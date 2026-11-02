import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac, randomUUID } from "node:crypto";
import {
  credentialIdMessage,
  proofMessage,
} from "@send-thing/contracts/network";
import { resolveHostRoute, verifyHost } from "./routes.ts";

const connection = {
  hostId: "host_1234567890123456",
  deviceId: "device_12345678901234",
  token: "token_1234567890123456",
  label: "Host",
  url: "http://192.168.1.5:47823",
  routes: ["http://100.64.0.1:47823"],
};
function proof(nonce: string, token = connection.token) {
  return {
    hostId: connection.hostId,
    proof: createHmac("sha256", createHash("sha256").update(token).digest())
      .update(proofMessage(connection.hostId, connection.deviceId, nonce))
      .digest("hex"),
  };
}

test("a changed LAN address is verified and preferred before the tailnet, without transmitting credentials", async (t) => {
  const requests: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    requests.push(url);
    assert.equal(new Headers(init.headers).has("Authorization"), false);
    assert.equal(String(init.body).includes(connection.token), false);
    const { nonce } = JSON.parse(String(init.body));
    return Response.json(
      proof(
        nonce,
        url.includes("192.168.2.9") ? connection.token : "another-host",
      ),
    );
  });
  const result = await resolveHostRoute(
    connection,
    { discover: async () => ["http://192.168.2.9:47823"] },
    new AbortController().signal,
  );
  assert.equal(result, "http://192.168.2.9:47823");
  assert.ok(requests.every((url) => !url.includes("100.64")));
});

test("tailnet fallback waits until LAN discovery and LAN probes fail", async (t) => {
  let discoveryFinished = false;
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    if (url.includes("192.168")) throw new Error("Unreachable");
    assert.equal(discoveryFinished, true);
    return Response.json(proof(JSON.parse(String(init.body)).nonce));
  });
  const result = await resolveHostRoute(
    connection,
    {
      discover: async () => {
        await Promise.resolve();
        discoveryFinished = true;
        return [];
      },
    },
    new AbortController().signal,
  );
  assert.equal(result, connection.routes[0]);
});

test("a captured proof cannot be replayed for a different nonce", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json(proof(randomUUID())),
  );
  await assert.rejects(
    verifyHost(
      connection.url,
      connection,
      randomUUID(),
      new AbortController().signal,
    ),
    /not the paired host/,
  );
});

test("cancelled discovery cannot select a late address", async (t) => {
  const controller = new AbortController();
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: string, init: RequestInit) => {
      init.signal?.throwIfAborted();
      throw new Error("Old address unavailable");
    },
  );
  const result = resolveHostRoute(
    connection,
    {
      discover: async () => {
        controller.abort();
        return ["http://192.168.2.9:47823"];
      },
    },
    controller.signal,
  );
  await assert.rejects(result, /cancelled/);
});

test("older hosts keep their exact saved endpoint when discovery finds no verified replacement", async (t) => {
  const { deviceId: _, ...legacy } = connection;
  let scanned = false;
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(null, { status: 404 }),
  );
  assert.equal(
    await resolveHostRoute(
      legacy,
      {
        discover: async () => {
          scanned = true;
          return [];
        },
      },
      new AbortController().signal,
    ),
    connection.url,
  );
  assert.equal(scanned, true);
});

test("older pairings discover a changed address without sending the token or proof key", async (t) => {
  const { deviceId: _, ...legacy } = connection;
  const key = createHash("sha256").update(legacy.token).digest();
  const expectedId = createHash("sha256")
    .update(credentialIdMessage(key.toString("hex")))
    .digest("hex");
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    if (!url.includes("192.168.2.9"))
      throw new Error("Old address unavailable");
    const body = String(init.body);
    assert.equal(body.includes(legacy.token), false);
    assert.equal(body.includes(key.toString("hex")), false);
    assert.equal(new Headers(init.headers).has("Authorization"), false);
    const { credentialId, nonce } = JSON.parse(body);
    assert.equal(credentialId, expectedId);
    return Response.json({
      hostId: legacy.hostId,
      proof: createHmac("sha256", key)
        .update(proofMessage(legacy.hostId, credentialId, nonce))
        .digest("hex"),
    });
  });
  assert.equal(
    await resolveHostRoute(
      legacy,
      { discover: async () => ["http://192.168.2.9:47823"] },
      new AbortController().signal,
    ),
    "http://192.168.2.9:47823",
  );
});

test("an HTTPS pairing never downgrades credentials onto an advertised HTTP route", async (t) => {
  const secure = { ...connection, url: "https://host.example", routes: [] };
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.ok(url.startsWith("https:"));
    return Response.json(proof(JSON.parse(String(init.body)).nonce));
  });
  assert.equal(
    await resolveHostRoute(
      secure,
      { discover: async () => [connection.url] },
      new AbortController().signal,
    ),
    secure.url,
  );
});
