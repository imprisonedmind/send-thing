import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, randomBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import * as Schema from "effect/Schema";
import { connectionLog } from "./connection-log.ts";
import { type Connection, normalizeHostUrl } from "@send-thing/contracts";
import {
  HostProof,
  credentialIdMessage,
  hostRoutes,
  isLanUrl,
  isLoopbackUrl,
  proofMessage,
} from "@send-thing/contracts/network";

export interface ConnectionOptions {
  discover?: (
    hostId: string,
    signal: AbortSignal,
  ) => Promise<readonly string[]>;
  nonce?: () => string;
  onConnectionChange?: (connection: Connection) => Promise<void>;
}

export const connectionNonce = () => bytesToHex(randomBytes(16));

export async function verifyHost(
  url: string,
  connection: Connection,
  nonce: string,
  signal: AbortSignal,
) {
  const key = sha256(utf8ToBytes(connection.token));
  // Older pairings saved the token but not the device ID. A separate, one-way
  // identifier lets the host find its credential without revealing the proof key.
  const credentialId = bytesToHex(
    sha256(utf8ToBytes(credentialIdMessage(bytesToHex(key)))),
  );
  const identity = connection.deviceId ?? credentialId;
  const origin = normalizeHostUrl(url);
  const response = await fetch(`${origin}/api/host-proof`, {
    method: "POST",
    redirect: "error",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(connection.deviceId
        ? { deviceId: connection.deviceId }
        : { credentialId }),
      nonce,
    }),
  });
  if (!response.ok)
    throw new Error(`Host verification failed (HTTP ${response.status}).`);
  const result = Schema.decodeUnknownSync(HostProof)(await response.json());
  const expected = bytesToHex(
    hmac(
      sha256,
      key,
      utf8ToBytes(proofMessage(connection.hostId, identity, nonce)),
    ),
  );
  let difference = 0;
  for (let i = 0; i < expected.length; i++)
    difference |= expected.charCodeAt(i) ^ result.proof.charCodeAt(i);
  if (result.hostId !== connection.hostId || difference !== 0)
    throw new Error("This address is not the paired host.");
  return origin;
}

export async function resolveHostRoute(
  connection: Connection,
  options: ConnectionOptions,
  signal: AbortSignal,
  lanOnly = false,
) {
  if (isLoopbackUrl(connection.url)) return lanOnly ? null : connection.url;
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  let discoveryError: unknown;
  const discovered = (
    options.discover?.(connection.hostId, controller.signal) ??
    Promise.resolve([])
  )
    .then((urls) => {
      connectionLog("discovery-complete", {
        hostId: connection.hostId,
        count: urls.length,
      });
      return urls;
    })
    .catch((error) => {
      if (!controller.signal.aborted)
        connectionLog("discovery-failed", {
          hostId: connection.hostId,
          error: error instanceof Error ? error.message : String(error),
        });
      discoveryError = error;
      return [];
    });
  const known = hostRoutes([connection.url, ...(connection.routes ?? [])]);
  const permitted = (url: string) =>
    !connection.url.startsWith("https:") || url.startsWith("https:");
  const checked = new Set<string>();
  const check = (url: string) => {
    connectionLog("verify-start", { hostId: connection.hostId, url });
    checked.add(url);
    const timeout = new AbortController();
    const cancel = () => timeout.abort();
    controller.signal.addEventListener("abort", cancel, { once: true });
    if (controller.signal.aborted) cancel();
    const timer = setTimeout(cancel, 1_500);
    return verifyHost(
      url,
      connection,
      (options.nonce ?? connectionNonce)(),
      timeout.signal,
    )
      .then((verified) => {
        connectionLog("verify-success", { hostId: connection.hostId, url });
        return verified;
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          connectionLog("verify-failed", {
            hostId: connection.hostId,
            url,
            error: timeout.signal.aborted
              ? "Timed out after 1500 ms"
              : error instanceof Error
                ? error.message
                : String(error),
          });
        throw error;
      })
      .finally(() => {
        clearTimeout(timer);
        controller.signal.removeEventListener("abort", cancel);
      });
  };
  try {
    const lan = known.filter((url) => isLanUrl(url) && permitted(url));
    const foundLan = discovered.then((urls) =>
      Promise.any(
        hostRoutes(urls)
          .filter((url) => isLanUrl(url) && permitted(url) && !checked.has(url))
          .map(check),
      ),
    );
    try {
      return await Promise.any([...lan.map(check), foundLan]);
    } catch {
      if (controller.signal.aborted)
        throw new Error("Connection attempt cancelled.");
      if (lanOnly) return null;
    }
    for (const url of known.filter((url) => !isLanUrl(url) && permitted(url))) {
      try {
        return await check(url);
      } catch {
        if (controller.signal.aborted)
          throw new Error("Connection attempt cancelled.");
      }
    }
    // Keep compatibility with old hosts only at the explicitly paired address.
    // Every newly discovered address still requires a valid proof.
    if (!connection.deviceId) {
      connectionLog("legacy-saved-route", {
        hostId: connection.hostId,
        url: connection.url,
      });
      return connection.url;
    }
    throw new Error(
      discoveryError
        ? `LAN discovery failed: ${discoveryError instanceof Error ? discoveryError.message : String(discoveryError)}`
        : "Host unavailable. Join the host’s network or connect through Tailscale.",
    );
  } finally {
    abort();
    signal.removeEventListener("abort", abort);
  }
}
