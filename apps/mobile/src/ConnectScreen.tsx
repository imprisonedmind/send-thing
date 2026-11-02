// Scan-card layout adapted from T3's ConnectionsNewRouteScreen.
import { useEffect, useRef, useState } from "react";
import {
  AppState,
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import * as DeviceInfo from "expo-device";
import type { Connection } from "@send-thing/contracts";
import {
  parsePairingLink,
  type PairingCode,
} from "@send-thing/contracts/pairing";
import { errorText, pair } from "@send-thing/client-runtime/client";
import { useApp, type ScreenProps } from "./app-context.ts";
import { AppText, Button, ErrorNotice, Field, useTheme } from "./ui.tsx";
import { Icon } from "./components/Icon.tsx";

export function ConnectScreen({ route, navigation }: ScreenProps<"Connect">) {
  const { connections, save, selectHost, deviceSettings } = useApp();
  const theme = useTheme();
  const focused = useIsFocused();
  const [active, setActive] = useState(AppState.currentState === "active");
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const requested = useRef(false);
  const [scanning, setScanning] = useState(false);
  const locked = useRef(false);
  const [code, setCode] = useState<PairingCode | null>(null);
  const [link, setLink] = useState("");
  const [manual, setManual] = useState(false);
  const [name, setName] = useState(DeviceInfo.deviceName ?? "My phone");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paired = useRef<Connection | null>(null);
  useEffect(() => {
    if (!focused || !active || code || manual || route.params?.link) return;
    let cancelled = false;
    void (async () => {
      let current = await getPermission();
      if (!current.granted && current.canAskAgain && !requested.current) {
        requested.current = true;
        current = await requestPermission();
      }
      if (cancelled) return;
      setScanning(current.granted);
      if (current.granted) {
        locked.current = false;
        setError(null);
      }
    })().catch((e) => {
      if (!cancelled) setError(errorText(e));
    });
    return () => {
      cancelled = true;
    };
  }, [focused, active, Boolean(code), manual, route.params?.link]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (value) =>
      setActive(value === "active"),
    );
    return () => subscription.remove();
  }, []);
  function read(value: string) {
    locked.current = true;
    setScanning(false);
    setCode(null);
    setError(null);
    try {
      setCode(parsePairingLink(value));
      setLink(value);
      paired.current = null;
    } catch (e) {
      setError(errorText(e));
    }
  }
  useEffect(() => {
    if (route.params?.link) read(route.params.link);
  }, [route.params?.link]);
  async function scan() {
    setError(null);
    try {
      if (!(permission?.granted || (await requestPermission()).granted)) {
        setError("Allow camera access to scan, or use a pairing link.");
        return;
      }
      locked.current = false;
      setCode(null);
      setScanning(true);
    } catch (e) {
      setError(errorText(e));
    }
  }
  async function connect() {
    if (!code || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (!paired.current) {
        const current = parsePairingLink(link);
        const result = await pair(
          current.url,
          current.invite,
          deviceSettings.profile ?? {
            name: name.trim(),
            kind:
              DeviceInfo.deviceType === DeviceInfo.DeviceType.TABLET
                ? "tablet"
                : "phone",
            avatar: null,
          },
          connections.find(
            (c) => c.hostId === current.hostId && c.url === current.url,
          ),
        );
        if (result.hostId !== current.hostId)
          throw new Error(
            "This host does not match the QR code. Scan a new code from the host.",
          );
        paired.current = { ...result, label: current.group };
      }
      const connection = paired.current;
      await save([
        ...connections.filter((c) => c.hostId !== connection.hostId),
        connection,
      ]);
      selectHost(connection.hostId);
      navigation.popToTop();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <KeyboardAwareScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: 16, gap: 24 }}
    >
      {!code && (
        <>
          <View
            accessibilityLabel="Group QR scanner"
            style={{
              height: 250,
              borderRadius: 26,
              overflow: "hidden",
              backgroundColor: theme.message,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            {scanning && permission?.granted && focused && active && (
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={({ data }) => {
                  if (!locked.current) read(data);
                }}
                onMountError={({ message }) => {
                  setScanning(false);
                  setError(message);
                }}
              />
            )}
            <View
              pointerEvents="none"
              style={{ alignItems: "center", gap: 14 }}
            >
              <View
                style={{
                  width: 150,
                  height: 150,
                  borderRadius: 28,
                  borderWidth: 3,
                  borderColor: scanning ? "#fff" : theme.muted,
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                }}
              >
                {!scanning && (
                  <>
                    {permission ? (
                      <Icon name="camera" size={44} />
                    ) : (
                      <ActivityIndicator color={theme.text} />
                    )}
                  </>
                )}
              </View>
              <AppText
                style={{ color: scanning ? "#fff" : theme.muted, fontSize: 13 }}
              >
                Scan the QR code on your host
              </AppText>
            </View>
          </View>
          {permission && !permission.granted && permission.canAskAgain && (
            <Button label="Allow camera" onPress={() => void scan()} />
          )}
          {permission?.granted && !scanning && !manual && error && (
            <Button label="Retry scan" onPress={() => void scan()} />
          )}
          {permission && !permission.granted && !permission.canAskAgain && (
            <Button
              label="Allow camera in Settings"
              onPress={() => {
                void Linking.openSettings().catch((e) =>
                  setError(errorText(e)),
                );
              }}
            />
          )}
          <AppText style={{ color: theme.muted, fontSize: 13 }}>
            On your computer, open a group and choose Add device.
          </AppText>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setManual((value) => !value);
              setScanning(false);
            }}
          >
            <AppText style={{ color: theme.muted, textAlign: "center" }}>
              Use a pairing link
            </AppText>
          </Pressable>
          {manual && (
            <View style={{ gap: 12 }}>
              <Field
                label="Pairing link"
                value={link}
                onChangeText={setLink}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Button
                label="Continue"
                disabled={!link.trim()}
                onPress={() => read(link)}
              />
            </View>
          )}
        </>
      )}
      {code && (
        <>
          <View
            style={{
              backgroundColor: theme.message,
              borderRadius: 20,
              padding: 20,
              gap: 8,
            }}
          >
            <Icon name="devices" size={28} />
            <AppText
              style={{ fontSize: 22, lineHeight: 28, fontWeight: "600" }}
            >
              {code.group}
            </AppText>
            <AppText style={{ color: theme.muted, fontSize: 13 }}>
              {code.url}
            </AppText>
          </View>
          {!deviceSettings.profile && (
            <Field
              label="Device name"
              value={name}
              onChangeText={setName}
              maxLength={100}
              editable={!busy && !paired.current}
            />
          )}
          <Button
            label={paired.current ? "Save connection" : "Join group"}
            primary
            busy={busy}
            disabled={!name.trim()}
            onPress={() => void connect()}
          />
          {!paired.current && (
            <Button
              label="Scan another code"
              disabled={busy}
              onPress={() => void scan()}
            />
          )}
        </>
      )}
      <ErrorNotice error={error} />
    </KeyboardAwareScrollView>
  );
}
