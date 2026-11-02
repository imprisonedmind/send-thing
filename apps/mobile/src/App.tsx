import { useEffect, useRef, useState } from "react";
import {
  AppState,
  Linking,
  Pressable,
  ScrollView,
  StatusBar,
  useColorScheme,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
  createNavigationContainerRef,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { KeyboardProvider } from "react-native-keyboard-controller";
import {
  AppContext,
  useApp,
  type Routes,
  type ScreenProps,
} from "./app-context.ts";
import * as Sharing from "expo-sharing";
import * as Network from "expo-network";
import * as Crypto from "expo-crypto";
import { useFonts } from "expo-font";
import { DMSans_400Regular } from "@expo-google-fonts/dm-sans/400Regular";
import { DMSans_500Medium } from "@expo-google-fonts/dm-sans/500Medium";
import { DMSans_700Bold } from "@expo-google-fonts/dm-sans/700Bold";
import { File } from "expo-file-system";
import { light, dark } from "@send-thing/theme";
import { type Connection } from "@send-thing/contracts";
import { errorText } from "@send-thing/client-runtime/client";
import { useHost } from "@send-thing/client-runtime/react";
import { useDeviceProfile } from "@send-thing/client-runtime/device-profile";
import { AppText, Button, ErrorNotice, ThemeContext, useTheme } from "./ui.tsx";
import {
  loadConnections,
  profileStorage,
  loadSelection,
  saveSelection,
  type Selection,
  loadDraft,
  persistFile,
  removeDraft,
  removePendingFiles,
  saveConnections,
  saveDraft,
  type Draft,
  type PendingFile,
} from "./storage.ts";
import { GroupChat } from "./GroupScreen.tsx";
import { GroupSettingsScreen } from "./GroupSettingsScreen.tsx";
import { ConnectScreen } from "./ConnectScreen.tsx";
import { DeviceSettingsScreen } from "./DeviceSettingsScreen.tsx";
import { CreateGroupScreen } from "./CreateGroupScreen.tsx";
import { Icon } from "./components/Icon.tsx";
import { ConnectionStatus } from "./components/ConnectionStatus.tsx";
import { MenuView } from "@react-native-menu/menu";
import { discoverHost } from "./discovery.ts";

const Stack = createNativeStackNavigator<Routes>();
const navigation = createNavigationContainerRef<Routes>();

export function App() {
  const [fontsLoaded, fontError] = useFonts({
    "DMSans-Regular": DMSans_400Regular,
    "DMSans-Medium": DMSans_500Medium,
    "DMSans-Bold": DMSans_700Bold,
  });
  const scheme = useColorScheme();
  const theme = scheme === "dark" ? dark : light;
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const selectedHostId = selection?.hostId ?? "";
  const [incoming, setIncoming] = useState<Draft | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  function selectGroup(hostId: string, groupId: string | null) {
    const next = { hostId, groupId };
    setSelection(next);
    void saveSelection(next).catch((e) =>
      setError(`Could not remember this group: ${errorText(e)}`),
    );
  }
  const selectHost = (id: string) => selectGroup(id, null);
  const host = useHost(
    connections.find((c) => c.hostId === selectedHostId) ?? connections[0],
    {
      discover: discoverHost,
      nonce: Crypto.randomUUID,
      onConnectionChange: async (next) => {
        await save(
          connections.map((connection) =>
            connection.hostId === next.hostId && connection.token === next.token
              ? next
              : connection,
          ),
        );
      },
    },
  );
  const deviceSettings = useDeviceProfile(
    profileStorage,
    connections,
    host.client,
    host.session,
    host.status === "online",
  );
  const shareLock = useRef(false);
  const [pairingLink, setPairingLink] = useState<string | null>(null);
  useEffect(() => {
    const client = host.client;
    if (!client) return;
    let active = true;
    let hadNetwork = false;
    const record = (state: Network.NetworkState) => {
      if (!active) return;
      if (state.isConnected !== undefined)
        client.setNetworkAvailable(state.isConnected);
      if (state.isConnected && hadNetwork && AppState.currentState === "active")
        client.networkChanged();
      hadNetwork = Boolean(state.isConnected);
    };
    const check = () =>
      void Network.getNetworkStateAsync()
        .then(record)
        .catch(() => {
          /* Unknown connectivity still attempts the host. */
        });
    check();
    const network = Network.addNetworkStateListener(record);
    const app = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        check();
        client.reconnect();
      } else if (state === "background") client.stop();
    });
    return () => {
      active = false;
      network.remove();
      app.remove();
    };
  }, [host.client]);

  useEffect(() => {
    const receiveLink = (url: string | null | undefined) => {
      if (url?.startsWith("sendthing://pair")) setPairingLink(url);
    };
    void Linking.getInitialURL()
      .then(receiveLink)
      .catch((e) => setError(errorText(e)));
    const listener = Linking.addEventListener("url", ({ url }) =>
      receiveLink(url),
    );
    return () => listener.remove();
  }, []);
  function openPairingLink() {
    if (pairingLink && !sending && navigation.isReady()) {
      navigation.navigate("Connect", { link: pairingLink });
      setPairingLink(null);
    }
  }
  useEffect(openPairingLink, [pairingLink, ready, sending]);

  useEffect(() => {
    void (async () => {
      const [savedConnections, savedSelection] = await Promise.all([
        loadConnections(),
        loadSelection(),
      ]);
      setConnections(savedConnections);
      setSelection(savedSelection);
      const draft = loadDraft("incoming");
      if (draft.text || draft.files.length) setIncoming(draft);
      setReady(true);
    })().catch((e) => {
      setError(errorText(e));
      setStorageFailed(true);
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    const receive = async () => {
      if (shareLock.current || sending) return;
      shareLock.current = true;
      const files: PendingFile[] = [];
      let persisted = false;
      try {
        const payloads = Sharing.getSharedPayloads();
        if (!payloads.length) return;
        const fingerprint = JSON.stringify(payloads);
        const old = loadDraft("incoming");
        if (old.sourceFingerprint === fingerprint) {
          setIncoming(old);
          Sharing.clearSharedPayloads();
          return;
        }
        const texts: string[] = [];
        for (const payload of payloads) {
          if (payload.shareType === "text" || payload.shareType === "url")
            texts.push(payload.value);
          else {
            if (old.files.length + files.length >= 16)
              throw new Error(
                "An incoming share can contain up to 16 files. Send or discard the current share first.",
              );
            const source = new File(payload.value);
            files.push(
              await persistFile(
                payload.value,
                payload.originalName || source.name,
                payload.mimeType || "application/octet-stream",
              ),
            );
          }
        }
        const draft = {
          ...old,
          id: Crypto.randomUUID(),
          text: [old.text, ...texts].filter(Boolean).join("\n\n"),
          files: [...old.files, ...files],
          sourceFingerprint: fingerprint,
        };
        if (draft.text.length > 32000)
          throw new Error(
            "The shared text exceeds the 32,000 character limit.",
          );
        saveDraft("incoming", draft);
        persisted = true;
        setIncoming(draft);
        Sharing.clearSharedPayloads();
        if (navigation.isReady()) navigation.navigate("Home");
      } catch (e) {
        setError(errorText(e));
        if (!persisted) removePendingFiles(files);
      } finally {
        shareLock.current = false;
      }
    };
    void receive();
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void receive();
      }
    });
    return () => listener.remove();
  }, [ready, host.client, sending]);

  async function save(next: Connection[]) {
    await saveConnections(next);
    setConnections(next);
  }
  const navTheme = scheme === "dark" ? DarkTheme : DefaultTheme;
  return (
    <SafeAreaProvider>
      <KeyboardProvider statusBarTranslucent navigationBarTranslucent>
        <ThemeContext.Provider value={theme}>
          <StatusBar
            barStyle={scheme === "dark" ? "light-content" : "dark-content"}
          />
          <AppContext.Provider
            value={{
              connections,
              selectedHostId,
              selectHost,
              selectedGroupId: selection?.groupId ?? null,
              selectGroup,
              save,
              host,
              deviceSettings,
              incoming,
              setIncoming,
              sending,
              setSending,
            }}
          >
            <SafeAreaView
              edges={["bottom"]}
              style={{ flex: 1, backgroundColor: theme.canvas }}
            >
              {error && (
                <View style={{ padding: 14 }}>
                  <ErrorNotice error={error} />
                  {!storageFailed && (
                    <Button label="Dismiss" onPress={() => setError(null)} />
                  )}
                </View>
              )}
              {deviceSettings.error && (
                <View style={{ padding: 14 }}>
                  <ErrorNotice error={deviceSettings.error} />
                </View>
              )}
              {!ready || !fontsLoaded ? (
                <View style={{ padding: 24 }}>
                  <AppText>
                    {fontError
                      ? `Could not load fonts: ${fontError.message}`
                      : storageFailed
                        ? "Restart the app after resolving the storage error. Saved connections have not been overwritten."
                        : "Loading…"}
                  </AppText>
                </View>
              ) : (
                <NavigationContainer
                  ref={navigation}
                  onReady={openPairingLink}
                  theme={{
                    ...navTheme,
                    colors: {
                      ...navTheme.colors,
                      primary: theme.accent,
                      background: theme.canvas,
                      card: theme.canvas,
                      text: theme.text,
                      border: theme.border,
                    },
                  }}
                >
                  <Stack.Navigator
                    screenOptions={{
                      headerShadowVisible: false,
                      headerTitleStyle: {
                        fontFamily: "DMSans-Medium",
                        fontWeight: "normal",
                      },
                      contentStyle: { backgroundColor: theme.canvas },
                    }}
                  >
                    <Stack.Screen
                      name="Home"
                      component={HomeScreen}
                      options={{ title: "Send Thing", headerShown: false }}
                    />
                    <Stack.Screen
                      name="Connect"
                      component={ConnectScreen}
                      options={{ title: "Join group" }}
                    />
                    <Stack.Screen
                      name="DeviceSettings"
                      component={DeviceSettingsScreen}
                      options={{ title: "Device settings" }}
                    />
                    <Stack.Screen
                      name="CreateGroup"
                      component={CreateGroupScreen}
                      options={{ title: "New group" }}
                    />
                    <Stack.Screen
                      name="Settings"
                      component={GroupSettingsScreen}
                      options={{ title: "Group settings" }}
                    />
                  </Stack.Navigator>
                </NavigationContainer>
              )}
            </SafeAreaView>
          </AppContext.Provider>
        </ThemeContext.Provider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}

function HomeScreen({ navigation }: ScreenProps<"Home">) {
  const {
    connections,
    selectHost,
    host,
    incoming,
    setIncoming,
    selectedGroupId,
    selectGroup,
    sending,
  } = useApp();
  const theme = useTheme();
  const [error, setError] = useState<string | null>(null);
  const group =
    host.session?.groups.find((g) => g.id === selectedGroupId) ??
    host.session?.groups[0];
  useEffect(() => {
    if (group && host.client && selectedGroupId !== group.id)
      selectGroup(host.client.connection.hostId, group.id);
  }, [group?.id, selectedGroupId, host.client]);
  const headerOptions = {
    headerBackVisible: false,
    headerTitle: () => (
      <MenuView
        shouldOpenOnLongPress={false}
        actions={[
          ...(host.session?.groups ?? []).map((g) => ({
            id: `group:${g.id}`,
            title: g.name,
            state: g.id === group?.id ? ("on" as const) : ("off" as const),
            attributes: { disabled: sending },
          })),
          ...connections
            .filter((c) => c.hostId !== host.client?.connection.hostId)
            .map((c) => ({
              id: `host:${c.hostId}`,
              title: c.label,
              attributes: { disabled: sending },
            })),
          {
            id: "create",
            title: "New group",
            attributes: { disabled: sending },
          },
          {
            id: "add",
            title: "Join group",
            attributes: { disabled: sending },
          },
          {
            id: "device",
            title: "Edit device settings",
            attributes: { disabled: sending },
          },
        ]}
        onPressAction={({ nativeEvent }) => {
          if (sending) return;
          const action = nativeEvent.event;
          if (action === "add") navigation.navigate("Connect");
          else if (action === "create") navigation.navigate("CreateGroup");
          else if (action === "device") navigation.navigate("DeviceSettings");
          else if (action.startsWith("host:")) selectHost(action.slice(5));
          else if (action.startsWith("group:") && host.client)
            selectGroup(host.client.connection.hostId, action.slice(6));
        }}
      >
        <Pressable
          disabled={sending}
          accessibilityRole="button"
          accessibilityLabel="Change group"
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            minHeight: 44,
            maxWidth: 250,
          }}
        >
          <AppText
            numberOfLines={1}
            style={{ fontSize: 18, fontWeight: "600", flexShrink: 1 }}
          >
            {group?.name ?? "Send Thing"}
          </AppText>
          <Icon name="expand" size={16} />
        </Pressable>
      </MenuView>
    ),
    headerRight: () =>
      group ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Group settings"
          disabled={sending}
          style={{
            minWidth: 44,
            minHeight: 44,
            alignItems: "center",
            justifyContent: "center",
          }}
          onPress={() => navigation.navigate("Settings", { groupId: group.id })}
        >
          <Icon name="more" />
        </Pressable>
      ) : null,
  };
  const header = (
    <View
      style={{
        height: 54,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        backgroundColor: theme.header,
      }}
    >
      {headerOptions.headerTitle()}
      {headerOptions.headerRight()}
    </View>
  );
  if (group && host.client)
    return (
      <GroupChat
        key={`${host.client.connection.hostId}/${group.id}/${Boolean(incoming)}`}
        groupId={group.id}
        incoming={Boolean(incoming)}
        header={header}
      />
    );
  if (host.client && host.status !== "online")
    return (
      <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
        {header}
        <ConnectionStatus
          host={host}
          label={host.client.connection.label}
          onRetry={() => host.client?.reconnect()}
        />
      </SafeAreaView>
    );
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
      {header}
      <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }}>
        {incoming && (
          <View
            style={{
              padding: 16,
              borderRadius: 14,
              backgroundColor: theme.message,
              gap: 8,
            }}
          >
            <AppText style={{ fontWeight: "600" }}>Share to a group</AppText>
            {incoming.text && (
              <AppText numberOfLines={3}>{incoming.text}</AppText>
            )}
            {incoming.files.length > 0 && (
              <AppText>
                {incoming.files.length}{" "}
                {incoming.files.length === 1 ? "file" : "files"}
              </AppText>
            )}
            <Button
              label="Discard share"
              onPress={() => {
                try {
                  removeDraft("incoming");
                  setIncoming(null);
                  removePendingFiles(incoming.files);
                } catch (error) {
                  setError(errorText(error));
                }
              }}
            />
          </View>
        )}
        <ErrorNotice error={error} />
        {connections.length > 1 && (
          <MenuView
            shouldOpenOnLongPress={false}
            actions={connections.map((connection) => ({
              id: connection.hostId,
              title: connection.label,
              state:
                host.client?.connection.hostId === connection.hostId
                  ? "on"
                  : "off",
            }))}
            onPressAction={({ nativeEvent }) => selectHost(nativeEvent.event)}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Select host"
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                paddingVertical: 8,
              }}
            >
              <AppText style={{ color: theme.muted }}>
                {host.client?.connection.label}
              </AppText>
              <Icon name="expand" size={16} />
            </Pressable>
          </MenuView>
        )}
        {!connections.length && (
          <AppText style={{ color: theme.muted }}>
            Scan your computer’s group QR code to connect.
          </AppText>
        )}
        {host.session && !host.session.groups.length && (
          <AppText style={{ color: theme.muted }}>
            Ask the host to add this device to a group.
          </AppText>
        )}
        <Button
          label="Join group"
          onPress={() => navigation.navigate("Connect")}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
