import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLogWriter } from "./logging.ts";

test("desktop logs survive restarts and keep only one rotated file", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "send-thing-logs-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "send-thing.log");
  createLogWriter(directory, 160)("host", "first startup");
  const log = createLogWriter(directory, 160);
  log("host", "second startup");
  assert.match(
    readFileSync(path, "utf8"),
    /first startup[\s\S]*second startup/,
  );
  for (let i = 0; i < 10; i++) log("host", `retry ${i}`);
  assert.match(readFileSync(path, "utf8"), /retry 9/);
  assert.equal(readdirSync(directory).length, 2);
  assert.ok(statSync(path).size <= 160);
  assert.ok(statSync(`${path}.1`).size <= 160);
  if (process.platform !== "win32")
    assert.equal(statSync(path).mode & 0o777, 0o600);
});
