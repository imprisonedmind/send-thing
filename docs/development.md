# Development

Use Node 24+ and pnpm 10.33.0. Run `pnpm install`, then `pnpm dev:web` and
`pnpm dev:desktop` in separate terminals. The desktop app starts its own host
on port 47823. Do not run a standalone host on that port at the same time.

## Mobile

Build a native development client with one of:

```sh
pnpm --filter @send-thing/mobile ios
pnpm --filter @send-thing/mobile android
```

These commands regenerate native configuration, build, install and launch the
app. Then run `pnpm dev:mobile` as needed. Expo Go cannot receive system shares.
Rebuild after native dependencies, permissions, icons or plugins change;
restarting Metro alone is insufficient.

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
