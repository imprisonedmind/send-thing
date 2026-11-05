import {
  appendFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { format } from "node:util";

export function createLogWriter(directory: string, limit = 2 * 1024 * 1024) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, "send-thing.log");
  let size = existsSync(path) ? statSync(path).size : 0;
  return (source: string, message: string) => {
    const line = `${new Date().toISOString()} [${source}] ${message.slice(0, 8_192).trimEnd()}\n`;
    const bytes = Buffer.byteLength(line);
    if (size && size + bytes > limit) {
      rmSync(`${path}.1`, { force: true });
      renameSync(path, `${path}.1`);
      size = 0;
    }
    appendFileSync(path, line, { mode: 0o600 });
    size += bytes;
  };
}

export function installLogging(directory: string) {
  let write: ReturnType<typeof createLogWriter> | undefined;
  const stderr = console.error.bind(console);
  let reported = false;
  const log = (source: string, message: string) => {
    try {
      write ??= createLogWriter(directory);
      write(source, message);
    } catch (error) {
      // A full or unwritable log volume must not stop hosting or cause a
      // recursive logging failure. Keep reporting to the original stderr.
      if (!reported) stderr("Could not write Send Thing logs:", error);
      reported = true;
    }
  };
  for (const level of ["log", "info", "warn", "error"] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      log(`desktop:${level}`, format(...args));
      original(...args);
    };
  }
  return log;
}
