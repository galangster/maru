# The component system

How Wren's UI stays reusable, and the rules that keep it that way. DIRECTION.md
says what things look like; this says where the pieces live and when something
must be promoted. Audited 2026-08-29 (ticket M6): at that date, zero raw colors
outside the token layer, zero icon imports outside the seam, zero duplicated
class recipes across features.

## The layers

1. **Tokens** — `src/styles/tokens.css`, ruled by DIRECTION.md. Every color,
   radius, duration, easing, and named dimension (`--wren-row-h`,
   `--wren-icon-box`, `--wren-avatar`, `--wren-hit`…) lives here. Features
   never write a raw hex value, a literal `ms`, or a magic px that a token
   already names.
2. **Primitives** — `src/components/ui/`: the shadcn set (button on cva,
   dialog, popover, select, switch, tooltip, skeleton, sonner) and the **Icon
   seam** (`icon.tsx` + `icon-glyphs.ts`). Icons route through the seam only —
   that is what made the lucide → Anron swap a one-file change.
3. **The kit** — `src/components/`: Wren's own shared parts.
   - `wren-controls.tsx` — the chrome atoms: `PrimaryButton`, `IconButton` /
     `iconButtonClass`, `Keycap`, `AccountAvatar`, `HueTile`, `AccountDot`,
     `SurfaceHeader`, `SurfaceEmpty`; the recipes `PRESS`, `AVATAR_CHIP`,
     `SURFACE_TITLE`, `META_TEXT`, `DATE_COLUMN`, `SECTION_LABEL`,
     `ICON_SLOT`, `SEND_BUTTON` + `SEND_CONFIRM`; the `Tone` scale.
   - `empty-state.tsx` — `EmptyState` and `WrenMark`, the presentational
     halves (list, reading pane, and onboarding all draw on them). Which copy
     a mail view earns and the inbox-zero tier state are list domain and live
     in `features/list/inbox-zero.ts` — the kit never switches on `MailView`.
   - `thread-result.tsx` — the 52 px result row the list's search mode and
     the palette share.
   - `error-boundary.tsx`.
4. **Features** — `src/features/<name>/`: composition only. A feature styles
   its own layout inline with Tailwind (that is idiom, not debt), but any
   *recipe* — a class string with an opinion that two surfaces share — belongs
   one layer down.

## The promotion rule

**Used twice → promoted.** The second time a class recipe, a markup shape, or
a helper appears in a second file, it moves to the kit and both call sites
import it. Not because duplication is ugly, but because the second copy is
where drift starts: the approval queue's Approve button confirms "exactly as
the composer runs it" only for as long as both compose from `SEND_BUTTON` and
`SEND_CONFIRM`.

Promotion is a move, not a redesign. If two surfaces share structure but not
visuals, they get separate parts (`EmptyState` vs `SurfaceEmpty`) — forcing
one component to serve both is how flags accumulate.

A recipe two files inside **one feature** share is promoted within the
feature, not to the kit (`FIELD_LABEL` in `compose/chip-input.tsx`): the kit
is for what crosses feature lines.

## Import rules

- Features import **down** (core, lib, components) freely.
- Three features are **hubs** and may be imported by any feature: `mail`
  (queries + the MailService context), `shell` (surface store, theming),
  `keyboard` (keymap + registration). `compose`'s action layer
  (`use-compose-actions`) is hub-ish by the same logic: replying is an action
  many surfaces trigger.
- Leaf features do **not** import each other's UI. A component two features
  both want is a component that belongs in `src/components/` — that is how
  `empty-state.tsx` and `thread-result.tsx` got their current homes.
- Two sanctioned exceptions, by role rather than accident: **settings** is a
  composition surface and mounts feature-owned panels (`AgentsSection` from
  `features/agents`) — the section belongs to its feature, the frame to
  settings; and any feature may import another's **queries** (the sidebar
  reads `features/agents/queries` for its badge) — that is data, not UI.
- The engine side has the same shape: the UI sees `MailService`
  (`src/core/types.ts`) only; agent tools go through the one
  authorize-and-audit path in `gateway-server/tools.ts`; native goes through
  `Platform`.

## Conventions the audit chose to keep inline

- **Surface widths** (`w-[680px] max-w-[calc(100%-2rem)]`…) stay literal at
  each call site: Tailwind's scanner needs arbitrary classes written out, so a
  `surfaceWidth(px)` helper would silently generate no CSS. The convention is
  the pattern, not a shared constant.
- **z-index** uses three steps only: `z-10` (chrome above content), `z-40`
  (floating panels: composer), `z-50` (modal layer: dialogs, onboarding,
  error boundary). A fourth step is a design question, not a new number.
- **The vendored shadcn primitives** keep their upstream class strings
  (`switch.tsx`'s literal sizes); they are dependencies that happen to live
  in-tree, and rewriting them onto tokens would fork them.

## Proof discipline

A promotion or extraction claims "pixel-identical" only when
`node scripts/screenshot.mjs` reproduces every capture byte-identical
(`git diff docs/captures` empty). The M6 pass met that bar across all 13
captures.
