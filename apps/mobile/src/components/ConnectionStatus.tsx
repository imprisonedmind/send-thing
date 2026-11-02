import { ActivityIndicator, Pressable, View } from "react-native";
import { connectionPresentation } from "@send-thing/client-runtime/connection-presentation";
import type { HostSnapshot } from "@send-thing/client-runtime/client";
import { AppText, Button, useTheme } from "../ui.tsx";
import { Icon } from "./Icon.tsx";

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
  const theme = useTheme();
  const state = connectionPresentation(host, label);
  if (!state.visible) return null;
  const indicator = state.retrying ? (
    <ActivityIndicator size="small" color={theme.muted} />
  ) : compact ? (
    <View
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: theme.error,
      }}
    />
  ) : (
    <Icon
      name={host.status === "offline" ? "offline" : "connection"}
      size={24}
      color={theme.muted}
    />
  );
  if (compact)
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={state.pill}
        accessibilityHint={state.canRetry ? "Retry connection now" : undefined}
        accessibilityState={{ disabled: !state.canRetry }}
        disabled={!state.canRetry}
        onPress={onRetry}
        style={{
          minHeight: 44,
          alignSelf: "center",
          maxWidth: "100%",
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 16,
          borderRadius: 24,
          backgroundColor: theme.surface,
        }}
      >
        {indicator}
        <AppText
          accessibilityLiveRegion="polite"
          numberOfLines={1}
          style={{
            maxWidth: 260,
            flexShrink: 1,
            fontSize: 12,
            fontWeight: "500",
          }}
        >
          {state.pill}
        </AppText>
      </Pressable>
    );
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
      }}
    >
      <View style={{ maxWidth: 320, alignItems: "center", gap: 12 }}>
        {indicator}
        <AppText
          style={{ textAlign: "center", fontSize: 18, fontWeight: "700" }}
        >
          {state.title}
        </AppText>
        <AppText
          style={{ textAlign: "center", fontSize: 14, color: theme.muted }}
        >
          {state.detail}
        </AppText>
        {state.canRetry && <Button label="Retry now" onPress={onRetry} />}
      </View>
    </View>
  );
}
