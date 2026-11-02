import * as Schema from "effect/Schema";
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
  readonly connection: Connection;
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

  constructor(connection: Connection) {
    this.connection = connection;
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(next: Partial<HostSnapshot>) {
    this.snapshot = { ...this.snapshot, ...next };
    for (const listener of this.listeners) listener();
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
  }
  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    clearTimeout(this.handshake);
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
    if (!this.networkAvailable) {
      this.publish({ status: "offline", error: null });
      return;
    }
    this.publish({
      status:
        this.snapshot.session || this.attempt ? "reconnecting" : "connecting",
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
      clearTimeout(this.handshake);
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
