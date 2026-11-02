// Adapted from T3's connectionFloatingStatus and EnvironmentConnectionNotice.
import type { HostSnapshot } from "./client.ts";

export function connectionPresentation(host: HostSnapshot, label: string) {
  const retrying =
    host.status === "connecting" || host.status === "reconnecting";
  const title =
    host.status === "offline"
      ? "You are offline"
      : host.status === "unsupported"
        ? "Client not supported"
        : host.status === "error"
          ? `${label} is unavailable`
          : host.status === "connecting"
            ? `Connecting to ${label}...`
            : `Reconnecting to ${label}...`;
  const detail =
    host.status === "offline"
      ? "Loaded messages remain available. The chat will reconnect when your connection returns."
      : host.error
        ? `${retrying ? "The app will keep retrying automatically. " : ""}${host.error}`
        : "The chat will load as soon as the host is ready.";
  return {
    visible: host.status !== "online",
    retrying,
    canRetry: host.status !== "offline" && host.status !== "unsupported",
    title,
    detail,
    pill: retrying
      ? host.error
        ? `Failed to connect. Retrying ${label}...`
        : `Reconnecting to ${label}...`
      : host.status === "error"
        ? `Failed to connect to ${label}${host.error ? `: ${host.error}` : ""}`
        : title,
  };
}
