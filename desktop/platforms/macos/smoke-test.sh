#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <dmg>" >&2
  exit 2
fi

DMG="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
[[ -f "$DMG" ]] || { echo "DMG not found: $DMG" >&2; exit 1; }

mount_dir="$(mktemp -d)"
mounted=0
cleanup() {
  if [[ "$mounted" -eq 1 ]]; then
    hdiutil detach "$mount_dir" -quiet || true
  fi
  rmdir "$mount_dir" 2>/dev/null || true
}
trap cleanup EXIT

hdiutil attach "$DMG" -readonly -nobrowse -mountpoint "$mount_dir" -quiet
mounted=1
[[ -d "$mount_dir/vitr.app" ]] || {
  echo "DMG smoke test could not find vitr.app." >&2
  exit 1
}
[[ -f "$mount_dir/vitr.app/Contents/Info.plist" ]] || {
  echo "vitr.app is missing Info.plist." >&2
  exit 1
}

echo "macOS DMG smoke test passed."
