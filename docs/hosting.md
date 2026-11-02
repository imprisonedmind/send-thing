# Hosting and connections

Each group has one desktop host. Create a group and choose **Add device** to
generate a QR code or pairing link. Select a reachable LAN or Tailscale address.
Codes expire after ten minutes and can be redeemed once. A device can join
multiple groups and hosts; reopening the app restores its last-used group.

Closing the desktop popup keeps hosting active. Quitting stops the host.
Remote devices need the host awake and reachable. There is no cloud relay,
automatic background outbox, discovery or port forwarding.

## Network

The host listens on `0.0.0.0:47823`. Limit firewall access to intended networks.
Plain HTTP does not encrypt files or credentials; use it only on a trusted LAN.
Tailscale encrypts traffic between connected devices. Installing Tailscale and
configuring its access rules are separate from Send Thing.

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
