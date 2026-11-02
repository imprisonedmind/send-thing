import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { HostClient } from "./client.ts";
import { createHash, createHmac } from "node:crypto";
import {
  credentialIdMessage,
  proofMessage,
} from "@send-thing/contracts/network";

class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 1;
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onclose?: (event: { code: number }) => void;
  onerror?: () => void;
  url: string;
  constructor(url: string) {
    this.url = url;
    Socket.instances.push(this);
  }
  send(_data: string) {}
  close() {
    this.readyState = 3;
  }
  ready() {
    this.onmessage?.({ data: JSON.stringify({ type: "ready" }) });
  }
  disconnect(code = 1006) {
    this.close();
    this.onclose?.({ code });
  }
}
function mockSocket(t: TestContext) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "WebSocket")!;
  Object.defineProperty(globalThis, "WebSocket", {
    ...original,
    value: Socket,
  });
  t.after(() => Object.defineProperty(globalThis, "WebSocket", original));
}
const connection = {
  hostId: "host_1234567890123456",
  token: "token_1234567890123456",
  url: "http://localhost:47823",
  label: "Computer",
};
const session = {
  protocol: 1,
  hostId: connection.hostId,
  device: {
    id: connection.hostId,
    name: "Computer",
    kind: "desktop",
    avatar: null,
  },
  groups: [],
};

test("rediscovery persists the new route before opening its authenticated socket", async (t) => {
  Socket.instances = [];
  mockSocket(t);
  const saved = {
    ...connection,
    url: "http://192.168.1.5:47823",
    deviceId: "device_12345678901234",
  };
  const updates: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    if (url.includes("192.168.1.5")) throw new Error("Old network");
    const { nonce } = JSON.parse(String(init.body));
    return Response.json({
      hostId: saved.hostId,
      proof: createHmac(
        "sha256",
        createHash("sha256").update(saved.token).digest(),
      )
        .update(proofMessage(saved.hostId, saved.deviceId, nonce))
        .digest("hex"),
    });
  });
  const client = new HostClient(saved, {
    discover: async () => ["http://192.168.2.9:47823"],
    onConnectionChange: async (next) => {
      assert.equal(Socket.instances.length, 0);
      updates.push(next.url);
    },
  });
  t.after(() => client.stop());
  client.start();
  await setImmediate();
  assert.deepEqual(updates, ["http://192.168.2.9:47823"]);
  assert.equal(Socket.instances[0]?.url, "ws://192.168.2.9:47823/events");
});

test("stopping a client cancels discovery without reopening a socket or saving a stale route", async (t) => {
  Socket.instances = [];
  mockSocket(t);
  let finish!: (urls: string[]) => void;
  let writes = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: string, init: RequestInit) => {
      init.signal?.throwIfAborted();
      throw new Error("Unreachable");
    },
  );
  const client = new HostClient(
    {
      ...connection,
      url: "http://192.168.1.5:47823",
      deviceId: "device_12345678901234",
    },
    {
      discover: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      onConnectionChange: async () => {
        writes++;
      },
    },
  );
  client.start();
  client.stop();
  finish(["http://192.168.2.9:47823"]);
  await setImmediate();
  assert.equal(Socket.instances.length, 0);
  assert.equal(writes, 0);
});

test("a legacy pairing retries through discovery without repeated network notifications cancelling it", async (t) => {
  Socket.instances = [];
  mockSocket(t);
  let finish!: (urls: string[]) => void;
  let scans = 0;
  const legacy = { ...connection, url: "http://192.168.1.5:47823" };
  const key = createHash("sha256").update(legacy.token).digest();
  const credentialId = createHash("sha256")
    .update(credentialIdMessage(key.toString("hex")))
    .digest("hex");
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    if (!url.includes("192.168.2.9"))
      throw new Error("Old address unavailable");
    const { nonce } = JSON.parse(String(init.body));
    return Response.json({
      hostId: legacy.hostId,
      proof: createHmac("sha256", key)
        .update(proofMessage(legacy.hostId, credentialId, nonce))
        .digest("hex"),
    });
  });
  const client = new HostClient(legacy, {
    discover: () => {
      scans++;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  });
  t.after(() => client.stop());
  client.start();
  Socket.instances[0]!.disconnect();
  client.reconnect();
  client.networkChanged();
  client.networkChanged();
  assert.equal(scans, 1);
  finish(["http://192.168.2.9:47823"]);
  await setImmediate();
  assert.equal(Socket.instances.length, 2);
  assert.equal(Socket.instances[1]!.url, "ws://192.168.2.9:47823/events");
});

test("network changes retain a responsive socket and rediscover a silent one", async (t) => {
  Socket.instances = [];
  mockSocket(t);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const saved = {
    ...connection,
    url: "http://192.168.1.5:47823",
    deviceId: "device_12345678901234",
  };
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    if (url.endsWith("/api/session")) return Response.json(session);
    const { nonce } = JSON.parse(String(init.body));
    return Response.json({
      hostId: saved.hostId,
      proof: createHmac(
        "sha256",
        createHash("sha256").update(saved.token).digest(),
      )
        .update(proofMessage(saved.hostId, saved.deviceId, nonce))
        .digest("hex"),
    });
  });
  const client = new HostClient(saved);
  t.after(() => client.stop());
  client.start();
  await setImmediate();
  const socket = Socket.instances[0]!;
  socket.ready();
  await setImmediate();
  const send = t.mock.method(socket, "send", (data: string) => {
    const { type, nonce } = JSON.parse(data);
    if (type === "ping")
      socket.onmessage?.({ data: JSON.stringify({ type: "pong", nonce }) });
  });
  client.networkChanged();
  await setImmediate();
  assert.equal(Socket.instances.length, 1);
  assert.equal(client.getSnapshot().status, "online");
  send.mock.mockImplementation(() => {});
  client.networkChanged();
  t.mock.timers.tick(3_000);
  await setImmediate();
  assert.equal(socket.readyState, 3);
  assert.equal(Socket.instances.length, 2);
});

test("connection retries retain the session, and network loss stays offline despite a late socket close", async (t) => {
  Socket.instances = [];
  mockSocket(t);
  t.mock.method(globalThis, "fetch", async () => Response.json(session));
  const client = new HostClient(connection);
  t.after(() => client.stop());
  client.start();
  Socket.instances[0]!.ready();
  await setImmediate();
  assert.equal(client.getSnapshot().status, "online");
  Socket.instances[0]!.disconnect();
  assert.equal(client.getSnapshot().status, "reconnecting");
  assert.equal(client.getSnapshot().session?.hostId, session.hostId);
  client.reconnect();
  const previous = Socket.instances.at(-1)!;
  client.setNetworkAvailable(false);
  previous.disconnect();
  assert.equal(client.getSnapshot().status, "offline");
  const count = Socket.instances.length;
  client.reconnect();
  assert.equal(Socket.instances.length, count);
  client.setNetworkAvailable(true);
  Socket.instances.at(-1)!.ready();
  await setImmediate();
  assert.equal(client.getSnapshot().status, "online");
});

test("late HTTP replies cannot mark a closed connection online", async (t) => {
  Socket.instances = [];
  mockSocket(t);
  let resolve!: (response: Response) => void;
  t.mock.method(
    globalThis,
    "fetch",
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  );
  const client = new HostClient(connection);
  t.after(() => client.stop());
  client.start();
  Socket.instances[0]!.ready();
  Socket.instances[0]!.disconnect();
  resolve(Response.json(session));
  await setImmediate();
  assert.equal(client.getSnapshot().status, "reconnecting");
  assert.equal(client.getSnapshot().session, null);
});

test("rejected credentials and protocol mismatches stop automatic retries", async (t) => {
  Socket.instances = [];
  mockSocket(t);
  const fetch = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ error: "Pair again." }, { status: 401 }),
  );
  const client = new HostClient(connection);
  t.after(() => client.stop());
  client.start();
  Socket.instances[0]!.ready();
  await setImmediate();
  assert.equal(client.getSnapshot().status, "error");
  assert.equal(Socket.instances[0]!.readyState, 3);
  fetch.mock.mockImplementation(async () =>
    Response.json({ ...session, protocol: 999 }),
  );
  client.reconnect();
  Socket.instances.at(-1)!.ready();
  await setImmediate();
  assert.equal(client.getSnapshot().status, "unsupported");
  assert.equal(Socket.instances.at(-1)!.readyState, 3);
});
