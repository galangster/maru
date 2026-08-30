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
# Updater artifacts are signed too (P3):
#   TAURI_SIGNING_PRIVATE_KEY_PATH  defaults to ~/.wren-release/updater.key
#
# With the first unset it builds unsigned (a dev artifact, loudly labeled).
# With all four set, Tauri signs with hardened runtime, notarizes, and
# staples; this script then re-verifies with Apple's own tools so "it is
# signed" is a checked claim, not a hopeful one — and assembles the
# latest.json the auto-updater reads, ready to upload with the release.
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

# The contents variant: the _PATH variant silently skips signature
# generation on this CLI version. Empty password must be explicit.
UPDATER_KEY="${WREN_UPDATER_KEY:-$HOME/.wren-release/updater.key}"
[[ -f "$UPDATER_KEY" ]] || { echo "error: updater key not found at $UPDATER_KEY."; exit 1; }
export TAURI_SIGNING_PRIVATE_KEY="$(cat "$UPDATER_KEY")"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}" 

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

# The updater manifest. GitHub's /releases/latest/download/latest.json is
# the endpoint baked into the app; upload this file plus the .tar.gz with
# every release, tagged v<version>.
VERSION=$(node -p "require('./package.json').version")
TARBALL=$(ls src-tauri/target/release/bundle/macos/*.app.tar.gz | head -1)
SIG=$(cat "${TARBALL}.sig")
cat > src-tauri/target/release/bundle/latest.json <<MANIFEST
{
  "version": "${VERSION}",
  "pub_date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "platforms": {
    "darwin-aarch64": {
      "url": "https://github.com/galangster/wren/releases/download/v${VERSION}/$(basename "$TARBALL")",
      "signature": "${SIG}"
    }
  }
}
MANIFEST

echo "==> artifacts (upload the tar.gz, its .sig, latest.json and the DMG to the v${VERSION} release)"
ls -lh "$APP" "$DMG" "$TARBALL" src-tauri/target/release/bundle/latest.json | awk '{print $5, $9}'
