import { access, cp, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const directory = join(homedir(), ".config/send-thing/signing");
const env = {
  ...process.env,
  CI: "1",
  NODE_ENV: "production",
  SEND_THING_ANDROID_KEYSTORE:
    process.env.SEND_THING_ANDROID_KEYSTORE ??
    join(directory, "android-release.p12"),
  SEND_THING_ANDROID_PASSWORD_FILE:
    process.env.SEND_THING_ANDROID_PASSWORD_FILE ??
    join(directory, "android-release.password"),
};
await Promise.all([
  access(env.SEND_THING_ANDROID_KEYSTORE),
  access(env.SEND_THING_ANDROID_PASSWORD_FILE),
]);
execFileSync(
  "pnpm",
  ["exec", "expo", "prebuild", "--platform", "android", "--no-install"],
  {
    cwd: join(root, "apps/mobile"),
    env,
    stdio: "inherit",
  },
);
execFileSync("./gradlew", ["assembleRelease", "--no-daemon"], {
  cwd: join(root, "apps/mobile/android"),
  env,
  stdio: "inherit",
});
await mkdir(join(root, "release/artifacts"), { recursive: true });
await cp(
  join(
    root,
    "apps/mobile/android/app/build/outputs/apk/release/app-release.apk",
  ),
  join(root, "release/artifacts/send-thing-android.apk"),
);
