// Layout port of T3's ComposerToolbar and ComposerAttachmentStrip, without agent controls.
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { AppText, useTheme } from "../ui.tsx";
import { Icon } from "./Icon.tsx";
import { ComposerAttachmentButton } from "./ComposerAttachmentButton.tsx";
import type { PendingFile } from "../storage.ts";
import type { AttachmentSource } from "../attachments.ts";

export function Composer({
  text,
  files,
  disabled,
  sending,
  canSend,
  onChangeText,
  onRemove,
  onPick,
  onSend,
}: {
  text: string;
  files: readonly PendingFile[];
  disabled: boolean;
  sending: boolean;
  canSend: boolean;
  onChangeText: (text: string) => void;
  onRemove: (file: PendingFile) => void;
  onPick: (source: AttachmentSource) => void;
  onSend: () => void;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        borderRadius: 27,
        borderCurve: "continuous",
        backgroundColor: theme.surface,
        borderWidth: 1,
        borderColor: theme.border,
        padding: 6,
      }}
    >
      {files.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          contentContainerStyle={{
            gap: 10,
            paddingHorizontal: 8,
            paddingTop: 8,
          }}
        >
          {files.map((file) => (
            <View key={file.metadata.id} style={{ width: 72, paddingTop: 4 }}>
              {file.metadata.mime.startsWith("image/") ? (
                <Image
                  source={{ uri: file.uri }}
                  accessibilityLabel={file.metadata.name}
                  style={{ width: 72, height: 72, borderRadius: 16 }}
                />
              ) : (
                <View
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 16,
                    backgroundColor: theme.message,
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                    padding: 6,
                  }}
                >
                  <Icon
                    name={
                      file.metadata.mime.startsWith("video/") ? "video" : "file"
                    }
                  />
                  <AppText
                    numberOfLines={2}
                    style={{ fontSize: 10, lineHeight: 13 }}
                  >
                    {file.metadata.name}
                  </AppText>
                </View>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${file.metadata.name}`}
                disabled={disabled}
                hitSlop={6}
                onPress={() => onRemove(file)}
                style={{
                  position: "absolute",
                  top: 8,
                  right: 4,
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  backgroundColor: "#0009",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="close" size={12} color="#fff" />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}
      <TextInput
        accessibilityLabel="Message"
        multiline
        value={text}
        onChangeText={onChangeText}
        editable={!disabled}
        maxLength={32000}
        placeholder="Send something…"
        placeholderTextColor={theme.muted}
        style={{
          color: theme.text,
          fontFamily: "DMSans-Regular",
          fontSize: 16,
          lineHeight: 24,
          minHeight: 56,
          maxHeight: 152,
          paddingHorizontal: 14,
          paddingTop: 10,
          paddingBottom: 8,
          textAlignVertical: "top",
        }}
      />
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 2,
          gap: 6,
        }}
      >
        <ComposerAttachmentButton disabled={disabled} onPick={onPick} />
        <View style={{ flex: 1 }} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          accessibilityState={{ disabled: !canSend || disabled, busy: sending }}
          disabled={!canSend || disabled}
          onPress={onSend}
          style={{
            width: 44,
            height: 44,
            alignItems: "center",
            justifyContent: "center",
            opacity: !canSend || disabled ? 0.4 : 1,
          }}
        >
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: theme.text,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {sending ? (
              <ActivityIndicator size="small" color={theme.canvas} />
            ) : (
              <Icon name="send" size={20} color={theme.canvas} />
            )}
          </View>
        </Pressable>
      </View>
    </View>
  );
}
