# P2 — macOS signing, notarization, DMG  `wayfinder:task`

status: closed · claimed: P2 lane, 2026-08-29 · blocked by: —

## Question → work

Developer ID Application cert into the Tauri build, hardened runtime,
notarytool submission in CI (or a documented local release script), DMG
bundle target, stapling, and a verified cold-start on a clean macOS user
account. Deliverable: a downloadable DMG that Gatekeeper opens without
right-click ceremony. Secrets handling for the cert in CI is part of the
ticket, not an afterthought.

## Resolution

Closed with Nick's own terminal run of `scripts/release-macos.sh`:
**codesign, stapler and spctl all passed** — the first Gatekeeper-clean
Wren DMG. The road there, recorded because most of it will bite again:

- **Identity**: Developer ID Application under The Creative Co. Marketing
  Firm LLC (2M8UE59WH7), created via the portal's CSR flow driven in the
  in-app browser (first attempt hit the Fluffle Inc. team, where Apple
  reserves Developer ID creation for the Account Holder — team switching
  matters). The G2 intermediate had to be imported by hand (Xcode wasn't
  in the loop); `security find-identity` shows 0 identities until it is.
- **Hardened runtime** on, 12.0 floor, DMG layout in tauri.conf; the
  create-dmg Finder race fails ~1 run in 3 and just re-runs.
- **The icon** became a real macOS squircle (make-icon.mjs pipeline) after
  the full-square art drew a backing plate on macOS 26.
- **The traffic lights** are their own saga (commits be420f1→146c127):
  every sanctioned positioning API is dead on macOS 26; the shipping fix
  re-parents the buttons into an owned container, calibrated to Nick's
  equidistant ruling (~16 pt both axes). Known check carried to P3-era:
  native fullscreen transitions with re-parented buttons.
- CI twin (`macos-release.yml`) is pushed and waits only on repo secrets.

Env for future releases: APPLE_SIGNING_IDENTITY as above, APPLE_ID,
APPLE_TEAM_ID=2M8UE59WH7, APPLE_PASSWORD (app-specific, Nick-held).
