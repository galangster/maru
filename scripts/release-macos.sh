#!/usr/bin/env bash
# Signed, notarized macOS release — P2.
#
#   ./scripts/release-macos.sh
#
# Notarization uses the App Store Connect API key by default — no
# passwords, no OTPs. The trio below is baked in (ids are not secrets;
# the .p8 lives beside the other release keys):
#   APPLE_API_ISSUER / APPLE_API_KEY / APPLE_API_KEY_PATH
# Signing still wants:
#   APPLE_SIGNING_IDENTITY   "Developer ID Application: <name> (<team>)"
# (APPLE_ID/APPLE_PASSWORD/APPLE_TEAM_ID remain a manual fallback: set
# all three and unset APPLE_API_KEY to use the app-specific-password
# route instead.)
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
  export APPLE_API_ISSUER="${APPLE_API_ISSUER:-52f4e617-a4b3-4cee-bcd0-23f8e653d7b5}"
  export APPLE_API_KEY="${APPLE_API_KEY:-PTF7XH7JWF}"
  export APPLE_API_KEY_PATH="${APPLE_API_KEY_PATH:-$HOME/.wren-release/AuthKey_${APPLE_API_KEY}.p8}"
  [[ -f "$APPLE_API_KEY_PATH" ]] || {
    echo "error: notary API key not found at $APPLE_API_KEY_PATH."
    exit 1
  }
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
URL="https://github.com/galangster/maru/releases/download/v${VERSION}/$(basename "$TARBALL")"

# The platform keys are READ OFF THE BINARY, never assumed.
#
# This block used to hardcode `darwin-aarch64`. That happened to be true, because
# the only machine that has ever cut a release is Apple Silicon — but nothing
# checked, and the failure mode is silent in both directions. A release cut on an
# Intel Mac would have advertised an x86_64 tarball under the aarch64 key, handing
# Apple Silicon users a binary to run under Rosetta. And an updater lookup that
# finds no matching key returns null, which `check()` reports as "no update" —
# src/lib/updates.ts passes announceNoUpdate:false on launch, so a user on an
# unlisted architecture would simply never update and never be told.
#
# `lipo -archs` is the only source of truth for what was actually built. A
# universal binary prints both and gets both keys, with no further edit here.
ARCHS=$(lipo -archs "$APP/Contents/MacOS/wren")
PLATFORMS=""
for arch in $ARCHS; do
  case "$arch" in
    arm64)  key="darwin-aarch64" ;;
    x86_64) key="darwin-x86_64" ;;
    *) echo "error: unknown architecture '$arch' in the built binary." >&2; exit 1 ;;
  esac
  [[ -n "$PLATFORMS" ]] && PLATFORMS="${PLATFORMS},"
  PLATFORMS="${PLATFORMS}
    \"${key}\": {
      \"url\": \"${URL}\",
      \"signature\": \"${SIG}\"
    }"
done

cat > src-tauri/target/release/bundle/latest.json <<MANIFEST
{
  "version": "${VERSION}",
  "pub_date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "platforms": {${PLATFORMS}
  }
}
MANIFEST

# Say it out loud rather than leaving it to be discovered. An arm64-only build
# does not merely fail to update on an Intel Mac — it does not launch there at
# all, so the download page must not promise plain "macOS".
if [[ "$ARCHS" != *x86_64* ]]; then
  echo "==> NOTE: this build is $ARCHS only. Intel Macs cannot run it, and will"
  echo "    never see an update. See wayfinder/tickets/P20-sweep-leftovers.md §1."
fi

echo "==> artifacts (upload the tar.gz, its .sig, latest.json and the DMG to the v${VERSION} release)"
ls -lh "$APP" "$DMG" "$TARBALL" src-tauri/target/release/bundle/latest.json | awk '{print $5, $9}'
