# Releases and deployment

Run `pnpm typecheck`, `pnpm test`, `pnpm build:desktop` and
`pnpm build:marketing` before packaging.

## Android

`pnpm signing:android` creates a release identity once in
`~/.config/send-thing/signing`. Back up that directory securely. Updates require
the same signing key; never replace it for an existing release.

`pnpm package:android` regenerates Android, signs the release APK and writes
`release/artifacts/send-thing-android.apk`. CI can supply
`SEND_THING_ANDROID_KEYSTORE` and `SEND_THING_ANDROID_PASSWORD_FILE`.
Development installs use `com.sendthing.mobile.dev` and coexist with the release.
Older debug installs used the release ID and a different key, so this APK cannot
update those in place. Uninstalling an existing app removes its local data.

Mobile configuration defaults to development. `package:android` selects
`SEND_THING_VARIANT=production` explicitly; set the same variable for manual
iOS release builds to retain the production app, extension and App Group IDs.

## Desktop

The **Build desktop release artifacts** GitHub workflow builds Linux x64/ARM64
and Windows x64 from a tag and attaches installers to its draft release.
`pnpm package:desktop` packages the current platform locally.

macOS production distribution should use a Developer ID certificate and notarized,
stapled DMGs. Unsigned builds must be identified as such in release notes;
macOS may block opening them. Windows unsigned installers may also show warnings.

For an unsigned Mac release, use `pnpm package:macos:unsigned`. It builds both
architectures and applies an ad-hoc signature to preserve bundle integrity.
This does not establish a developer identity or satisfy notarization.

Collect these artifacts in one directory:

- `send-thing-macos-arm64.dmg` and `send-thing-macos-x64.dmg`
- `send-thing-linux-arm64.AppImage` and `send-thing-linux-x64.AppImage`
- `send-thing-windows-x64.exe`
- `send-thing-android.apk`

Run `pnpm prepare:release /absolute/path/to/artifacts`. It validates inputs,
uses the desktop package version, computes SHA-256 checksums and stages
`release/distribution`. The Linux installer is pinned to that version, verifies
the AppImage checksum and installs into `~/.local/bin` without launching it.

Publish the staged installers, `SHA256SUMS` and `install-linux.sh` on
`imprisonedmind/send-thing` under `v<version>`. Once assets are live, publish the
generated `homebrew/Casks/send-thing.rb` to `imprisonedmind/homebrew-tap` as
`Casks/send-thing.rb`. The cask uses versioned URLs and checksums for both Macs.

## Website

`pnpm dev:marketing` uses port 4321. `pnpm deploy:marketing` builds and deploys
the static website to Cloudflare Worker `send-thing-marketing` at
`send-thing.lukestephens.co.za`. Cloudflare manages the custom domain's DNS and
TLS. The main personal website is separate.

After deployment, the marketing deploy command verifies the public IndexNow
ownership file and submits the built sitemap's URLs. If submission fails after
a successful deployment, rerun `pnpm --filter @send-thing/marketing indexnow`.
An accepted submission is not a guarantee of indexing.

`SITE_URL` overrides the canonical origin. Set `PUBLIC_IOS_DOWNLOAD_URL` to
an App Store or TestFlight URL when available. Other downloads use GitHub
release assets and the Homebrew tap, which must be published before installation
links work.
