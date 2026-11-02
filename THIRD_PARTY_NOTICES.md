# T3 Code

Send Thing adapts T3 Code's theme colors, chat and composer layouts, menu patterns,
QR scan card, QR SVG component and web button, follows its desktop/server/mobile
package boundaries, and includes its Expo Sharing patch.
The connection presentation adapts its `connectionFloatingStatus`,
`FloatingWorkingControl`, and `EnvironmentConnectionNotice`, including the
floating retry pill and centered connection notice on both clients.
Source: https://github.com/pingdotgg/t3code, local reference commit `3748c5c241`.

Adapted files: `packages/theme/src/index.ts`,
`apps/web/src/components/ui/button.tsx`, `apps/web/src/components/ui/menu.tsx`,
`apps/web/src/components/ui/qr-code.tsx`, `apps/web/src/Chat.tsx`,
`apps/web/src/style.css`, `apps/mobile/src/ConnectScreen.tsx`,
`apps/mobile/src/components/Composer.tsx`,
`apps/mobile/src/components/ComposerAttachmentButton.tsx`,
`apps/mobile/src/components/Icon.tabler.d.ts`, and
`patches/expo-sharing@58.0.19.patch`.
Connection adaptations: `packages/client-runtime/src/connection-presentation.ts`,
`apps/mobile/src/components/ConnectionStatus.tsx`, and
`apps/web/src/ConnectionStatus.tsx`.
The rounded chat canvas and header frame adapt `ThreadScreenHost` and
`mobileThemeVariables` in `apps/mobile/src/GroupScreen.tsx`,
`apps/mobile/src/App.tsx`, and `apps/web/src/style.css`.
The marketing app adapts T3's Astro package structure, `Layout.astro`, centered
homepage hero, screenshot frame, typography and navigation styles in
`apps/marketing/src/layouts/Layout.astro`, `apps/marketing/src/pages/index.astro`,
`apps/marketing/src/styles/global.css`. Product copy is Send Thing's; marketing
screenshots, logo and device frame were supplied by the user.
`apps/marketing/src/components/InstallCommand.astro` also ports T3's GitHub
source-link SVGs and styles.

Reference components: `ComposerSurface`, `TimelineUserMessageRow`,
`ComposerAttachmentStrip`, `ComposerToolbar`, `ComposerAttachmentButton`,
`ConnectionsNewRouteScreen`, and Base UI `Menu`.

`apps/web/src/lib/qrCode.ts` is T3's vendored Project Nayuki QR Code generator.
Its Project Nayuki copyright and MIT license are preserved in that file.

MIT License

Copyright (c) 2026 T3 Tools Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

# DM Sans

The mobile app uses DM Sans through `@expo-google-fonts/dm-sans`, under the
SIL Open Font License 1.1. The complete font license and copyright notice are
included in `licenses/DM-Sans.txt`.
The marketing app self-hosts T3's DM Sans Latin font subset; its license is
included at `apps/marketing/public/fonts/dm-sans-OFL.txt`.
