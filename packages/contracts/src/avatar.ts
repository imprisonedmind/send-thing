export const AVATAR_SIZE = 256;
export const MAX_AVATAR_BYTES = 256_000;
export const AVATAR_QUALITIES = [0.85, 0.7, 0.5] as const;

export function avatarCrop(width: number, height: number) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 1 ||
    height < 1
  )
    throw new Error("This image has invalid dimensions.");
  const side = Math.floor(Math.min(width, height));
  return {
    originX: Math.floor((width - side) / 2),
    originY: Math.floor((height - side) / 2),
    width: side,
    height: side,
  };
}
