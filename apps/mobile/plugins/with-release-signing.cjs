const { withAppBuildGradle } = require("expo/config-plugins");

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (config) => {
    const marker = "// Send Thing release signing";
    if (config.modResults.contents.includes(marker)) return config;
    config.modResults.contents += `
${marker}
def sendThingKeystore = System.getenv("SEND_THING_ANDROID_KEYSTORE")
def sendThingPasswordFile = System.getenv("SEND_THING_ANDROID_PASSWORD_FILE")
if (sendThingKeystore && sendThingPasswordFile) {
    android.signingConfigs.create("sendThingRelease") {
        storeFile file(sendThingKeystore)
        storePassword new File(sendThingPasswordFile).text.trim()
        keyAlias "send-thing"
        keyPassword new File(sendThingPasswordFile).text.trim()
    }
    android.buildTypes.release.signingConfig = android.signingConfigs.sendThingRelease
} else {
    // Never distribute a release signed with the public Android debug key.
    android.buildTypes.release.signingConfig = null
}
`;
    return config;
  });
};
