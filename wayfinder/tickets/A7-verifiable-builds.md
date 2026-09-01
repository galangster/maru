# A7 — Verifiable builds  `wayfinder:task`

status: **open, agent** · map 4 launch gate

Bit-for-bit reproducibility is not honest for a signed Tauri app: signing
and notarization change bytes. The honest claim is **verifiable**: the
release artifact is built by CI from a tagged commit, with a GitHub
artifact attestation (SLSA provenance) anyone can check with `gh attestation
verify`, and the unsigned bundle hash is published beside the signed one.
Work: move the macOS release build into `.github/workflows/release.yml`
with the signing identity and notarization key as secrets, add
`actions/attest-build-provenance`, document the verify command in
SECURITY.md. Acceptance: one release built and verified from a clean machine.
