import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Pressable,
  StatusBar,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useEvent } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import { type Attachment, type Message } from "@send-thing/contracts";
import {
  errorText,
  formatBytes,
  type HostClient,
} from "@send-thing/client-runtime/client";
import { AppText, ErrorNotice, useTheme } from "../ui.tsx";
import { Icon } from "./Icon.tsx";
import { saveAttachment, SavePermissionError } from "../save-attachment.ts";
import { LinkPreview } from "./LinkPreview.tsx";

const isImage = (file: Attachment) =>
  /^image\/(png|jpeg|webp|gif|avif|heic|heif)$/.test(file.mime);
const isVideo = (file: Attachment) => file.mime.startsWith("video/");

export function MessageRow({
  message,
  previous,
  own,
  client,
}: {
  message: Message;
  previous?: Message;
  own: boolean;
  client: HostClient;
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const continued =
    previous?.sender.id === message.sender.id &&
    Date.parse(message.createdAt) - Date.parse(previous.createdAt) < 300_000;
  const media = message.attachments.some(
    (file) => isImage(file) || isVideo(file),
  );
  const overlayTime =
    !message.text &&
    message.attachments.length > 0 &&
    message.attachments.every((file) => isImage(file) || isVideo(file));
  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const bubbleWidth = Math.min(width - (own ? 48 : 82), 340);
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: own ? "flex-end" : "flex-start",
        alignItems: "flex-end",
        gap: 6,
        marginTop: continued ? 3 : 12,
      }}
    >
      {!own && (
        <View style={{ width: 30 }}>
          {!continued &&
            (message.sender.avatar ? (
              <Image
                source={{ uri: message.sender.avatar }}
                accessibilityLabel={message.sender.name}
                style={{ width: 30, height: 30, borderRadius: 15 }}
              />
            ) : (
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  backgroundColor: theme.border,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon
                  name={
                    message.sender.kind === "phone"
                      ? "phone"
                      : message.sender.kind === "tablet"
                        ? "tablet"
                        : "computer"
                  }
                  size={18}
                />
              </View>
            ))}
        </View>
      )}
      <View
        style={{
          maxWidth: bubbleWidth,
          width: media ? bubbleWidth : undefined,
          borderRadius: 14,
          borderBottomRightRadius: own ? 4 : 14,
          borderBottomLeftRadius: own ? 14 : 4,
          backgroundColor: own ? theme.message : theme.surface,
          padding: media ? 4 : 10,
          gap: 4,
        }}
      >
        {!own && !continued && (
          <AppText
            numberOfLines={1}
            style={{
              fontSize: 12,
              lineHeight: 17,
              fontWeight: "600",
              color: theme.accent,
              marginHorizontal: media ? 6 : 0,
            }}
          >
            {message.sender.name}
          </AppText>
        )}
        {message.attachments.map((file, index) => (
          <AttachmentTile
            key={file.id}
            file={file}
            client={client}
            width={bubbleWidth - 8}
            time={
              overlayTime && index === message.attachments.length - 1
                ? time
                : undefined
            }
          />
        ))}
        {Boolean(message.text) && (
          <LinkPreview
            client={client}
            message={message}
            width={bubbleWidth - 20}
            media={media}
          />
        )}
        {!overlayTime && (
          <AppText
            style={{
              alignSelf: "flex-end",
              marginHorizontal: media ? 6 : 0,
              fontSize: 10,
              lineHeight: 14,
              color: theme.muted,
            }}
          >
            {time}
          </AppText>
        )}
      </View>
    </View>
  );
}

function AttachmentTile({
  file,
  client,
  width,
  time,
}: {
  file: Attachment;
  client: HostClient;
  width: number;
  time?: string;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ratio, setRatio] = useState(0.85);
  const [saved, setSaved] = useState<string | null>(null);
  const [needsSettings, setNeedsSettings] = useState(false);
  const saving = useRef(false);
  const media = isImage(file) || isVideo(file);
  useEffect(() => {
    if (!saved) return;
    const timeout = setTimeout(() => setSaved(null), 3000);
    return () => clearTimeout(timeout);
  }, [saved]);
  async function save() {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError(null);
    setSaved(null);
    setNeedsSettings(false);
    try {
      setSaved(await saveAttachment(client, file, media));
    } catch (e) {
      setError(errorText(e));
      setNeedsSettings(e instanceof SavePermissionError && !e.canAskAgain);
    } finally {
      setBusy(false);
      saving.current = false;
    }
  }
  const source = {
    uri: client.fileUrl(file.id),
    headers: client.fileHeaders(),
  };
  return (
    <>
      {media ? (
        <View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${file.name} fullscreen`}
            onPress={() => setOpen(true)}
            style={{
              width,
              maxWidth: "100%",
              aspectRatio: isVideo(file) ? 0.85 : ratio,
              borderRadius: 10,
              overflow: "hidden",
              backgroundColor: theme.border,
            }}
          >
            {isImage(file) ? (
              <Image
                source={source}
                resizeMode="cover"
                style={{ width: "100%", height: "100%" }}
                onLoad={({ nativeEvent }) => {
                  const s = nativeEvent.source;
                  if (s.height > 0)
                    setRatio(Math.max(0.65, Math.min(1.8, s.width / s.height)));
                }}
                onError={() =>
                  setError("Could not load image. Tap to retry fullscreen.")
                }
              />
            ) : (
              <VideoContent client={client} file={file} preview />
            )}
            {isVideo(file) && (
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  inset: 0,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <View
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 26,
                    backgroundColor: "#0008",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name="play" size={28} color="#fff" />
                </View>
              </View>
            )}
          </Pressable>
          {time && (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                bottom: 6,
                right: 6,
                paddingHorizontal: 5,
                paddingVertical: 1,
                borderRadius: 5,
                backgroundColor: "#0008",
              }}
            >
              <AppText style={{ fontSize: 10, lineHeight: 14, color: "#fff" }}>
                {time}
              </AppText>
            </View>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Save ${file.name}`}
            accessibilityState={{ busy, disabled: busy }}
            disabled={busy}
            onPress={() => void save()}
            style={{
              position: "absolute",
              top: 6,
              right: 6,
              width: 44,
              height: 44,
              borderRadius: 10,
              backgroundColor: "#0009",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Icon name={saved ? "check" : "down"} size={22} color="#fff" />
            )}
          </Pressable>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Save ${file.name}`}
          disabled={busy}
          onPress={() => void save()}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            padding: 8,
            minWidth: 180,
            maxWidth: width,
          }}
        >
          <Icon name="file" color={theme.muted} />
          <View style={{ flex: 1 }}>
            <AppText numberOfLines={2} style={{ fontSize: 13, lineHeight: 18 }}>
              {file.name}
            </AppText>
            <AppText style={{ fontSize: 11, color: theme.muted }}>
              {formatBytes(file.size)}
            </AppText>
          </View>
          {busy ? (
            <ActivityIndicator color={theme.muted} />
          ) : (
            <Icon name="down" size={18} />
          )}
        </Pressable>
      )}
      {!open && (
        <>
          <ErrorNotice error={error} />
          {saved && (
            <AppText
              accessibilityLiveRegion="polite"
              style={{ color: theme.muted, fontSize: 12 }}
            >
              {saved}
            </AppText>
          )}
          {needsSettings && (
            <Pressable
              onPress={() => {
                void Linking.openSettings().catch((e) =>
                  setError(errorText(e)),
                );
              }}
            >
              <AppText>Open Settings</AppText>
            </Pressable>
          )}
        </>
      )}
      {open && (
        <Modal
          visible
          animationType="fade"
          presentationStyle="fullScreen"
          onRequestClose={() => setOpen(false)}
        >
          <SafeAreaView style={{ flex: 1, backgroundColor: "#000" }}>
            <StatusBar barStyle="light-content" />
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                padding: 8,
              }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close media"
                onPress={() => setOpen(false)}
                style={{ padding: 12 }}
              >
                <Icon name="close" color="#fff" size={24} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Save media"
                disabled={busy}
                onPress={() => void save()}
                style={{ padding: 12 }}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Icon
                    name={saved ? "check" : "down"}
                    color="#fff"
                    size={24}
                  />
                )}
              </Pressable>
            </View>
            {isVideo(file) ? (
              <VideoContent client={client} file={file} />
            ) : (
              <Image
                source={source}
                resizeMode="contain"
                style={{ width: "100%", flex: 1 }}
                onError={() => setError("Could not load this image.")}
              />
            )}
            <View style={{ paddingHorizontal: 16 }}>
              <ErrorNotice error={error} />
              {saved && (
                <AppText
                  accessibilityLiveRegion="polite"
                  style={{ color: "#fff", fontSize: 12 }}
                >
                  {saved}
                </AppText>
              )}
              {needsSettings && (
                <Pressable
                  onPress={() => {
                    void Linking.openSettings().catch((e) =>
                      setError(errorText(e)),
                    );
                  }}
                >
                  <AppText style={{ color: "#fff" }}>Open Settings</AppText>
                </Pressable>
              )}
            </View>
          </SafeAreaView>
        </Modal>
      )}
    </>
  );
}

function VideoContent({
  file,
  client,
  preview = false,
}: {
  file: Attachment;
  client: HostClient;
  preview?: boolean;
}) {
  const player = useVideoPlayer(
    {
      uri: client.fileUrl(file.id),
      headers: client.fileHeaders(),
      contentType: "progressive",
    },
    (player) => {
      player.muted = preview;
    },
  );
  const status = useEvent(player, "statusChange", { status: player.status });
  useEffect(() => {
    if (!preview) player.play();
  }, [player, preview]);
  return (
    <View
      pointerEvents={preview ? "none" : "auto"}
      style={{ flex: 1, width: "100%", height: "100%" }}
    >
      <VideoView
        player={player}
        nativeControls={!preview}
        contentFit={preview ? "cover" : "contain"}
        surfaceType="textureView"
        fullscreenOptions={{ enable: !preview }}
        style={{ width: "100%", height: "100%" }}
      />
      {status.status === "loading" && !preview && (
        <ActivityIndicator
          color="#fff"
          style={{ position: "absolute", alignSelf: "center", top: "50%" }}
        />
      )}
      {status.status === "error" && (
        <AppText
          style={{
            color: "#ff6467",
            position: "absolute",
            bottom: 16,
            left: 16,
            right: 16,
            fontSize: 13,
          }}
        >
          Video could not be played. Save it to open in another app.
        </AppText>
      )}
    </View>
  );
}
