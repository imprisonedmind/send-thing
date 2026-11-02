import { test } from "node:test";
import assert from "node:assert/strict";
import { discoveredUrls } from "./network.ts";

test("discovery accepts only the requested host's LAN endpoints", () => {
  const service = {
    port: 47823,
    txt: { hostId: "paired", scheme: "http" },
    addresses: [
      "192.168.1.5",
      "10.1.2.3",
      "172.16.0.5",
      "100.64.0.1",
      "127.0.0.1",
      "8.8.8.8",
      "192.168.999.5",
    ],
  };
  assert.deepEqual(discoveredUrls(service, "paired"), [
    "http://192.168.1.5:47823",
    "http://10.1.2.3:47823",
    "http://172.16.0.5:47823",
  ]);
  assert.deepEqual(discoveredUrls(service, "other"), []);
  assert.deepEqual(discoveredUrls({ ...service, port: 0 }, "paired"), []);
  assert.deepEqual(
    discoveredUrls(
      { ...service, txt: { hostId: "paired", scheme: "file" } },
      "paired",
    ),
    [],
  );
});
