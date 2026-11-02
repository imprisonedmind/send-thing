import { useState } from "react";
import { Image, Pressable, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { MenuView } from "@react-native-menu/menu";
import * as ImagePicker from "expo-image-picker";
import type { ProfileInput } from "@send-thing/contracts";
import { errorText } from "@send-thing/client-runtime/client";
import { useApp } from "./app-context.ts";
import { AppText, Button, ErrorNotice, Field, useTheme } from "./ui.tsx";
import { Icon } from "./components/Icon.tsx";
import { prepareAvatar } from "./avatar.ts";

export function DeviceSettingsScreen() {
  const { deviceSettings } = useApp();
  return deviceSettings.profile ? (
    <DeviceEditor profile={deviceSettings.profile} />
  ) : (
    <View style={{ padding: 20 }}>
      <AppText>Waiting for device settings.</AppText>
    </View>
  );
}

function DeviceEditor({ profile }: { profile: ProfileInput }) {
  const { deviceSettings, connections, save, host } = useApp();
  const theme = useTheme();
  const [name, setName] = useState(profile.name);
  const [kind, setKind] = useState(profile.kind);
  const [avatar, setAvatar] = useState(profile.avatar);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function perform(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await work();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <KeyboardAwareScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: 20, gap: 20 }}
    >
      <Field
        label="Name"
        value={name}
        editable={!busy}
        onChangeText={(value) => {
          setName(value);
          setSaved(false);
        }}
        maxLength={100}
      />
      <View style={{ gap: 6 }}>
        <AppText style={{ fontSize: 13 }}>Device type</AppText>
        <MenuView
          shouldOpenOnLongPress={false}
          actions={(
            ["desktop", "laptop", "phone", "tablet", "server"] as const
          ).map((value) => ({
            id: value,
            title: value,
            state: value === kind ? "on" : "off",
            attributes: { disabled: busy },
          }))}
          onPressAction={({ nativeEvent }) => {
            if (!busy) {
              setKind(nativeEvent.event as ProfileInput["kind"]);
              setSaved(false);
            }
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Change device type"
            disabled={busy}
            style={{
              backgroundColor: theme.surface,
              borderRadius: 12,
              padding: 13,
              flexDirection: "row",
              justifyContent: "space-between",
            }}
          >
            <AppText>{kind}</AppText>
            <Icon name="expand" />
          </Pressable>
        </MenuView>
      </View>
      {avatar && (
        <Image
          source={{ uri: avatar }}
          style={{ width: 72, height: 72, borderRadius: 20 }}
        />
      )}
      <Button
        label="Choose device image"
        disabled={busy}
        onPress={() =>
          void perform(async () => {
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ["images"],
              allowsEditing: true,
              aspect: [1, 1],
              quality: 1,
            });
            if (result.canceled) return;
            const asset = result.assets[0];
            if (!asset) return;
            const nextAvatar = await prepareAvatar(asset.uri);
            setAvatar(nextAvatar);
            await deviceSettings.save({ ...profile, avatar: nextAvatar });
          })
        }
      />
      {avatar && (
        <Button
          label="Remove image"
          disabled={busy}
          onPress={() =>
            void perform(async () => {
              setAvatar(null);
              await deviceSettings.save({ ...profile, avatar: null });
            })
          }
        />
      )}
      <ErrorNotice error={error} />
      <Button
        label="Save device settings"
        busy={busy}
        disabled={!name.trim()}
        primary
        onPress={() =>
          void perform(async () => {
            await deviceSettings.save({ name, kind, avatar });
            setSaved(true);
          })
        }
      />
      {saved && <AppText>Saved.</AppText>}
      {connections.length > 0 && (
        <AppText style={{ fontWeight: "600" }}>Connections</AppText>
      )}
      {connections.map((connection) => (
        <View key={connection.hostId} style={{ gap: 8 }}>
          <AppText>{connection.label}</AppText>
          {!(
            connection.hostId === host.session?.hostId &&
            host.session.device.id === host.session.hostId
          ) && (
            <Button
              label="Forget host"
              disabled={busy}
              onPress={() =>
                void perform(() =>
                  save(
                    connections.filter((c) => c.hostId !== connection.hostId),
                  ),
                )
              }
            />
          )}
        </View>
      ))}
    </KeyboardAwareScrollView>
  );
}
