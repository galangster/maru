# Nick's queue — owner-only actions

Standing order 2026-08-30: the agent works the map autonomously and
parks anything only Nick can do here, with exact steps, instead of
asking in chat. Newest at the top of each section. Strike items done.

## Blocking the submission path

1. **getmaru.app is the domain** (renamed Wren → Maru, 2026-08-30;
   you already own it — no purchase). Your buttons now:
   - ~~DNS + site~~ — done 2026-08-30: https://getmaru.app live on
     GitHub Pages, cert issued, HTTPS enforced. Old Vercel site off the
     domain.
   - ~~Mail routing~~ — done 2026-08-30: ImprovMX active on getmaru.app
     (MX + SPF at GoDaddy verified), catch-all forwards to your Gmail, so
     support@ and security@ both deliver.
   - ~~Rename the GitHub repo~~ — done 2026-08-30 (galangster/maru;
     old maru project moved to maru-legacy).
   - ~~Publish `maru-mcp`~~ — done 2026-08-30, verified cold from the
     registry; wren-mcp deprecated with a pointer.
   - Consent screen name is **"Maru Mail"** when you reach the console.
   - The trademark/name-collision check matters more for "Maru" than it
     did for Wren — busier name.
2. ~~Create the production Google Cloud project~~ — done 2026-08-30:
   `maru-mail-prod`, Gmail API on, External, one Desktop client,
   `gmail.modify` only. Still open from this item, needs you in the
   console (agent won't change account config unattended):
   - **Second durable owner** in IAM — you named galangsterr@gmail.com
     (2026-08-30) but the grant was skipped when the permission classifier
     blocked the form fill. IAM → Grant access → principal
     `galangsterr@gmail.com` → role Basic/Owner → Save, then accept the
     invite from that account. Verify the double-r spelling first.
   - ~~Quota dashboards + alerts~~ — done 2026-08-30 via
     `ops/google-oauth/monitoring/apply.sh`: dashboard + 7 policies →
     support@getmaru.app. Recorded in ops/google-oauth/QUOTA.md. Still
     open there: log-based project-state-change alerts, dashboard
     screenshot + first alert-fire record at submission time.
   - **Billing decision** (moved to Non-blocking below).
3. ~~Consent screen~~ — done 2026-08-30: "Maru Mail", In production,
   getmaru.app branding + authorized domain. **Brand verification
   (plan §5) still pending** — runs inside the verification submission.
4. ~~Inject the official client id~~ — done 2026-08-30: repo variable
   `WREN_OFFICIAL_GOOGLE_CLIENT_ID` on galangster/maru; release
   workflow fails without it.
5. **Freeze done — hand-smoke + recording prep before the sitting**
   (2026-08-31): the freeze build (main @ 8e6beb6, coral brand + Maru
   character + link fix) is signed, notarized Accepted, stapled, all
   three Gatekeeper checks passed, and installed at /Applications/
   Maru.app (verified again post-install; app launches and renders).
   The agent stopped short of driving the UI — you were using the
   machine and synthetic keystrokes were landing across windows. Your
   ~2 minutes, in the app:
   - Open any thread (body renders), click one link (opens in Arc),
     open the weekend-photos thread and click a thumbnail (lightbox
     morph), watch the empty state (Maru breathes).
   - **Check the seed emails are still in the inbox** — the unified
     inbox showed only 2 real threads at smoke time, none of the 5
     seeds from SEED-EMAILS.md. If earlier testing archived them,
     re-seed per demo/SEED-EMAILS.md before recording.
   - Recording prep: star "Invoice #1042 from Acme Design", send one
     short reply from galangsterr on the "Team lunch Thursday?" thread.
   Then the ~20-minute sitting per demo/RECORDING-RUNBOOK.md.

6. **Demo video captures** — the Remotion scaffold is built (`demo/`,
   2026-08-30) with the full 10-shot list, captions, and placeholder
   slots. Your part: record the clips of the final signed build —
   especially the three consent flows (account addition, Google
   consent screen, agent-session consent), each ONE continuous
   unedited capture with the address bar visible. Drop files in
   `demo/public/captures/<shot-id>.mp4` per `demo/README.md`; the
   agent wires durations and renders.

## Dossier placeholders

The submission dossier is written (`docs/security/`, `ops/google-oauth/`).
Every field only you can fill is marked `«NICK: …»` — grep for it.
Concentrations: verification-answers (project id, client id, trademark
receipt, frozen release, demo package), QUOTA (dashboards + alerts),
CONTACTS (roster), INCIDENT (second owner), REVERIFICATION (calendar).

## Decisions to ratify

- **Remembering "Show images" per sender** (from the P16 investigation,
  2026-08-31). Today allow-images is scoped to a thread AND to the
  session, so a newsletter you read daily is blocked again every time
  and you re-click Show every time — quite possibly part of what
  "still" meant. Options: keep it as-is (max privacy), remember per
  sender for the session, or persist a per-sender allowlist. This is a
  privacy-posture call, not a bug fix, so it is yours. (The actual
  defects — the ~350px void, Show not working for CSS backgrounds, and
  the tracking-pixel bypasses — are agent work, ticket P16.)

- **Notification badge default + the iOS payload shape** (your ask,
  2026-08-31; ticket P15-notification-badges). Modes drafted: unread in
  inbox (your default), everything in inbox, dot-only, off, plus
  approvals-waiting as an overlay, with per-account opt-in and quiet
  hours. Two things need you: (1) confirm the default, (2) ratify how
  iOS gets its number — **(b) the relay sends raw counts and the device
  applies your preference** (recommended: no preferences or mail counts
  on the server, keeps the verification story intact) versus (a) the
  relay computes the badge and therefore stores your settings. This
  decision constrains map 4's relay payload, so it is worth settling
  before that relay is built.

- **Color anchor for the harmonization pass** (your ask, 2026-08-31;
  ticket P14-color-harmony): interface coral, logo, and Maru's #FF4F87
  are three different color stories. Pick the anchor — (a) coral/logo:
  Maru gets recolored toward it; (b) Maru's pink: the interface accent
  ramp is re-derived from #FF4F87; (c) a shared parent hue for both.
  Also say whether it lands before the freeze or after submission —
  it changes every capture.

- **Multi-device sequence** (asked 2026-08-31, brief in
  docs/research/multi-device-strategy.md): map 4 = paid sync service
  (settings + audit doc, E2E, plus the Gmail-watch push relay), map 5 =
  iOS via Tauri riding that relay. Ratify the order, or reorder; and
  decide whether the map-4 grill waits for Google's review verdict.
  Until then, P5's settings export/import is the zero-server stopgap.

## Non-blocking

- **Re-test the 7-day re-auth path** against the production consent
  screen after the flip (P4 ticket, still open).
- **Billing exposure decision** for quota beyond the free tier (plan
  §7 launch math).

- **CI signing secrets decision** (found 2026-08-31: macos-release run
  33353074623 failed at codesign — the repo only has
  TAURI_SIGNING_PRIVATE_KEY; all Apple secrets are missing). Either
  export the Developer ID .p12 and set APPLE_CERTIFICATE,
  APPLE_CERTIFICATE_PASSWORD, APPLE_SIGNING_IDENTITY + notarization
  creds via `gh secret set`, or keep signing local-only via
  scripts/release-macos.sh (worked for v0.1.0 and v0.1.1) and demote
  the workflow. Local-only is fine until releases need to happen off
  your machine.

## Hand-checks (need a human at the machine)

- **Windows hand-smoke** of the v0.1.0 NSIS installer — after it,
  add windows-x86_64 to latest.json so auto-update covers Windows.
- **Fullscreen traffic lights** (P2's carried check) — verify the
  re-parented buttons in macOS fullscreen.
