import { Alert, Linking } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import {
  persistFile,
  removePendingFiles,
  type PendingFile,
} from "./storage.ts";

export type AttachmentSource = "camera" | "photos" | "videos" | "files";

export async function pickAttachments(
  source: AttachmentSource,
  remaining: number,
): Promise<PendingFile[]> {
  if (remaining <= 0) throw new Error("Send up to 16 files at a time.");
  let assets: { uri: string; name: string; mime: string }[];
  if (source === "files") {
    const result = await DocumentPicker.getDocumentAsync({
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return [];
    assets = result.assets.map((asset) => ({
      uri: asset.uri,
      name: asset.name,
      mime: asset.mimeType ?? "application/octet-stream",
    }));
  } else {
    if (source === "camera") {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        if (!permission.canAskAgain)
          Alert.alert(
            "Camera access",
            "Allow camera access in Settings to take a photo.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Open Settings",
                onPress: () => void Linking.openSettings(),
              },
            ],
          );
        else throw new Error("Camera permission is needed to take a photo.");
        return [];
      }
    }
    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            quality: 1,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: source === "videos" ? ["videos"] : ["images"],
            allowsMultipleSelection: true,
            selectionLimit: remaining,
            base64: false,
            quality: 1,
            shouldDownloadFromNetwork: true,
          });
    if (result.canceled) return [];
    assets = result.assets.map((asset) => {
      const file = new File(asset.uri);
      return {
        uri: asset.uri,
        name: asset.fileName || file.name,
        mime: asset.mimeType || file.type || "application/octet-stream",
      };
    });
  }
  if (assets.length > remaining)
    throw new Error(
      `You can attach ${remaining} more ${remaining === 1 ? "file" : "files"}.`,
    );
  const files: PendingFile[] = [];
  try {
    for (const asset of assets)
      files.push(await persistFile(asset.uri, asset.name, asset.mime));
    return files;
  } catch (error) {
    removePendingFiles(files);
    throw error;
  }
}
