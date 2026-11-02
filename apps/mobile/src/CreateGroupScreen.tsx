import { useState } from "react";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { errorText } from "@send-thing/client-runtime/client";
import { useApp, type ScreenProps } from "./app-context.ts";
import { AppText, Button, ErrorNotice, Field } from "./ui.tsx";

export function CreateGroupScreen({ navigation }: ScreenProps<"CreateGroup">) {
  const { host, selectGroup } = useApp();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isHost = host.session && host.session.device.id === host.session.hostId;
  return (
    <KeyboardAwareScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: 20, gap: 20 }}
    >
      {isHost ? (
        <>
          <Field
            label="Group name"
            value={name}
            onChangeText={setName}
            maxLength={100}
            editable={!busy}
            autoFocus
          />
          <ErrorNotice error={error} />
          <Button
            label="Create group"
            primary
            busy={busy}
            disabled={!name.trim()}
            onPress={() => {
              if (!host.client || busy) return;
              setBusy(true);
              setError(null);
              void host.client
                .createGroup(name)
                .then((group) => {
                  selectGroup(host.client!.connection.hostId, group.id);
                  navigation.popToTop();
                })
                .catch((e) => setError(errorText(e)))
                .finally(() => setBusy(false));
            }}
          />
        </>
      ) : (
        <AppText>
          Create groups on the computer that will host them, then join from this
          device.
        </AppText>
      )}
    </KeyboardAwareScrollView>
  );
}
