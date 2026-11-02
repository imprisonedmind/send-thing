import { createContext, useContext } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Pressable,
  Text,
  TextInput,
  type TextInputProps,
  type TextProps,
  View,
} from "react-native";
import { light, type Theme } from "@send-thing/theme";

export const ThemeContext = createContext<Theme>(light);
export const useTheme = () => useContext(ThemeContext);
export function AppText({ style, ...props }: TextProps) {
  const theme = useTheme();
  const weight = StyleSheet.flatten(style)?.fontWeight;
  const family =
    weight === "bold" || Number(weight) >= 700
      ? "DMSans-Bold"
      : Number(weight) >= 500
        ? "DMSans-Medium"
        : "DMSans-Regular";
  return (
    <Text
      {...props}
      style={[
        { color: theme.text, fontSize: 16, lineHeight: 23 },
        style,
        { fontFamily: family, fontWeight: "normal" },
      ]}
    />
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <AppText style={{ fontSize: 13, fontWeight: "500" }}>{label}</AppText>
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholderTextColor={theme.muted}
        style={[
          {
            color: theme.text,
            backgroundColor: theme.surface,
            borderColor: theme.border,
            borderWidth: 1,
            borderRadius: 12,
            padding: 13,
            fontSize: 16,
            fontFamily: "DMSans-Regular",
          },
          props.style,
        ]}
      />
    </View>
  );
}
// T3's mobile controls use native Pressable semantics, rounded surfaces and explicit busy states.
export function Button({
  label,
  onPress,
  busy,
  disabled,
  primary = false,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  primary?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 11,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 8,
        opacity: disabled || busy ? 0.5 : pressed ? 0.7 : 1,
        backgroundColor: primary ? theme.accent : theme.message,
      })}
    >
      {busy && (
        <ActivityIndicator color={primary ? theme.accentText : theme.text} />
      )}
      <AppText
        style={{
          color: primary ? theme.accentText : theme.text,
          fontWeight: "500",
        }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}
export function ErrorNotice({ error }: { error: string | null }) {
  const theme = useTheme();
  return error ? (
    <AppText
      accessibilityRole="alert"
      style={{ color: theme.error, fontSize: 13 }}
    >
      {error}
    </AppText>
  ) : null;
}
