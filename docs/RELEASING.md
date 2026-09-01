# Releasing Maru for macOS

The tag workflow builds the Apple Silicon release from the tagged commit. It
signs and notarizes the app. It also creates GitHub build provenance for each
published updater artifact.

## Automated workflow

`.github/workflows/release.yml` runs only when a `v*` tag reaches GitHub. The
tag must match the version in `package.json`. The job uses the ARM64
`macos-14` runner and stops if the runner or app binary is not ARM64.

Configure this repository variable:

- `WREN_OFFICIAL_GOOGLE_CLIENT_ID`

Configure these repository secrets:

- `APPLE_CERTIFICATE`: Base64 form of the Developer ID `.p12` file.
- `APPLE_CERTIFICATE_PASSWORD`: Password for the `.p12` file.
- `APPLE_SIGNING_IDENTITY`: Full Developer ID Application identity.
- `APPLE_API_ISSUER`: App Store Connect API issuer id.
- `APPLE_API_KEY`: App Store Connect API key id.
- `APPLE_API_PRIVATE_KEY`: Complete contents of the matching `.p8` file.
- `TAURI_SIGNING_PRIVATE_KEY`: Complete Tauri updater private key.

The workflow performs these operations:

1. It installs locked Node dependencies and the Rust toolchain.
2. It builds an unsigned `.app` and records its bundle tree digest.
3. It imports the Developer ID certificate into a temporary keychain.
4. It writes the notarization and updater keys to temporary files.
5. It runs `scripts/release-macos.sh` without modifying that script.
6. The script builds, signs, notarizes, staples, and verifies the app.
7. The script creates the updater signature and `latest.json`.
8. GitHub attests the DMG, `.app.tar.gz`, `.sig`, and `latest.json`.
9. The workflow uploads those four files and `SHA256SUMS.txt` to the release.

The job creates a release when the tag has no release. If a release already
exists, the job replaces its assets with the files from the tagged build.

## Unsigned bundle digest

`SHA256SUMS.txt` contains one digest named `Maru.app.unsigned-tree`. This is a
SHA-256 digest of a sorted manifest. Each manifest row contains a relative
path and either the file's SHA-256 digest or the target of a symbolic link.

This digest avoids signing and notarization changes. It does not claim that
two signed app bundles have identical bytes.

To reproduce the digest after an unsigned build, run:

```bash
unsigned_app=$(find src-tauri/target/release/bundle/macos -maxdepth 1 -name '*.app' -print -quit)
manifest=$(mktemp)
(
  cd "$unsigned_app"
  find . \( -type f -o -type l \) -print | LC_ALL=C sort |
    while IFS= read -r path; do
      if [ -L "$path" ]; then
        printf 'link  %s  %s\n' "$(readlink "$path")" "$path"
      else
        shasum -a 256 "$path"
      fi
    done
) > "$manifest"
shasum -a 256 "$manifest"
```

Compare the first value with the value in `SHA256SUMS.txt`.

## Verify published provenance

Download an artifact and run:

```bash
gh attestation verify ./Maru_0.1.7_aarch64.dmg --repo galangster/maru
```

Replace the filename when you verify another release or artifact.

## Manual fallback

Use the manual path only when GitHub Actions is unavailable. A manual build
does not receive GitHub build provenance.

Install the Developer ID certificate in the keychain. Put the App Store
Connect `.p8` file and the updater key on the local machine. Then set:

```bash
export APPLE_SIGNING_IDENTITY='Developer ID Application: name (team)'
export APPLE_API_ISSUER='issuer-id'
export APPLE_API_KEY='key-id'
export APPLE_API_KEY_PATH='/absolute/path/AuthKey_key-id.p8'
export WREN_UPDATER_KEY='/absolute/path/updater.key'
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=''
./scripts/release-macos.sh
```

The script verifies the code signature, notarization ticket, and Gatekeeper
result. It prints the four files that belong on the matching `v*` release.
Upload them with `gh release upload`. Record why the automated workflow was
unavailable in the release notes.
