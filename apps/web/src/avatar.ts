import {
  AVATAR_SIZE,
  MAX_AVATAR_BYTES,
  AVATAR_QUALITIES,
  avatarCrop,
} from "@send-thing/contracts/avatar";

export async function prepareAvatar(file: File): Promise<string> {
  let image: ImageBitmap;
  try {
    image = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(
      "This image could not be opened. Choose a supported photo such as JPEG, PNG or WebP.",
    );
  }
  try {
    const crop = avatarCrop(image.width, image.height);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = Math.min(AVATAR_SIZE, crop.width);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image processing is unavailable.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingQuality = "high";
    context.drawImage(
      image,
      crop.originX,
      crop.originY,
      crop.width,
      crop.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    for (const quality of AVATAR_QUALITIES) {
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) =>
            value
              ? resolve(value)
              : reject(new Error("Could not process this image.")),
          "image/jpeg",
          quality,
        ),
      );
      if (blob.size > MAX_AVATAR_BYTES) continue;
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () =>
          reject(new Error("Could not read the processed image."));
        reader.readAsDataURL(blob);
      });
    }
    throw new Error(
      "Could not compress this image to an avatar. Try another image.",
    );
  } finally {
    image.close();
  }
}
