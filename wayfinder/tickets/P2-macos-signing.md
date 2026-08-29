# P2 — macOS signing, notarization, DMG  `wayfinder:task`

status: open · claimed: — · blocked by: Apple Developer enrollment (Nick)

## Question → work

Developer ID Application cert into the Tauri build, hardened runtime,
notarytool submission in CI (or a documented local release script), DMG
bundle target, stapling, and a verified cold-start on a clean macOS user
account. Deliverable: a downloadable DMG that Gatekeeper opens without
right-click ceremony. Secrets handling for the cert in CI is part of the
ticket, not an afterthought.
