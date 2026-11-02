import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowUp,
  Download,
  File,
  Play,
  Laptop,
  Smartphone,
  Tablet,
  Paperclip,
  X,
  GripVertical,
  Image as ImageIcon,
  Video,
  LoaderCircle,
} from "lucide-react";
import {
  MAX_FILE_BYTES,
  type Attachment,
  type Group,
} from "@send-thing/contracts";
import {
  type HostClient,
  type HostSnapshot,
  errorText,
  formatBytes,
} from "@send-thing/client-runtime/client";
import { useHistory } from "@send-thing/client-runtime/react";
import { Button } from "./components/ui/button.tsx";
import { loadDraft, saveDraft } from "./drafts.ts";
import { MediaViewer } from "./MediaViewer.tsx";
import { LinkPreview } from "./LinkPreview.tsx";
import { createChatFollow } from "@send-thing/client-runtime/chat-follow";
import { ConnectionStatus } from "./ConnectionStatus.tsx";
import {
  Menu,
  MenuTrigger,
  MenuPopup,
  MenuItem,
} from "./components/ui/menu.tsx";

interface Pending {
  metadata: Attachment;
  file: globalThis.File;
}
export function Chat({
  client,
  group,
  deviceId,
  revision,
  online,
  local,
  onSendingChange,
  host,
}: {
  client: HostClient;
  group: Group;
  deviceId: string;
  revision: number;
  online: boolean;
  local: boolean;
  onSendingChange: (sending: boolean) => void;
  host: HostSnapshot;
}) {
  const history = useHistory(client, group.id, revision);
  const draftKey = `send-thing.draft.${client.connection.hostId}.${group.id}`;
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Pending[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const messageId = useRef<string>(crypto.randomUUID());
  const pendingSave = useRef<Promise<void>>(Promise.resolve());
  const input = useRef<HTMLInputElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [follow] = useState(createChatFollow);
  const scrollInputUntil = useRef(0);
  const pointerDown = useRef(false);
  useEffect(() => {
    const release = () => {
      pointerDown.current = false;
    };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", release);
    };
  }, []);
  const controls = useRef<HTMLDivElement>(null);
  const [controlsHeight, setControlsHeight] = useState(150);
  const scrollToLatest = useCallback(() => {
    const element = scroller.current;
    if (!element || !follow.active) return;
    // Include the bottom composer padding, which is below the last message.
    element.scrollTop = element.scrollHeight;
  }, [follow]);
  useLayoutEffect(() => {
    if (!controls.current) return;
    const observer = new ResizeObserver(() =>
      setControlsHeight(controls.current?.offsetHeight ?? 0),
    );
    observer.observe(controls.current);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (!editor.current) return;
    editor.current.style.height = "auto";
    editor.current.style.height = `${Math.min(160, editor.current.scrollHeight)}px`;
  }, [text, loaded]);
  useEffect(() => {
    let cancelled = false;
    void loadDraft(draftKey)
      .then((draft) => {
        if (cancelled) return;
        messageId.current = draft.id;
        setText(draft.text);
        setFiles([...draft.files]);
        setLoaded(true);
      })
      .catch((error) => {
        if (!cancelled)
          setError(`Could not load this draft: ${errorText(error)}`);
      });
    return () => {
      cancelled = true;
    };
  }, [draftKey]);
  useEffect(() => {
    if (!loaded) return;
    const operation = saveDraft(draftKey, {
      id: messageId.current,
      text,
      files,
    });
    pendingSave.current = operation;
    void operation.catch((error) =>
      setError(`Could not save this draft: ${errorText(error)}`),
    );
  }, [draftKey, text, files, loaded]);
  useLayoutEffect(scrollToLatest, [
    history.messages.at(-1)?.id,
    controlsHeight,
    scrollToLatest,
  ]);
  useLayoutEffect(() => {
    // Link cards and media can grow after the message has arrived.
    const observer = new ResizeObserver(scrollToLatest);
    if (scroller.current) observer.observe(scroller.current);
    for (const element of scroller.current?.children ?? [])
      observer.observe(element);
    return () => observer.disconnect();
  }, [group.id, history.messages.length, scrollToLatest]);

  function updateText(value: string) {
    setText(value);
    messageId.current = crypto.randomUUID();
  }
  function addFiles(incoming: globalThis.File[]) {
    setError(null);
    if (files.length + incoming.length > 16) {
      setError("Send up to 16 files at a time.");
      return;
    }
    if (incoming.some((file) => file.size > MAX_FILE_BYTES)) {
      setError("Files can be up to 256 MB each.");
      return;
    }
    setFiles((old) => [
      ...old,
      ...incoming.map((file) => ({
        file,
        metadata: {
          id: crypto.randomUUID(),
          name: file.name,
          mime: file.type || "application/octet-stream",
          size: file.size,
        },
      })),
    ]);
    messageId.current = crypto.randomUUID();
  }
  async function send() {
    if (busy || !loaded || !online || (!text.trim() && !files.length)) return;
    setBusy(true);
    onSendingChange(true);
    setError(null);
    try {
      await pendingSave.current;
      for (const file of files) {
        setProgress(`Uploading ${file.metadata.name}…`);
        await client.upload(group.id, file.metadata, file.file);
      }
      setProgress("Sending…");
      await client.send(group.id, {
        id: messageId.current,
        text,
        attachmentIds: files.map((file) => file.metadata.id),
      });
      await saveDraft(draftKey, null);
      setText("");
      setFiles([]);
      messageId.current = crypto.randomUUID();
      follow.resume();
      scrollToLatest();
      history.refresh();
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
      onSendingChange(false);
      setProgress(null);
    }
  }
  return (
    <section
      className="conversation"
      aria-label={group.name}
      onDragOver={(event) => {
        if (!busy && loaded) event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        if (!busy && loaded) addFiles(Array.from(event.dataTransfer.files));
      }}
    >
      <div
        ref={scroller}
        className={`timeline ${!history.messages.length ? "timeline-empty" : ""}`}
        style={{ paddingBottom: controlsHeight + 18 }}
        tabIndex={0}
        aria-label="Messages"
        onPointerDown={() => {
          pointerDown.current = true;
        }}
        onTouchMove={() => {
          scrollInputUntil.current = performance.now() + 180;
          follow.pause();
        }}
        onKeyDown={(event) => {
          if (
            [
              "ArrowUp",
              "ArrowDown",
              "PageUp",
              "PageDown",
              "Home",
              "End",
              " ",
            ].includes(event.key)
          ) {
            scrollInputUntil.current = performance.now() + 180;
            follow.pause();
          }
        }}
        onWheel={(event) => {
          scrollInputUntil.current = performance.now() + 180;
          if (event.deltaY < 0) follow.pause();
        }}
        onScroll={() => {
          const el = scroller.current!;
          const userInitiated =
            pointerDown.current || performance.now() < scrollInputUntil.current;
          if (userInitiated) scrollInputUntil.current = performance.now() + 180;
          follow.onScroll(
            el.scrollTop,
            el.scrollHeight,
            el.clientHeight,
            userInitiated,
          );
        }}
      >
        {history.hasMore && (
          <Button
            className="older"
            size="small"
            onClick={() => {
              follow.pause();
              void history.loadMore();
            }}
            disabled={history.loading}
          >
            Earlier messages
          </Button>
        )}
        {!history.messages.length && !online && (
          <ConnectionStatus
            host={host}
            label={client.connection.label}
            onRetry={() => client.reconnect()}
          />
        )}
        {!history.messages.length && online && (
          <div className="empty">
            <p>
              {history.loading
                ? "Loading messages…"
                : "Send something to this group."}
            </p>
          </div>
        )}
        {history.messages.map((message, index) => {
          const own = message.sender.id === deviceId;
          const previous = history.messages[index - 1];
          const continued =
            previous?.sender.id === message.sender.id &&
            Date.parse(message.createdAt) - Date.parse(previous.createdAt) <
              300_000;
          const media = message.attachments.some(isMedia);
          const overlayTime =
            !message.text &&
            message.attachments.length > 0 &&
            message.attachments.every(isMedia);
          return (
            <article
              className={`message ${own ? "own" : ""} ${continued ? "continued" : ""}`}
              key={message.id}
            >
              {!own && (
                <div className="message-avatar">
                  {!continued &&
                    (message.sender.avatar ? (
                      <img
                        src={message.sender.avatar}
                        alt={message.sender.name}
                      />
                    ) : (
                      <span aria-label={message.sender.name}>
                        {message.sender.kind === "phone" ? (
                          <Smartphone size={18} />
                        ) : message.sender.kind === "tablet" ? (
                          <Tablet size={18} />
                        ) : (
                          <Laptop size={18} />
                        )}
                      </span>
                    ))}
                </div>
              )}
              <div className={`bubble ${media ? "has-media" : ""}`}>
                {!own && !continued && (
                  <div className="message-sender">{message.sender.name}</div>
                )}
                {message.attachments.map((file, index) => (
                  <FileCard
                    key={file.id}
                    file={file}
                    client={client}
                    local={local}
                    timestamp={
                      overlayTime && index === message.attachments.length - 1
                        ? message.createdAt
                        : undefined
                    }
                  />
                ))}
                {message.text && (
                  <LinkPreview client={client} message={message} />
                )}
                {!overlayTime && (
                  <time
                    className="message-time"
                    dateTime={message.createdAt}
                    title={new Date(message.createdAt).toLocaleString()}
                  >
                    {new Date(message.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <div ref={controls} className="chat-controls">
        {history.messages.length > 0 && (
          <ConnectionStatus
            compact
            host={host}
            label={client.connection.label}
            onRetry={() => client.reconnect()}
          />
        )}
        {(error || (online && history.error)) && (
          <div className="error" role="alert">
            {error ?? history.error}
          </div>
        )}
        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          {files.length > 0 && (
            <div className="attachment-strip">
              {files.map((file) => (
                <DraftAttachment
                  key={file.metadata.id}
                  pending={file}
                  disabled={busy}
                  onRemove={() => {
                    setFiles(files.filter((f) => f !== file));
                    messageId.current = crypto.randomUUID();
                  }}
                />
              ))}
            </div>
          )}
          {progress && (
            <p className="muted" role="status">
              {progress}
            </p>
          )}
          <input
            ref={input}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              addFiles(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />
          <textarea
            ref={editor}
            aria-label="Message"
            placeholder="Send something…"
            maxLength={32000}
            rows={1}
            value={text}
            disabled={busy || !loaded}
            onChange={(event) => updateText(event.target.value)}
            onPaste={(event) => {
              if (event.clipboardData.files.length) {
                event.preventDefault();
                addFiles(Array.from(event.clipboardData.files));
              }
            }}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <div className="composer-toolbar">
            {window.sendThing?.platform === "darwin" ? (
              <Button
                size="icon"
                tone="ghost"
                aria-label="Add attachment"
                disabled={busy || !loaded}
                onClick={() => {
                  if (input.current) {
                    input.current.accept = "";
                    input.current.click();
                  }
                }}
              >
                <Paperclip />
              </Button>
            ) : (
              <Menu>
                <MenuTrigger
                  render={
                    <Button
                      size="icon"
                      tone="ghost"
                      aria-label="Add attachment"
                      disabled={busy || !loaded}
                    />
                  }
                >
                  <Paperclip />
                </MenuTrigger>
                <MenuPopup side="top" align="start">
                  {[
                    { name: "Photos", accept: "image/*", icon: ImageIcon },
                    { name: "Videos", accept: "video/*", icon: Video },
                    { name: "Files", accept: "", icon: Paperclip },
                  ].map(({ name, accept, icon: Icon }) => (
                    <MenuItem
                      key={name}
                      onClick={() => {
                        if (input.current) {
                          input.current.accept = accept;
                          input.current.click();
                        }
                      }}
                    >
                      <Icon />
                      {name}
                    </MenuItem>
                  ))}
                </MenuPopup>
              </Menu>
            )}
            <span className="composer-spacer" />
            <Button
              className="send-button"
              size="icon"
              tone="primary"
              aria-label="Send"
              type="submit"
              disabled={
                busy || !loaded || !online || (!text.trim() && !files.length)
              }
            >
              {busy ? <LoaderCircle className="animate-spin" /> : <ArrowUp />}
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}

function DraftAttachment({
  pending,
  disabled,
  onRemove,
}: {
  pending: Pending;
  disabled: boolean;
  onRemove: () => void;
}) {
  const [preview, setPreview] = useState<string>();
  useEffect(() => {
    if (!pending.file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(pending.file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [pending.file]);
  return (
    <div className="draft-attachment" title={pending.metadata.name}>
      {preview ? (
        <img src={preview} alt={pending.metadata.name} />
      ) : (
        <>
          {pending.metadata.mime.startsWith("video/") ? (
            <Video size={24} />
          ) : (
            <File size={24} />
          )}
          <span>{pending.metadata.name}</span>
        </>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={onRemove}
        className="remove-attachment"
        aria-label={`Remove ${pending.metadata.name}`}
      >
        <X size={12} />
      </button>
    </div>
  );
}

const isMedia = (file: Attachment) =>
  /^(image\/(png|jpeg|webp|gif|avif|heic|heif)|video\/[\w.+-]+)$/.test(
    file.mime,
  );

function FileCard({
  file,
  client,
  local,
  timestamp,
}: {
  file: Attachment;
  client: HostClient;
  local: boolean;
  timestamp?: string;
}) {
  const [key, setKey] = useState<string>();
  const [preview, setPreview] = useState<string>();
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [ratio, setRatio] = useState(0.85);
  const card = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const media = isMedia(file);
  const video = file.mime.startsWith("video/");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    if (card.current) observer.observe(card.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);
  useEffect(() => {
    if (!window.sendThing || !local || !visible) return;
    let cancelled = false;
    void window.sendThing
      .prepareFile(client.connection, file)
      .then((key) => {
        if (!cancelled) setKey(key);
      })
      .catch((error) => {
        if (!cancelled) setError(errorText(error));
      });
    return () => {
      cancelled = true;
    };
  }, [client, file.id, local, visible]);
  useEffect(() => {
    if (!media || !visible) return;
    const controller = new AbortController();
    let source: string | undefined;
    const desktop = window.sendThing;
    function release(url: string) {
      if (desktop)
        void desktop.releaseMediaSource(url).catch(() => {
          /* Window may have closed. */
        });
      else URL.revokeObjectURL(url);
    }
    setError(null);
    void (async () => {
      let url: string;
      if (desktop) url = await desktop.mediaSource(client.connection, file);
      else {
        const response = await fetch(client.fileUrl(file.id), {
          headers: client.fileHeaders(),
          signal: controller.signal,
          redirect: "error",
        });
        if (!response.ok) throw new Error("Media preview unavailable.");
        const blob = await response.blob();
        if (blob.size !== file.size)
          throw new Error("Download was incomplete. Please retry.");
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(new Blob([blob], { type: file.mime }));
      }
      if (controller.signal.aborted) {
        release(url);
        return;
      }
      source = url;
      setPreview(url);
    })().catch((error) => {
      if (!controller.signal.aborted) setError(errorText(error));
    });
    return () => {
      controller.abort();
      if (source) release(source);
    };
  }, [client, file.id, media, visible, attempt]);
  async function showMedia() {
    setError(null);
    if (!window.sendThing) {
      setOpen(true);
      return;
    }
    setBusy(true);
    try {
      await window.sendThing.openMedia(client.connection, file);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function action(drag: boolean, propagate = false) {
    setBusy(true);
    setError(null);
    try {
      if (window.sendThing) {
        if (drag)
          setKey(await window.sendThing.prepareFile(client.connection, file));
        else await window.sendThing.saveFile(client.connection, file);
      } else if (preview) {
        const a = document.createElement("a");
        a.href = preview;
        a.download = file.name;
        a.click();
      } else {
        const response = await fetch(client.fileUrl(file.id), {
          headers: client.fileHeaders(),
          redirect: "error",
        });
        if (!response.ok) throw new Error("Could not download this file.");
        const url = URL.createObjectURL(await response.blob());
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch (error) {
      setError(errorText(error));
      if (propagate) throw error;
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      ref={card}
      className={`file-card ${media ? "media-card" : ""}`}
      onContextMenu={(event) => {
        if (!window.sendThing) return;
        event.preventDefault();
        event.stopPropagation();
        if (busy) return;
        setBusy(true);
        setError(null);
        void window.sendThing
          .copyMenu({ kind: "file", connection: client.connection, file })
          .catch((error) => setError(errorText(error)))
          .finally(() => setBusy(false));
      }}
      draggable={Boolean(key)}
      onDragStart={(event) => {
        if (key) {
          event.preventDefault();
          window.sendThing?.dragFile(key);
        }
      }}
    >
      {media && (
        <button
          type="button"
          className="media-tile"
          style={{ aspectRatio: ratio }}
          aria-label={`Open ${file.name} fullscreen`}
          disabled={busy || !preview}
          onClick={() => void showMedia()}
        >
          {preview ? (
            video ? (
              <video
                src={preview}
                muted
                playsInline
                preload="metadata"
                onLoadedMetadata={(event) => {
                  const el = event.currentTarget;
                  if (el.videoHeight)
                    setRatio(
                      Math.max(
                        0.65,
                        Math.min(1.8, el.videoWidth / el.videoHeight),
                      ),
                    );
                }}
                onError={() =>
                  setError(
                    "Preview unavailable. Open or save this video to play it.",
                  )
                }
              />
            ) : (
              <img
                src={preview}
                alt={file.name}
                draggable={false}
                onLoad={(event) => {
                  const el = event.currentTarget;
                  if (el.naturalHeight)
                    setRatio(
                      Math.max(
                        0.65,
                        Math.min(1.8, el.naturalWidth / el.naturalHeight),
                      ),
                    );
                }}
                onError={() =>
                  setError(
                    "Preview unavailable. Open or save this image to view it.",
                  )
                }
              />
            )
          ) : (
            <LoaderCircle className="animate-spin" />
          )}
          {video && preview && (
            <span className="media-play">
              <Play size={28} fill="currentColor" />
            </span>
          )}
          {timestamp && (
            <time
              className="media-time"
              dateTime={timestamp}
              title={new Date(timestamp).toLocaleString()}
            >
              {new Date(timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          )}
        </button>
      )}
      <div className={media ? "media-actions" : "file-row"}>
        {!media && <File size={22} aria-hidden />}
        {!media && (
          <div className="file-name">
            <strong>{file.name}</strong>
            <span>{formatBytes(file.size)}</span>
          </div>
        )}
        {window.sendThing && !key && !local && (
          <Button
            size="icon"
            tone="ghost"
            aria-label={`Prepare ${file.name} for dragging`}
            disabled={busy}
            onClick={() => void action(true)}
          >
            <GripVertical />
          </Button>
        )}
        <Button
          size="icon"
          tone="ghost"
          aria-label={`Save ${file.name}`}
          disabled={busy}
          onClick={() => void action(false)}
        >
          <Download />
        </Button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
          {media && !preview && (
            <Button
              size="small"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Retry
            </Button>
          )}
        </p>
      )}
      {open && preview && (
        <dialog
          className="media-dialog"
          ref={dialog}
          onCancel={() => setOpen(false)}
          onClose={() => setOpen(false)}
        >
          <MediaViewer
            file={file}
            url={preview}
            onClose={() => setOpen(false)}
            onSave={() => action(false, true)}
          />
        </dialog>
      )}
    </div>
  );
}
