#!/bin/sh
set -eu

# prepare-release.mjs pins this to the release that contains this installer.
send_thing_tag='__SEND_THING_RELEASE_TAG__'
case "$send_thing_tag" in
  v[0-9]*) ;;
  *) printf '%s\n' 'Use the installer attached to a published Send Thing release.' >&2; exit 1 ;;
esac
if [ "$(uname -s)" != Linux ]; then
  printf '%s\n' 'This installer is for Linux.' >&2
  exit 1
fi
case "$(uname -m)" in
  x86_64) send_thing_arch=x64 ;;
  aarch64|arm64) send_thing_arch=arm64 ;;
  *) printf '%s\n' 'Unsupported CPU architecture.' >&2; exit 1 ;;
esac
command -v curl >/dev/null
command -v sha256sum >/dev/null
send_thing_asset="send-thing-linux-$send_thing_arch.AppImage"
send_thing_base="https://github.com/imprisonedmind/send-thing/releases/download/$send_thing_tag"
send_thing_tmp=$(mktemp -d)
trap 'rm -rf "$send_thing_tmp"' EXIT
trap 'exit 1' HUP INT TERM
curl -fL --proto '=https' "$send_thing_base/$send_thing_asset" -o "$send_thing_tmp/$send_thing_asset"
curl -fsSL --proto '=https' "$send_thing_base/SHA256SUMS" -o "$send_thing_tmp/SHA256SUMS"
(
  cd "$send_thing_tmp"
  awk -v asset="$send_thing_asset" '$2 == asset { print }' SHA256SUMS > selected.sha256
  test -s selected.sha256
  sha256sum --check selected.sha256
)
send_thing_bin="$HOME/.local/bin"
mkdir -p "$send_thing_bin"
install -m 755 "$send_thing_tmp/$send_thing_asset" "$send_thing_bin/send-thing.AppImage"
printf 'Installed Send Thing to %s/send-thing.AppImage\n' "$send_thing_bin"
printf 'Run %s/send-thing.AppImage to open it.\n' "$send_thing_bin"
