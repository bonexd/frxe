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
npx --no-install tauri build --bundles deb,appimage

DEB_SOURCE="src-tauri/target/release/bundle/deb/vitr_${VITR_VERSION}_amd64.deb"
APPIMAGE_SOURCE="src-tauri/target/release/bundle/appimage/vitr_${VITR_VERSION}_amd64.AppImage"

[[ -f "$DEB_SOURCE" ]] || { echo "Built DEB not found: $DEB_SOURCE" >&2; exit 1; }
[[ -f "$APPIMAGE_SOURCE" ]] || { echo "Built AppImage not found: $APPIMAGE_SOURCE" >&2; exit 1; }

mkdir -p release-upload
DEB_OUTPUT="release-upload/vitr-${VITR_VERSION}-amd64.deb"
APPIMAGE_OUTPUT="release-upload/vitr-${VITR_VERSION}-x86_64.AppImage"
cp "$DEB_SOURCE" "$DEB_OUTPUT"
cp "$APPIMAGE_SOURCE" "$APPIMAGE_OUTPUT"
if [[ -f "${APPIMAGE_SOURCE}.sig" ]]; then
  cp "${APPIMAGE_SOURCE}.sig" "${APPIMAGE_OUTPUT}.sig"
fi

bash platforms/linux/smoke-test.sh "$DEB_OUTPUT" "$APPIMAGE_OUTPUT"

echo "Built:"
echo "  $DEB_OUTPUT"
echo "  $APPIMAGE_OUTPUT"
