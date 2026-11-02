import { randomBytes } from "node:crypto";
import { mkdir, access, chmod, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const directory = join(homedir(), ".config/send-thing/signing");
const keystore = join(directory, "android-release.p12");
const passwordFile = join(directory, "android-release.password");
const exists = (path) =>
  access(path).then(
    () => true,
    () => false,
  );
const [hasKey, hasPassword] = await Promise.all([
  exists(keystore),
  exists(passwordFile),
]);
if (hasKey || hasPassword) {
  if (!hasKey || !hasPassword)
    throw new Error(
      "Incomplete signing files; restore the existing key/password instead of creating a replacement.",
    );
  console.log(`Using existing Android release identity in ${directory}`);
} else {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(passwordFile, randomBytes(32).toString("hex"), {
    mode: 0o600,
    flag: "wx",
  });
  execFileSync(
    "keytool",
    [
      "-genkeypair",
      "-keystore",
      keystore,
      "-storetype",
      "PKCS12",
      "-storepass:file",
      passwordFile,
      "-keypass:file",
      passwordFile,
      "-alias",
      "send-thing",
      "-keyalg",
      "RSA",
      "-keysize",
      "4096",
      "-validity",
      "10000",
      "-dname",
      "CN=Send Thing, O=Luke Stephens, C=ZA",
    ],
    { stdio: "inherit" },
  );
  await chmod(keystore, 0o600);
  console.log(
    `Created Android release identity. Back up ${directory} securely; updates require the same key.`,
  );
}
