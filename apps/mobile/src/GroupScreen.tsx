import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useFocusEffect, usePreventRemove } from "@react-navigation/native";
import { FlatList, View } from "react-native";
import { createChatFollow } from "@send-thing/client-runtime/chat-follow";
import { ConnectionStatus } from "./components/ConnectionStatus.tsx";
import {
  KeyboardStickyView,
  useKeyboardState,
} from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Crypto from "expo-crypto";
import { File } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";
import { type Message } from "@send-thing/contracts";
import { errorText } from "@send-thing/client-runtime/client";
import { useHistory } from "@send-thing/client-runtime/react";
import { useApp } from "./app-context.ts";
import { AppText, Button, ErrorNotice, useTheme } from "./ui.tsx";
import { Composer } from "./components/Composer.tsx";
import { MessageRow } from "./components/MessageRow.tsx";
import { pickAttachments, type AttachmentSource } from "./attachments.ts";
import {
  emptyDraft,
  loadDraft,
  removeDraft,
  removePendingFiles,
  saveDraft,
  type Draft,
} from "./storage.ts";

export function GroupChat({
  groupId,
  incoming,
  header,
}: {
  groupId: string;
  incoming: boolean;
  header: ReactNode;
}) {
  const { host, setIncoming, setSending } = useApp();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardState((state) => state.height);
  const [composerHeight, setComposerHeight] = useState(0);
  const bottomSpace =
    composerHeight + Math.max(0, keyboardHeight - insets.bottom);
  const group = host.session?.groups.find((g) => g.id === groupId);
  const key = incoming
    ? "incoming"
    : `${host.client?.connection.hostId}_${groupId}`;
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const history = useHistory(host.client, group?.id, host.revision);
  const list = useRef<FlatList<Message>>(null);
  const [follow] = useState(createChatFollow);
  const scrollGesture = useRef(false);
  const listSize = useRef({ content: 0, viewport: 0 });
  const scrollFrame = useRef<number | null>(null);
  const scrollToLatest = useCallback(() => {
    if (scrollFrame.current !== null) return;
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = null;
      const { content, viewport } = listSize.current;
      if (!follow.active || viewport <= 0) return;
      // FlatList.scrollToEnd estimates the last cell and excludes content
      // padding. Use the measured extent, including composer/keyboard space.
      list.current?.scrollToOffset({
        offset: Math.max(0, content - viewport),
        animated: false,
      });
    });
  }, [follow]);
  useEffect(
    () => () => {
      if (scrollFrame.current !== null)
        cancelAnimationFrame(scrollFrame.current);
    },
    [],
  );
  useEffect(scrollToLatest, [
    history.messages.at(-1)?.id,
    bottomSpace,
    scrollToLatest,
  ]);
  const [headerHeight, setHeaderHeight] = useState(54);
  usePreventRemove(busy || picking, () =>
    setError("Finish attaching or sending before leaving the group."),
  );
  useFocusEffect(
    useCallback(() => {
      setLoaded(false);
      try {
        let current = loadDraft(key);
        const destination = `${host.client?.connection.hostId}_${groupId}`;
        if (current.destination !== destination) {
          current = {
            ...current,
            destination,
            id: Crypto.randomUUID(),
            files: current.files.map((file) => ({
              ...file,
              metadata: { ...file.metadata, id: Crypto.randomUUID() },
            })),
          };
          saveDraft(key, current);
        }
        setDraft(current);
        setLoaded(true);
      } catch (e) {
        setError(errorText(e));
      }
    }, [key, host.client, groupId]),
  );

  function update(next: Draft) {
    try {
      saveDraft(key, next);
      setDraft(next);
      if (incoming) setIncoming(next);
      return true;
    } catch (error) {
      setError(errorText(error));
      return false;
    }
  }
  async function attach(source: AttachmentSource) {
    if (busy || picking || !loaded) return;
    setPicking(true);
    setSending(true);
    setError(null);
    try {
      const files = await pickAttachments(source, 16 - draft.files.length);
      if (!files.length) return;
      const saved = update({
        ...draft,
        id: Crypto.randomUUID(),
        files: [...draft.files, ...files],
      });
      if (!saved) removePendingFiles(files);
    } catch (error) {
      setError(errorText(error));
    } finally {
      setPicking(false);
      setSending(false);
    }
  }
  async function send() {
    if (
      !host.client ||
      !group ||
      busy ||
      picking ||
      !loaded ||
      (!draft.text.trim() && !draft.files.length)
    )
      return;
    setBusy(true);
    setSending(true);
    setError(null);
    try {
      for (const file of draft.files) {
        setProgress(`Uploading ${file.metadata.name}…`);
        await host.client.upload(
          group.id,
          file.metadata,
          new File(file.uri),
          expoFetch as typeof fetch,
        );
      }
      setProgress("Sending…");
      await host.client.send(group.id, {
        id: draft.id,
        text: draft.text,
        attachmentIds: draft.files.map((file) => file.metadata.id),
      });
      removeDraft(key);
      const completedFiles = draft.files;
      setDraft({
        ...emptyDraft(),
        destination: `${host.client.connection.hostId}_${group.id}`,
      });
      follow.resume();
      scrollToLatest();
      history.refresh();
      removePendingFiles(completedFiles);
      if (incoming) setIncoming(null);
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
      setSending(false);
      setProgress(null);
    }
  }
  if (!host.client || !group)
    return (
      <View style={{ padding: 20 }}>
        <AppText>This group is no longer available on this host.</AppText>
      </View>
    );
  return (
    <View
      style={{ flex: 1, overflow: "hidden", backgroundColor: theme.header }}
    >
      <View
        style={{
          position: "absolute",
          top: insets.top + headerHeight,
          bottom: 0,
          left: 0,
          right: 0,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          overflow: "hidden",
          backgroundColor: theme.canvas,
        }}
      >
        <FlatList
          ref={list}
          style={{ flex: 1 }}
          data={history.messages as Message[]}
          keyExtractor={(message) => message.id}
          contentContainerStyle={{
            paddingHorizontal: 10,
            paddingBottom: bottomSpace + 12,
            paddingTop: 4,
            flexGrow: 1,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          scrollIndicatorInsets={{ top: insets.top, bottom: bottomSpace }}
          onScrollBeginDrag={() => {
            scrollGesture.current = true;
            follow.pause();
          }}
          onScrollEndDrag={() => {
            scrollGesture.current = false;
          }}
          onMomentumScrollBegin={() => {
            scrollGesture.current = true;
          }}
          onMomentumScrollEnd={() => {
            scrollGesture.current = false;
          }}
          onScroll={(event) => {
            const { contentOffset, contentSize, layoutMeasurement } =
              event.nativeEvent;
            follow.onScroll(
              contentOffset.y,
              contentSize.height,
              layoutMeasurement.height,
              scrollGesture.current,
            );
          }}
          scrollEventThrottle={16}
          onContentSizeChange={(_width, height) => {
            listSize.current.content = height;
            scrollToLatest();
          }}
          onLayout={({ nativeEvent }) => {
            listSize.current.viewport = nativeEvent.layout.height;
            scrollToLatest();
          }}
          ListHeaderComponent={
            history.hasMore ? (
              <Button
                label="Earlier messages"
                busy={history.loading}
                onPress={() => {
                  follow.pause();
                  void history.loadMore();
                }}
              />
            ) : undefined
          }
          ListEmptyComponent={
            host.status !== "online" ? (
              <ConnectionStatus
                host={host}
                label={host.client.connection.label}
                onRetry={() => host.client?.reconnect()}
              />
            ) : (
              <AppText
                style={{
                  color: theme.muted,
                  textAlign: "center",
                  marginTop: 30,
                }}
              >
                {history.loading
                  ? "Loading messages…"
                  : "Send a message or attach a file."}
              </AppText>
            )
          }
          renderItem={({ item, index }) => (
            <MessageRow
              message={item}
              previous={history.messages[index - 1]}
              own={item.sender.id === host.session?.device.id}
              client={host.client!}
            />
          )}
        />
      </View>
      <View
        style={{
          position: "absolute",
          top: insets.top,
          left: 0,
          right: 0,
          zIndex: 2,
          height: headerHeight,
          overflow: "hidden",
        }}
      >
        <View
          onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
        >
          {header}
        </View>
      </View>
      <KeyboardStickyView
        pointerEvents="box-none"
        offset={{ closed: 0, opened: insets.bottom }}
        style={{ position: "absolute", bottom: 0, left: 0, right: 0 }}
      >
        <View
          onLayout={(event) =>
            setComposerHeight(event.nativeEvent.layout.height)
          }
          style={{
            backgroundColor: theme.canvas,
            paddingHorizontal: 12,
            paddingBottom: 8,
            paddingTop: 4,
            gap: 8,
          }}
        >
          {history.messages.length > 0 && (
            <ConnectionStatus
              compact
              host={host}
              label={host.client.connection.label}
              onRetry={() => host.client?.reconnect()}
            />
          )}
          <ErrorNotice
            error={error ?? (host.status === "online" ? history.error : null)}
          />
          {incoming && (
            <Button
              label="Discard incoming share"
              disabled={busy || picking}
              onPress={() => {
                try {
                  removeDraft("incoming");
                  removePendingFiles(draft.files);
                  setIncoming(null);
                } catch (e) {
                  setError(errorText(e));
                }
              }}
            />
          )}
          {progress && (
            <AppText
              accessibilityLiveRegion="polite"
              style={{ fontSize: 12, color: theme.muted }}
            >
              {progress}
            </AppText>
          )}
          <Composer
            text={draft.text}
            files={draft.files}
            disabled={busy || picking || !loaded}
            sending={busy}
            canSend={
              host.status === "online" &&
              Boolean(draft.text.trim() || draft.files.length)
            }
            onChangeText={(text) =>
              update({ ...draft, id: Crypto.randomUUID(), text })
            }
            onPick={(source) => void attach(source)}
            onSend={() => void send()}
            onRemove={(file) => {
              if (
                update({
                  ...draft,
                  id: Crypto.randomUUID(),
                  files: draft.files.filter((f) => f !== file),
                })
              ) {
                try {
                  removePendingFiles([file]);
                } catch (error) {
                  setError(errorText(error));
                }
              }
            }}
          />
        </View>
      </KeyboardStickyView>
    </View>
  );
}
