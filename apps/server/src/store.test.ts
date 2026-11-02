import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Store, newToken } from "./store.ts";

const profile = { name: "Phone", kind: "phone", avatar: null } as const;

test("only the host can delete a group, preserving identities and other groups", () => {
  const store = new Store(":memory:", { name: "Host", token: newToken() });
  try {
    const a = store.createGroup(store.hostId, "A");
    const b = store.createGroup(store.hostId, "B");
    const phone = store.pair(store.invite(store.hostId, a.id).token, profile);
    store.pair(
      store.invite(store.hostId, b.id).token,
      profile,
      phone.session.device.id,
    );
    const invite = store.invite(store.hostId, a.id);
    const file = {
      id: randomUUID(),
      name: "photo.png",
      mime: "image/png",
      size: 5,
    };
    store.reserveFile(store.hostId, a.id, file);
    store.completeFile(file.id);
    store.send(store.hostId, a.id, {
      id: randomUUID(),
      text: "Photo",
      attachmentIds: [file.id],
    });
    assert.throws(() => store.deleteGroup(phone.session.device.id, a.id));
    assert.deepEqual(store.deleteGroup(store.hostId, a.id), [file.id]);
    assert.equal(store.hasFile(file.id), false);
    assert.throws(() => store.pair(invite.token, profile));
    assert.throws(() => store.history(phone.session.device.id, a.id));
    assert.equal(store.authenticate(phone.token), phone.session.device.id);
    assert.deepEqual(
      store.session(phone.session.device.id).groups.map((g) => g.id),
      [b.id],
    );
  } finally {
    store.close();
  }
});

test("pairing is single-use and grants only the invited group", () => {
  const store = new Store(":memory:", { name: "Host", token: newToken() });
  try {
    const personal = store.createGroup(store.hostId, "Personal");
    const office = store.createGroup(store.hostId, "Office");
    const invitation = store.invite(store.hostId, personal.id);
    const paired = store.pair(invitation.token, profile);
    assert.deepEqual(
      paired.session.groups.map((g) => g.id),
      [personal.id],
    );
    assert.throws(() => store.pair(invitation.token, profile));
    assert.throws(() => store.history(paired.session.device.id, office.id));
    assert.throws(() =>
      store.createGroup(paired.session.device.id, "Impersonated host"),
    );
    const next = store.invite(store.hostId, office.id);
    store.pair(next.token, profile, paired.session.device.id);
    assert.equal(store.session(paired.session.device.id).groups.length, 2);
    assert.equal(store.authenticate(paired.token), paired.session.device.id);
  } finally {
    store.close();
  }
});

test("message retries are idempotent and reject changed payloads", () => {
  const store = new Store(":memory:", { name: "Host", token: newToken() });
  try {
    const group = store.createGroup(store.hostId, "Personal");
    const input = { id: randomUUID(), text: "A link", attachmentIds: [] };
    const first = store.send(store.hostId, group.id, input);
    assert.deepEqual(store.send(store.hostId, group.id, input), first);
    assert.equal(store.history(store.hostId, group.id).messages.length, 1);
    assert.throws(() =>
      store.send(store.hostId, group.id, { ...input, text: "Changed" }),
    );
  } finally {
    store.close();
  }
});

test("a file cannot cross groups, publish early, or be read after membership is revoked", () => {
  const store = new Store(":memory:", { name: "Host", token: newToken() });
  try {
    const a = store.createGroup(store.hostId, "A");
    const b = store.createGroup(store.hostId, "B");
    const phone = store.pair(store.invite(store.hostId, a.id).token, profile)
      .session.device.id;
    const file = {
      id: randomUUID(),
      name: "example.txt",
      mime: "text/plain",
      size: 3,
    };
    store.reserveFile(store.hostId, a.id, file);
    const input = { id: randomUUID(), text: "", attachmentIds: [file.id] };
    assert.throws(() => store.send(store.hostId, a.id, input));
    store.completeFile(file.id);
    assert.throws(() => store.send(store.hostId, b.id, input));
    assert.throws(() => store.file(phone, file.id));
    store.send(store.hostId, a.id, input);
    assert.equal(store.reserveFile(store.hostId, a.id, file).complete, true);
    assert.equal(store.send(store.hostId, a.id, input).id, input.id);
    assert.equal(store.file(phone, file.id).name, file.name);
    store.removeMember(store.hostId, a.id, phone);
    assert.throws(() => store.file(phone, file.id));
    assert.throws(() => store.history(phone, a.id));
  } finally {
    store.close();
  }
});
