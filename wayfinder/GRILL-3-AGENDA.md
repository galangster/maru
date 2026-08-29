# Grill session 3 — agenda  `wayfinder:grilling-prep`

Prepared 2026-08-29 at map 2's close, for the session Nick asked for:
"grill me session + wayfinder to plot how we can continue to make this
app more functional and production ready." This is the primer, not the
grilling — bring opinions.

## New facts the next map must absorb

- **Subscription intent** (Nick, 2026-08-29): "Ultimately I'll probably
  make this a subscription." Unpriced, unshaped. This reframes G2 (a paid
  hosted sync service becomes the obvious product), the no-servers line
  (map 2 out-of-scope; a business needs *some* server), and open-source
  positioning (AGPL was chosen with this in mind — sole authorship keeps
  dual-licensing open).
- **License is decided**: AGPL-3.0 code, CC BY 4.0 spec (G1, delegated).
  Still open in G1: public timing (PUBLIC-READINESS.md says the history
  is clean — the flip is now purely a choice), the Anron icon license
  line, and `wren-mcp` naming/packaging.

## Decisions to force in the grilling

1. **What is the subscription?** Candidates, not equals: hosted sync
   (G2-3), multi-provider (Outlook/IMAP as the paid tier?), a hosted
   agent runner, support/priority, or simply "pay for the app" with AGPL
   source. Each implies a different map.
2. **When does the repo flip public**, and does launch = flip? The
   defacto thesis needs eyes; the subscription needs a story first?
3. **Providers**: is Outlook/Graph the next engine investment, or does
   Gmail-only ride until users complain? (Map 2 said "until the thesis
   is proven" — is it proven?)
4. **G2 mechanism** (three options in the ticket) — now entangled with
   the subscription question.
5. **Distribution**: signing, notarization, auto-update, `wren-mcp` on
   npm — what does "someone else installs Wren" actually look like?

## Production-readiness backlog (candidates for map 3 tickets)

- Packaging: macOS signing/notarization, Windows installer signing,
  auto-update channel, crash/error reporting posture (local-first!).
- The 7-day re-auth production-status flip (standing since MVP).
- Windows/Linux gateway hand-verification (still unrun).
- List paging past the newest-100 (M7's documented lens limit) and
  `order` on `ListThreadsOptions`.
- Bundle: 1.39 MB index chunk wants code-splitting (build warning).
- Standing-permission UX + revocation ergonomics (fog since M1).
- Agent identity hardening when upstream (SEP-1289) moves.
- SECURITY.md + a disclosure channel before public.
- The live triage-morning film (still the best marketing asset unbanked).

## What map 2 closes with

M1–M10 shipped (M10 at notice tier); G1 license half resolved by
delegation; G2 and the gate variant deliberately parked. The permission
model is spec'd, fact-checked, and CC-BY-publishable. 415 tests.
