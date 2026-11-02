# Send Thing

[![Send Thing — Send things between your devices.](apps/marketing/public/social/send-thing-og.jpg)](https://send-thing.lukestephens.co.za)

Share text, links, photos and files between your devices through group chats.
A desktop hosts each group; other devices connect over your local network or
Tailscale. The host must stay awake and reachable.

[Website](https://send-thing.lukestephens.co.za) ·
[Downloads](https://github.com/imprisonedmind/send-thing/releases)

## Development

Requires Node 24+ and pnpm 10.33.0.

```sh
pnpm install
pnpm dev:web
# In another terminal:
pnpm dev:desktop
```

## Documentation

- [Development and architecture](docs/development.md)
- [Hosting and connections](docs/hosting.md)
- [Releases and deployment](docs/releases.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)
