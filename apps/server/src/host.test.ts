import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import * as Schema from "effect/Schema";
import { Group, History, Invite, PairResult } from "@send-thing/contracts";
import { startHost } from "./host.ts";

test("transport protects private file bytes and keeps committed history across restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "send-thing-test-"));
  let host: Awaited<ReturnType<typeof startHost>> | undefined;
  try {
    host = await startHost({ directory, bind: "127.0.0.1", port: 0 });
    const origin = `http://127.0.0.1:${host.port}`;
    const call = (
      path: string,
      method = "GET",
      body?: unknown,
      token = host!.token,
    ) =>
      fetch(origin + path, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    assert.equal((await fetch(origin + "/api/session")).status, 401);
    assert.equal(
      (await call("/api/groups", "POST", { name: " " })).status,
      400,
    );
    const personal = Schema.decodeUnknownSync(Group)(
      await (await call("/api/groups", "POST", { name: "Personal" })).json(),
    );
    const office = Schema.decodeUnknownSync(Group)(
      await (await call("/api/groups", "POST", { name: "Office" })).json(),
    );
    const invite = Schema.decodeUnknownSync(Invite)(
      await (await call(`/api/groups/${office.id}/invites`, "POST")).json(),
    );
    const paired = Schema.decodeUnknownSync(PairResult)(
      await (
        await call(
          "/api/pair",
          "POST",
          {
            invite: invite.token,
            profile: { name: "Office phone", kind: "phone", avatar: null },
          },
          "",
        )
      ).json(),
    );
    const file = {
      id: randomUUID(),
      name: "hello.txt",
      mime: "text/plain",
      size: 5,
    };
    assert.equal(
      (await call(`/api/groups/${personal.id}/files`, "POST", file)).status,
      200,
    );
    assert.equal(
      (
        await fetch(`${origin}/api/files/${file.id}`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${host.token}` },
          body: "hello",
        })
      ).status,
      200,
    );
    const message = { id: randomUUID(), text: "", attachmentIds: [file.id] };
    assert.equal(
      (await call(`/api/groups/${personal.id}/messages`, "POST", message))
        .status,
      201,
    );
    const previewPath = `/api/groups/${personal.id}/messages/${message.id}/preview`;
    assert.equal((await fetch(origin + previewPath)).status, 401);
    assert.equal(
      (await call(previewPath, "GET", undefined, paired.token)).status,
      403,
    );
    assert.equal(await (await call(previewPath)).json(), null);
    assert.equal(
      (await call(`/api/groups/${office.id}/messages/${message.id}/preview`))
        .status,
      404,
    );
    assert.equal(
      (await call(`/api/files/${file.id}`, "GET", undefined, paired.token))
        .status,
      403,
    );
    assert.equal(
      (
        await call(
          `/api/files/${file.id}/metadata`,
          "GET",
          undefined,
          paired.token,
        )
      ).status,
      403,
    );
    assert.equal(await (await call(`/api/files/${file.id}`)).text(), "hello");
    const range = await fetch(`${origin}/api/files/${file.id}`, {
      headers: { Authorization: `Bearer ${host.token}`, Range: "bytes=1-3" },
    });
    assert.equal(range.status, 206);
    assert.equal(range.headers.get("Content-Range"), "bytes 1-3/5");
    assert.equal(await range.text(), "ell");
    assert.equal(
      (
        await fetch(`${origin}/api/files/${file.id}`, {
          headers: {
            Authorization: `Bearer ${paired.token}`,
            Range: "bytes=1-3",
          },
        })
      ).status,
      403,
    );
    const invalidRange = await fetch(`${origin}/api/files/${file.id}`, {
      headers: { Authorization: `Bearer ${host.token}`, Range: "bytes=5-" },
    });
    assert.equal(invalidRange.status, 416);
    assert.equal(invalidRange.headers.get("Content-Range"), "bytes */5");
    const originalHostId = host.hostId;
    await host.close();
    host = undefined;
    host = await startHost({ directory, bind: "127.0.0.1", port: 0 });
    assert.equal(host.hostId, originalHostId);
    const response = await fetch(
      `http://127.0.0.1:${host.port}/api/groups/${personal.id}/messages`,
      { headers: { Authorization: `Bearer ${host.token}` } },
    );
    const history = Schema.decodeUnknownSync(History)(await response.json());
    assert.equal(history.messages[0]?.id, message.id);
    assert.equal(history.messages[0]?.attachments[0]?.name, file.name);
    const restartedOrigin = `http://127.0.0.1:${host.port}`;
    assert.equal(
      (
        await fetch(`${restartedOrigin}/api/groups/${office.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${paired.token}` },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(`${restartedOrigin}/api/groups/${personal.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${host.token}` },
        })
      ).status,
      200,
    );
    await assert.rejects(stat(join(directory, "files", file.id)), {
      code: "ENOENT",
    });
    assert.equal(
      (
        await fetch(`${restartedOrigin}/api/files/${file.id}`, {
          headers: { Authorization: `Bearer ${host.token}` },
        })
      ).status,
      404,
    );
  } finally {
    await host?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
