# Nick's queue — owner-only actions

Standing order 2026-08-30: the agent works the map autonomously and
parks anything only Nick can do here, with exact steps, instead of
asking in chat. Newest at the top of each section. Strike items done.

## Blocking the submission path

1. **getmaru.app is the domain** (renamed Wren → Maru, 2026-08-30;
   you already own it — no purchase). Your buttons now:
   - DNS records for getmaru.app once I stand up hosting (I deploy on
     one approval; then a CNAME/A from you or a signed-in session).
   - Mail routing so **support@getmaru.app** and security@ deliver.
   - **Rename the GitHub repo** galangster/wren → maru (redirects keep
     old links and the auto-update endpoint working) — recommended.
   - **Publish `maru-mcp` on npm** (name is free; wren-mcp then gets a
     deprecation notice pointing at it).
   - Consent screen name is **"Maru Mail"** when you reach the console.
   - The trademark/name-collision check matters more for "Maru" than it
     did for Wren — busier name.
2. **Create the production Google Cloud project** (plan Part 2 §4, all
   console work): separate from dev, Gmail API on, External audience,
   one Desktop OAuth client, `gmail.modify` only on Data Access, two
   durable owners, current contact addresses, quota dashboards +
   alerts. Delete unused clients before submission. Billing account
   only if you accept the exposure (§4 last bullet).
3. **Consent screen**: name "Wren Mail" (N2), publish to production,
   then brand verification (plan §5) — homepage, privacy URL on
   wren.so must be live first.
4. **Inject the official client id into the release workflow**
   (`WREN_OFFICIAL_GOOGLE_CLIENT_ID`) once the production client
   exists. Code and checks already expect it; it must never land in
   Git.
5. **Demo video** (plan §8) needs the production consent screen, so it
   sits behind items 2–3. The app-side surfaces it shows are done.

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
