import { useEffect, useRef, useState } from "react";
import { Download, Maximize, X } from "lucide-react";
import type { Attachment } from "@send-thing/contracts";
import { errorText } from "@send-thing/client-runtime/client";
import { Button } from "./components/ui/button.tsx";

export function MediaViewer({
  file,
  url,
  onClose,
  onSave,
}: {
  file: Attachment;
  url: string;
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const viewer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.fullscreenElement) {
        event.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [onClose]);
  return (
    <div
      ref={viewer}
      className="media-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={file.name}
    >
      <div className="media-viewer-toolbar">
        <Button
          autoFocus
          size="icon"
          tone="ghost"
          aria-label="Close media"
          onClick={onClose}
        >
          <X />
        </Button>
        <span />
        {!window.sendThing && document.fullscreenEnabled && (
          <Button
            size="icon"
            tone="ghost"
            aria-label="Fullscreen"
            onClick={() => {
              void viewer.current
                ?.requestFullscreen()
                .catch((e) => setError(errorText(e)));
            }}
          >
            <Maximize />
          </Button>
        )}
        <Button
          size="icon"
          tone="ghost"
          aria-label="Save media"
          disabled={saving}
          onClick={() => {
            setSaving(true);
            void onSave()
              .catch((e) => setError(errorText(e)))
              .finally(() => setSaving(false));
          }}
        >
          <Download />
        </Button>
      </div>
      {file.mime.startsWith("video/") ? (
        <video
          src={url}
          controls
          autoPlay
          playsInline
          onError={() =>
            setError(
              "This video could not be played. Save it to open in another app.",
            )
          }
        />
      ) : (
        <img
          src={url}
          alt={file.name}
          onError={() =>
            setError(
              "This image could not be displayed. Save it to open in another app.",
            )
          }
        />
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}

export function DesktopMediaViewer() {
  const [data, setData] = useState<{ file: Attachment; url: string }>();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void window
      .sendThing!.mediaData()
      .then(setData)
      .catch((e) => setError(errorText(e)));
  }, []);
  return data ? (
    <MediaViewer
      {...data}
      onClose={() => {
        void window.sendThing!.closeMedia();
      }}
      onSave={() => window.sendThing!.saveMedia()}
    />
  ) : (
    <div className="empty">{error ?? "Opening media…"}</div>
  );
}
