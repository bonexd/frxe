#!/usr/bin/env bash
set -euo pipefail

: "${APPLE_CERTIFICATE:?APPLE_CERTIFICATE is required}"
: "${APPLE_CERTIFICATE_PASSWORD:?APPLE_CERTIFICATE_PASSWORD is required}"
: "${KEYCHAIN_PASSWORD:?KEYCHAIN_PASSWORD is required}"
: "${RUNNER_TEMP:?RUNNER_TEMP is required}"
: "${GITHUB_ENV:?GITHUB_ENV is required}"

nonce="$$"
certificate_path="$RUNNER_TEMP/vitr-apple-certificate-$nonce.p12"
keychain_path="$RUNNER_TEMP/vitr-signing-$nonce.keychain-db"

cleanup() {
  rm -f "$certificate_path"
}
trap cleanup EXIT

printf '%s' "$APPLE_CERTIFICATE" | base64 --decode > "$certificate_path"
security create-keychain -p "$KEYCHAIN_PASSWORD" "$keychain_path"
security default-keychain -s "$keychain_path"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$keychain_path"
security set-keychain-settings -t 3600 -u "$keychain_path"
security import "$certificate_path" -k "$keychain_path" -P "$APPLE_CERTIFICATE_PASSWORD" -T /usr/bin/codesign >/dev/null
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASSWORD" "$keychain_path" >/dev/null

identity="$(security find-identity -v -p codesigning "$keychain_path" | awk -F'"' '/Developer ID Application/ { print $2; exit }')"
if [[ -z "$identity" ]]; then
  identity="$(security find-identity -v -p codesigning "$keychain_path" | awk -F'"' '/[0-9]+\)/ { print $2; exit }')"
fi
[[ -n "$identity" ]] || { echo 'No usable macOS code-signing identity was found in the imported certificate.' >&2; exit 1; }

printf 'APPLE_SIGNING_IDENTITY=%s\n' "$identity" >> "$GITHUB_ENV"
printf 'VITR_APPLE_KEYCHAIN=%s\n' "$keychain_path" >> "$GITHUB_ENV"
echo 'Imported macOS signing identity.'
