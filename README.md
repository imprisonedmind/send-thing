# Send Thing

Share text, links, images and files between your devices through group chats.
Each group has one designated host computer. The host can run on macOS, Windows
or Linux; phones and tablets connect over the LAN or Tailscale. A device can join
multiple groups, including groups on different hosts.

This is an initial implementation. Type checking is available; native builds,
runtime behavior, signing and packaging still need validation on real devices.

## Development

Use Node 24+ and pnpm 10.33.0. Install with `pnpm install`. Dependencies were
initially installed with lifecycle scripts disabled. Desktop development's
`install-electron` step downloads the Electron runtime if necessary.

In separate terminals:

```sh
pnpm dev:web
pnpm dev:desktop
```

The desktop app starts its own host on port 47823 and stays in the tray / menu
bar. Click its icon to open the compact chat popover. Click outside, click the
icon again, or press Escape to dismiss it. Right-click the icon to quit or change
startup settings. Create a group, then choose **Add device** in its header to show
a QR code. Select the host's reachable LAN or Tailscale address. On the phone,
choose **Join group** and scan, or open the code with the system camera. Confirm
the group and device name to join. Computers can use **Copy pairing link** and
**Join a group**. Codes expire after ten minutes and can be redeemed once.
Joining another group at the same host address reuses the device identity.

For mobile, first make a native development build using one of:

```sh
pnpm --filter @send-thing/mobile ios
pnpm --filter @send-thing/mobile android
```

Then use `pnpm dev:mobile` when a development client is installed. Expo Go is not
sufficient for receiving system shares. iOS builds need signing configured for
the app and share extension's App Group; update the bundle identifiers in
`apps/mobile/app.config.ts` to identifiers you own. The dependency versions match
Expo SDK 58. The T3 Code Expo Sharing patch preserves Android text-file shares,
original filenames and safe temporary paths, and fixes extension project entries.

Rebuild the mobile development client after native dependency or permission
changes; restarting Metro alone does not install the camera scanner or native
attachment menu. The `ios` and `android` commands refresh the generated native
configuration before building, including removing an old Android camera block.
The Android launcher and adaptive icons use `apps/mobile/assets/icon.png`;
changing this image also requires a native rebuild.
Join group requests camera access and starts scanning immediately. If permission
was permanently denied, its Settings button opens the app's system settings.
The paperclip menu offers **Camera**, **Photos**, **Videos** and
**Files**. Photos and videos use the native media library; Files uses the document
picker. Camera takes a photo. On macOS, the paperclip opens the standard file
picker directly. Other desktop platforms keep the Photos, Videos and Files menu.
Draft attachments persist across restarts.

Mobile opens the last-used group chat. Tap the group name to switch groups or
hosts, create or join a group, or edit device settings. Creating a group requires
the designated host computer. Device settings are separate from group settings:
the app stores one name, device type and image, and shares that profile with its
hosts. Saving publishes it to connected hosts; an unavailable host receives it
when selected and reconnected. Existing installations adopt their current profile.
Choosing or removing a device image saves it immediately; name and type changes
use **Save device settings**. Devices without an image use a device icon in chat.
Device images are cropped to a square, resized to at most 256 pixels and compressed
before saving; the avatar size limit applies to the processed image, not the source photo.
Messages use compact bubbles, device avatars and large
media previews. Media-only messages overlay the time on the last image or video.
The first web link in a message gets a preview card on desktop and mobile when
the page exposes Open Graph, Twitter Card or standard title/description metadata.
The host fetches and caches metadata and thumbnails; video cards open the original
page. Sites without accessible metadata remain ordinary links. Preview fetching
only connects to public HTTP/HTTPS addresses, including after redirects, and never
sends device credentials to external sites.
Resolved link cards replace the raw URL while retaining surrounding message text.
Right-click a desktop card to copy its original link, or an attachment to copy the
original file for pasting into other apps. Mobile link cards offer **Copy link** on
long press. File copies use the desktop download cache and preserve the original bytes.
Connection loss keeps loaded messages and drafts visible with T3's floating
retry pill above the composer. With no loaded chat, a centered notice offers
**Retry now**. Network loss, automatic reconnection, pairing errors and incompatible
hosts have distinct states. Mobile uses the network connection rather than internet
reachability, so LAN-only networks still work.
After scrolling settles in the middle of a conversation, the header and composer
slide away on both clients. Resuming scrolling keeps them hidden; only reaching
the actual top or bottom reveals them. Reduced-motion settings disable the transition.
Both clients use T3's 28px rounded content canvas beneath a contrasting header.
The mobile status area matches the header while it is visible. When the bars
dismiss, the timeline extends behind a gradient-masked blur and tint directly
under the status-bar icons. Returning to either edge restores the solid header.
Opening a chat and successfully sending scroll to the actual bottom, including
composer spacing. Following survives history, media and keyboard layout changes;
scrolling up or loading older messages pauses it until returning to the bottom
or sending again.
Mobile previews and fullscreen viewers have a save control:
images/videos go to the photo library, while documents use a destination-folder
picker. Saving never opens the share sheet. On desktop, preview save controls
appear on hover or keyboard focus; native dragging remains available.
Desktop opens media in a separate fullscreen window so it stays open
when the tray popover loses focus. Video playback depends on platform codec support.
Mobile uses T3's sticky composer pattern with the keyboard controller and matching
message-list spacing. The keyboard and photo-library dependencies require rebuilding
the development client; a Metro refresh cannot add its native code.

The desktop popup hides when closed; Quit stops hosting. On macOS, Windows and
Linux the main process owns a separate server process. Start at login is exposed
on macOS and Windows. Linux requires a working tray and credential keyring.

## Host and connection behavior

- SQLite stores profiles, memberships and messages; attachment bytes live in a
  separate files directory. Uploads stream to temporary files and only become
  attachable after completion. Maximum: 16 files per message, 256 MB per file.
- Group access is enforced for history, uploads, downloads and live updates.
  Office groups are invite-only. The host manages membership; members can leave.
  The host can delete a group from Group settings after confirmation. This
  removes its history, files, invitations and memberships, preserving other groups.
- Pairing creates a device credential. The server stores credential hashes.
  Desktop connections use OS-backed encryption; mobile connections use SecureStore.
- HTTP carries messages and streams files. An authenticated WebSocket signals
  changes. Reconnection refreshes history; a WebSocket event is never the only copy
  of a message. Clients load 50 messages at a time and can fetch older history.
- Native mobile shares and unsent drafts are stored locally (SQLite plus files on
  mobile, IndexedDB on desktop). Sending requires the
  host to be reachable; there is no automatic background outbox or cloud relay.
  A received share opens the last-used group composer; the header lets you change
  its destination before sending. Nothing is sent automatically.
- On the host, received files are already on disk. Native dragging uses a named
  cache copy (copy-on-write when supported), so another app cannot modify the
  group's original attachment. Other desktops can prepare a download for
  dragging. Save opens the OS save dialog.
- Remote devices need the host awake. Sleep and network loss show a disconnected
  state. Keep a desktop or other always-on computer as host if availability matters.

Plain HTTP over a LAN does not encrypt files or device credentials. Use it only
on a trusted network. A Tailscale address routes through Tailscale's encrypted
network; both devices must have Tailscale installed and allowed to connect.
Tailscale installation, ACLs and TLS provisioning are external to this version.
No internet-facing discovery or port forwarding is configured.

The host listens on `0.0.0.0:47823`. Allow inbound connections in the host firewall
only for networks you intend to share with. Set `SEND_THING_BIND=127.0.0.1` to
restrict a standalone host to local access. QR codes carry the selected LAN /
Tailscale address; route switching and automatic discovery are not implemented.

For a standalone host, run `pnpm dev:server`. Its state defaults to
`apps/server/.send-thing`; set `SEND_THING_HOME` to an absolute directory to use a
stable location. The browser development connect form can use the `host-token`
file from that directory to manage the host. Keep this token private. Do not run
the standalone host and desktop host on the same port or against the same data.
The host locks its data directory; after a crash, a stale lock expires after ten
seconds. Startup waits up to twelve seconds for that lease or an orderly shutdown;
it never removes a live host's lock. Desktop quit waits for the host to release it.

| Environment variable                        | Purpose                                                                    |
| ------------------------------------------- | -------------------------------------------------------------------------- |
| `SEND_THING_HOME`                           | Standalone host's data directory                                           |
| `SEND_THING_PORT`                           | TCP port, defaults to 47823                                                |
| `SEND_THING_BIND`                           | Listen interface, defaults to 0.0.0.0                                      |
| `SEND_THING_TLS_CERT`, `SEND_THING_TLS_KEY` | Optional TLS certificate and key files; clients must trust the certificate |
| `SEND_THING_WEB_ROOT`                       | Optional built renderer directory for a standalone host                    |

Desktop development state lives in `.send-thing/desktop`; packaged desktop state
lives under Electron's application user-data directory. Back up the host directory
while it is stopped, including the SQLite database, credential and files directory.
History and files are retained until the host deletes their group; automatic retention,
host migration, resumable uploads and push notifications are not implemented.

## Marketing site

`apps/marketing` is a standalone static Astro app, following T3 Code's marketing
package structure. It uses the supplied Send Thing logo and product recording,
self-hosted DM Sans, and an always-dark layout.

```sh
pnpm dev:marketing
pnpm --filter @send-thing/marketing typecheck
pnpm build:marketing
```

Development uses port 4321. `pnpm deploy:marketing` builds the static site and
deploys it to the Cloudflare Worker `send-thing-marketing`, with the custom domain
`send-thing.lukestephens.co.za`. Cloudflare manages its DNS record and TLS; the
existing personal site is unaffected. `SITE_URL` can override the canonical
origin for other deployments. Download destinations
target `imprisonedmind/send-thing` on GitHub and `imprisonedmind/homebrew-tap` for
Homebrew. The CTA detects macOS (copy Homebrew command), Linux (copy installer
command), Android (APK), Windows (installer), and iOS. iPad desktop-mode user
agents are treated as iOS. Desktop visitors also see source and mobile links.
Set `PUBLIC_IOS_DOWNLOAD_URL` to an App Store or TestFlight URL to enable iOS;
until then it is explicitly unavailable. The first GitHub release and Homebrew
tap still need publishing before the other install destinations work.
Source images live in `apps/marketing/src/assets`.
The hero plays `apps/marketing/public/media/send-thing-synced.mp4` muted, inline,
on a loop with no controls. The Android recording appears inside `device-frame.png`
to the left of the desktop recording. Their shared “hi” message aligns at roughly
28 seconds in `send-thing-1.mov` and 21 seconds in `send-thing-2.mp4`: trim the
first seven seconds from desktop, preserving real-time pacing. Convert variable
frame rates to 30 fps before trimming so sparse phone frames retain their timing.
The common 86.9-second interval is composited into one 1920×836 H.264 video with
fast-start metadata and no audio. A single playback clock keeps both views aligned
through refreshes, buffering and loops. `product-poster.jpg` is extracted from it
for loading and blocked autoplay. Playback pauses in background tabs and for
reduced-motion preferences; the original desktop image remains the social card.

## Release distribution

Run `pnpm typecheck`, `pnpm test`, `pnpm build:desktop` and `pnpm build:marketing`
before packaging. `pnpm signing:android` creates a dedicated Android release
identity once in `~/.config/send-thing/signing`; back up that directory securely.
Never replace its key for an existing release, since Android updates require the
same identity. `pnpm package:android` regenerates Android, signs the release APK
and copies it to `release/artifacts/send-thing-android.apk`. Existing debug
installations use a different key and cannot be updated in place with this APK.
CI can supply `SEND_THING_ANDROID_KEYSTORE` and `SEND_THING_ANDROID_PASSWORD_FILE`.

The `Build desktop release artifacts` GitHub workflow packages Linux (x64/ARM64)
and Windows (x64) from a release tag and uploads to an existing draft release.
Package macOS locally using a Developer ID identity, notarize and staple both
DMGs, then collect all six artifacts before running `prepare:release`.

Desktop packaging uses stable asset names for GitHub's
[`releases/latest/download` links](https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases).
Collect the signed/notarized macOS DMGs, Linux AppImages, Windows installer, and
a signed Android APK in one directory with these names:

- `send-thing-macos-arm64.dmg` and `send-thing-macos-x64.dmg`
- `send-thing-linux-arm64.AppImage` and `send-thing-linux-x64.AppImage`
- `send-thing-windows-x64.exe`
- `send-thing-android.apk`

Run `pnpm prepare:release /absolute/path/to/artifacts` after building them.
It validates all inputs, uses the desktop package version, computes SHA-256
checksums, and stages `release/distribution` with the installers, `SHA256SUMS`,
and a Linux installer pinned to that release. The Linux script detects x64 or
arm64, verifies the AppImage checksum and installs into `~/.local/bin` without
launching the app. No builds or uploads are performed by this command.

Publish those assets on `imprisonedmind/send-thing` with tag `v<version>`.
Copy the generated `homebrew/Casks/send-thing.rb` into
`imprisonedmind/homebrew-tap` as `Casks/send-thing.rb` after the assets are live.
The [Homebrew cask](https://docs.brew.sh/Cask-Cookbook) uses versioned URLs and real
checksums for both Mac architectures. Its install command is
`brew install --cask imprisonedmind/tap/send-thing`. No cask, release, repository,
or tap has been published by this setup.

## Architecture

The package boundaries follow [T3 Code](https://github.com/pingdotgg/t3code):

| Package                   | Responsibility                                             |
| ------------------------- | ---------------------------------------------------------- |
| `apps/desktop`            | Electron lifecycle, tray, credentials, native save / drag  |
| `apps/web`                | React desktop renderer and development browser client      |
| `apps/mobile`             | Expo / React Native navigation, shares and device storage  |
| `apps/marketing`          | Static Astro marketing site and product images             |
| `apps/server`             | Host lifecycle, authorization, SQLite, streaming transfers |
| `packages/contracts`      | Effect Schema validation at network boundaries             |
| `packages/client-runtime` | Shared typed requests, connections and history             |
| `packages/theme`          | Shared light / dark colors adapted from T3 Code            |

The server is independent of Electron. Effect owns its resource lifecycle. The
smaller sharing domain uses transactional SQLite operations and HTTP requests
instead of T3's agent event store and large RPC surface. Shared client logic is
platform-independent; each application owns native capabilities and persistence.
See `THIRD_PARTY_NOTICES.md` for reused code and its license.

The chat UI adapts T3's composer surface, separate toolbar, attachment strip,
message surfaces and compact menu navigation. Mobile uses its DM Sans typography,
44-point composer controls, 72-point attachment tiles, native attachment menu
pattern, and QR scan-card layout. Desktop ports T3's Base UI menu structure and
QR SVG component (including its vendored QR encoder). Agent/provider controls are
omitted; group membership, transfer state and device identity use Send Thing's
existing contracts. Native and visual parity still require device validation.

## Validation and packaging

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm package:desktop
```

`pnpm build` builds the desktop renderer, Electron shell and bundled host server.
`pnpm package:desktop` also produces the desktop installer. Mobile is a separate
React Native application; its platform-specific native builds use the `ios` and
`android` commands above, which also install and launch the development app.

The tests cover invite isolation, single-use pairing, idempotent message delivery,
membership revocation, group deletion, attachment ownership, authenticated byte
ranges, transport authorization, restart
persistence, popover positioning and pairing-link validation. They have not been
run during implementation. Type checking
does not verify Electron packaging, Expo native code, OS share extensions or
network connectivity. Desktop packaging targets the current OS; release signing
and distribution credentials are not configured.

For the first runtime pass, pair a phone to a desktop, share a text file from
another app, send it to a group, and save / drag it from the tray. Also try an
image, host sleep / wake, a retry, an office group with a different member, and
the host's Tailscale address.
