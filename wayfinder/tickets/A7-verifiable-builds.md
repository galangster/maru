# A7 — Verifiable builds  `wayfinder:task`

status: **workflow complete in lane D; first tagged run remains a launch gate** · map 4 launch gate

Bit-for-bit reproducibility is not honest for a signed Tauri app: signing
and notarization change bytes. The honest claim is **verifiable**: the
release artifact is built by CI from a tagged commit, with a GitHub
artifact attestation (SLSA provenance) anyone can check with `gh attestation
verify`, and the unsigned bundle hash is published beside the signed one.
Work: move the macOS release build into `.github/workflows/release.yml`
with the signing identity and notarization key as secrets, add
`actions/attest-build-provenance`, document the verify command in
SECURITY.md. Acceptance: one release built and verified from a clean machine.

## Lane D implementation, 2026-09-01

- `.github/workflows/release.yml` builds from a `v*` tag on ARM64
  `macos-14`. It rejects a tag that does not match `package.json`.
- The job records a tree digest from the unsigned `.app` before signing.
- The job imports the Developer ID certificate and prepares App Store Connect
  and updater keys from repository secrets.
- `scripts/release-macos.sh` remains unchanged. The job uses it for the signed,
  notarized, stapled, and locally verified artifacts.
- `actions/attest-build-provenance@v4` covers the DMG, `.app.tar.gz`, `.sig`,
  and `latest.json`.
- The workflow publishes those four files and `SHA256SUMS.txt` to the GitHub
  release for the tag.
- `SECURITY.md` contains the exact `gh attestation verify` command and its
  proof boundary.
- `docs/RELEASING.md` documents the workflow, required inputs, unsigned digest,
  provenance check, and manual fallback.

The workflow was not triggered in this ticket. Acceptance still requires one
tagged release and a successful verification from a clean machine.
