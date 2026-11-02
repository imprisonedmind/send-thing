import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createServer as createSecureServer } from "node:https";
import { createReadStream, createWriteStream } from "node:fs";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  rm,
  stat,
  readdir,
} from "node:fs/promises";
import { join, resolve, extname, sep } from "node:path";
import { hostname } from "node:os";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import lockfile from "proper-lockfile";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  CreateGroupInput,
  Id,
  PairInput,
  ProfileInput,
  SendInput,
  SocketAuth,
  SocketPing,
  UploadInput,
  safeFilename,
} from "@send-thing/contracts";
import { Store, newToken } from "./store.ts";
import { ApiError } from "./errors.ts";
import { parseByteRange } from "./range.ts";
import { firstLink } from "@send-thing/contracts/links";
import { LinkPreviews } from "./link-preview.ts";
import { HostChallenge } from "@send-thing/contracts/network";
import { advertiseHost, hostAddresses } from "./discovery.ts";

export interface HostOptions {
  directory: string;
  port: number;
  bind: string;
  webRoot?: string;
  tls?: { cert: string; key: string };
}

async function json(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 400_000) throw new ApiError(413, "Request too large.");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    throw new ApiError(400, "Invalid JSON.");
  }
}

function decode<S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  value: unknown,
): S["Type"] {
  try {
    return Schema.decodeUnknownSync(schema)(value);
  } catch {
    throw new ApiError(400, "Invalid request. Check the supplied fields.");
  }
}

function reply(response: ServerResponse, value: unknown, status = 200) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(value));
}

export async function startHost(options: HostOptions) {
  await mkdir(options.directory, { recursive: true, mode: 0o700 });
  const release = await lockfile
    .lock(options.directory, {
      realpath: false,
      // Allow a previous process to finish releasing, or its crash lease to expire.
      stale: 10_000,
      update: 2_000,
      retries: { retries: 12, factor: 1, minTimeout: 1_000, maxTimeout: 1_000 },
    })
    .catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ELOCKED")
        throw new Error(
          "Another Send Thing host is using this data directory. Quit that host before restarting.",
          { cause: error },
        );
      throw error;
    });
  try {
    const host = await startOwnedHost(options);
    return {
      ...host,
      async close() {
        try {
          await host.close();
        } finally {
          await release();
        }
      },
    };
  } catch (error) {
    await release();
    throw error;
  }
}

async function startOwnedHost(options: HostOptions) {
  await mkdir(options.directory, { recursive: true, mode: 0o700 });
  const filesDirectory = join(options.directory, "files");
  await mkdir(filesDirectory, { recursive: true, mode: 0o700 });
  const credentialPath = join(options.directory, "host-token");
  let token: string;
  try {
    token = (await readFile(credentialPath, "utf8")).trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    token = newToken();
    await writeFile(credentialPath, token, { mode: 0o600, flag: "wx" });
  }
  decode(Id, token);
  const store = new Store(join(options.directory, "state.sqlite"), {
    name: hostname(),
    token,
  });
  // A process interruption must not leave partial bytes masquerading as a complete file.
  for (const name of await readdir(filesDirectory)) {
    if (
      name.endsWith(".part") ||
      (/^[a-zA-Z0-9_-]{16,80}$/.test(name) && !store.hasFile(name))
    )
      await rm(join(filesDirectory, name));
  }
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  const clients = new Map<WebSocket, string>();
  const activeUploads = new Set<string>();
  const linkPreviews = new LinkPreviews();
  const pairAttempts = new Map<string, { count: number; until: number }>();
  const broadcast = (groupId: string) => {
    for (const [socket, deviceId] of clients) {
      try {
        store.assertMember(deviceId, groupId);
        if (socket.bufferedAmount > 64 * 1024) socket.terminate();
        else socket.send(JSON.stringify({ type: "changed", groupId }));
      } catch {
        /* Membership can be removed while a socket remains connected. */
      }
    }
  };

  const handle = async (request: IncomingMessage, response: ServerResponse) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, Range",
    );
    response.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS",
    );
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }
    const url = new URL(request.url ?? "/", "http://host");
    const parts = url.pathname.split("/").filter(Boolean);
    const method = request.method;
    const bearer = request.headers.authorization?.replace(/^Bearer /, "");

    if (method === "POST" && url.pathname === "/api/host-proof") {
      const input = decode(HostChallenge, await json(request));
      reply(
        response,
        "deviceId" in input
          ? store.hostProof(input.deviceId, input.nonce)
          : store.hostProof(input.credentialId, input.nonce, "credential"),
      );
      return;
    }

    if (method === "POST" && url.pathname === "/api/pair") {
      const address = request.socket.remoteAddress ?? "unknown";
      const now = Date.now();
      for (const [key, entry] of pairAttempts)
        if (entry.until < now) pairAttempts.delete(key);
      const limit = pairAttempts.get(address) ?? {
        count: 0,
        until: now + 60_000,
      };
      if (++limit.count > 20 || pairAttempts.size > 10_000)
        throw new ApiError(
          429,
          "Too many pairing attempts. Try again in a minute.",
        );
      pairAttempts.set(address, limit);
      const input = decode(PairInput, await json(request));
      const existing = bearer ? store.authenticate(bearer) : undefined;
      const result = store.pair(input.invite, input.profile, existing);
      reply(response, {
        ...result,
        token: existing ? bearer : result.token,
        session: { ...result.session, endpoints: endpoints() },
      });
      for (const group of result.session.groups) broadcast(group.id);
      return;
    }

    if (parts[0] === "api") {
      if (!bearer) throw new ApiError(401, "Pair this device with the host.");
      const device = store.authenticate(bearer);
      if (method === "GET" && url.pathname === "/api/session") {
        reply(response, { ...store.session(device), endpoints: endpoints() });
        return;
      }
      if (method === "PUT" && url.pathname === "/api/profile") {
        reply(
          response,
          store.updateProfile(
            device,
            decode(ProfileInput, await json(request)),
          ),
        );
        for (const group of store.session(device).groups) broadcast(group.id);
        return;
      }
      if (method === "POST" && url.pathname === "/api/groups") {
        reply(
          response,
          store.createGroup(
            device,
            decode(CreateGroupInput, await json(request)).name,
          ),
          201,
        );
        return;
      }
      if (parts[1] === "groups" && parts[2]) {
        const groupId = decode(Id, parts[2]);
        if (parts.length === 3 && method === "DELETE") {
          const fileIds = store.groupFileIds(device, groupId);
          if (fileIds.some((id) => activeUploads.has(id)))
            throw new ApiError(
              409,
              "Wait for this group’s uploads to finish before deleting it.",
            );
          const memberIds = new Set(
            store.members(device, groupId).map((member) => member.id),
          );
          store.deleteGroup(device, groupId);
          for (const [socket, id] of clients)
            if (memberIds.has(id)) socket.close(4001, "Group deleted");
          // Metadata deletion commits first so access is immediately revoked. A crash
          // or failed unlink is recovered by orphan cleanup on the next host start.
          const cleanup = await Promise.allSettled(
            fileIds.map((id) => rm(join(filesDirectory, id), { force: true })),
          );
          for (const result of cleanup)
            if (result.status === "rejected")
              console.error(
                "Deleted group file cleanup will retry on restart:",
                result.reason,
              );
          reply(response, { ok: true });
          return;
        }
        if (parts.length === 4 && parts[3] === "invites" && method === "POST") {
          reply(response, store.invite(device, groupId));
          return;
        }
        if (parts.length === 4 && parts[3] === "members" && method === "GET") {
          reply(response, store.members(device, groupId));
          return;
        }
        if (
          parts.length === 5 &&
          parts[3] === "members" &&
          method === "DELETE"
        ) {
          const removed = decode(Id, parts[4]);
          store.removeMember(device, groupId, removed);
          for (const [socket, id] of clients)
            if (id === removed) socket.close(4001, "Membership changed");
          broadcast(groupId);
          reply(response, { ok: true });
          return;
        }
        if (
          parts.length === 6 &&
          parts[3] === "messages" &&
          parts[5] === "preview" &&
          method === "GET"
        ) {
          const text = store.messageText(device, groupId, decode(Id, parts[4]));
          const link = firstLink(text);
          const preview = link ? await linkPreviews.get(link) : null;
          // Membership can change while external metadata is being fetched.
          store.assertMember(device, groupId);
          reply(response, preview);
          return;
        }
        if (parts.length === 4 && parts[3] === "messages") {
          if (method === "GET") {
            const before = url.searchParams.has("before")
              ? Number(url.searchParams.get("before"))
              : undefined;
            if (
              before !== undefined &&
              (!Number.isSafeInteger(before) || before <= 0)
            )
              throw new ApiError(400, "Invalid history cursor.");
            reply(response, store.history(device, groupId, before));
            return;
          }
          if (method === "POST") {
            const message = store.send(
              device,
              groupId,
              decode(SendInput, await json(request)),
            );
            broadcast(groupId);
            reply(response, message, 201);
            return;
          }
        }
        if (parts.length === 4 && parts[3] === "files" && method === "POST") {
          reply(
            response,
            store.reserveFile(
              device,
              groupId,
              decode(UploadInput, await json(request)),
            ),
          );
          return;
        }
      }
      if (
        parts.length === 4 &&
        parts[1] === "files" &&
        parts[3] === "metadata" &&
        method === "GET"
      ) {
        reply(response, store.file(device, decode(Id, parts[2])));
        return;
      }
      if (parts.length === 3 && parts[1] === "files" && parts[2]) {
        const id = decode(Id, parts[2]);
        if (method === "PUT") {
          const file = store.file(device, id, true);
          if (activeUploads.has(id))
            throw new ApiError(409, "This file is already uploading.");
          if (file.complete) {
            request.resume();
            reply(response, file);
            return;
          }
          activeUploads.add(id);
          const temporary = join(filesDirectory, `${id}.${randomUUID()}.part`);
          let bytes = 0;
          try {
            const meter = new Transform({
              transform(chunk, _encoding, callback) {
                bytes += chunk.length;
                callback(
                  bytes > file.size
                    ? new ApiError(413, "File exceeds its declared size.")
                    : null,
                  chunk,
                );
              },
            });
            await pipeline(
              request,
              meter,
              createWriteStream(temporary, { flags: "wx", mode: 0o600 }),
            );
            if (bytes !== file.size)
              throw new ApiError(400, "Upload was incomplete. Retry the file.");
            store.assertMember(device, file.groupId);
            await rename(temporary, join(filesDirectory, id));
            store.completeFile(id);
            reply(response, file);
          } finally {
            activeUploads.delete(id);
            await rm(temporary, { force: true });
          }
          return;
        }
        if (method === "GET") {
          const file = store.file(device, id);
          const path = join(filesDirectory, id);
          await stat(path);
          const range = request.headers.range
            ? parseByteRange(request.headers.range, file.size)
            : undefined;
          if (range === null) {
            response.writeHead(416, {
              "Content-Range": `bytes */${file.size}`,
            });
            response.end();
            return;
          }
          response.writeHead(range ? 206 : 200, {
            "Content-Type":
              /^(image\/(png|jpeg|webp|gif|avif|heic|heif)|video\/[\w.+-]+)$/.test(
                file.mime,
              )
                ? file.mime
                : "application/octet-stream",
            "Content-Length": range ? range.end - range.start + 1 : file.size,
            "Accept-Ranges": "bytes",
            ...(range
              ? {
                  "Content-Range": `bytes ${range.start}-${range.end}/${file.size}`,
                }
              : {}),
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeFilename(file.name))}`,
            "Cache-Control": "private, no-store",
          });
          await pipeline(createReadStream(path, range), response);
          return;
        }
      }
      throw new ApiError(404, "Not found.");
    }

    if (method === "GET" && options.webRoot) {
      const root = resolve(options.webRoot);
      let path = resolve(root, `.${decodeURIComponent(url.pathname)}`);
      if (path !== root && !path.startsWith(root + sep))
        throw new ApiError(404, "Not found.");
      if (url.pathname === "/") path = join(root, "index.html");
      const types: Record<string, string> = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".png": "image/png",
      };
      const data = await readFile(path);
      response.writeHead(200, {
        "Content-Type": types[extname(path)] ?? "application/octet-stream",
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: sendthing-media:; media-src 'self' blob: sendthing-media:; connect-src 'self' http: https: ws: wss:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'",
      });
      response.end(data);
      return;
    }
    throw new ApiError(404, "Not found.");
  };

  const listener = (request: IncomingMessage, response: ServerResponse) => {
    void handle(request, response).catch((error) => {
      if (response.headersSent || response.destroyed) {
        response.destroy();
        return;
      }
      if (!(error instanceof ApiError))
        console.error("Host request failed", error);
      reply(
        response,
        {
          error:
            error instanceof ApiError
              ? error.message
              : "The host could not complete this request.",
        },
        error instanceof ApiError ? error.status : 500,
      );
    });
  };
  const server = options.tls
    ? createSecureServer(
        {
          cert: await readFile(options.tls.cert),
          key: await readFile(options.tls.key),
        },
        listener,
      )
    : createServer(listener);
  server.requestTimeout = 10 * 60_000;
  server.headersTimeout = 15_000;
  server.on("upgrade", (request, socket, head) => {
    if (request.url !== "/events") {
      socket.destroy();
      return;
    }
    sockets.handleUpgrade(request, socket, head, (ws) =>
      sockets.emit("connection", ws),
    );
  });
  sockets.on("connection", (socket) => {
    const timeout = setTimeout(
      () => socket.close(4000, "Authentication required"),
      5000,
    );
    socket.on("error", () => socket.terminate());
    socket.once("message", (data) => {
      clearTimeout(timeout);
      try {
        const auth = decode(SocketAuth, JSON.parse(data.toString()));
        clients.set(socket, store.authenticate(auth.token));
        socket.send(JSON.stringify({ type: "ready" }));
        socket.on("message", (data) => {
          try {
            const ping = decode(SocketPing, JSON.parse(data.toString()));
            socket.send(JSON.stringify({ type: "pong", nonce: ping.nonce }));
          } catch {
            socket.close(1008, "Invalid message");
          }
        });
      } catch {
        socket.close(4003, "Authentication failed");
      }
    });
    socket.on("close", () => {
      clearTimeout(timeout);
      clients.delete(socket);
    });
  });
  const alive = new Set<WebSocket>();
  sockets.on("connection", (socket) => {
    alive.add(socket);
    socket.on("pong", () => alive.add(socket));
    socket.on("close", () => alive.delete(socket));
  });
  const heartbeat = setInterval(() => {
    for (const socket of sockets.clients) {
      if (!alive.delete(socket)) socket.terminate();
      else socket.ping();
    }
  }, 30_000);
  try {
    await new Promise<void>((accept, reject) => {
      server.once("error", reject);
      server.listen(options.port, options.bind, () => {
        server.off("error", reject);
        accept();
      });
    });
  } catch (error) {
    clearInterval(heartbeat);
    sockets.close();
    store.close();
    throw error;
  }
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Host did not bind a TCP port.");
  const endpoints = () =>
    hostAddresses(options.bind, address.port, options.tls ? "https" : "http");
  const stopAdvertising = advertiseHost(
    store.hostId,
    options.bind,
    address.port,
    options.tls ? "https" : "http",
  );
  return {
    hostId: store.hostId,
    token,
    port: address.port,
    protocol: options.tls ? "https" : "http",
    async close() {
      stopAdvertising();
      clearInterval(heartbeat);
      linkPreviews.close();
      for (const socket of sockets.clients) socket.terminate();
      sockets.close();
      await new Promise<void>((accept, reject) =>
        server.close((error) => (error ? reject(error) : accept())),
      );
      store.close();
    },
  };
}

// Resource ownership stays with the host runtime, independently of the desktop shell.
export const hostResource = (options: HostOptions) =>
  Effect.acquireRelease(
    Effect.tryPromise(() => startHost(options)),
    (host) => Effect.promise(() => host.close()),
  );
