export const REPOSITORY_URL = "https://github.com/imprisonedmind/send-thing";
export const RELEASES_URL = `${REPOSITORY_URL}/releases/latest`;
export const APK_URL = `${RELEASES_URL}/download/send-thing-android.apk`;

export type Platform =
  "macos" | "windows" | "linux" | "android" | "ios" | "unknown";
export type InstallAction =
  | { kind: "copy"; command: string }
  | { kind: "download"; label: string; href: string }
  | { kind: "unavailable"; label: string };

export function detectPlatform(
  userAgent: string,
  platform: string,
  maxTouchPoints: number,
): Platform {
  if (/Android/i.test(userAgent)) return "android";
  if (
    /iPhone|iPad|iPod/i.test(userAgent) ||
    (/Mac/i.test(platform) && maxTouchPoints > 1)
  )
    return "ios";
  if (/Macintosh|Mac OS X/i.test(userAgent)) return "macos";
  if (/Windows/i.test(userAgent)) return "windows";
  if (/Linux/i.test(userAgent) && !/CrOS/i.test(userAgent)) return "linux";
  return "unknown";
}

export function installAction(
  platform: Platform,
  iosUrl?: string,
): InstallAction {
  switch (platform) {
    case "macos":
      return {
        kind: "copy",
        command: "brew install --cask imprisonedmind/tap/send-thing",
      };
    case "linux":
      return {
        kind: "copy",
        command: `curl -fsSL ${RELEASES_URL}/download/install-linux.sh | sh`,
      };
    case "android":
      return { kind: "download", label: "Download APK", href: APK_URL };
    case "windows":
      return {
        kind: "download",
        label: "Download for Windows",
        href: `${RELEASES_URL}/download/send-thing-windows-x64.exe`,
      };
    case "ios":
      return iosUrl
        ? { kind: "download", label: "Download for iOS", href: iosUrl }
        : { kind: "unavailable", label: "iOS download not available yet" };
    default:
      return { kind: "download", label: "View downloads", href: RELEASES_URL };
  }
}
