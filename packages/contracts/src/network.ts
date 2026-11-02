import * as Schema from "effect/Schema";
import { Id, normalizeHostUrl } from "./index.ts";

export const DISCOVERY_SERVICE = "send-thing";
export const HostChallenge = Schema.Union([
  Schema.Struct({ deviceId: Id, nonce: Id }),
  Schema.Struct({ credentialId: Id, nonce: Id }),
]);
export const credentialIdMessage = (tokenHash: string) =>
  `send-thing:credential-id:v1\n${tokenHash}`;
export const HostProof = Schema.Struct({
  hostId: Id,
  proof: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
});
export const proofMessage = (hostId: string, deviceId: string, nonce: string) =>
  `send-thing:host-proof:v1\n${hostId}\n${deviceId}\n${nonce}`;

export function isLanAddress(address: string) {
  const parts = address.split(".");
  if (
    parts.length !== 4 ||
    parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)
  )
    return false;
  const [a, b] = parts.map(Number);
  return (
    a === 10 ||
    (a === 172 && b! >= 16 && b! <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

export function isLanUrl(url: string) {
  try {
    return isLanAddress(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function isLoopbackUrl(url: string) {
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function hostRoutes(urls: readonly string[]) {
  const valid = new Set<string>();
  for (const url of urls) {
    try {
      const normalized = normalizeHostUrl(url);
      if (!isLoopbackUrl(normalized)) valid.add(normalized);
    } catch {
      /* Ignore malformed advertised endpoints. */
    }
  }
  return [...valid].slice(0, 16);
}

export function discoveredUrls(
  service: {
    addresses?: readonly string[];
    port: number;
    txt?: Record<string, unknown>;
  },
  hostId: string,
) {
  if (
    service.txt?.hostId !== hostId ||
    !Number.isInteger(service.port) ||
    service.port < 1 ||
    service.port > 65535
  )
    return [];
  const scheme = service.txt?.scheme;
  if (scheme !== "http" && scheme !== "https") return [];
  return (service.addresses ?? [])
    .filter(isLanAddress)
    .map((address) => `${scheme}://${address}:${service.port}`);
}
