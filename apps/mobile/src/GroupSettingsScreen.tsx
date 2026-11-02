import { useEffect, useState } from "react";
import { Alert, Image, ScrollView, View } from "react-native";
import type { Device } from "@send-thing/contracts";
import { errorText } from "@send-thing/client-runtime/client";
import { useApp, type ScreenProps } from "./app-context.ts";
import { AppText, Button, ErrorNotice, useTheme } from "./ui.tsx";
import { Icon } from "./components/Icon.tsx";

export function GroupSettingsScreen({
  route,
  navigation,
}: ScreenProps<"Settings">) {
  const { host } = useApp();
  const theme = useTheme();
  const [members, setMembers] = useState<readonly Device[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isHost = Boolean(
    host.session && host.session.hostId === host.session.device.id,
  );
  useEffect(() => {
    let cancelled = false;
    void host.client
      ?.members(route.params.groupId)
      .then((value) => {
        if (!cancelled) setMembers(value);
      })
      .catch((e) => {
        if (!cancelled) setError(errorText(e));
      });
    return () => {
      cancelled = true;
    };
  }, [host.client, host.revision, route.params.groupId]);
  async function perform(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }}>
      <ErrorNotice error={error} />
      {isHost && (
        <Button
          label="Delete group"
          disabled={busy}
          onPress={() =>
            Alert.alert(
              "Delete group?",
              "This deletes its messages and files for every device. It cannot be undone.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: () =>
                    void perform(async () => {
                      await host.client!.deleteGroup(route.params.groupId);
                      navigation.popToTop();
                    }),
                },
              ],
            )
          }
        />
      )}
      <AppText style={{ fontWeight: "600" }}>Devices</AppText>
      {members.map((device) => (
        <View
          key={device.id}
          style={{ flexDirection: "row", gap: 12, alignItems: "center" }}
        >
          {device.avatar ? (
            <Image
              source={{ uri: device.avatar }}
              style={{ width: 36, height: 36, borderRadius: 18 }}
            />
          ) : (
            <Icon name="devices" size={28} />
          )}
          <View style={{ flex: 1 }}>
            <AppText>{device.name}</AppText>
            <AppText style={{ fontSize: 12, color: theme.muted }}>
              {device.id === host.session?.hostId ? "Host" : device.kind}
            </AppText>
          </View>
          {isHost && device.id !== host.session?.hostId && (
            <Button
              label="Remove"
              disabled={busy}
              onPress={() =>
                void perform(async () => {
                  await host.client!.removeMember(
                    route.params.groupId,
                    device.id,
                  );
                  setMembers(await host.client!.members(route.params.groupId));
                })
              }
            />
          )}
        </View>
      ))}
      {!isHost && (
        <Button
          label="Leave group"
          disabled={busy}
          onPress={() =>
            void perform(async () => {
              if (!host.client || !host.session) return;
              await host.client.removeMember(
                route.params.groupId,
                host.session.device.id,
              );
              navigation.popToTop();
            })
          }
        />
      )}
    </ScrollView>
  );
}
