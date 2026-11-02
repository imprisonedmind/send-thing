import { resolve } from "node:path";
import { networkInterfaces } from "node:os";
import * as Effect from "effect/Effect";
import { hostResource } from "./host.ts";

const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());
process.once("disconnect", () => controller.abort());

const program = Effect.scoped(
  Effect.gen(function* () {
    const cert = process.env.SEND_THING_TLS_CERT;
    const key = process.env.SEND_THING_TLS_KEY;
    if (Boolean(cert) !== Boolean(key))
      throw new Error("Set both SEND_THING_TLS_CERT and SEND_THING_TLS_KEY.");
    const host = yield* hostResource({
      directory: resolve(process.env.SEND_THING_HOME ?? ".send-thing"),
      bind: process.env.SEND_THING_BIND ?? "0.0.0.0",
      port: Number(process.env.SEND_THING_PORT ?? 47823),
      webRoot: process.env.SEND_THING_WEB_ROOT,
      tls: cert && key ? { cert, key } : undefined,
    });
    const addresses = Object.values(networkInterfaces()).flatMap((interfaces) =>
      (interfaces ?? [])
        .filter((address) => address.family === "IPv4" && !address.internal)
        .map((address) => `${host.protocol}://${address.address}:${host.port}`),
    );
    process.send?.({
      type: "ready",
      hostId: host.hostId,
      token: host.token,
      url: `${host.protocol}://127.0.0.1:${host.port}`,
      addresses,
    });
    console.log(`Send Thing host listening on port ${host.port}.`);
    yield* Effect.never;
  }),
);

Effect.runPromise(program, { signal: controller.signal })
  .catch((error) => {
    if (!controller.signal.aborted) {
      console.error(error);
      process.exitCode = 1;
    }
  })
  .finally(() => {
    // A fork's open IPC channel otherwise keeps the completed child alive.
    if (process.connected) process.disconnect();
  });
