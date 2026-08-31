# Autonomous run 4 — Maru rename, getmaru.app live, production Google project (2026-08-30/31)

Standing order: memory `wren-autonomous-standing-order` — work
autonomously, never stall on approval, owner-only actions go to
`wayfinder/NICK-QUEUE.md`. Nick re-confirmed it this session and sat in
the loop for browser work.

## What this session shipped (commit range 2225756..HEAD, all pushed)

- Plan §3 closed (encryption at rest, key destruction, agent sessions,
  injection tests) — `20fa907`; N5 approved + PERMISSION-MODEL amended
  — `3ca43ad`; §3 stragglers + client-failure UI — `45df4a0`;
  submission dossier + its gap fixes — `b673dfe`.
- **Product renamed Wren → Maru** — `3bccd62`. Consent name "Maru
  Mail", domain **getmaru.app** (Nick's, was his old project-management
  site). State-carrying internals deliberately keep `wren` strings —
  ticket [P12](../wayfinder/tickets/P12-internal-rename-migration.md).
- GitHub repo renamed → **github.com/galangster/maru** (old private
  maru project → maru-legacy). `maru-mcp@0.1.0` published by Nick,
  verified cold; `wren-mcp` deprecated with pointer.
- **getmaru.app is live**: GitHub Pages (workflow `.github/workflows/
  pages.yml`, publishes `site/`), GoDaddy DNS swapped off Vercel (4 GH
  A records + www CNAME, edited live in Nick's Chrome), cert issued,
  HTTPS enforced. Clean URLs are directory indexes.
- **Production Google project live**: `maru-mail-prod` (number
  537601059334), Gmail API enabled, consent screen "Maru Mail"
  External with getmaru.app branding + authorized domain,
  `gmail.modify` the only scope, Desktop client "Maru Mail Desktop"
  (id `537601059334-su62jrimhnfg3lg5ql21uet30135mdll.apps.
  googleusercontent.com`; secret never stored — public client),
  **publishing status In production**. Nick personally: project Create,
  the User Data Policy tick, production confirm.
- Release wiring: repo variable `WREN_OFFICIAL_GOOGLE_CLIENT_ID` set on
  galangster/maru; macos-release.yml injects it and fails without it.
- Dossier ids filled (verification-answers). 477 tests, tsc clean.

## Environment facts the next session needs

- Local checkout is still `~/Projects/wren` (folder name ≠ product).
  If Nick renames the folder, ALSO move the agent memory directory
  `~/.claude/projects/-Users-galangster-Projects-wren` to the matching
  new path, or the standing-order memory stops loading.
- Two gh accounts are logged in; **pushes need `gh auth switch -u
  galangster`** (NickMetaDAO is usually active; switch back after).
- Claude-in-Chrome is installed and paired in Nick's real Chrome
  (list_connected_browsers → select_browser to reattach). GoDaddy and
  Google console sessions live there. The auto-mode permission
  classifier sometimes blocks form fills; Nick flips to bypass/ask mode
  when that bites.
- Codex Sol delegate pattern per the runtime contract:
  `codex exec -m gpt-5.6-sol -c model_reasoning_effort=high --sandbox
  workspace-write "<brief>"`. Its sandbox can't bind unix sockets — the
  3 live tests always need a local re-run.

## Ordered next actions (repo-side first)

1. **Remotion demo scaffold** — a composition shell with title cards,
   captions and placeholder slots per the shot list (plan Part 1 §8 +
   Part 2 §8): real screen captures only inside flows, no editing
   within a consent flow. New dir (e.g. `demo/`), not in the app build.
2. **ImprovMX MX + SPF records** at GoDaddy the moment Nick reports his
   ImprovMX signup (his only pending micro-task): mx1/mx2.improvmx.com
   (prio 10/20) at apex + `v=spf1 include:spf.improvmx.com ~all` TXT.
   Note existing `send`-subdomain MX/TXT (old project's Resend) — leave.
   Then consider swapping the consent-screen support email to
   support@getmaru.app.
3. **Console leftovers** (browser, low risk): second durable owner in
   IAM, Gmail API quota dashboards + alerts (plan §4).
4. **Demo capture** with Nick (his sign-in moments), then render via
   the scaffold.
5. **Verification submission** in the Verification Center, pasting
   docs/security/google-oauth-verification-answers.md verbatim
   (assessment-determination request + scope justification + agent-use
   statement). Nick approves the submit.
6. After submission: cut the first release carrying the official client
   id (workflow_dispatch macos-release), controlled cohort per plan
   §12; expect the unverified warning until review passes.
7. Hand-checks whenever Nick has hands: Windows smoke (then add
   windows-x86_64 to latest.json), fullscreen traffic lights, 7-day
   re-auth retest against production.

## Open owner gates

None presentation-gated. Everything ownable is in NICK-QUEUE.md:
ImprovMX signup; demo sign-ins; verification submit click; second
owner; billing decision; hand-checks.

## Un-run instructions

None. No surface is mid-mutation. Working tree clean at push.
