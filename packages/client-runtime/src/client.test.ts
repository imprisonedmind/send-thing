import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { HostClient } from "./client.ts";

class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 1;
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onclose?: (event: { code: number }) => void;
  onerror?: () => void;
  constructor() {
    Socket.instances.push(this);
  }
  send() {}
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
