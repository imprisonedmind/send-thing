import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(process.argv[2] ?? join(root, "apps/desktop/release"));
const output = join(root, "release/distribution");
const { version } = JSON.parse(
  await readFile(join(root, "apps/desktop/package.json"), "utf8"),
);
if (!/^\d+\.\d+\.\d+$/.test(version))
  throw new Error("Use a stable desktop version for this release.");
const assets = [
  "send-thing-macos-arm64.dmg",
  "send-thing-macos-x64.dmg",
  "send-thing-linux-arm64.AppImage",
  "send-thing-linux-x64.AppImage",
  "send-thing-windows-x64.exe",
  "send-thing-android.apk",
];
const hashes = new Map();
// Validate every input before producing a publishable bundle. Never fabricate
// checksums or publish a cask that points at a missing architecture.
for (const name of assets) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(join(source, name)))
    hash.update(chunk);
  hashes.set(name, hash.digest("hex"));
}
await mkdir(join(output, "homebrew/Casks"), { recursive: true });
for (const name of assets) await cp(join(source, name), join(output, name));
const installer = (
  await readFile(join(root, "scripts/install-linux.sh"), "utf8")
).replace("__SEND_THING_RELEASE_TAG__", `v${version}`);
await writeFile(join(output, "install-linux.sh"), installer, { mode: 0o755 });
hashes.set(
  "install-linux.sh",
  createHash("sha256").update(installer).digest("hex"),
);
await writeFile(
  join(output, "SHA256SUMS"),
  [...hashes].map(([name, hash]) => `${hash}  ${name}\n`).join(""),
);
const cask = `cask "send-thing" do
  arch arm: "arm64", intel: "x64"

  version "${version}"
  sha256 arm: "${hashes.get("send-thing-macos-arm64.dmg")}",
         intel: "${hashes.get("send-thing-macos-x64.dmg")}"

  url "https://github.com/imprisonedmind/send-thing/releases/download/v#{version}/send-thing-macos-#{arch}.dmg"
  name "Send Thing"
  desc "Share files, photos and links between your devices"
  homepage "https://github.com/imprisonedmind/send-thing"

  depends_on :macos
  app "Send Thing.app"
end
`;
await writeFile(join(output, "homebrew/Casks/send-thing.rb"), cask);
console.log(`Prepared v${version} in ${output}. Nothing has been published.`);
