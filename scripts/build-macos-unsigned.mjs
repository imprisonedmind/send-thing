import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "darwin")
  throw new Error("Build macOS packages on a Mac.");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const desktop = join(root, "apps/desktop");
function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: desktop,
    stdio: "inherit",
    env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: "false" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} failed (${result.status}).`);
}

run("pnpm", [
  "exec",
  "electron-builder",
  "--mac",
  "dir",
  "--arm64",
  "--x64",
  "--publish",
  "never",
]);
for (const [arch, directory] of [
  ["arm64", "mac-arm64"],
  ["x64", "mac"],
]) {
  const bundle = join(desktop, "release", directory, "Send Thing.app");
  // Replacing Electron's resources invalidates its original signature. An ad-hoc
  // signature repairs bundle integrity, but provides no Developer ID or notarization.
  run("codesign", [
    "--force",
    "--deep",
    "--sign",
    "-",
    "--preserve-metadata=entitlements",
    bundle,
  ]);
  run("codesign", ["--verify", "--deep", "--strict", bundle]);
  run("pnpm", [
    "exec",
    "electron-builder",
    "--mac",
    "dmg",
    `--${arch}`,
    "--prepackaged",
    bundle,
    "--publish",
    "never",
  ]);
}
