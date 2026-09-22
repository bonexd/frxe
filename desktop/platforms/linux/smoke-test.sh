#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <deb> <appimage>" >&2
  exit 2
fi

DEB="$(realpath "$1")"
APPIMAGE="$(realpath "$2")"
[[ -f "$DEB" ]] || { echo "DEB not found: $DEB" >&2; exit 1; }
[[ -f "$APPIMAGE" ]] || { echo "AppImage not found: $APPIMAGE" >&2; exit 1; }

dpkg-deb --info "$DEB" >/dev/null

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT
chmod +x "$APPIMAGE"
(
  cd "$tmp_dir"
  "$APPIMAGE" --appimage-extract >/dev/null
)
[[ -f "$tmp_dir/squashfs-root/AppRun" ]] || {
  echo "AppImage smoke test could not find AppRun after extraction." >&2
  exit 1
}

echo "Linux package smoke tests passed."
