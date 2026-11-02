import { LoaderCircle, WifiOff, Unplug } from "lucide-react";
import { connectionPresentation } from "@send-thing/client-runtime/connection-presentation";
import type { HostSnapshot } from "@send-thing/client-runtime/client";
import { Button } from "./components/ui/button.tsx";

export function ConnectionStatus({
  host,
  label,
  onRetry,
  compact = false,
}: {
  host: HostSnapshot;
  label: string;
  onRetry: () => void;
  compact?: boolean;
}) {
  const state = connectionPresentation(host, label);
  if (!state.visible) return null;
  const indicator = state.retrying ? (
    <LoaderCircle size={16} className="animate-spin" aria-hidden />
  ) : compact ? (
    <span className="connection-dot" />
  ) : host.status === "offline" ? (
    <WifiOff size={24} />
  ) : (
    <Unplug size={24} />
  );
  return compact ? (
    <button
      type="button"
      className="connection-pill"
      disabled={!state.canRetry}
      title={`${state.detail}${state.canRetry ? " Retry now." : ""}`}
      onClick={onRetry}
    >
      {indicator}
      <span role="status">{state.pill}</span>
    </button>
  ) : (
    <div className="connection-notice" role="status">
      <div>
        {indicator}
        <strong>{state.title}</strong>
        <p>{state.detail}</p>
        {state.canRetry && <Button onClick={onRetry}>Retry now</Button>}
      </div>
    </div>
  );
}
