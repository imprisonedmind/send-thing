import { useEffect, useRef, useState } from "react";
import * as Schema from "effect/Schema";
import {
  Device,
  ProfileInput,
  type Connection,
  type Session,
} from "@send-thing/contracts";
import { errorText, request, type HostClient } from "./client.ts";

export interface ProfileStorage {
  read: () => Promise<unknown | null>;
  write: (profile: ProfileInput) => Promise<void>;
}

// The app owns one profile. Hosts keep copies for membership and message history.
export function useDeviceProfile(
  storage: ProfileStorage,
  connections: Connection[],
  client: HostClient | null,
  session: Session | null,
  online: boolean,
) {
  const [profile, setProfile] = useState<ProfileInput | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const adopting = useRef(false);
  const writes = useRef(Promise.resolve());
  const syncing = useRef(new Map<string, Promise<unknown>>());

  useEffect(() => {
    let cancelled = false;
    void storage
      .read()
      .then((value) => {
        if (cancelled) return;
        setProfile(
          value === null ? null : Schema.decodeUnknownSync(ProfileInput)(value),
        );
        setLoaded(true);
      })
      .catch((e) => {
        if (!cancelled)
          setError(`Could not load device settings: ${errorText(e)}`);
      });
    return () => {
      cancelled = true;
    };
  }, [storage]);

  async function persist(value: ProfileInput) {
    const next = Schema.decodeUnknownSync(ProfileInput)(value);
    const operation = writes.current
      .catch(() => {})
      .then(() => storage.write(next));
    writes.current = operation;
    await operation;
    setProfile(next);
    return next;
  }

  // Keep the existing device identity when upgrading an installation.
  useEffect(() => {
    if (!loaded || profile || !session || adopting.current) return;
    adopting.current = true;
    void persist({
      name: session.device.name,
      kind: session.device.kind,
      avatar: session.device.avatar,
    })
      .catch((e) => setError(`Could not save device settings: ${errorText(e)}`))
      .finally(() => {
        adopting.current = false;
      });
  }, [loaded, profile, session]);

  function publish(connection: Connection, next: ProfileInput) {
    const key = `${connection.hostId}/${connection.url}`;
    const previous = syncing.current.get(key) ?? Promise.resolve();
    const operation = previous
      .catch(() => {})
      .then(() =>
        request(connection.url, connection.token, "/api/profile", Device, {
          method: "PUT",
          body: JSON.stringify(next),
        }),
      );
    syncing.current.set(key, operation);
    void operation
      .finally(() => {
        if (syncing.current.get(key) === operation) syncing.current.delete(key);
      })
      .catch(() => {});
    return operation;
  }

  useEffect(() => {
    if (!profile || !session || !client || !online) return;
    const device = session.device;
    if (
      device.name === profile.name &&
      device.kind === profile.kind &&
      device.avatar === profile.avatar
    ) {
      setError(null);
      return;
    }
    let cancelled = false;
    void publish(client.connection, profile)
      .then(async () => {
        await client.refresh();
        if (!cancelled) setError(null);
      })
      .catch((e) => {
        if (!cancelled)
          setError(`Device profile could not sync: ${errorText(e)}`);
      });
    return () => {
      cancelled = true;
    };
  }, [profile, session, client, online]);

  async function save(value: ProfileInput) {
    if (!loaded) throw new Error("Device settings have not loaded.");
    setError(null);
    const next = await persist(value);
    const results = await Promise.allSettled(
      connections.map((connection) => publish(connection, next)),
    );
    await client?.refresh();
    const failed = results.flatMap((result, index) =>
      result.status === "rejected" ? [connections[index]!.label] : [],
    );
    if (failed.length)
      throw new Error(
        `Saved on this device. Could not update ${failed.join(", ")}; reconnect to those hosts to sync.`,
      );
  }
  return { profile, loaded, error, save };
}
