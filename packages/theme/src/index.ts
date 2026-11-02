// Adapted from T3 Code's shared themePalettes.ts. See THIRD_PARTY_NOTICES.md.
export const light = {
  canvas: "#fcfcfc",
  header: "#f4f4f5",
  surface: "#ffffff",
  text: "#27272a",
  muted: "#71717b",
  border: "#e4e4e7",
  accent: "#1b4ed8",
  accentText: "#ffffff",
  message: "#f4f4f5",
  sidebar: "#fafafa",
  error: "#c10007",
};
export const dark: typeof light = {
  canvas: "#0a0a0a",
  header: "#141414",
  surface: "#111111",
  text: "#f5f5f5",
  muted: "#818181",
  border: "#191919",
  accent: "#346bf1",
  accentText: "#ffffff",
  message: "#141414",
  sidebar: "#000000",
  error: "#ff6467",
};
export type Theme = typeof light;
