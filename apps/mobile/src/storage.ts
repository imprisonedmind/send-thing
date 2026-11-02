import * as SecureStore from "expo-secure-store";
import { Directory, File, Paths } from "expo-file-system";
import * as Crypto from "expo-crypto";
import * as Schema from "effect/Schema";
import { openDatabaseSync, type SQLiteDatabase } from "expo-sqlite";
import {
  Attachment,
  Connections,
  type Connection,
  MAX_FILE_BYTES,
  safeFilename,
  Id,
  type ProfileInput,
} from "@send-thing/contracts";

const connectionKey = "send-thing.connections.v1";
export async function loadConnections(): Promise<Connection[]> {
  const json = await SecureStore.getItemAsync(connectionKey);
  return json
    ? [...Schema.decodeUnknownSync(Connections)(JSON.parse(json))]
    : [];
}
let connectionWrite = Promise.resolve();
export function saveConnections(connections: Connection[]) {
  const encoded = JSON.stringify(connections);
  const next = connectionWrite
    .catch(() => {})
    .then(() => SecureStore.setItemAsync(connectionKey, encoded));
  connectionWrite = next;
  return next;
}

const Selection = Schema.Struct({ hostId: Id, groupId: Schema.NullOr(Id) });
export type Selection = typeof Selection.Type;
export async function loadSelection(): Promise<Selection | null> {
  const json = await SecureStore.getItemAsync("send-thing.selection.v1");
  return json ? Schema.decodeUnknownSync(Selection)(JSON.parse(json)) : null;
}
let selectionWrite = Promise.resolve();
export function saveSelection(selection: Selection) {
  const next = selectionWrite
    .catch(() => {})
    .then(() =>
      SecureStore.setItemAsync(
        "send-thing.selection.v1",
        JSON.stringify(selection),
      ),
    );
  selectionWrite = next;
  return next;
}

const PendingFile = Schema.Struct({ metadata: Attachment, uri: Schema.String });
const Draft = Schema.Struct({
  id: Schema.String,
  text: Schema.String,
  files: Schema.Array(PendingFile),
  destination: Schema.NullOr(Schema.String),
  sourceFingerprint: Schema.NullOr(Schema.String),
});
export type Draft = typeof Draft.Type;
export type PendingFile = typeof PendingFile.Type;
const pending = new Directory(Paths.document, "pending-files");
let database: SQLiteDatabase | undefined;
function draftsDatabase() {
  if (!database) {
    database = openDatabaseSync("send-thing.sqlite");
    database.execSync(
      "PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS drafts (key TEXT PRIMARY KEY, json TEXT NOT NULL);",
    );
    database.execSync(
      "CREATE TABLE IF NOT EXISTS preferences (key TEXT PRIMARY KEY, json TEXT NOT NULL);",
    );
  }
  return database;
}

export const profileStorage = {
  read: async (): Promise<unknown | null> => {
    const row = draftsDatabase().getFirstSync<{ json: string }>(
      "SELECT json FROM preferences WHERE key = ?",
      "device-profile",
    );
    return row ? JSON.parse(row.json) : null;
  },
  write: async (profile: ProfileInput) => {
    draftsDatabase().runSync(
      "INSERT INTO preferences VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET json = excluded.json",
      "device-profile",
      JSON.stringify(profile),
    );
  },
};

export function emptyDraft(): Draft {
  return {
    id: Crypto.randomUUID(),
    text: "",
    files: [],
    destination: null,
    sourceFingerprint: null,
  };
}
export function loadDraft(key: string): Draft {
  const row = draftsDatabase().getFirstSync<{ json: string }>(
    "SELECT json FROM drafts WHERE key = ?",
    key,
  );
  return row
    ? Schema.decodeUnknownSync(Draft)(JSON.parse(row.json))
    : emptyDraft();
}
export function saveDraft(key: string, draft: Draft) {
  draftsDatabase().runSync(
    "INSERT INTO drafts VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET json = excluded.json",
    key,
    JSON.stringify(draft),
  );
}
export function removeDraft(key: string) {
  draftsDatabase().runSync("DELETE FROM drafts WHERE key = ?", key);
}

export async function persistFile(
  uri: string,
  name: string,
  mime: string,
): Promise<PendingFile> {
  const original = new File(uri);
  if (!original.exists)
    throw new Error(`Cannot read ${name}. Share it again from the source app.`);
  if (original.size > MAX_FILE_BYTES)
    throw new Error(`${name} exceeds the 256 MB file limit.`);
  pending.create({ intermediates: true, idempotent: true });
  const id = Crypto.randomUUID();
  const folder = new Directory(pending, id);
  folder.create();
  const file = new File(folder, safeFilename(name));
  await original.copy(file);
  return { metadata: { id, name, mime, size: file.size }, uri: file.uri };
}
export function removePendingFiles(files: readonly PendingFile[]) {
  for (const file of files) {
    if (
      !file.uri.startsWith(
        pending.uri.endsWith("/") ? pending.uri : pending.uri + "/",
      )
    )
      continue;
    const owned = new File(file.uri);
    if (owned.exists) owned.delete();
  }
}
