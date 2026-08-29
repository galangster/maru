# M6 — Component-system audit  `wayfinder:task`

status: closed · claimed: M6 lane, 2026-08-29 · blocked by: —

## Question → work

Hold the UI to the bar Nick named: reusable parts, nothing hand-rolled or
hardcoded, actually scalable. Sweep `src/features` and `src/components`
for: (a) values that bypass the token layer (raw hex/rgb, magic px,
literal durations/easings, ad-hoc z-indexes); (b) recipes repeated across
feature files that belong in `wren-controls.tsx` or `components/ui`;
(c) seam bypasses (lucide imported outside the Icon seam, raw elements
where a kit control exists, cross-feature imports); (d) kit gaps —
things used twice and never promoted. Apply the safe promotions, fix the
violations, and document the kit (`docs/design/COMPONENTS.md`: the
layers, the inventory, and the promotion rule that keeps it scalable).
Proof of refactor-purity: the deterministic capture set re-runs
byte-comparable.

## Resolution

The sweep found the token and seam layers already clean — zero raw colors
outside tokens.css, zero lucide imports outside the Icon seam, durations and
easings all token-routed — so the audit's work was one layer up, where
recipes and structures repeat.

**Moved to the right home.** `empty-state.tsx` → `src/components/` (it was
imported cross-feature by reading and onboarding), with its list-domain half
— `emptyCopyFor` over `MailView` and the inbox-zero tier state — split back
out to `features/list/inbox-zero.ts`, because the kit never switches on a
mail view. `celebrate.ts` → `src/lib/`. `thread-result.tsx` →
`src/components/` (the list's search mode and the palette both consumed it
from `features/search`, which is now gone).

**Promoted into the kit** (`wren-controls.tsx`): `SurfaceHeader` (the 48 px
title-and-actions header the queue, the audit log and settings each
hand-rolled), `SurfaceEmpty` (the quiet icon/title/why block both agents
surfaces copied), and the recipes `SURFACE_TITLE`, `META_TEXT`,
`DATE_COLUMN`, `SECTION_LABEL`, `ICON_SLOT`, `SEND_BUTTON` + `SEND_CONFIRM`
— the last pair making the queue's "confirms exactly as the composer" claim
mechanical rather than aspirational. `FIELD_LABEL` stayed feature-local in
`compose/chip-input.tsx`, the worked example of the kit being for
cross-feature recipes only. Roughly thirty call sites now import what they
used to restate.

**Kept inline deliberately**: surface widths (Tailwind's scanner needs
arbitrary classes literal — a width helper would silently emit no CSS), the
three-step z scale, and the vendored shadcn class strings. All recorded in
docs/design/COMPONENTS.md, which now documents the layers, the promotion
rule ("used twice → promoted; promotion is a move, not a redesign"), and
the import rules — amended after review to match the real graph (settings
as a composition surface; queries importable as data).

/simplify ran before the seal (two agents, four angles). It caught four
missed call sites (all fixed: the queue's `ml-auto` meta, the compose field
label ×3, the date column pair, a stale tokens.css path comment), forced
the empty-state domain split above, and caught COMPONENTS.md describing an
import rule the graph violated — resolved by promoting `ThreadResult` and
writing the two real exceptions down. Noted, not done: a type-only
`TITLE_TEXT` variant for two near-miss title sites.

Gates: typecheck clean · 388 tests green · all 13 captures re-ran
**byte-identical, twice** (after the main pass and again after the review
fixes) — the refactor-purity bar COMPONENTS.md now names.
