# P1 — Public flip prep  `wayfinder:task`

status: closed (two owner actions pending) · claimed: autonomous run, 2026-08-29 · blocked by: —

## Question → work

Everything between today's private repo and Nick pressing the visibility
switch, per docs/research/PUBLIC-READINESS.md and grill 3:

1. Run `gitleaks detect --log-opts=--all` (install locally) and attach
   the clean report to the readiness doc — upgrades the shape-scan claim.
2. `SECURITY.md`: where to report, what the socket trusts, what a
   credential can and cannot do (crib from PERMISSION-MODEL §9).
3. The Anron license line: all rights reserved, named exception for Wren
   builds, lucide fallback noted — in README §License and
   `src/assets/icons/anron/LICENSE.md`.
4. README posture: pre-1.0 honesty block + "free and open; a paid hosted
   sync service is planned" (ratified wording intent, not final copy).
5. Claim `wren-mcp` on npm with a placeholder (package prepped in-repo;
   the `npm publish` itself is Nick's account → his go).
6. Then: Nick flips visibility. Launch stays a separate, later event.

## Resolution

All prep shipped: gitleaks over all 34 commits — no leaks — recorded in
PUBLIC-READINESS.md, which now reads unconditional; SECURITY.md (report
channel, the one-page trust model, researcher scope notes); the Anron
license (src/assets/icons/anron/LICENSE.md — all rights reserved,
Wren-build exception, lucide fallback) with the README's license section
updated to match; the README opener rewritten to the ratified posture
(gateway in the first sentence, pre-1.0 honesty block, "paid hosted sync
is planned"); and the `wren-mcp` placeholder package prepped in
npm/wren-mcp/ (tested; prints the claim and exits 1).

Two actions are Nick's, in order: `npm login && npm publish` from
npm/wren-mcp/ (this machine holds no npm session — ENEEDAUTH), then the
repository visibility flip. /simplify skipped: docs and a 12-line
placeholder, no substantive code (orchestrator's judgment per contract).
