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
5. **Demo video captures** — the Remotion scaffold is built (`demo/`,
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

## Non-blocking

- **Re-test the 7-day re-auth path** against the production consent
  screen after the flip (P4 ticket, still open).
- **Billing exposure decision** for quota beyond the free tier (plan
  §7 launch math).

## Hand-checks (need a human at the machine)

- **Windows hand-smoke** of the v0.1.0 NSIS installer — after it,
  add windows-x86_64 to latest.json so auto-update covers Windows.
- **Fullscreen traffic lights** (P2's carried check) — verify the
  re-parented buttons in macOS fullscreen.
