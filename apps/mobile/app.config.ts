import type { ExpoConfig } from "expo/config";

const variant = process.env.SEND_THING_VARIANT ?? "development";
if (variant !== "development" && variant !== "production")
  throw new Error("SEND_THING_VARIANT must be development or production.");
const development = variant === "development";
const appId = development ? "com.sendthing.mobile.dev" : "com.sendthing.mobile";

const config: ExpoConfig = {
  name: development ? "Send Thing Dev" : "Send Thing",
  slug: development ? "send-thing-dev" : "send-thing",
  scheme: development ? "sendthing-dev" : "sendthing",
  version: "0.0.5",
  orientation: "default",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: appId,
    buildNumber: "5",
    supportsTablet: true,
    infoPlist: {
      NSLocalNetworkUsageDescription:
        "Send files and messages to the host devices in your groups.",
      NSBonjourServices: ["_send-thing._tcp"],
      NSAppTransportSecurity: {
        NSAllowsLocalNetworking: true,
        NSAllowsArbitraryLoads: true,
      },
    },
  },
  android: {
    package: appId,
    versionCode: 5,
    icon: "./assets/icon.png",
    adaptiveIcon: {
      foregroundImage: "./assets/icon.png",
      backgroundColor: "#000000",
    },
    permissions: ["android.permission.CAMERA"],
  },
  plugins: [
    "./plugins/with-camera-permission.cjs",
    "./plugins/with-release-signing.cjs",
    [
      "expo-splash-screen",
      {
        backgroundColor: "#000000",
        dark: { backgroundColor: "#000000" },
      },
    ],
    "expo-video",
    [
      "expo-media-library",
      {
        savePhotosPermission:
          "Save images and videos from your groups to Photos.",
        granularPermissions: [],
        isAccessMediaLocationEnabled: false,
      },
    ],
    "expo-secure-store",
    "expo-document-picker",
    [
      "expo-camera",
      {
        cameraPermission: "Scan a Send Thing group QR code.",
        microphonePermission: false,
        recordAudioAndroid: false,
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission: "Choose photos and videos to send to your group.",
        cameraPermission: "Take a photo to send to your group.",
        microphonePermission: false,
      },
    ],
    ["expo-build-properties", { android: { usesCleartextTraffic: true } }],
    [
      "expo-sharing",
      {
        ios: {
          enabled: true,
          extensionBundleIdentifier: `${appId}.sharing`,
          appGroupId: `group.${appId}`,
          activationRule: {
            supportsText: true,
            supportsWebUrlWithMaxCount: 1,
            supportsImageWithMaxCount: 16,
            supportsMovieWithMaxCount: 16,
            supportsFileWithMaxCount: 16,
          },
        },
        android: {
          enabled: true,
          singleShareMimeTypes: ["*/*"],
          multipleShareMimeTypes: ["*/*"],
        },
      },
    ],
  ],
};
export default config;
