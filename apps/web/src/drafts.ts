import * as Schema from "effect/Schema";
import { Attachment, Id } from "@send-thing/contracts";

const Draft = Schema.Struct({
  id: Id,
  text: Schema.String,
  files: Schema.Array(
    Schema.Struct({
      metadata: Attachment,
      file: Schema.instanceOf(globalThis.File),
    }),
  ),
});
export type Draft = typeof Draft.Type;
let database: Promise<IDBDatabase> | undefined;
function open() {
  if (!database)
    database = new Promise((accept, reject) => {
      const request = indexedDB.open("send-thing", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("drafts");
      request.onerror = () => {
        database = undefined;
        reject(request.error);
      };
      request.onsuccess = () => accept(request.result);
    });
  return database;
}

export async function loadDraft(key: string): Promise<Draft> {
  const db = await open();
  return new Promise((accept, reject) => {
    const request = db.transaction("drafts").objectStore("drafts").get(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      try {
        accept(
          request.result === undefined
            ? { id: crypto.randomUUID(), text: "", files: [] }
            : Schema.decodeUnknownSync(Draft)(request.result),
        );
      } catch (error) {
        reject(error);
      }
    };
  });
}

export async function saveDraft(key: string, draft: Draft | null) {
  const db = await open();
  return new Promise<void>((accept, reject) => {
    const transaction = db.transaction("drafts", "readwrite");
    const store = transaction.objectStore("drafts");
    if (draft) store.put(draft, key);
    else store.delete(key);
    transaction.oncomplete = () => accept();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Draft could not be saved."));
  });
}
