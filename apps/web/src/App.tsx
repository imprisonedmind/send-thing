import { useEffect, useRef, useState, type FormEvent } from "react";
import * as Schema from "effect/Schema";
import {
  Connections,
  Id,
  Session,
  normalizeHostUrl,
  type Connection,
  type ProfileInput,
} from "@send-thing/contracts";
import { pair, request, errorText } from "@send-thing/client-runtime/client";
import { useHost } from "@send-thing/client-runtime/react";
import {
  useDeviceProfile,
  type ProfileStorage,
} from "@send-thing/client-runtime/device-profile";
import {
  ArrowLeft,
  Plus,
  Settings,
  ChevronDown,
  Check,
  Link,
  UserPlus,
  Ellipsis,
} from "lucide-react";
import { parsePairingLink } from "@send-thing/contracts/pairing";
import { Button } from "./components/ui/button.tsx";
import {
  Menu,
  MenuTrigger,
  MenuPopup,
  MenuItem,
  MenuGroup,
  MenuLabel,
  MenuSeparator,
} from "./components/ui/menu.tsx";
import { Chat } from "./Chat.tsx";
import { ConnectionStatus } from "./ConnectionStatus.tsx";
import { GroupSettings } from "./GroupSettings.tsx";
import { DeviceSettings } from "./DeviceSettings.tsx";
import { PairingCard } from "./components/PairingCard.tsx";

const storageKey = "send-thing.connections.v1";
const selectionKey = "send-thing.selection.v1";
const Selection = Schema.Struct({ hostId: Id, groupId: Schema.NullOr(Id) });
const profileStorage: ProfileStorage = {
  read: async () =>
    JSON.parse(localStorage.getItem("send-thing.device-profile.v1") ?? "null"),
  write: async (profile) => {
    localStorage.setItem(
      "send-thing.device-profile.v1",
      JSON.stringify(profile),
    );
  },
};
export function App() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [addresses, setAddresses] = useState<string[]>([]);
  const [pairingScheme, setPairingScheme] = useState<
    "sendthing" | "sendthing-dev"
  >(import.meta.env.DEV ? "sendthing-dev" : "sendthing");
  const [localHostId, setLocalHostId] = useState<string>();
  const [hostId, setHostId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [screen, setScreen] = useState<
    "chat" | "connect" | "create" | "settings" | "pair" | "device"
  >("chat");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const connection =
    connections.find((c) => c.hostId === hostId) ?? connections[0];
  const host = useHost(connection, {
    discover: (id, signal) =>
      signal.aborted
        ? Promise.resolve([])
        : (window.sendThing?.discoverHost(id) ?? Promise.resolve([])),
    onConnectionChange: async (next) => {
      await save(
        connections.map((connection) =>
          connection.hostId === next.hostId && connection.token === next.token
            ? next
            : connection,
        ),
      );
    },
  });
  const deviceSettings = useDeviceProfile(
    profileStorage,
    connections,
    host.client,
    host.session,
    host.status === "online",
  );
  const groups = host.session?.groups ?? [];
  const group = groups.find((g) => g.id === groupId) ?? groups[0];
  const isHost =
    host.session?.device.id === host.session?.hostId && Boolean(host.session);

  useEffect(() => {
    if (!window.sendThing || (screen !== "pair" && screen !== "settings"))
      return;
    let cancelled = false;
    const refresh = () =>
      void window
        .sendThing!.bootstrap()
        .then((data) => {
          if (!cancelled) setAddresses(data.addresses);
        })
        .catch((error) => {
          if (!cancelled) setError(errorText(error));
        });
    refresh();
    const timer = setInterval(refresh, 5_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [screen]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rawSelection = localStorage.getItem(selectionKey);
      const selection = rawSelection
        ? Schema.decodeUnknownSync(Selection)(JSON.parse(rawSelection))
        : null;
      if (window.sendThing) {
        const data = await window.sendThing.bootstrap();
        if (cancelled) return;
        setConnections(data.connections);
        setAddresses(data.addresses);
        setPairingScheme(data.pairingScheme);
        setLocalHostId(data.localHostId);
      } else {
        const raw = localStorage.getItem(storageKey);
        if (raw)
          setConnections([
            ...Schema.decodeUnknownSync(Connections)(JSON.parse(raw)),
          ]);
      }
      if (selection) {
        setHostId(selection.hostId);
        setGroupId(selection.groupId ?? "");
      }
      setLoaded(true);
    })().catch((e) => {
      if (!cancelled)
        setError(
          `Could not load saved connections: ${errorText(e)}. Restart after resolving this error.`,
        );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loaded || screen !== "chat" || !connection || !host.session || !group)
      return;
    try {
      localStorage.setItem(
        selectionKey,
        JSON.stringify({
          hostId: connection.hostId,
          groupId: group.id,
        }),
      );
    } catch (error) {
      setError(`Could not remember this group: ${errorText(error)}`);
    }
  }, [loaded, screen, connection?.hostId, host.session, group?.id]);

  useEffect(() => {
    const network = () => host.client?.setNetworkAvailable(navigator.onLine);
    network();
    const wake = () => {
      if (document.visibilityState === "visible") host.client?.reconnect();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", network);
    window.addEventListener("offline", network);
    return () => {
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", network);
      window.removeEventListener("offline", network);
    };
  }, [host.client]);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !event.isComposing &&
        !event.defaultPrevented &&
        !document.querySelector('[data-slot="menu-popup"]')
      )
        window.sendThing?.dismiss();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, []);

  async function save(next: Connection[]) {
    if (window.sendThing) await window.sendThing.saveConnections(next);
    else localStorage.setItem(storageKey, JSON.stringify(next));
    setConnections(next);
  }

  return (
    <main className={`app ${screen === "chat" && group ? "chat-layout" : ""}`}>
      <header className="toolbar">
        {screen !== "chat" && (
          <Button
            size="icon"
            tone="ghost"
            aria-label="Back"
            onClick={() => setScreen("chat")}
          >
            <ArrowLeft />
          </Button>
        )}
        {screen === "chat" && connections.length > 0 ? (
          <Menu>
            <MenuTrigger
              render={
                <Button
                  tone="ghost"
                  className="group-switcher"
                  disabled={sending}
                />
              }
            >
              <span>{group?.name ?? "Send Thing"}</span>
              <ChevronDown size={14} />
            </MenuTrigger>
            <MenuPopup>
              <MenuGroup>
                {groups.map((item) => (
                  <MenuItem key={item.id} onClick={() => setGroupId(item.id)}>
                    <span>{item.name}</span>
                    {group?.id === item.id && (
                      <Check className="menu-trailing" />
                    )}
                  </MenuItem>
                ))}
                {(isHost || localHostId) && (
                  <MenuItem
                    onClick={() => {
                      if (localHostId) setHostId(localHostId);
                      setScreen("create");
                    }}
                  >
                    <Plus />
                    New group
                  </MenuItem>
                )}
              </MenuGroup>
              {connections.length > 1 && (
                <>
                  <MenuSeparator />
                  <MenuGroup>
                    <MenuLabel>Hosts</MenuLabel>
                    {connections.map((item) => (
                      <MenuItem
                        key={item.hostId}
                        onClick={() => {
                          setHostId(item.hostId);
                          setGroupId("");
                        }}
                      >
                        <span>
                          {item.hostId === localHostId
                            ? (deviceSettings.profile?.name ?? item.label)
                            : item.label}
                        </span>
                        {connection?.hostId === item.hostId && (
                          <Check className="menu-trailing" />
                        )}
                      </MenuItem>
                    ))}
                  </MenuGroup>
                </>
              )}
              <MenuSeparator />
              <MenuItem onClick={() => setScreen("connect")}>
                <Link />
                Join group
              </MenuItem>
              <MenuItem onClick={() => setScreen("device")}>
                <Settings />
                Edit device settings
              </MenuItem>
            </MenuPopup>
          </Menu>
        ) : (
          <strong className="title">
            {screen === "connect"
              ? "Join group"
              : screen === "pair"
                ? "Add device"
                : screen === "create"
                  ? "New group"
                  : screen === "device"
                    ? "Device settings"
                    : screen === "settings"
                      ? (group?.name ?? "Group settings")
                      : "Send Thing"}
          </strong>
        )}
        {screen === "chat" && (
          <div className="toolbar-actions">
            {isHost && group && (
              <Button
                size="icon"
                tone="ghost"
                aria-label="Add device"
                title="Add device"
                disabled={sending}
                onClick={() => setScreen("pair")}
              >
                <UserPlus />
              </Button>
            )}
            {group && (
              <Menu>
                <MenuTrigger
                  render={
                    <Button
                      size="icon"
                      tone="ghost"
                      aria-label="Group menu"
                      disabled={sending}
                    />
                  }
                >
                  <Ellipsis />
                </MenuTrigger>
                <MenuPopup align="end">
                  <MenuItem onClick={() => setScreen("settings")}>
                    <Settings />
                    Group settings
                  </MenuItem>
                </MenuPopup>
              </Menu>
            )}
          </div>
        )}
      </header>
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      {deviceSettings.error && (
        <div role="alert" className="error">
          {deviceSettings.error}
        </div>
      )}
      {!loaded ? (
        <div className="empty">Loading connections…</div>
      ) : screen === "connect" || !connections.length ? (
        <Connect
          connections={connections}
          profile={deviceSettings.profile}
          onConnect={async (next) => {
            await save([
              ...connections.filter((c) => c.hostId !== next.hostId),
              next,
            ]);
            setHostId(next.hostId);
            setGroupId("");
            setScreen("chat");
          }}
        />
      ) : (
        <>
          {screen === "device" ? (
            deviceSettings.profile ? (
              <DeviceSettings
                profile={deviceSettings.profile}
                onSave={deviceSettings.save}
                connections={connections}
                localHostId={localHostId}
                onForget={(id) =>
                  save(
                    connections.filter(
                      (connection) => connection.hostId !== id,
                    ),
                  )
                }
              />
            ) : (
              <div className="empty">Waiting for device settings.</div>
            )
          ) : host.client && group && isHost && screen === "pair" ? (
            <div className="settings scroll">
              <PairingCard
                scheme={pairingScheme}
                autoCreate
                key={`${connection?.hostId}/${group.id}`}
                client={host.client}
                group={group}
                addresses={connection?.hostId === localHostId ? addresses : []}
              />
            </div>
          ) : host.client && isHost && screen === "create" ? (
            <CreateGroup
              onCreate={async (name) => {
                const created = await host.client!.createGroup(name);
                setGroupId(created.id);
                setScreen("chat");
              }}
            />
          ) : host.client && group && host.session && screen === "settings" ? (
            <GroupSettings
              key={`${connection?.hostId}/${group.id}`}
              client={host.client}
              group={group}
              session={host.session}
              addresses={connection?.hostId === localHostId ? addresses : []}
              onLeave={() => setScreen("chat")}
            />
          ) : host.client && group && host.session ? (
            <Chat
              key={`${connection?.hostId}/${group.id}`}
              client={host.client}
              group={group}
              deviceId={host.session.device.id}
              revision={host.revision}
              online={host.status === "online"}
              host={host}
              local={connection?.hostId === localHostId}
              onSendingChange={setSending}
            />
          ) : host.client && host.status !== "online" ? (
            <ConnectionStatus
              host={host}
              label={host.client.connection.label}
              onRetry={() => host.client?.reconnect()}
            />
          ) : (
            <div className="empty">
              {host.session ? (
                <>
                  <p>No groups yet.</p>
                  {isHost && (
                    <Button onClick={() => setScreen("create")}>
                      Create a group
                    </Button>
                  )}
                </>
              ) : (
                <p>Waiting for the host.</p>
              )}
            </div>
          )}
        </>
      )}
    </main>
  );
}

function Connect({
  connections,
  profile,
  onConnect,
}: {
  connections: Connection[];
  profile: ProfileInput | null;
  onConnect: (connection: Connection) => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const [localToken, setLocalToken] = useState(false);
  const paired = useRef<Connection | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (paired.current) {
        await onConnect(paired.current);
        return;
      }
      const data = new FormData(event.currentTarget);
      let connection: Connection;
      if (localToken) {
        const normalized = normalizeHostUrl(url);
        const credential = String(data.get("invite")).trim();
        const session = await request(
          normalized,
          credential,
          "/api/session",
          Session,
        );
        connection = {
          url: normalized,
          token: credential,
          hostId: session.hostId,
          label: session.device.name,
        };
      } else {
        const code = parsePairingLink(String(data.get("link")));
        connection = await pair(
          code.url,
          code.invite,
          profile ?? {
            name: String(data.get("name")),
            kind: "desktop",
            avatar: null,
          },
          connections.find(
            (c) => c.hostId === code.hostId && c.url === code.url,
          ),
        );
        if (connection.hostId !== code.hostId)
          throw new Error("This host does not match the pairing link.");
        connection = { ...connection, label: code.group };
      }
      paired.current = connection;
      await onConnect(connection);
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="form" onSubmit={submit}>
      {localToken ? (
        <>
          <label>
            Host address
            <input
              name="url"
              type="url"
              placeholder="http://192.168.1.20:47823"
              value={url}
              onChange={(event) => {
                paired.current = null;
                setUrl(event.target.value);
              }}
              required
              disabled={busy || Boolean(paired.current)}
            />
          </label>
          <label>
            Host token
            <input
              name="invite"
              autoComplete="off"
              type="password"
              required
              disabled={busy || Boolean(paired.current)}
            />
          </label>
        </>
      ) : (
        <label>
          Pairing link
          <input
            name="link"
            placeholder="Paste the link from the host"
            autoComplete="off"
            required
            disabled={busy || Boolean(paired.current)}
          />
        </label>
      )}
      {!localToken && !profile && (
        <label>
          Device name
          <input
            name="name"
            placeholder="My laptop"
            maxLength={100}
            required
            disabled={busy || Boolean(paired.current)}
          />
        </label>
      )}
      {import.meta.env.DEV && !window.sendThing && (
        <label className="check">
          <input
            type="checkbox"
            checked={localToken}
            onChange={(event) => setLocalToken(event.target.checked)}
          />
          Use local host token for development
        </label>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <Button tone="primary" type="submit" disabled={busy}>
        {busy
          ? "Connecting…"
          : paired.current
            ? "Retry saving connection"
            : "Connect"}
      </Button>
    </form>
  );
}

function CreateGroup({
  onCreate,
}: {
  onCreate: (name: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault();
        const name = String(new FormData(event.currentTarget).get("name"));
        setBusy(true);
        setError(null);
        void onCreate(name)
          .catch((e) => setError(errorText(e)))
          .finally(() => setBusy(false));
      }}
    >
      <label>
        Group name
        <input
          name="name"
          placeholder="My devices"
          maxLength={100}
          required
          autoFocus
        />
      </label>
      <p className="muted">
        This computer will store the group’s messages and files.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <Button type="submit" tone="primary" disabled={busy}>
        {busy ? "Creating…" : "Create group"}
      </Button>
    </form>
  );
}
