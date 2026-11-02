import * as Schema from "effect/Schema";
import { Id, Name, normalizeHostUrl } from "./index.ts";

const PairingCode = Schema.Struct({
  hostId: Id,
  url: Schema.String,
  group: Name,
  invite: Id,
  expiresAt: Schema.String,
});
export type PairingCode = typeof PairingCode.Type;

export type PairingScheme = "sendthing" | "sendthing-dev";

export function createPairingLink(
  input: PairingCode,
  scheme: PairingScheme = "sendthing",
): string {
  const code = Schema.decodeUnknownSync(PairingCode)(input);
  const link = new URL(`${scheme}://pair`);
  link.searchParams.set("v", "1");
  link.searchParams.set("host", normalizeHostUrl(code.url));
  link.searchParams.set("hostId", code.hostId);
  link.searchParams.set("group", code.group);
  link.searchParams.set("invite", code.invite);
  link.searchParams.set("expires", code.expiresAt);
  return link.toString();
}

export function parsePairingLink(input: string, now = Date.now()): PairingCode {
  if (input.length > 4096) throw new Error("This is not a Send Thing QR code.");
  let link: URL;
  try {
    link = new URL(input.trim());
  } catch {
    throw new Error("Scan a Send Thing group QR code.");
  }
  if (
    !["sendthing:", "sendthing-dev:"].includes(link.protocol) ||
    link.hostname !== "pair" ||
    (link.pathname !== "" && link.pathname !== "/") ||
    link.username ||
    link.password ||
    link.port ||
    link.hash ||
    link.searchParams.get("v") !== "1"
  ) {
    throw new Error("This is not a supported Send Thing QR code.");
  }
  let code: PairingCode;
  try {
    code = Schema.decodeUnknownSync(PairingCode)({
      hostId: link.searchParams.get("hostId"),
      url: normalizeHostUrl(link.searchParams.get("host") ?? ""),
      group: link.searchParams.get("group"),
      invite: link.searchParams.get("invite"),
      expiresAt: link.searchParams.get("expires"),
    });
  } catch {
    throw new Error("This pairing code is incomplete or invalid.");
  }
  const expires = Date.parse(code.expiresAt);
  if (!Number.isFinite(expires) || expires <= now) {
    throw new Error("This QR code has expired. Create a new one on the host.");
  }
  return code;
}
