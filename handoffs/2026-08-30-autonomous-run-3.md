# Autonomous run 3 — plan §3 + N5 + §3 stragglers + dossier (2026-08-30)

Standing order this run works under: Nick, 2026-08-30 — "keep going
autonomously, stop asking"; owner-only actions go to
`wayfinder/NICK-QUEUE.md`, never to a chat question. Recorded in agent
memory (`wren-autonomous-standing-order`).

## Commits, in order

- `20fa907` — plan §3 core: encryption at rest (AES-256-GCM, per-account
  keychain keys, AAD-bound), key destruction on account removal
  (crypto-erases audit content), agent-session consent (Part 1 §2),
  untrusted-content marking, tests/injection.test.ts, SECURITY.md key
  lifecycle. Two Sol delegates + /simplify; record in the P4 ticket.
- `3ca43ad` — gate N5 approved by Nick ("Do what you recommend"):
  PERMISSION-MODEL.md §8.1 + summary item 7 now state append-only =
  structure forever, mail-derived content erasable only by key
  destruction on account removal.
- `45df4a0` — plan §3 closed: "Delete local Google data" action,
  agent disclosure in onboarding + Settings (one shared constant),
  in-app help links, typed clientFailure → "Use your own client" row.
  NICK-QUEUE.md created.
- `b673dfe` — plan §6–§7 dossier: ten artifacts under `docs/security/`
  and `ops/google-oauth/`, submission wording verbatim, «NICK»
  placeholders indexed in NICK-QUEUE. Plus the gaps its cross-check
  caught: list_pending session-gated, consent dialog names off-device
  processing, site-draft key/attachment claims corrected, one-scope
  setup guide, README signing note.

## State

- 477 tests green, `tsc --noEmit` clean, working tree clean, main.
- P4 is the only open ticket; its full history (decisions N1–N5,
  every lane's /simplify record) is in
  `wayfinder/tickets/P4-onboarding-reauth.md`.
- Every remaining item needs Nick or his console:
  `wayfinder/NICK-QUEUE.md` is the complete, self-contained list
  (domain/site, production Google project, consent flip + brand
  verification, client-id injection, demo, dossier «NICK» fields,
  Windows hand-smoke, fullscreen traffic lights, 7-day retest).

## Exact resume points

- After Nick creates the production client: fill
  `docs/security/google-oauth-verification-answers.md` placeholders,
  wire `WREN_OFFICIAL_GOOGLE_CLIENT_ID` into the release workflow
  (release-workflow checks already expect it — see plan §2 artifacts),
  cut the frozen reviewer build, then the demo (plan §8 shot list).
- If Google answers the assessment determination with "CASA required":
  fall back to N1 position 2 — disable shared-client agent access
  (agents require BYO), per the fallback tree in plan §13.
- No un-run instructions are pending. No surface is mid-mutation.

## Opener for a fresh session

```
Open ~/Projects/wren. Read handoffs/2026-08-30-autonomous-run-3.md and
wayfinder/NICK-QUEUE.md. The standing order (memory:
wren-autonomous-standing-order) applies: work autonomously, queue
owner-only actions. Continue from whichever NICK-QUEUE item has
unblocked since the handoff.
```
