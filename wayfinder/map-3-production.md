# Wayfinder map 3 — Production  `wayfinder:map`

Tracker: local-markdown fallback. Tickets in [tickets/](tickets/), prefixed
`P` (production task), `R3-` (research). Charted 2026-08-29 from grill
session 3 ([GRILL-3-AGENDA.md](GRILL-3-AGENDA.md)) — two rounds, every
recommendation accepted. Map 2 (agentic gateway) closed the same day with
M1–M10 shipped.

## Destination

**A stranger can download Wren, connect their Gmail, connect Claude, and
live the triage morning — no repo clone, nothing that feels unfinished.**
Agent-runners keep their terminals (`claude mcp add` stays); what dies is
everything that smells like a prototype: unsigned builds, the 7-day
re-auth, the OAuth console safari, updates that never arrive.

Wren stays free and open (AGPL-3.0). The business is **hosted sync**, and
it is *map 4's* product — map 3 ships zero servers, so the first server
Wren ever runs is the one people pay for.

## Ratified in grill 3 (Nick, 2026-08-29, all recommendations accepted)

- **Subscription spine = hosted sync** (the Obsidian-Sync shape). No
  billing, no accounts, no pricing anywhere in map 3; the README says a
  paid sync service is planned.
- **Flip public early, launch later** — two separate events. The full
  process record (handoffs/, wayfinder/) stays public: for an audit-log
  product built with an agent, the process is the marketing.
- **Anron icons**: all rights reserved with a named exception for Wren
  builds; forks fall back to lucide through the Icon seam. Demo cast
  keeps "Nick Galang" — it reads as a signed demo.
- **Gmail-only** through map 3. Providers are breadth before depth until
  strangers actually install; Outlook opens map 4 at the earliest.
- **macOS first-class**: Developer ID + notarization + DMG. Windows keeps
  building unsigned in CI with an honest SmartScreen note.
- **No telemetry, ever, in this map** — an in-app debug-log export is the
  whole story. Anything phoning home breaks "local-first, talks only to
  Google" and spec §9's posture.
- **Auto-update = Tauri updater** over a static, signature-verified
  manifest on GitHub Releases. Auto-check, always ask before installing.
- **The shim is `wren-mcp`** (name unclaimed on npm as of charting —
  claim immediately with a placeholder, publish for real at flip). This
  settles G1's naming question.
- **Owner gates opened by Nick**: Apple Developer enrollment now
  (approval latency gates P2); Google OAuth production flip when P4's
  re-auth work lands.

## Tickets

- [P1 public flip prep](tickets/P1-public-flip.md) — gitleaks, SECURITY.md,
  Anron line, README posture, npm name claim; then Nick flips visibility.
- [P2 macOS signing](tickets/P2-macos-signing.md) — Developer ID,
  notarization, DMG. Blocked by: Apple enrollment (Nick).
- [P3 auto-update](tickets/P3-auto-update.md) — Tauri updater, static
  manifest, key ceremony. Blocked by: P2 (one signing story).
- [P4 onboarding + re-auth](tickets/P4-onboarding-reauth.md) — the
  stranger's first hour; the production-status flip.
- [R3a shared OAuth client](tickets/R3a-shared-oauth-client.md) — can one
  published client id spare strangers the Cloud console? Verification /
  CASA / PKCE-public-client facts → decision.
- [P5 settings export/import](tickets/P5-settings-export.md) — the free
  sync stopgap; its serialization seeds map 4's sync schema. Never
  tokens, never grants.
- [P6 shim on npm](tickets/P6-shim-npm.md) — real `wren-mcp` publish at
  flip; `npx wren-mcp` in the docs.
- [P7 debug-log export](tickets/P7-debug-log.md) — the no-telemetry
  answer to "it broke".
- [P8 bundle split](tickets/P8-bundle-split.md) — the 1.39 MB chunk.
  Cuttable if the map runs long.
- [P9 gateway CI matrix](tickets/P9-gateway-ci.md) — Windows named-pipe +
  Linux socket verification in CI. Cuttable.

Owner thread, not tickets: the triage-morning live run + film (runbook in
docs/TRIAGE-MORNING.md §4) — still the launch's centerpiece asset.

## Progress — autonomous run, 2026-08-29 (evening)

Closed same-day: **P1** (flip prep: gitleaks clean over all history,
SECURITY.md, Anron license, README posture, `wren-mcp` placeholder
prepped — the publish and the flip are Nick's two buttons), **R3a**
(recommendation: one shared *verified* client via the restricted-scope
local-client CASA exemption; Thunderbird precedent; bring-your-own stays
the fork path — docs/research/shared-oauth-client.md), **P5** (clipboard
settings transfer with checksum + preview), **P7** (debug report, no
telemetry), **P8** (startup chunk 1,387 → 541 KB via latched lazy
surfaces), **P9** (gateway CI matrix; first run triggered). **P2**
closed later the same night: cert via the portal under Nick's LLC, first
signed+notarized+stapled DMG verified by Nick's own release-script run;
plus the macOS 26 traffic-light saga (re-parented buttons, equidistant),
the squircle icon, and the 52 px titlebar rhythm. Remaining: P3 (now
unblocked), P4 behind R3a's owner read + the film, P6 behind the flip.
- **P3 closed** same night (auto-update, key custody in the ticket) and
  the **keychain prompt storms killed at the root**: stable signature +
  recreate-on-write ACL self-healing + a dev-only keychain service.
  Nick's UX directive produced
  [UX-FRICTION-2026-08-29.md](../docs/design/UX-FRICTION-2026-08-29.md):
  P0s are P4's spine; **P10 (daily polish: save attachments, persistent
  drafts, human labels)** and **P11 (bulk actions + search operators)**
  proposed, awaiting Nick's cut.
- **The repo is PUBLIC and `wren-mcp@0.1.0` is on npm** (flip driven
  through the in-app browser; publish by Nick after npm's
  2FA-required-but-none-existed wall — both verified from outside,
  including a cold `npx wren-mcp` run). P6 closed. P10 closed the same
  evening (row-level focus, e-e-e triage, real attachment saves,
  crash-safe drafts, human labels).

## Not yet specified

- The shared-client outcome (R3a) reshapes P4's scope either way.
- Tauri updater key custody (where the private key lives, who can cut a
  release) — sharpens in P3.
- What exactly "settings" serializes to in P5 — the list is the work.
- Launch mechanics (Show HN, the film's cut, timing) — its own small map
  or a G-ticket when the pieces exist.

## Out of scope

- Hosted sync service, accounts, billing — **map 4's product**.
- Outlook/Graph, IMAP — map 4 at the earliest.
- Standing-permission UX, agent-identity hardening (upstream still
  dormant) — carried fog.
- Teams/multiplayer — unchanged from map 2.
