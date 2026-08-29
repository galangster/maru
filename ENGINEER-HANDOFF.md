# Wren — engineer handoff (first ship)

Sealed 2026-08-28. This is the first ship of this surface, so it carries
ENGINEER-HANDOFF.md (per the delta contract, a re-ship would carry
CHANGES-SINCE-2026-08-28.md instead).

## What this is

Wren MVP: a Spark-class unified multi-account Gmail client. Tauri 2 shell,
React 19 + shadcn/ui front, all application logic in TypeScript
(`src/core`), Rust confined to plugins + ~80 lines of commands. Windows is
the target platform (CI builds NSIS/MSI); development and verification ran
on macOS.

## Receipts

- Commits: e918af0 (T1 scaffold) → 639333c (T2 engine) → 2a1a585 (T7
  design system) → e5ebd96 (T3 shell) → f0a4b0a (T4 features) → 3288894
  (T5 polish) → e1fa205 (T6 simplify) → final docs commit (HEAD).
- Gates at seal: typecheck ✓ · 218/218 vitest ✓ · vite build ✓ · cargo
  build ✓ · native `tauri dev` smoke: ran ~10 min, zero panics ✓ · 8
  captures in docs/captures/ ✓.
- Simplify pass: 36 findings from two review lanes, 30 deduped applied,
  none skipped (two resolved by choosing an offered option) — see commit
  e1fa205 message and wayfinder/tickets/T6-seal.md.

## Where things live

- Product spec: docs/PRD.md · decisions: docs/DECISIONS.md (grill log,
  5 rounds) · build map: wayfinder/ · SOP: docs/SOP.md.
- Visual law: docs/design/DIRECTION.md + src/styles/tokens.css.
- Research: docs/research/ (Gmail API facts incl. 2026-05 quota model;
  prior-art verdict).
- Gmail setup for users: docs/SETUP-GOOGLE-OAUTH.md.

## Seams that matter

- `MailService` (src/core/types.ts) — the only surface the UI sees.
  real.ts vs demo.ts; demo powers the browser build and screenshots.
- `Platform` (src/core/platform.ts) — native seam; tests implement it over
  Node (better-sqlite3 + stubbed fetch).
- Icon seam (src/components/ui/icon.tsx) — lucide today; Anron SVGs drop
  in here when exported from Figma.
- Folder rule — core/defaults.ts FOLDER_LABELS is the single source for
  views, sidebar, palette, and membership predicates.

## Known limitations / next steps (ordered)

1. Real-Gmail end-to-end is code-complete but has never run against a live
   Google OAuth client (none exists yet — Nick creates it per the setup
   doc, then signs in; first live sync is the next real gate).
2. Windows binary is CI-built, not hand-verified: needs a GitHub remote,
   one workflow_dispatch run, and a smoke on a Windows machine.
3. Anron icon swap pending Figma export.
4. Attachment save/preview is stubbed (honest copy in-app); wire
   tauri-plugin-dialog + fs when wanted.
5. Post-MVP backlog in docs/PRD.md's Out column and wayfinder map's
   fog/out-of-scope sections.
