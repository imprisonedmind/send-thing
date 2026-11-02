const { build } = require("./package.json");

module.exports = {
  ...build,
  appId: "com.sendthing.desktop.dev",
  productName: "Send Thing Dev",
  extraMetadata: { name: "send-thing-dev", productName: "Send Thing Dev" },
  directories: { output: "release/development" },
  mac: { ...build.mac, artifactName: "send-thing-dev-macos-${arch}.${ext}" },
  win: { ...build.win, artifactName: "send-thing-dev-windows-${arch}.${ext}" },
  linux: {
    ...build.linux,
    executableName: "send-thing-dev",
    artifactName: "send-thing-dev-linux-${arch}.${ext}",
  },
};
