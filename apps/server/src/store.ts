import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import {
  credentialIdMessage,
  proofMessage,
} from "@send-thing/contracts/network";
import * as Schema from "effect/Schema";
import {
  Attachment,
  Device,
  Group,
  LinkPreview,
  type ProfileInput,
  type SendInput,
  type Session,
  type Message,
} from "@send-thing/contracts";
import { ApiError } from "./errors.ts";

export const newToken = () => randomBytes(32).toString("base64url");
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export class Store {
  readonly db: DatabaseSync;
  readonly hostId: string;

  constructor(filename: string, host: { name: string; token: string }) {
    this.db = new DatabaseSync(filename);
    this.db.exec(
      "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;",
    );
    const version = Number(
      this.db.prepare("PRAGMA user_version").get()?.user_version,
    );
    if (version > 2) {
      this.db.close();
      throw new Error("This database requires a newer Send Thing host.");
    }
    if (version === 0)
      this.db.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE devices (id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, avatar TEXT, tokenHash TEXT NOT NULL UNIQUE, isHost INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, hostDeviceId TEXT NOT NULL REFERENCES devices(id), createdAt TEXT NOT NULL);
      CREATE TABLE members (groupId TEXT NOT NULL REFERENCES groups(id), deviceId TEXT NOT NULL REFERENCES devices(id), PRIMARY KEY(groupId, deviceId));
      CREATE TABLE invites (tokenHash TEXT PRIMARY KEY, groupId TEXT NOT NULL REFERENCES groups(id), expiresAt TEXT NOT NULL);
      CREATE TABLE messages (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, groupId TEXT NOT NULL REFERENCES groups(id), senderId TEXT NOT NULL REFERENCES devices(id), text TEXT NOT NULL, createdAt TEXT NOT NULL);
      CREATE INDEX messages_group_sequence ON messages(groupId, sequence);
      CREATE TABLE files (id TEXT PRIMARY KEY, groupId TEXT NOT NULL REFERENCES groups(id), ownerId TEXT NOT NULL REFERENCES devices(id), name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, complete INTEGER NOT NULL DEFAULT 0, messageId TEXT REFERENCES messages(id));
      PRAGMA user_version = 1;
      COMMIT;
    `);
    if (version < 2)
      this.db.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE link_previews (url TEXT PRIMARY KEY, value TEXT NOT NULL);
      PRAGMA user_version = 2;
      COMMIT;
    `);
    const existing = this.db
      .prepare("SELECT id FROM devices WHERE isHost = 1")
      .get();
    this.hostId = existing ? String(existing.id) : randomUUID();
    if (!existing)
      this.db
        .prepare("INSERT INTO devices VALUES (?, ?, 'desktop', NULL, ?, 1)")
        .run(this.hostId, host.name, hash(host.token));
    else
      this.db
        .prepare("UPDATE devices SET tokenHash = ? WHERE id = ?")
        .run(hash(host.token), this.hostId);
  }

  transaction<T>(f: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = f();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  authenticate(token: string): string {
    const row = this.db
      .prepare("SELECT id FROM devices WHERE tokenHash = ?")
      .get(hash(token));
    if (!row) throw new ApiError(401, "Pair this device with the host again.");
    return String(row.id);
  }

  hostProof(
    identity: string,
    nonce: string,
    kind: "device" | "credential" = "device",
  ) {
    const row =
      kind === "credential"
        ? this.db
            .prepare("SELECT tokenHash FROM devices")
            .all()
            .find(
              (device) =>
                hash(credentialIdMessage(String(device.tokenHash))) ===
                identity,
            )
        : this.db
            .prepare("SELECT tokenHash FROM devices WHERE id = ?")
            .get(identity);
    if (!row) throw new ApiError(404, "Unknown paired device.");
    return {
      hostId: this.hostId,
      proof: createHmac("sha256", Buffer.from(String(row.tokenHash), "hex"))
        .update(proofMessage(this.hostId, identity, nonce))
        .digest("hex"),
    };
  }

  device(id: string): Device {
    return Schema.decodeUnknownSync(Device)(
      this.db
        .prepare("SELECT id, name, kind, avatar FROM devices WHERE id = ?")
        .get(id),
    );
  }

  session(deviceId: string): Session {
    const groups = this.db
      .prepare(
        "SELECT g.* FROM groups g JOIN members m ON m.groupId = g.id WHERE m.deviceId = ? ORDER BY g.createdAt, g.id",
      )
      .all(deviceId);
    return {
      protocol: 1,
      hostId: this.hostId,
      device: this.device(deviceId),
      groups: Schema.decodeUnknownSync(Schema.Array(Group))(groups),
    };
  }

  assertMember(deviceId: string, groupId: string): void {
    if (
      !this.db
        .prepare("SELECT 1 FROM members WHERE deviceId = ? AND groupId = ?")
        .get(deviceId, groupId)
    )
      throw new ApiError(403, "This device is not a member of this group.");
  }

  assertHost(deviceId: string): void {
    if (deviceId !== this.hostId)
      throw new ApiError(403, "Manage this group on its host device.");
  }

  createGroup(deviceId: string, name: string): Group {
    this.assertHost(deviceId);
    const group = {
      id: randomUUID(),
      name: name.trim(),
      hostDeviceId: this.hostId,
      createdAt: new Date().toISOString(),
    };
    this.transaction(() => {
      this.db
        .prepare("INSERT INTO groups VALUES (?, ?, ?, ?)")
        .run(group.id, group.name, group.hostDeviceId, group.createdAt);
      this.db
        .prepare("INSERT INTO members VALUES (?, ?)")
        .run(group.id, deviceId);
    });
    return group;
  }

  invite(deviceId: string, groupId: string) {
    this.assertHost(deviceId);
    this.assertMember(deviceId, groupId);
    const token = newToken();
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    this.db
      .prepare("DELETE FROM invites WHERE expiresAt < ?")
      .run(new Date().toISOString());
    this.db
      .prepare("INSERT INTO invites VALUES (?, ?, ?)")
      .run(hash(token), groupId, expiresAt);
    return { token, expiresAt };
  }

  pair(invite: string, profile: ProfileInput, existingDevice?: string) {
    return this.transaction(() => {
      const row = this.db
        .prepare(
          "DELETE FROM invites WHERE tokenHash = ? AND expiresAt > ? RETURNING groupId",
        )
        .get(hash(invite), new Date().toISOString());
      if (!row)
        throw new ApiError(
          403,
          "This invitation has expired or was already used.",
        );
      const id = existingDevice ?? randomUUID();
      const token = newToken();
      if (!existingDevice)
        this.db
          .prepare("INSERT INTO devices VALUES (?, ?, ?, ?, ?, 0)")
          .run(
            id,
            profile.name.trim(),
            profile.kind,
            profile.avatar,
            hash(token),
          );
      this.db
        .prepare("INSERT OR IGNORE INTO members VALUES (?, ?)")
        .run(String(row.groupId), id);
      // Existing sessions keep their credential; the caller supplies it in the response.
      return { token, session: this.session(id) };
    });
  }

  updateProfile(deviceId: string, profile: ProfileInput) {
    this.db
      .prepare("UPDATE devices SET name = ?, kind = ?, avatar = ? WHERE id = ?")
      .run(profile.name.trim(), profile.kind, profile.avatar, deviceId);
    return this.device(deviceId);
  }

  members(deviceId: string, groupId: string) {
    this.assertMember(deviceId, groupId);
    return Schema.decodeUnknownSync(Schema.Array(Device))(
      this.db
        .prepare(
          "SELECT d.id, d.name, d.kind, d.avatar FROM devices d JOIN members m ON m.deviceId = d.id WHERE m.groupId = ? ORDER BY d.name",
        )
        .all(groupId),
    );
  }

  removeMember(actor: string, groupId: string, deviceId: string) {
    this.assertMember(actor, groupId);
    if (actor !== deviceId) this.assertHost(actor);
    if (deviceId === this.hostId)
      throw new ApiError(409, "The group's host cannot leave its group.");
    this.db
      .prepare("DELETE FROM members WHERE groupId = ? AND deviceId = ?")
      .run(groupId, deviceId);
  }

  groupFileIds(actor: string, groupId: string): string[] {
    this.assertHost(actor);
    this.assertMember(actor, groupId);
    return this.db
      .prepare("SELECT id FROM files WHERE groupId = ?")
      .all(groupId)
      .map((row) => String(row.id));
  }

  hasFile(id: string): boolean {
    return Boolean(this.db.prepare("SELECT 1 FROM files WHERE id = ?").get(id));
  }

  deleteGroup(actor: string, groupId: string) {
    const files = this.groupFileIds(actor, groupId);
    this.transaction(() => {
      this.db.prepare("DELETE FROM files WHERE groupId = ?").run(groupId);
      this.db.prepare("DELETE FROM messages WHERE groupId = ?").run(groupId);
      this.db.prepare("DELETE FROM invites WHERE groupId = ?").run(groupId);
      this.db.prepare("DELETE FROM members WHERE groupId = ?").run(groupId);
      this.db.prepare("DELETE FROM groups WHERE id = ?").run(groupId);
    });
    return files;
  }

  history(deviceId: string, groupId: string, before?: number) {
    this.assertMember(deviceId, groupId);
    const rows = this.db
      .prepare(
        "SELECT * FROM messages WHERE groupId = ? AND sequence < ? ORDER BY sequence DESC LIMIT 51",
      )
      .all(groupId, before ?? Number.MAX_SAFE_INTEGER);
    const messages = rows
      .slice(0, 50)
      .reverse()
      .map((row) => this.message(row));
    return { messages, hasMore: rows.length > 50 };
  }

  messageText(deviceId: string, groupId: string, messageId: string): string {
    this.assertMember(deviceId, groupId);
    const row = this.db
      .prepare("SELECT text FROM messages WHERE id = ? AND groupId = ?")
      .get(messageId, groupId);
    if (!row) throw new ApiError(404, "Message not found.");
    return String(row.text);
  }

  linkPreview(url: string): LinkPreview | null {
    const row = this.db
      .prepare("SELECT value FROM link_previews WHERE url = ?")
      .get(url);
    return row
      ? Schema.decodeUnknownSync(LinkPreview)(JSON.parse(String(row.value)))
      : null;
  }

  saveLinkPreview(value: LinkPreview): void {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO link_previews (url, value) VALUES (?, ?)",
      )
      .run(value.url, JSON.stringify(value));
  }

  private message(row: Record<string, SQLInputValue>): Message {
    return {
      id: String(row.id),
      sequence: Number(row.sequence),
      groupId: String(row.groupId),
      text: String(row.text),
      sender: this.device(String(row.senderId)),
      createdAt: String(row.createdAt),
      attachments: Schema.decodeUnknownSync(Schema.Array(Attachment))(
        this.db
          .prepare(
            "SELECT id, name, mime, size FROM files WHERE messageId = ? ORDER BY rowid",
          )
          .all(String(row.id)),
      ),
    };
  }

  reserveFile(deviceId: string, groupId: string, file: Attachment) {
    this.assertMember(deviceId, groupId);
    const existing = this.db
      .prepare("SELECT * FROM files WHERE id = ?")
      .get(file.id);
    if (existing) {
      if (
        existing.ownerId !== deviceId ||
        existing.groupId !== groupId ||
        existing.name !== file.name ||
        existing.mime !== file.mime ||
        existing.size !== file.size
      )
        throw new ApiError(409, "This file ID is already in use.");
      return { ...file, complete: existing.complete === 1 };
    }
    this.db
      .prepare(
        "INSERT INTO files (id, groupId, ownerId, name, mime, size) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(file.id, groupId, deviceId, file.name, file.mime, file.size);
    return { ...file, complete: false };
  }

  file(deviceId: string, id: string, upload = false) {
    const row = this.db.prepare("SELECT * FROM files WHERE id = ?").get(id);
    if (!row) throw new ApiError(404, "File not found.");
    this.assertMember(deviceId, String(row.groupId));
    if (
      upload
        ? row.ownerId !== deviceId || row.messageId !== null
        : row.complete !== 1 || row.messageId === null
    )
      throw new ApiError(403, "This file is not available.");
    return {
      ...Schema.decodeUnknownSync(Attachment)(row),
      groupId: String(row.groupId),
      complete: row.complete === 1,
    };
  }

  completeFile(id: string) {
    this.db.prepare("UPDATE files SET complete = 1 WHERE id = ?").run(id);
  }

  send(deviceId: string, groupId: string, input: SendInput): Message {
    this.assertMember(deviceId, groupId);
    return this.transaction(() => {
      const old = this.db
        .prepare("SELECT * FROM messages WHERE id = ?")
        .get(input.id);
      if (old) {
        const oldFiles = this.db
          .prepare("SELECT id FROM files WHERE messageId = ? ORDER BY id")
          .all(input.id)
          .map((r) => String(r.id));
        if (
          old.senderId !== deviceId ||
          old.groupId !== groupId ||
          old.text !== input.text.trim() ||
          JSON.stringify(oldFiles) !==
            JSON.stringify([...input.attachmentIds].sort())
        )
          throw new ApiError(409, "This message ID is already in use.");
        return this.message(old);
      }
      if (!input.text.trim() && !input.attachmentIds.length)
        throw new ApiError(400, "Add a message or a file.");
      if (new Set(input.attachmentIds).size !== input.attachmentIds.length)
        throw new ApiError(400, "A file may only be attached once.");
      for (const id of input.attachmentIds) {
        const file = this.file(deviceId, id, true);
        if (file.groupId !== groupId || !file.complete)
          throw new ApiError(409, "Wait for every file to finish uploading.");
      }
      const createdAt = new Date().toISOString();
      this.db
        .prepare(
          "INSERT INTO messages (id, groupId, senderId, text, createdAt) VALUES (?, ?, ?, ?, ?)",
        )
        .run(input.id, groupId, deviceId, input.text.trim(), createdAt);
      for (const id of input.attachmentIds)
        this.db
          .prepare("UPDATE files SET messageId = ? WHERE id = ?")
          .run(input.id, id);
      return this.message(
        this.db.prepare("SELECT * FROM messages WHERE id = ?").get(input.id)!,
      );
    });
  }

  close() {
    this.db.close();
  }
}
