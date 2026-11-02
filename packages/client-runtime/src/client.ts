import * as Schema from "effect/Schema";
import { connectionLog } from "./connection-log.ts";
import {
  hostRoutes,
  isLanUrl,
  isLoopbackUrl,
} from "@send-thing/contracts/network";
import {
  connectionNonce,
  resolveHostRoute,
  type ConnectionOptions,
} from "./routes.ts";
export type { ConnectionOptions } from "./routes.ts";
import {
  Attachment,
  UploadReservation,
  Device,
  Group,
  History,
  Invite,
  Message,
  LinkPreview,
  PairResult,
  Session,
  Event,
  normalizeHostUrl,
  type Connection,
  type ProfileInput,
  type SendInput,
} from "@send-thing/contracts";

export class RequestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export class ProtocolError extends Error {}

export async function request<S extends Schema.ConstraintDecoder<unknown>>(
  url: string,
  token: string | null,
  path: string,
  schema: S,
  init: RequestInit = {},
): Promise<S["Type"]> {
  const response = await fetch(`${normalizeHostUrl(url)}${path}`, {
    ...init,
    redirect: "error",
    signal: init.signal ?? AbortSignal.timeout(30_000),
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    throw new RequestError(
      response.status,
      body &&
        typeof body === "object" &&
        "error" in body &&
        typeof body.error === "string"
        ? body.error
        : `Host returned ${response.status}.`,
    );
  }
  const body: unknown = await response.json();
  try {
    return Schema.decodeUnknownSync(schema)(body);
  } catch {
    throw new ProtocolError(
      "Use compatible versions of Send Thing on this device and the host.",
    );
  }
}

export async function pair(
  url: string,
  invite: string,
  profile: ProfileInput,
  existing?: Connection,
): Promise<Connection> {
  const normalized = normalizeHostUrl(url);
  const result = await request(
    normalized,
    existing?.token ?? null,
    "/api/pair",
    PairResult,
    {
      method: "POST",
      body: JSON.stringify({ invite: invite.trim(), profile }),
    },
  );
  return {
    hostId: result.session.hostId,
    url: normalized,
    token: result.token,
    label: result.session.groups[0]?.name ?? profile.name,
    ...(result.session.endpoints
      ? {
          deviceId: result.session.device.id,
          routes: hostRoutes([normalized, ...result.session.endpoints]),
        }
      : {}),
  };
}

export interface HostSnapshot {
  session: Session | null;
  status:
    | "connecting"
    | "reconnecting"
    | "online"
    | "offline"
    | "error"
    | "unsupported";
  error: string | null;
  revision: number;
}

export class HostClient {
  connection: Connection;
  private readonly options: ConnectionOptions;
  private routeAbort?: AbortController;
  private routeTimer?: ReturnType<typeof setInterval>;
  private checkingRoute = false;
  private pendingProbe?: { nonce: string; done: () => void };
  private snapshot: HostSnapshot = {
    session: null,
    status: "connecting",
    error: null,
    revision: 0,
  };
  private listeners = new Set<() => void>();
  private socket?: WebSocket;
  private timer?: ReturnType<typeof setTimeout>;
  private handshake?: ReturnType<typeof setTimeout>;
  private stopped = true;
  private attempt = 0;
  private refreshPending = false;
  private refreshing = false;
  private networkAvailable = true;
  private refreshAbort?: AbortController;

  constructor(connection: Connection, options: ConnectionOptions = {}) {
    this.connection = { ...connection };
    this.options = options;
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(next: Partial<HostSnapshot>) {
    if (
      (next.status && next.status !== this.snapshot.status) ||
      (next.error && next.error !== this.snapshot.error)
    ) {
      connectionLog("state", {
        hostId: this.connection.hostId,
        url: this.connection.url,
        status: next.status ?? this.snapshot.status,
        ...(next.error ? { error: next.error } : {}),
      });
    }
    this.snapshot = { ...this.snapshot, ...next };
    for (const listener of this.listeners) listener();
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
    this.routeTimer = setInterval(() => void this.checkConnection(), 30_000);
  }
  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    clearTimeout(this.handshake);
    clearInterval(this.routeTimer);
    this.routeAbort?.abort();
    this.refreshAbort?.abort();
    this.refreshPending = false;
    const socket = this.socket;
    this.socket = undefined;
    socket?.close();
  }
  reconnect() {
    this.stop();
    this.start();
  }
  networkChanged() {
    if (this.stopped) return;
    if (this.snapshot.status === "online") {
      connectionLog("network-changed", {
        hostId: this.connection.hostId,
        status: this.snapshot.status,
      });
      void this.checkConnection();
    }
    // Connectivity notifications can repeat every few seconds without a route
    // change. Let an existing discovery/retry finish; offline -> online already
    // restarts immediately through setNetworkAvailable.
  }
  setNetworkAvailable(available: boolean) {
    if (this.networkAvailable === available) return;
    this.networkAvailable = available;
    if (this.stopped) return;
    if (available) this.reconnect();
    else {
      this.stop();
      this.stopped = false;
      this.publish({ status: "offline", error: null });
    }
  }

  private connect() {
    if (this.stopped) return;
    connectionLog("connect", {
      hostId: this.connection.hostId,
      url: this.connection.url,
      attempt: this.attempt,
    });
    if (!this.networkAvailable) {
      this.publish({ status: "offline", error: null });
      return;
    }
    this.publish({
      status:
        this.snapshot.session || this.attempt ? "reconnecting" : "connecting",
    });
    if (
      (!this.connection.deviceId && this.attempt === 0) ||
      isLoopbackUrl(this.connection.url)
    ) {
      this.openSocket();
      return;
    }
    const controller = new AbortController();
    this.routeAbort = controller;
    void resolveHostRoute(this.connection, this.options, controller.signal)
      .then(async (url) => {
        if (controller.signal.aborted || this.stopped || !url) return;
        await this.updateConnection({ ...this.connection, url });
        if (!controller.signal.aborted && !this.stopped) this.openSocket();
      })
      .catch((error) => {
        if (controller.signal.aborted || this.stopped) return;
        this.publish({ status: "reconnecting", error: errorText(error) });
        this.timer = setTimeout(
          () => this.connect(),
          Math.min(30_000, 1000 * 2 ** this.attempt++),
        );
      });
  }

  private async updateConnection(next: Connection) {
    if (JSON.stringify(next) === JSON.stringify(this.connection)) return;
    await this.options.onConnectionChange?.(next);
    this.connection = next;
  }

  private async checkConnection() {
    if (
      this.stopped ||
      this.checkingRoute ||
      this.snapshot.status !== "online" ||
      !this.connection.deviceId ||
      isLoopbackUrl(this.connection.url)
    )
      return;
    this.checkingRoute = true;
    const controller = new AbortController();
    this.routeAbort = controller;
    try {
      try {
        await this.probeSocket(controller.signal);
      } catch {
        if (
          !this.stopped &&
          this.routeAbort === controller &&
          this.snapshot.status === "online"
        )
          this.reconnect();
        return;
      }
      if (
        isLanUrl(this.connection.url) ||
        !this.options.discover ||
        controller.signal.aborted ||
        this.stopped
      )
        return;
      const url = await resolveHostRoute(
        this.connection,
        this.options,
        controller.signal,
        true,
      );
      if (url && !controller.signal.aborted && !this.stopped) {
        await this.updateConnection({ ...this.connection, url });
        if (!controller.signal.aborted && !this.stopped) this.reconnect();
      }
    } catch (error) {
      if (!controller.signal.aborted) this.publish({ error: errorText(error) });
    } finally {
      this.checkingRoute = false;
    }
  }

  private probeSocket(signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      const nonce = (this.options.nonce ?? connectionNonce)();
      const finish = (error?: Error) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        if (this.pendingProbe?.nonce === nonce) this.pendingProbe = undefined;
        if (error) reject(error);
        else resolve();
      };
      const abort = () => finish(new Error("Connection probe cancelled."));
      const timer = setTimeout(
        () => finish(new Error("Host stopped responding.")),
        isLanUrl(this.connection.url) ? 3_000 : 10_000,
      );
      this.pendingProbe = { nonce, done: () => finish() };
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) {
        abort();
        return;
      }
      try {
        if (this.socket?.readyState !== WebSocket.OPEN)
          throw new Error("Socket closed.");
        this.socket.send(JSON.stringify({ type: "ping", nonce }));
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private openSocket() {
    connectionLog("socket-open", {
      hostId: this.connection.hostId,
      url: this.connection.url,
    });
    const url = new URL(normalizeHostUrl(this.connection.url));
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/events";
    const socket = new WebSocket(url.toString());
    this.socket = socket;
    const isCurrent = () => !this.stopped && this.socket === socket;
    this.handshake = setTimeout(() => socket.close(), 10_000);
    socket.onopen = () => {
      if (isCurrent())
        socket.send(JSON.stringify({ token: this.connection.token }));
    };
    socket.onmessage = (message) => {
      if (!isCurrent()) return;
      try {
        const event = Schema.decodeUnknownSync(Event)(
          JSON.parse(String(message.data)),
        );
        if (event.type === "pong") {
          if (event.nonce === this.pendingProbe?.nonce)
            this.pendingProbe.done();
          return;
        }
        if (event.type === "ready") {
          clearTimeout(this.handshake);
        }
        void this.refresh();
      } catch {
        this.publish({
          status: "unsupported",
          error:
            "Use compatible versions of Send Thing on this device and the host.",
        });
        socket.close();
      }
    };
    socket.onerror = () => socket.close();
    socket.onclose = (event) => {
      if (!isCurrent()) return;
      connectionLog("socket-close", {
        hostId: this.connection.hostId,
        code: event.code,
      });
      clearTimeout(this.handshake);
      this.routeAbort?.abort();
      this.refreshAbort?.abort();
      if (this.snapshot.status === "unsupported") return;
      this.publish({
        status: event.code === 4003 ? "error" : "reconnecting",
        error:
          event.code === 4003
            ? "Pair this device with the host again."
            : "Host unavailable. Check that it is awake and reachable.",
      });
      if (event.code !== 4003)
        this.timer = setTimeout(
          () => this.connect(),
          Math.min(30_000, 1000 * 2 ** this.attempt++),
        );
    };
  }

  async refresh() {
    this.refreshPending = true;
    if (this.refreshing) return;
    this.refreshing = true;
    const socket = this.socket;
    const current = () =>
      !this.stopped &&
      this.socket === socket &&
      socket?.readyState === WebSocket.OPEN;
    try {
      while (this.refreshPending && current()) {
        this.refreshPending = false;
        this.refreshAbort = new AbortController();
        const timeout = setTimeout(() => this.refreshAbort?.abort(), 15_000);
        let session: Session;
        try {
          session = await this.call("/api/session", Session, {
            signal: this.refreshAbort.signal,
          });
        } finally {
          clearTimeout(timeout);
        }
        if (session.hostId !== this.connection.hostId)
          throw new RequestError(
            401,
            "This address now belongs to a different host. Pair again.",
          );
        if (current()) {
          if (session.endpoints) {
            await this.updateConnection({
              ...this.connection,
              deviceId: session.device.id,
              routes: hostRoutes([
                this.connection.url,
                ...(this.connection.routes ?? []).filter(
                  (url) => !isLanUrl(url),
                ),
                ...session.endpoints,
              ]),
            });
          }
          if (!current()) break;
          this.attempt = 0;
          this.publish({
            session,
            status: "online",
            error: null,
            revision: this.snapshot.revision + 1,
          });
        }
      }
    } catch (error) {
      if (current()) {
        if (error instanceof ProtocolError) {
          this.publish({ status: "unsupported", error: error.message });
          this.stop();
        } else if (
          error instanceof RequestError &&
          [401, 403].includes(error.status)
        ) {
          this.publish({ status: "error", error: errorText(error) });
          // Stop retrying credentials that require pairing again.
          this.stop();
        } else {
          this.publish({ status: "reconnecting", error: errorText(error) });
          socket?.close();
        }
      }
    } finally {
      this.refreshing = false;
      if (this.refreshPending && !this.stopped && this.socket !== socket)
        void this.refresh();
    }
  }

  call<S extends Schema.ConstraintDecoder<unknown>>(
    path: string,
    schema: S,
    init?: RequestInit,
  ) {
    return request(
      this.connection.url,
      this.connection.token,
      path,
      schema,
      init,
    );
  }
  history(groupId: string, before?: number) {
    return this.call(
      `/api/groups/${groupId}/messages${before ? `?before=${before}` : ""}`,
      History,
    );
  }
  members(groupId: string) {
    return this.call(`/api/groups/${groupId}/members`, Schema.Array(Device));
  }
  linkPreview(groupId: string, messageId: string, signal: AbortSignal) {
    return this.call(
      `/api/groups/${groupId}/messages/${messageId}/preview`,
      Schema.NullOr(LinkPreview),
      { signal },
    );
  }
  async createGroup(name: string) {
    const group = await this.call("/api/groups", Group, {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    await this.refresh();
    return group;
  }
  invite(groupId: string) {
    return this.call(`/api/groups/${groupId}/invites`, Invite, {
      method: "POST",
    });
  }
  async deleteGroup(groupId: string) {
    await this.call(
      `/api/groups/${groupId}`,
      Schema.Struct({ ok: Schema.Boolean }),
      { method: "DELETE" },
    );
    await this.refresh();
  }
  async profile(profile: ProfileInput) {
    await this.call("/api/profile", Device, {
      method: "PUT",
      body: JSON.stringify(profile),
    });
    await this.refresh();
  }
  async removeMember(groupId: string, deviceId: string) {
    await this.call(
      `/api/groups/${groupId}/members/${deviceId}`,
      Schema.Struct({ ok: Schema.Boolean }),
      { method: "DELETE" },
    );
    await this.refresh();
  }
  send(groupId: string, input: SendInput) {
    return this.call(`/api/groups/${groupId}/messages`, Message, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
  async upload(
    groupId: string,
    file: Attachment,
    body: BodyInit,
    uploadFetch: typeof fetch = fetch,
  ) {
    const reservation = await this.call(
      `/api/groups/${groupId}/files`,
      UploadReservation,
      {
        method: "POST",
        body: JSON.stringify(file),
      },
    );
    // A prior send may have committed even if its acknowledgement was lost.
    if (reservation.complete) return;
    const result = await uploadFetch(
      `${this.connection.url}/api/files/${file.id}`,
      {
        method: "PUT",
        body,
        redirect: "error",
        signal: AbortSignal.timeout(10 * 60_000),
        headers: {
          Authorization: `Bearer ${this.connection.token}`,
          "Content-Type": "application/octet-stream",
        },
      },
    );
    if (!result.ok)
      throw new RequestError(
        result.status,
        `Upload failed for ${file.name}. Retry sending.`,
      );
  }
  fileUrl(id: string) {
    return `${this.connection.url}/api/files/${id}`;
  }
  fileHeaders() {
    return { Authorization: `Bearer ${this.connection.token}` };
  }
}

export function errorText(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please retry.";
}
export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
