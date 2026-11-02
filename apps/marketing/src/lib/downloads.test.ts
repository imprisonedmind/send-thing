import { test } from "node:test";
import assert from "node:assert/strict";
import { APK_URL, detectPlatform, installAction } from "./downloads.ts";

test("mobile user agents are not mistaken for their desktop platforms", () => {
  assert.equal(
    detectPlatform("Mozilla/5.0 (Linux; Android 15) Mobile", "Linux armv8l", 5),
    "android",
  );
  assert.equal(
    detectPlatform(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
      "iPhone",
      5,
    ),
    "ios",
  );
  assert.equal(
    detectPlatform(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)",
      "MacIntel",
      5,
    ),
    "ios",
  );
  assert.equal(
    detectPlatform(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)",
      "MacIntel",
      0,
    ),
    "macos",
  );
  assert.equal(
    detectPlatform("Mozilla/5.0 (X11; Linux x86_64)", "Linux x86_64", 0),
    "linux",
  );
});
test("download actions keep APK links separate from desktop install commands", () => {
  assert.deepEqual(installAction("android"), {
    kind: "download",
    label: "Download APK",
    href: APK_URL,
  });
  assert.equal(installAction("macos").kind, "copy");
  assert.equal(installAction("linux").kind, "copy");
  assert.equal(installAction("windows").kind, "download");
  assert.equal(installAction("ios").kind, "unavailable");
  assert.equal(
    installAction("ios", "https://testflight.apple.com/join/example").kind,
    "download",
  );
});
