import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type Bonjour from "bonjour-service";

// Exercise the patched dependency without opening sockets. These errors used
// to be swallowed, leaving the host believing its announcement was healthy.
const require = createRequire(import.meta.url);
const { Registry } = require(
  join(dirname(require.resolve("bonjour-service")), "lib/registry.js"),
);

function registry(failure: "probe" | "announce") {
  const denied = new Error("send EPERM");
  const mdns = Object.assign(new EventEmitter(), {
    query(_name: string, _type: string, callback: (error?: Error) => void) {
      queueMicrotask(() => callback(failure === "probe" ? denied : undefined));
    },
    respond(_packet: unknown, callback: (error?: Error) => void) {
      queueMicrotask(() =>
        callback(failure === "announce" ? denied : undefined),
      );
    },
  });
  const instance = new Registry({
    mdns,
    register() {},
    unregister() {},
  });
  const service: Bonjour.Service = instance.publish({
    name: "send-thing-test",
    type: "send-thing",
    port: 47823,
    probe: failure === "probe",
  });
  return { instance, service, denied, mdns };
}

test("a rejected mDNS probe reports failure and releases its listener", async () => {
  const { instance, service, denied, mdns } = registry("probe");
  try {
    assert.deepEqual(await once(service, "error"), [denied]);
    assert.equal(service.published, false);
    assert.equal(service.activated, false);
    assert.equal(mdns.listenerCount("response"), 0);
  } finally {
    instance.destroy();
  }
});

test("a rejected announcement never reports itself as published", async () => {
  const { instance, service, denied } = registry("announce");
  let published = false;
  service.on("up", () => (published = true));
  try {
    assert.deepEqual(await once(service, "error"), [denied]);
    assert.equal(service.published, false);
    assert.equal(published, false);
  } finally {
    instance.destroy();
  }
});
