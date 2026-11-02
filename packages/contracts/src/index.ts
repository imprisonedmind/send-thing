import * as Schema from "effect/Schema";

export const PROTOCOL_VERSION = 1;
export const MAX_FILE_BYTES = 256 * 1024 * 1024;
export const Id = Schema.String.check(
  Schema.isPattern(/^[a-zA-Z0-9_-]{16,80}$/),
);
export const Name = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(100),
  Schema.isPattern(/\S/),
);
export const DeviceKind = Schema.Literals([
  "desktop",
  "laptop",
  "phone",
  "tablet",
  "server",
]);
export const Avatar = Schema.NullOr(
  Schema.String.check(
    Schema.isMaxLength(350_000),
    Schema.isPattern(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/),
  ),
);
export const ProfileInput = Schema.Struct({
  name: Name,
  kind: DeviceKind,
  avatar: Avatar,
});
export type ProfileInput = typeof ProfileInput.Type;
export const Device = Schema.Struct({ id: Id, ...ProfileInput.fields });
export type Device = typeof Device.Type;
export const Group = Schema.Struct({
  id: Id,
  name: Name,
  hostDeviceId: Id,
  createdAt: Schema.String,
});
export type Group = typeof Group.Type;
export const Attachment = Schema.Struct({
  id: Id,
  name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(240)),
  mime: Schema.String.check(
    Schema.isMaxLength(200),
    Schema.isPattern(/^[\w.+-]+\/[\w.+-]+$/),
  ),
  size: Schema.Int.check(
    Schema.isBetween({ minimum: 0, maximum: MAX_FILE_BYTES }),
  ),
});
export type Attachment = typeof Attachment.Type;
export const UploadInput = Schema.Struct({ ...Attachment.fields });
export const UploadReservation = Schema.Struct({
  ...Attachment.fields,
  complete: Schema.Boolean,
});
export const SendInput = Schema.Struct({
  id: Id,
  text: Schema.String.check(Schema.isMaxLength(32_000)),
  attachmentIds: Schema.Array(Id).check(Schema.isMaxLength(16)),
});
export type SendInput = typeof SendInput.Type;
export const Message = Schema.Struct({
  id: Id,
  sequence: Schema.Int,
  groupId: Id,
  sender: Device,
  text: Schema.String,
  attachments: Schema.Array(Attachment),
  createdAt: Schema.String,
});
export type Message = typeof Message.Type;
export const LinkPreview = Schema.Struct({
  url: Schema.String.check(
    Schema.isPattern(/^https?:\/\//),
    Schema.isMaxLength(32_000),
  ),
  title: Schema.String.check(Schema.isMaxLength(240)),
  description: Schema.String.check(Schema.isMaxLength(500)),
  siteName: Schema.String.check(Schema.isMaxLength(100)),
  image: Schema.NullOr(
    Schema.String.check(
      Schema.isMaxLength(2_800_000),
      Schema.isPattern(
        /^data:image\/(jpeg|png|webp|gif|avif);base64,[A-Za-z0-9+/=]+$/,
      ),
    ),
  ),
  video: Schema.Boolean,
});
export type LinkPreview = typeof LinkPreview.Type;
export const History = Schema.Struct({
  messages: Schema.Array(Message),
  hasMore: Schema.Boolean,
});
export type History = typeof History.Type;
export const Session = Schema.Struct({
  protocol: Schema.Literal(PROTOCOL_VERSION),
  hostId: Id,
  device: Device,
  groups: Schema.Array(Group),
  endpoints: Schema.optional(
    Schema.Array(Schema.String).check(Schema.isMaxLength(16)),
  ),
});
export type Session = typeof Session.Type;
export const PairInput = Schema.Struct({ invite: Id, profile: ProfileInput });
export const PairResult = Schema.Struct({ token: Id, session: Session });
export const Invite = Schema.Struct({ token: Id, expiresAt: Schema.String });
export const CreateGroupInput = Schema.Struct({ name: Name });
export const Event = Schema.Union([
  Schema.Struct({ type: Schema.Literal("ready") }),
  Schema.Struct({ type: Schema.Literal("changed"), groupId: Id }),
  Schema.Struct({ type: Schema.Literal("pong"), nonce: Id }),
]);
export const SocketPing = Schema.Struct({
  type: Schema.Literal("ping"),
  nonce: Id,
});
export const SocketAuth = Schema.Struct({ token: Id });
export const Connection = Schema.Struct({
  hostId: Id,
  url: Schema.String,
  token: Id,
  label: Schema.String,
  deviceId: Schema.optional(Id),
  routes: Schema.optional(
    Schema.Array(Schema.String).check(Schema.isMaxLength(16)),
  ),
});
export type Connection = typeof Connection.Type;
export const Connections = Schema.Array(Connection);

// All user-provided endpoint URLs pass this boundary, including desktop IPC.
export function normalizeHostUrl(input: string): string {
  const url = new URL(input.trim());
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "Enter an HTTP or HTTPS host address without a path or credentials.",
    );
  }
  return url.origin;
}

export function safeFilename(name: string): string {
  const clean = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/[. ]+$/, "");
  const valid =
    !clean || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(clean)
      ? `file_${clean}`
      : clean;
  let result = "";
  let bytes = 0;
  for (const character of valid) {
    bytes += new TextEncoder().encode(character).length;
    if (bytes > 180) break;
    result += character;
  }
  return result.replace(/[. ]+$/, "") || "file";
}
