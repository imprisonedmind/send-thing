import { useState } from "react";
import { Image, Linking, Pressable, View } from "react-native";
import type { Message } from "@send-thing/contracts";
import type { HostClient } from "@send-thing/client-runtime/client";
import { errorText } from "@send-thing/client-runtime/client";
import { useLinkPreview } from "@send-thing/client-runtime/react";
import { AppText, ErrorNotice, useTheme } from "../ui.tsx";
import { Icon } from "./Icon.tsx";
import { MenuView } from "@react-native-menu/menu";
import * as Clipboard from "expo-clipboard";
import { visibleMessageLinks, messageLinks } from "@send-thing/contracts/links";

export function LinkPreview({
  client,
  message,
  width,
  media,
}: {
  client: HostClient;
  message: Message;
  width: number;
  media: boolean;
}) {
  const preview = useLinkPreview(
    client,
    message.groupId,
    message.id,
    message.text,
  );
  const theme = useTheme();
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const domain = preview ? new URL(preview.url).hostname : "";
  const parts = visibleMessageLinks(message.text, preview?.url);
  return (
    <View style={{ gap: 4 }}>
      {preview && (
        <MenuView
          shouldOpenOnLongPress
          actions={[{ id: "copy", title: "Copy link" }]}
          onPressAction={() => {
            setError(null);
            const url =
              messageLinks(message.text).find(
                (part) => part.url === preview.url,
              )?.text ?? preview.url;
            void Clipboard.setStringAsync(url)
              .then((copied) => {
                if (!copied) throw new Error("Could not copy this link.");
              })
              .catch((error) => setError(errorText(error)));
          }}
        >
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={preview.title || domain}
            onPress={() => {
              setError(null);
              void Linking.openURL(preview.url).catch((e) =>
                setError(errorText(e)),
              );
            }}
            style={{
              width,
              maxWidth: "100%",
              backgroundColor: theme.border,
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            {preview.image && failedImage !== preview.image && (
              <View
                style={{
                  aspectRatio: 1.91,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Image
                  source={{ uri: preview.image }}
                  resizeMode="cover"
                  style={{ width: "100%", height: "100%" }}
                  onError={() => setFailedImage(preview.image)}
                />
                {preview.video && (
                  <View
                    style={{
                      position: "absolute",
                      backgroundColor: "#0008",
                      borderRadius: 26,
                      width: 52,
                      height: 52,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name="play" size={26} color="#fff" />
                  </View>
                )}
              </View>
            )}
            <View style={{ padding: 10, gap: 5 }}>
              {Boolean(preview.title) && (
                <AppText
                  numberOfLines={2}
                  style={{ fontSize: 14, fontWeight: "600" }}
                >
                  {preview.title}
                </AppText>
              )}
              {Boolean(preview.description) && (
                <AppText
                  numberOfLines={3}
                  style={{ fontSize: 12, lineHeight: 17, color: theme.muted }}
                >
                  {preview.description}
                </AppText>
              )}
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
              >
                {preview.video && (
                  <Icon name="play" size={12} color={theme.muted} />
                )}
                <AppText
                  numberOfLines={1}
                  style={{ flex: 1, fontSize: 11, color: theme.muted }}
                >
                  {preview.siteName
                    ? `${preview.siteName} · ${domain}`
                    : domain}
                </AppText>
              </View>
            </View>
          </Pressable>
        </MenuView>
      )}
      {parts.some((part) => part.text.trim()) && (
        <AppText
          selectable
          style={{
            paddingHorizontal: media ? 6 : 0,
            paddingTop: message.attachments.length ? 4 : 0,
          }}
        >
          {parts.map((part, index) =>
            part.url ? (
              <AppText
                key={index}
                accessibilityRole="link"
                style={{ color: theme.accent }}
                onPress={() => {
                  setError(null);
                  void Linking.openURL(part.url!).catch((error) =>
                    setError(errorText(error)),
                  );
                }}
              >
                {part.text}
              </AppText>
            ) : (
              part.text
            ),
          )}
        </AppText>
      )}
      <ErrorNotice error={error} />
    </View>
  );
}
