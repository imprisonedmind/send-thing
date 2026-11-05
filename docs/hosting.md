# Hosting and connections

Each group has one desktop host. Create a group and choose **Add device** to
generate a QR code or pairing link. Select a reachable LAN or Tailscale address.
Codes expire after ten minutes and can be redeemed once. A device can join
multiple groups and hosts; reopening the app restores its last-used group.

Closing the desktop popup keeps hosting active. Quitting stops the host.
Remote devices need the host awake and reachable. There is no cloud relay,
automatic background outbox or port forwarding.

## Network

The host listens on `0.0.0.0:47823`. Limit firewall access to intended networks.
Plain HTTP does not encrypt files or credentials; use it only on a trusted LAN.
Tailscale encrypts traffic between connected devices. Installing Tailscale and
configuring its access rules are separate from Send Thing.

Desktop and mobile rediscover paired hosts on the LAN using Bonjour/mDNS
(`_send-thing._tcp`). Reconnect tries verified LAN routes before saved Tailscale
or other remote routes, and returns to LAN when it becomes reachable. The host
refreshes its announcements after interface changes. Discovery requires local
network access and multicast between devices; guest networks may block it.
The current implementation discovers IPv4 LAN addresses. A browser cannot scan
mDNS, but can reconnect through previously learned addresses.

Packaged desktop logs include host startup, discovery and connection events.
On macOS, they are in `~/Library/Logs/Send Thing/send-thing.log`; other platforms
use the application's user-data `logs` directory. Logs rotate at 2 MB and retain
one previous file (`send-thing.log.1`). If discovery fails after updating macOS or
the app, check Send Thing's Local Network permission as well as the firewall.

Existing pairings can rediscover an updated host even if their saved address is
already stale. New addresses must answer a fresh challenge using the paired
credential's hash before credentials are sent. This prevents
accidental connections to a different host; it does not encrypt plain HTTP or
protect it against an active network intermediary. HTTPS pairings never downgrade
to HTTP. Mobile needs a native rebuild to include the discovery module.

An authenticated WebSocket signals changes; reconnecting refreshes history over
HTTP. Clients fetch history in pages of 50 messages. Drafts survive restarts;
received system shares open a composer and are never sent automatically.

## Standalone host

Run `pnpm dev:server`. State defaults to `apps/server/.send-thing`. The private
`host-token` file in that directory allows the browser development client to
manage the host. Never share that token or run two hosts against the same data.

| Variable                                    | Purpose                                                |
| ------------------------------------------- | ------------------------------------------------------ |
| `SEND_THING_HOME`                           | Absolute host data directory                           |
| `SEND_THING_PORT`                           | TCP port; default `47823`                              |
| `SEND_THING_BIND`                           | Listen interface; default `0.0.0.0`                    |
| `SEND_THING_TLS_CERT`, `SEND_THING_TLS_KEY` | Optional TLS files; clients must trust the certificate |
| `SEND_THING_WEB_ROOT`                       | Optional built renderer directory                      |

Use `SEND_THING_BIND=127.0.0.1` for local-only access. The host locks its data
directory; stale locks expire after ten seconds following a crash.

## Storage

SQLite stores profiles, memberships and messages; attachment bytes are separate
files. Uploads become attachable only after completion. Limits are 16 attachments
per message and 256 MB per file. Group authorization covers history, uploads,
downloads and live updates. Device credentials are hashed on the host and stored
using OS-backed encryption on desktop or SecureStore on mobile.

Desktop development state is in `.send-thing/desktop`; packaged state uses
Electron's application user-data directory. Back up the entire host directory
while the host is stopped, including its database, credential and files.
Deleting a group removes its history, files, invitations and memberships.
Automatic retention, host migration, resumable uploads and push notifications
are not implemented.
