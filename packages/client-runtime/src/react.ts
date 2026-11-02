import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { Connection, History, LinkPreview } from "@send-thing/contracts";
import { firstLink } from "@send-thing/contracts/links";
import { HostClient, errorText, type ConnectionOptions } from "./client.ts";
import { connectionNonce } from "./routes.ts";

const empty = {
  session: null,
  status: "offline" as const,
  error: null,
  revision: 0,
};
const noop = () => () => {};
export function useLinkPreview(
  client: HostClient,
  groupId: string,
  messageId: string,
  text: string,
) {
  const link = firstLink(text);
  const { status } = useSyncExternalStore(client.subscribe, client.getSnapshot);
  const [result, setResult] = useState<{
    key: string;
    value: LinkPreview | null;
  } | null>(null);
  const key = `${client.connection.hostId}/${groupId}/${messageId}/${link}`;
  useEffect(() => {
    if (!link || status !== "online") return;
    const controller = new AbortController();
    void client
      .linkPreview(groupId, messageId, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setResult({ key, value });
      })
      .catch(() => {
        // A preview is optional; the original link remains usable when unavailable.
        if (!controller.signal.aborted) setResult({ key, value: null });
      });
    return () => controller.abort();
  }, [client, groupId, messageId, link, key, status]);
  return result?.key === key ? result.value : null;
}
export function useHost(
  connection: Connection | undefined,
  options: ConnectionOptions = {},
) {
  const latest = useRef(options);
  latest.current = options;
  const client = useMemo(
    () =>
      connection
        ? new HostClient(connection, {
            discover: (hostId, signal) =>
              latest.current.discover?.(hostId, signal) ?? Promise.resolve([]),
            nonce: () => latest.current.nonce?.() ?? connectionNonce(),
            onConnectionChange: async (next) =>
              latest.current.onConnectionChange?.(next),
          })
        : null,
    [connection?.hostId, connection?.token],
  );
  useEffect(() => {
    client?.start();
    return () => client?.stop();
  }, [client]);
  const snapshot = useSyncExternalStore(
    client?.subscribe ?? noop,
    client?.getSnapshot ?? (() => empty),
  );
  return { client, ...snapshot };
}

export function useHistory(
  client: HostClient | null,
  groupId: string | undefined,
  revision: number,
) {
  const [state, setState] = useState<{
    key: string;
    history: History;
    error: string | null;
    loading: boolean;
  }>({
    key: "",
    history: { messages: [], hasMore: false },
    error: null,
    loading: false,
  });
  const key = `${client?.connection.hostId}/${groupId}`;
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!client || !groupId) return;
    let cancelled = false;
    setState((old) =>
      old.key === key
        ? { ...old, loading: true }
        : {
            key,
            history: { messages: [], hasMore: false },
            error: null,
            loading: true,
          },
    );
    void client.history(groupId).then(
      (history) => {
        if (!cancelled) setState({ key, history, error: null, loading: false });
      },
      (error) => {
        if (!cancelled)
          setState((old) => ({
            ...old,
            loading: false,
            error: errorText(error),
          }));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [client, groupId, key, revision, reload]);
  const history =
    state.key === key ? state.history : { messages: [], hasMore: false };
  const loadMore = async () => {
    const first = history.messages[0];
    if (!client || !groupId || !first || state.loading) return;
    setState((old) => ({ ...old, loading: true }));
    try {
      const older = await client.history(groupId, first.sequence);
      setState((old) =>
        old.key !== key
          ? old
          : {
              ...old,
              loading: false,
              error: null,
              history: {
                hasMore: older.hasMore,
                messages: [
                  ...older.messages,
                  ...old.history.messages.filter(
                    (m) => m.sequence >= first.sequence,
                  ),
                ],
              },
            },
      );
    } catch (error) {
      setState((old) =>
        old.key === key
          ? { ...old, loading: false, error: errorText(error) }
          : old,
      );
    }
  };
  return {
    ...history,
    error: state.key === key ? state.error : null,
    loading: state.loading,
    loadMore,
    refresh: () => setReload((value) => value + 1),
  };
}
