#!/usr/bin/env bash
# Signed, notarized macOS release — P2.
#
#   ./scripts/release-macos.sh
#
# Wants, in the environment (Tauri reads these itself):
#   APPLE_SIGNING_IDENTITY   "Developer ID Application: <name> (<team>)"
#   APPLE_ID                 the Apple account email
#   APPLE_PASSWORD           an app-specific password (appleid.apple.com)
#   APPLE_TEAM_ID            the 10-character team id
#
# With the first unset it builds unsigned (a dev artifact, loudly labeled).
# With all four set, Tauri signs with hardened runtime, notarizes, and
# staples; this script then re-verifies with Apple's own tools so "it is
# signed" is a checked claim, not a hopeful one.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -z "${APPLE_SIGNING_IDENTITY:-}" ]]; then
  echo "==> APPLE_SIGNING_IDENTITY is not set — building UNSIGNED (dev only)."
else
  security find-identity -v -p codesigning | grep -q "$APPLE_SIGNING_IDENTITY" || {
    echo "error: identity '$APPLE_SIGNING_IDENTITY' is not in the keychain."
    exit 1
  }
  for var in APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID; do
    [[ -n "${!var:-}" ]] || { echo "error: $var is not set (needed to notarize)."; exit 1; }
  done
fi

npm run tauri build

APP=$(ls -d src-tauri/target/release/bundle/macos/*.app | head -1)
DMG=$(ls src-tauri/target/release/bundle/dmg/*.dmg | head -1)

if [[ -n "${APPLE_SIGNING_IDENTITY:-}" ]]; then
  echo "==> verifying signature, notarization, and Gatekeeper's verdict"
  codesign --verify --deep --strict "$APP"
  xcrun stapler validate "$APP"
  spctl --assess --type execute "$APP"
  echo "==> all three checks passed"
fi

echo "==> artifacts"
ls -lh "$APP" "$DMG" | awk '{print $5, $9}'
