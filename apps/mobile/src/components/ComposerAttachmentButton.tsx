// Adapted from T3's ComposerAttachmentButton; native menus launch native pickers.
import { MenuView } from "@react-native-menu/menu";
import { Platform, Pressable, useColorScheme } from "react-native";
import { Icon } from "./Icon.tsx";
import type { AttachmentSource } from "../attachments.ts";

export function ComposerAttachmentButton({
  disabled,
  onPick,
}: {
  disabled: boolean;
  onPick: (source: AttachmentSource) => void;
}) {
  const scheme = useColorScheme();
  const button = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add attachment"
      accessibilityState={{ disabled }}
      disabled={disabled}
      style={{
        width: 44,
        height: 44,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Icon name="attachment" size={22} />
    </Pressable>
  );
  if (disabled) return button;
  return (
    <MenuView
      themeVariant={scheme === "dark" ? "dark" : "light"}
      shouldOpenOnLongPress={false}
      actions={[
        {
          id: "camera",
          title: "Camera",
          image: Platform.OS === "ios" ? "camera" : "ic_menu_camera",
        },
        {
          id: "photos",
          title: "Photos",
          image: Platform.OS === "ios" ? "photo" : "ic_menu_gallery",
        },
        {
          id: "videos",
          title: "Videos",
          image: Platform.OS === "ios" ? "video" : "ic_media_play",
        },
        {
          id: "files",
          title: "Files",
          image: Platform.OS === "ios" ? "folder" : "ic_menu_agenda",
        },
      ]}
      onPressAction={({ nativeEvent }) => {
        const source = nativeEvent.event;
        if (
          source === "camera" ||
          source === "photos" ||
          source === "videos" ||
          source === "files"
        )
          onPick(source);
      }}
    >
      {button}
    </MenuView>
  );
}
