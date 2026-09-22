#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

command -v xcodebuild >/dev/null || { echo "Xcode is required."; exit 1; }
command -v zip >/dev/null || { echo "zip is required."; exit 1; }

VERSION="0.1.0"
BUILD_ROOT="$ROOT_DIR/build"
DIST="$ROOT_DIR/dist"

rm -rf "$BUILD_ROOT/ios-device" "$DIST/Payload"
mkdir -p "$DIST"

xcodebuild \
  -project Vitr.xcodeproj \
  -scheme Vitr \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -derivedDataPath "$BUILD_ROOT/ios-device" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  build

APP="$BUILD_ROOT/ios-device/Build/Products/Release-iphoneos/Vitr.app"
test -d "$APP"

VERSION_FOUND=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP/Info.plist")
BUNDLE_FOUND=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP/Info.plist")
PUBLISHER=$(/usr/libexec/PlistBuddy -c 'Print :VitrPublisher' "$APP/Info.plist")

test "$VERSION_FOUND" = "$VERSION"
test "$BUNDLE_FOUND" = "com.bloodvitr.vitr"
test "$PUBLISHER" = "Blood"

mkdir -p "$DIST/Payload"
cp -R "$APP" "$DIST/Payload/"
rm -rf "$DIST/Payload/Vitr.app/_CodeSignature"
rm -f "$DIST/Payload/Vitr.app/embedded.mobileprovision"
(
  cd "$DIST"
  rm -f "Vitr-$VERSION-sideload.ipa"
  zip -qry "Vitr-$VERSION-sideload.ipa" Payload
)

rm -rf "$DIST/Payload"
echo "Built $DIST/Vitr-$VERSION-sideload.ipa"
