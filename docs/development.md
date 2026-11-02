# Development

Use Node 24+ and pnpm 10.33.0. Run `pnpm install`, then `pnpm dev:web` and
`pnpm dev:desktop` in separate terminals. The desktop app starts its own host
on port 47824; the installed release uses 47823. Do not run a standalone dev
host on 47824 at the same time as the desktop dev host.

Dev apps are named **Send Thing Dev**, with `.dev` app IDs and separate data.
Desktop dev data lives in the OS application-data directory under `Send Thing Dev`.
The first dev launch needs its own pairing; existing release data is unchanged.
`pnpm package:desktop:dev` creates a separate installable desktop app in
`apps/desktop/release/development`.

## Mobile

Build a native development client with one of:

```sh
pnpm --filter @send-thing/mobile ios
pnpm --filter @send-thing/mobile android
```

These commands regenerate native configuration, build, install and launch the
app. Then run `pnpm dev:mobile` as needed. Expo Go cannot receive system shares.
Native folders are generated with `prebuild --clean` so switching variants does
not retain old package, scheme or share-extension IDs; keep native changes in plugins.
Rebuild after native dependencies, permissions, icons or plugins change;
restarting Metro alone is insufficient.

Expo defaults to the development identity (`com.sendthing.mobile.dev`). The
Android release script explicitly sets `SEND_THING_VARIANT=production`; use that
variable for manual iOS release builds too. Dev uses `sendthing-dev://` links
and separate iOS share-extension and App Group identifiers. The built-in scanner
can read either variant's QR codes when you intentionally pair across variants.

iOS requires signing for the app and share extension's App Group. Configure
identifiers you own in `apps/mobile/app.config.ts`. The Android launcher and
adaptive icons use `apps/mobile/assets/icon.png`.

LAN discovery uses native Bonjour/Android NSD through `react-native-zeroconf`;
allow local network access when prompted. The desktop/server Bonjour dependency
is patched to report UDP socket errors instead of terminating the host.

## Checks

```sh
pnpm typecheck
pnpm test
pnpm build:desktop
pnpm build:marketing
```

Tests cover pairing, group isolation, authorization, message delivery, attachment
ownership, byte ranges, persistence, connections and installer selection.
Native sharing, keyboard behavior and OS integration still require device testing.

## Packages

| Package                   | Responsibility                                              |
| ------------------------- | ----------------------------------------------------------- |
| `apps/desktop`            | Electron lifecycle, tray, credentials, native save and drag |
| `apps/web`                | React desktop renderer and development browser client       |
| `apps/mobile`             | Expo navigation, native shares and device storage           |
| `apps/marketing`          | Static Astro website                                        |
| `apps/server`             | Host lifecycle, authorization, SQLite and file transfers    |
| `packages/contracts`      | Effect Schema validation at network boundaries              |
| `packages/client-runtime` | Shared requests, connections and history                    |
| `packages/theme`          | Shared colors                                               |

The server runs independently of Electron; Effect owns its resource lifecycle.
Each app owns its native capabilities and persistence. See the
[third-party notices](../THIRD_PARTY_NOTICES.md) for reused code and licenses.
