import { File } from "expo-file-system";
import {
  ImageManipulator,
  SaveFormat,
  type ImageRef,
} from "expo-image-manipulator";
import {
  AVATAR_SIZE,
  MAX_AVATAR_BYTES,
  AVATAR_QUALITIES,
  avatarCrop,
} from "@send-thing/contracts/avatar";

export async function prepareAvatar(uri: string): Promise<string> {
  // Downsample while loading so a camera original does not remain full-sized in memory.
  const context = ImageManipulator.manipulate(uri, {
    maxWidth: 2048,
    maxHeight: 2048,
  });
  let original: ImageRef | undefined;
  let avatar: ImageRef | undefined;
  try {
    original = await context.renderAsync();
    const crop = avatarCrop(original.width, original.height);
    const size = Math.min(AVATAR_SIZE, crop.width);
    avatar = await context
      .crop(crop)
      .resize({ width: size, height: size })
      .renderAsync();
    for (const quality of AVATAR_QUALITIES) {
      const result = await avatar.saveAsync({
        format: SaveFormat.JPEG,
        compress: quality,
        base64: true,
      });
      const file = new File(result.uri);
      try {
        if (file.size > MAX_AVATAR_BYTES) continue;
        if (!result.base64)
          throw new Error("Could not encode the device image.");
        return `data:image/jpeg;base64,${result.base64}`;
      } finally {
        try {
          file.delete();
        } catch (error) {
          console.warn("Could not remove processed avatar cache", error);
        }
      }
    }
    throw new Error(
      "Could not compress this image to an avatar. Try another image.",
    );
  } finally {
    avatar?.release();
    original?.release();
    context.release();
  }
}
