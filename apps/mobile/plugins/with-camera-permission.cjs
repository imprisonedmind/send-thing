const { withAndroidManifest } = require("expo/config-plugins");

// Earlier builds blocked CAMERA. Merely ensuring the permission exists leaves
// that tools:node="remove" directive intact during an incremental prebuild.
module.exports = function withCameraPermission(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const permissions = manifest["uses-permission"] ?? [];
    manifest["uses-permission"] = permissions.filter(
      (entry) => entry.$["android:name"] !== "android.permission.CAMERA",
    );
    manifest["uses-permission"].push({
      $: { "android:name": "android.permission.CAMERA" },
    });
    return config;
  });
};
