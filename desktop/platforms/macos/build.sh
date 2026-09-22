#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

command -v cargo >/dev/null || { echo "Cargo/Rust is required." >&2; exit 1; }
command -v node >/dev/null || { echo "Node.js is required." >&2; exit 1; }
command -v npm >/dev/null || { echo "npm is required." >&2; exit 1; }

npm ci
VITR_VERSION="$(node tools/release-metadata.mjs version)"
[[ -n "$VITR_VERSION" ]] || { echo "Could not determine vitr version." >&2; exit 1; }

npx --no-install tauri icon web/vitr-icon.png --output src-tauri/icons
npm run check
npx --no-install tauri build --bundles dmg

ARCH="$(uname -m)"
case "$ARCH" in
  arm64) TARGET_ARCH="aarch64"; RELEASE_ARCH="arm64" ;;
  x86_64) TARGET_ARCH="x64"; RELEASE_ARCH="x64" ;;
  *) echo "Unsupported macOS architecture: $ARCH" >&2; exit 1 ;;
esac

DMG_SOURCE="src-tauri/target/release/bundle/dmg/vitr_${VITR_VERSION}_${TARGET_ARCH}.dmg"
[[ -f "$DMG_SOURCE" ]] || { echo "Built DMG not found: $DMG_SOURCE" >&2; exit 1; }

mkdir -p release-upload
OUTPUT="release-upload/vitr-${VITR_VERSION}-macos-${RELEASE_ARCH}.dmg"
cp "$DMG_SOURCE" "$OUTPUT"

UPDATER_SOURCE="src-tauri/target/release/bundle/macos/vitr.app.tar.gz"
if [[ -f "$UPDATER_SOURCE" && -f "${UPDATER_SOURCE}.sig" ]]; then
  UPDATER_OUTPUT="release-upload/vitr-${VITR_VERSION}-macos-${RELEASE_ARCH}.app.tar.gz"
  cp "$UPDATER_SOURCE" "$UPDATER_OUTPUT"
  cp "${UPDATER_SOURCE}.sig" "${UPDATER_OUTPUT}.sig"
fi

bash platforms/macos/smoke-test.sh "$OUTPUT"

echo "Built $OUTPUT"
