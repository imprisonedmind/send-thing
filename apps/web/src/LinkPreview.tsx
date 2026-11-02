import { useState } from "react";
import { Play } from "lucide-react";
import type { Message } from "@send-thing/contracts";
import type { HostClient } from "@send-thing/client-runtime/client";
import { useLinkPreview } from "@send-thing/client-runtime/react";
import { visibleMessageLinks, messageLinks } from "@send-thing/contracts/links";
import { errorText } from "@send-thing/client-runtime/client";

export function LinkPreview({
  client,
  message,
}: {
  client: HostClient;
  message: Message;
}) {
  const preview = useLinkPreview(
    client,
    message.groupId,
    message.id,
    message.text,
  );
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const domain = preview ? new URL(preview.url).hostname : "";
  const parts = visibleMessageLinks(message.text, preview?.url);
  const copy = (event: React.MouseEvent, url: string) => {
    if (!window.sendThing) return;
    event.preventDefault();
    event.stopPropagation();
    setError(null);
    void window.sendThing
      .copyMenu({ kind: "link", url })
      .catch((error) => setError(errorText(error)));
  };
  return (
    <>
      {preview && (
        <a
          className="link-preview"
          href={preview.url}
          target="_blank"
          rel="noreferrer"
          onContextMenu={(event) =>
            copy(
              event,
              messageLinks(message.text).find(
                (part) => part.url === preview.url,
              )?.text ?? preview.url,
            )
          }
        >
          {preview.image && failedImage !== preview.image && (
            <div className="link-preview-image">
              <img
                src={preview.image}
                alt=""
                onError={() => setFailedImage(preview.image)}
              />
              {preview.video && (
                <span className="media-play">
                  <Play size={26} fill="currentColor" aria-hidden />
                </span>
              )}
            </div>
          )}
          <div className="link-preview-content">
            {preview.title && <strong>{preview.title}</strong>}
            {preview.description && <p>{preview.description}</p>}
            <span className="link-preview-site">
              {preview.video && <Play size={12} aria-label="Video" />}
              {preview.siteName ? `${preview.siteName} · ${domain}` : domain}
            </span>
          </div>
        </a>
      )}
      {parts.some((part) => part.text.trim()) && (
        <p className="message-text">
          {parts.map((part, index) =>
            part.url ? (
              <a
                key={index}
                href={part.url}
                target="_blank"
                rel="noreferrer"
                onContextMenu={(event) => copy(event, part.text)}
              >
                {part.text}
              </a>
            ) : (
              part.text
            ),
          )}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
