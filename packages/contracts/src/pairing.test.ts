import { test } from "node:test";
import assert from "node:assert/strict";
import { createPairingLink, parsePairingLink } from "./pairing.ts";

const now = Date.parse("2026-11-02T10:00:00Z");
const invitation = {
  hostId: "host-device-0123456789",
  url: "http://100.64.0.10:47823",
  group: "Luke’s devices & office",
  invite: "single-use-token-0123456789",
  expiresAt: "2026-11-02T10:10:00.000Z",
};

test("a scanned link carries the selected host, group and one-time invitation", () => {
  assert.deepEqual(
    parsePairingLink(createPairingLink(invitation), now),
    invitation,
  );
});

test("development links target the development app and remain scannable in either app", () => {
  const link = createPairingLink(invitation, "sendthing-dev");
  assert.equal(new URL(link).protocol, "sendthing-dev:");
  assert.equal(new URL(createPairingLink(invitation)).protocol, "sendthing:");
  assert.deepEqual(parsePairingLink(link, now), invitation);
  assert.throws(
    () => parsePairingLink(link.replace("sendthing-dev:", "another-app:"), now),
    /supported/,
  );
});

test("expired codes cannot be submitted, including exactly at expiry", () => {
  assert.throws(
    () =>
      parsePairingLink(
        createPairingLink(invitation),
        Date.parse(invitation.expiresAt),
      ),
    /expired/,
  );
});

test("unrelated QR codes, protocol versions and incomplete invites are rejected", () => {
  for (const input of [
    "not a URL",
    "https://example.com",
    "sendthing://pair?v=2",
    "sendthing://pair?v=1",
  ]) {
    assert.throws(() => parsePairingLink(input, now));
  }
});

test("scanned hosts cannot contain credentials, paths or non-HTTP schemes", () => {
  for (const host of [
    "file:///etc/passwd",
    "http://user:secret@host:47823",
    "http://host:47823/api/pair",
    "http://host:47823/?token=secret",
  ]) {
    const link = new URL(createPairingLink(invitation));
    link.searchParams.set("host", host);
    assert.throws(() => parsePairingLink(link.toString(), now), /invalid/);
  }
});

test("malformed token and expiry values fail before making a request", () => {
  for (const [key, value] of [
    ["invite", "short"],
    ["expires", "not-a-date"],
  ]) {
    const link = new URL(createPairingLink(invitation));
    link.searchParams.set(key!, value!);
    assert.throws(() => parsePairingLink(link.toString(), now));
  }
});
