import { Platform } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import * as Crypto from "expo-crypto";
import { safeFilename, type Attachment } from "@send-thing/contracts";
import type { HostClient } from "@send-thing/client-runtime/client";

export class SavePermissionError extends Error {
  constructor(readonly canAskAgain: boolean) {
    super(
      canAskAgain
        ? "Allow saving to your photo library, then try again."
        : "Allow photo library access in Settings to save this media.",
    );
  }
}

function unusedName(directory: Directory, name: string) {
  const names = new Set(directory.list().map((entry) => entry.name));
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";
  let next = name;
  for (let index = 1; names.has(next); index++)
    next = `${base} (${index})${extension}`;
  return next;
}

export async function saveAttachment(
  client: HostClient,
  attachment: Attachment,
  media: boolean,
): Promise<string | null> {
  let destination: Directory | undefined;
  if (media) {
    // Scoped storage lets Android 10+ add media without reading the library.
    if (
      Platform.OS === "ios" ||
      (Platform.OS === "android" && Number(Platform.Version) < 29)
    ) {
      const permission = await MediaLibrary.requestPermissionsAsync(true);
      if (!permission.granted)
        throw new SavePermissionError(permission.canAskAgain);
    }
  } else {
    try {
      destination = await Directory.pickDirectoryAsync();
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (
        code === "ERR_PICKER_CANCELLED" ||
        code === "ERR_FILE_PICKING_CANCELLED"
      )
        return null;
      throw error;
    }
  }

  const folder = new Directory(Paths.cache, "downloads", Crypto.randomUUID());
  folder.create({ intermediates: true });
  try {
    let name = safeFilename(attachment.name);
    if (media && !/\.[^./]+$/.test(name)) {
      const extensions: Record<string, string> = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/gif": "gif",
        "image/webp": "webp",
        "image/heic": "heic",
        "image/heif": "heif",
        "image/avif": "avif",
        "video/mp4": "mp4",
        "video/quicktime": "mov",
        "video/webm": "webm",
      };
      const extension = extensions[attachment.mime];
      if (!extension)
        throw new Error(
          "This media needs a filename extension before it can be saved to the gallery.",
        );
      name += `.${extension}`;
    }
    const downloaded = await File.downloadFileAsync(
      client.fileUrl(attachment.id),
      new File(folder, name),
      { headers: client.fileHeaders() },
    );
    if (downloaded.size !== attachment.size)
      throw new Error("Download was incomplete. Please retry.");
    if (media) {
      await MediaLibrary.Asset.create(downloaded.uri);
      return Platform.OS === "ios" ? "Saved to Photos" : "Saved to gallery";
    }
    const target = destination!.createFile(
      unusedName(destination!, name),
      attachment.mime,
    );
    try {
      // Write into the provider-owned URI. File.copy with overwrite can delete
      // an Android SAF document and invalidate that URI before copying bytes.
      await downloaded.readableStream().pipeTo(target.writableStream());
      if (target.size !== attachment.size)
        throw new Error("The saved file was incomplete. Please retry.");
    } catch (error) {
      try {
        target.delete();
      } catch (cleanupError) {
        console.warn("Could not remove incomplete saved file", cleanupError);
      }
      throw error;
    }
    return `Saved to ${destination!.name}`;
  } finally {
    try {
      folder.delete();
    } catch (error) {
      console.warn("Could not remove download cache", error);
    }
  }
}
