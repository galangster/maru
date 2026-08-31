# Wren — Design Direction

Owner: Nick. Lane: T7. Status: ratified for the shell lane.
Implementation: `src/styles/tokens.css`. This document is the *why*; the tokens file is the *what*.
Re-grounded on the Amie study 2026-08-28 — see `AMIE-STUDY.md` and `tokens-amie-proposal.css`
beside this file. §3 (colour), §4 (the eyebrow), §5 (row measures), §6 (radius and elevation),
§7 (where glass lives), §8 (filled icons) and §9 (the celebration register) all moved.

Wren is a unified Gmail desktop client that should feel like a cloud: light, soft-edged,
weightless, quiet. It is not a MetaDAO product and carries none of that styling. Every value
below is derived fresh from the reference set (Family, Phantom, Aave, Umbra) and from a bounded
Mobbin study of Superhuman and web command-palette patterns.

---

## 1. Principles

**Cloud-soft.** Depth comes from *fill steps and soft ambient shadow*, never from strokes or
hard drops. Corners are generous. Nothing has a hard edge against the canvas.

**Calm.** One accent, used sparingly. Color is information (unread, starred, danger), not
decoration. A screen at rest should be near-monochrome; the only saturated pixels are the
sender avatars and at most one accent element.

**Precise.** Spacing and alignment are the product. Everything sits on a 4 px grid. The three
panes have fixed, named measures so alignment is decided once, here, and never re-argued in a
component. Columns line up across every row of a list, always.

**Wren refuses to:**
- Tint or stripe a list row to signal state. Unread is a dot and a weight change.
- Put glass behind text that must be read (the list, the message body).
- Use more than one accent hue, or a gradient as a surface.
- Ship density presets. There is one density, tuned once, correctly.
- Animate anything the user did not ask for.

---

## 2. Reference notes

### Family (iOS wallet)
1. **Rows with no container and no dividers.** The token list is bare text on the canvas;
   grouping comes from vertical space alone. → Wren's list uses *no* hairline between rows in
   the same day-group. A hairline appears only between groups.
2. **Action cards carry a one-line "why".** Every action is title + explanatory subtitle, never
   a bare label. → Empty states, onboarding cards, and every destructive confirm get a subtitle.
3. **A single colored circular chip leads the row.** Scannability without borders. → The sender
   avatar is the only saturated element in a list row.
4. **Primary value right-aligned, secondary muted beneath it.** → Timestamp over attachment/count meta.

### Phantom (iOS wallet)
1. **Depth by fill, never by stroke.** Rows sit on a slightly raised rounded container on a
   darker base. No borders anywhere in the dark theme. → `base → surface → raised` fill steps.
2. **Rigid three-column row anatomy** repeated identically down the list: 32 px circular icon /
   two-line name+meta / right-aligned two-line value+delta. → Exactly Wren's message row:
   avatar / sender+subject+snippet / time+meta.
3. **Equal-width action tiles** under the header — icon over label, rounded, same width.
   → The reading-pane action bar.
4. **Section headers are small, muted, with a trailing "Show more".** → Command palette sections
   and the search results panel.

### Aave / DeFi web (Binance, OKX, Kraken observed)
1. **Dense tables that still breathe.** Tall rows (44–52 px) with generous horizontal padding and
   a very low-contrast divider — density comes from row height, not from cramped padding.
2. **Right rail of stacked contextual cards** (Activity / Explore / Tips) instead of modals.
   → Wren's third pane can host thread context without ever opening a dialog.
3. **All numerics right-aligned and tabular.** → `font-variant-numeric: tabular-nums` on every
   time, count, and size in the app. Non-negotiable; it stops the list from shimmering on refresh.
4. **Column headers are small and muted, not bold.** Hierarchy by color, not by weight.

### Superhuman (web mail)
1. **Fixed-width sender column (~150 px).** Every subject starts at the same x. This single
   decision is what makes the list scannable. → `--wren-list-sender-w`.
2. **Unread = dot in the left gutter + darker sender.** No row tint, no left bar. This
   independently confirms Nick's no-sliver rule.
3. **Day grouping via a small muted label** ("Yesterday", "Last 7 days") with generous space above.
4. **A persistent lightweight right rail** teaching shortcuts, rather than a modal help screen.
5. **Toast is small, bottom-left, rounded, with inline UNDO and a dismiss ×.** Steal verbatim.

### Command palette (Ferndesk, Vapi, Juicebox)
1. **Centered floating card ~560–640 px wide over a dimmed app.** Never full-screen.
2. **A permanent keycap footer** inside the palette (↑↓ navigate · ↵ select · esc close).
3. **Tiny muted section headers**, rows of icon + label + muted right-side context.
4. Juicebox marks the selected row with a 2 px left bar. **We reject that** — selection is a soft
   fill plus an accent-tinted icon.

---

## 3. Color

OKLCH throughout. The neutral ramp is **achromatic** — hue 286 at chroma 0.002–0.005, which is
a true neutral that still avoids a dead flat grey. It used to be periwinkle-tinted at hue 268;
the Amie study (`AMIE-STUDY.md` §2.1) found that the tint fought every saturated element beside
it, and it came out when the category hue family arrived. The greys now read *neutral and
airy*; the cool comes from the accent, not from the canvas.

**Accent: periwinkle indigo, `oklch(0.545 0.185 268)` / `#4364DA`.** Held.
Justification: violet-indigo is the shared territory of Phantom, Aave and Umbra, but pushed
lighter and cooler toward sky so it reads *cloud*, not *crypto wallet*. The study offered a
nudge to hue 258 (Amie's internet blue); the owner declined it — the accent is Wren's identity
anchor and does not move.

### Light

| Role | OKLCH | Hex |
|---|---|---|
| base (app canvas, sidebar) | `0.968 0.002 286` | `#F4F4F5` |
| sunken (wells, inset fields) | `0.949 0.003 286` | `#EDEDEF` |
| surface (list, reading pane) | `1 0 0` | `#FFFFFF` |
| raised (cards, popovers) | `1 0 0` | `#FFFFFF` |
| hairline | `0.923 0.003 286` | `#E6E6E9` |
| text-1 primary | `0.205 0.004 286` | `#171719` |
| text-2 secondary | `0.470 0.004 286` | `#5A5A5D` |
| text-3 meta | `0.535 0.004 286` | `#6D6D6F` |
| accent | `0.545 0.185 268` | `#4364DA` |
| accent-hover | `0.495 0.185 268` | `#3654C9` |
| destructive | `0.560 0.210 25` | `#D4212D` |
| success | `0.515 0.125 155` | `#087C46` |
| star | `0.630 0.150 58` | `#CA6E03` |

### Dark

| Role | OKLCH | Hex |
|---|---|---|
| base | `0.160 0.003 286` | `#0C0C0E` |
| sunken | `0.110 0.002 286` | `#050506` |
| surface | `0.225 0.004 286` | `#1C1C1F` |
| raised | `0.285 0.005 286` | `#28282C` |
| hairline | `oklch(1 0 0 / 0.08)` | — |
| text-1 | `0.968 0.002 286` | `#F4F4F6` |
| text-2 | `0.742 0.004 286` | `#ABABAE` |
| text-3 | `0.660 0.004 286` | `#929294` |
| accent | `0.745 0.120 268` | `#8CA9F9` |
| accent-hover | `0.815 0.090 268` | `#A9C1FE` |
| destructive | `0.705 0.175 22` | `#FA6B6D` |
| success | `0.760 0.150 158` | `#48CD8C` |
| star | `0.800 0.135 80` | `#EBB34B` |

**text-2 and text-3 hold their lightness exactly in both themes.** Only chroma and hue moved,
which is what carries the verified table below through the de-tinting unchanged. text-1 only
ever got darker. Amie's own meta tier measures ≈2.8:1 and Wren declines it outright.

### The category hue family

Eight hues — green, teal, blue, violet, magenta, red, orange, yellow — each in three states:
**solid** (rings, dots, tiles, filled marks), **ink** (text or a glyph on the matching wash;
every one clears 4.5:1 on `surface` and on `base`), and **wash** (the solid at 12% light / 22%
dark). Lightness is compensated per hue on purpose; a fixed-L rainbow is a myth. Every chroma
is clamped to the sRGB boundary for its lightness, so nothing relies on browser gamut mapping.

**They bind to exactly two things: a real Gmail label, and a stable hash of a sender's address
(`src/lib/hue.ts`).** Nothing else. The moment a hue decorates chrome, "one accent" becomes "no
accent" and §1's near-monochrome-at-rest promise is gone. Settings-section tiles are the one
assigned exception, and they are five fixed positions rather than decoration.

`--wren-hue-fg` is the ink that sits *on* a hue solid — a fixed dark value in **both** themes.
Amie sets white there; white measures 1.6–4.1 on these solids and fails the 3:1 a non-text
glyph needs on four of the eight, so Wren does not.

### Verified contrast (WCAG 2.x, computed not estimated)

Light, against `base` / `surface`: text-1 **16.33 / 17.92**, text-2 **6.23 / 6.83**,
text-3 **4.71 / 5.17**, accent **4.71 / 5.17**, destructive **4.72 / 5.18**,
success **4.83 / 5.30**. White on accent **5.17**.
Star (non-text, needs 3.0) **3.34 / 3.66**.

Dark, against `base` / `surface` / `raised`: text-1 **17.69 / 15.59 / 13.09**,
text-2 **8.47 / 7.47 / 6.27**, text-3 **6.24 / 5.50 / 4.61**, accent **8.46 / 7.46 / 6.26**,
destructive **6.84 / 6.03 / 5.06**, success **9.62 / 8.48 / 7.12**, star **10.26 / 9.04 / 7.59**.

Hue inks, light, on `surface`: green **6.16**, teal **6.03**, blue **6.14**, violet **7.38**,
magenta **6.92**, red **6.88**, orange **5.53**, yellow **5.09**. Dark inks run 8.35–11.89.
`--wren-hue-fg` on a hue solid: **5.13–13.22** across all sixteen solids.

Every text tier clears AA (4.5) on every surface it is permitted to sit on. All values are in
sRGB gamut — verified, no clipping.

**One licensed exception.** The light solids for green, teal, orange and yellow measure
2.6–2.9:1 against white. They are permitted only as marks sitting immediately beside their own
text label, never as the sole carrier of meaning.

**Semantic mapping.** Unread = accent dot + sender at 600. Starred = star hue, **Style=Filled**
glyph. Current mailbox = accent + **Style=Filled** glyph. Selected row =
`--wren-fill-selected` (accent at 8% light / 14% dark), never a stroke.
Hover = `--wren-fill-hover` (neutral, not accent).

> **shadcn trap:** in shadcn, `--accent` is the *subtle hover fill*, not the brand colour.
> Wren's brand accent maps to `--primary` and `--ring`. Do not use `bg-accent` for a brand element.

---

## 4. Type

Two families, four weights total, five sizes total.

- **Open Runde** — Medium 500, Semibold 600. UI chrome, headings, sender names, buttons, tabs,
  numerals in chrome. Its rounded terminals are the typographic half of "cloud-soft".
- **DM Sans** — Regular 400, Medium 500. Body copy, snippets, meta, timestamps, form values.

`@font-face` blocks live in `tokens.css` with `font-display: swap`, pointing at the bundled
`src/assets/fonts/open-runde/OpenRunde-{Regular,Medium,Semibold}.woff2` and
`src/assets/fonts/dm-sans/DMSans-{Regular,Medium}.ttf`.

| Token | Size | Line-height | Tracking | Use |
|---|---|---|---|---|
| `--text-xs` | 11.5px | 16px | +0.02em | timestamps, counts, keycaps, the eyebrow |
| `--text-sm` | 13px | 18px | 0 | snippets, secondary meta, table headers |
| `--text-base` | 14px | 20px | −0.006em | UI default, sender names, buttons, menu items |
| `--text-lg` | 15.5px | 24px | −0.011em | message body in the reading pane |
| `--text-xl` | 21px | 27px | −0.018em | subject line, empty states, onboarding headline |

**The eyebrow.** Open Runde 600, all-caps, `--text-xs`, `+0.02em`, in `text-3`. Amie's most
distinctive typographic move, and the reason xs tracking widened. It marks a section label that
is a *word*: the palette's group headings, the composer's field labels, the settings field
labels, the "?" sheet's groups. It is not used where the label is an address or a date —
"NICK@GMAIL.COM" and "YESTERDAY" both read as a shout. Those keep the weight and the tracking
and drop the caps.

Rules: `font-variant-numeric: tabular-nums` globally. `text-wrap: pretty` on prose,
`text-wrap: balance` on headings under 3 lines. Reading-pane measure capped at **68ch**.
Never use a weight below 400 or above 600. Never fake a weight.

The size tokens live in `:root` as plain custom properties, named with Tailwind v4's
`--text-*--line-height` convention. To get `text-sm` / `text-lg` *utilities* out of them, the
shell lane lifts the same five declarations into a `@theme` block; nothing else changes.

**Shell lane action:** `src/index.css` still imports `@fontsource-variable/inter` and pins
`--font-sans` to Inter inside `@theme inline`. Remove that import and repoint the theme font to
`var(--wren-font-body)` when wiring tokens.css. Also convert the two DM Sans `.ttf` files to
subset `.woff2` — they are ~56 KB each as TTF and load unsubset today.

---

## 5. Spacing and pane measures

**4 px grid. No exceptions.** Any value not divisible by 4 fails review, with two licensed
exceptions: hairlines (1 px) and optical icon nudges (±1 px, documented at the call site).

Steps: `--wren-space-1` 4 · `-2` 8 · `-3` 12 · `-4` 16 · `-5` 20 · `-6` 24 · `-8` 32 · `-10` 40 · `-12` 48 · `-16` 64.

Pane measures, decided once:

| Token | Value | Note |
|---|---|---|
| `--wren-toolbar-h` | 52px | per-pane header — the window's ONE horizontal band |
| `--wren-sidebar-gutter` | 8px | the ground channel around the floating sidebar card |
| `--wren-lights-gap` | 16px | mirrors `GAP` in `src-tauri/src/lib.rs`, both axes |
| `--wren-lights-reserve` | 44px | the card's top band = toolbar 52 − gutter 8 |
| `--wren-sidebar-w` | 248px | CARD width; the panel is this + 2 × gutter |
| `--wren-sidebar-w-min` / `-max` | 200px / 320px | resize clamp, card widths |
| `--wren-sidebar-w-collapsed` | 68px | icon rail seating the lights; panel 84, content box 52 |
| `--wren-list-w` | 400px | default |
| `--wren-list-w-min` / `-max` | 340px / 520px | resize clamp |
| `--wren-row-h` | 68px | two-line message row |
| `--wren-row-h-compact` | 52px | single-line row (search results, palette) |
| `--wren-list-sender-w` | 152px | fixed sender column — the Superhuman lesson |
| `--wren-row-inset-x` | 8px | the inset rounded row's horizontal inset |
| `--wren-row-gap` | 4px | the gap between two row rects; the pitch stays 68px |
| `--wren-tile` | 28px | the category squircle in settings and label rows |
| `--wren-read-px` | 32px | reading-pane horizontal padding |
| `--wren-read-pt` | 24px | reading-pane top padding |
| `--wren-read-measure` | 68ch | body max-width |
| `--wren-avatar` | 32px | |
| `--wren-icon-box` | 24px | fixed slot, `flex-shrink: 0` |
| `--wren-hit` | 32px | minimum interactive box in chrome |

---

## 6. Radius, elevation, hairline

**Radius** — a desktop scale, retuned from a mobile one. The old top three read as an iOS sheet
on a 640 px floating card (`AMIE-STUDY.md` §4.1). shadcn's `--radius` base stays `1rem`.

`--wren-radius-xs` 6 (chips, badges, keycaps) · `-sm` 8 (inputs, small buttons, category tiles)
· `-md` 12 (buttons, menu items, composer field wells) · `-row` **10** (the inset list-row rect)
· `-lg` **14** (cards, panes) · `-xl` **18** (sheets, popovers) · `-2xl` **24** (command
palette, composer sheet, settings, onboarding) · `-full` 999.

Nested radii must be concentric: **inner = outer − inset.** Never nest equal radii. A 24 sheet
with a 12 px inset puts its wells at 12; a 24 palette with `p-2` puts its rows at 16. A focus
ring is a `box-shadow` and follows its element's radius on its own, so getting the radius right
is what gets the ring right — the composer's draft well is the worked example.

The **floating sidebar card** is the second worked example, and the one that decided its own
numbers. The card takes `-xl` **18** and insets its three bands by `px-2` **8**, so its rows
land at 18 − 8 = **10** — `--wren-radius-row`, the radius every list and sidebar row already
carries. No waiver, no new radius step, and `NavRow` is untouched. The rejected alternative
(`-lg` 14 at a 12 px inset) demanded an inner radius of 2 against those same 10 px rows.

**Buttons and badges are pills.** Amie uses one for every primary action and every chip at both
densities. Keycaps are the exception and stay at `-xs`: a keycap has to read as a key.

**Rows are inset rounded rects, not full-bleed bands.** Every list row and every sidebar row is
its own `-row` rect, inset `--wren-row-inset-x` with `--wren-row-gap` between neighbours, and
hover and selection fill *that rect*. The gap does the grouping, so the in-list hairline is
gone — which is what Family 1 asked for in the first place.

**Elevation** — a 1 px ring composed **with** a soft ambient shadow. The ring is what separates
a floating surface from the canvas; the blur only softens (`AMIE-STUDY.md` §4.2). Every tier
carries the ring as its first layer, and the blur alphas sit ~25% below where they were. In
light the ring is a dark hairline; in dark it is a *light* one, because against a black canvas
a dark ring is invisible. No `0 4px 4px` hard drops, ever.

`--wren-shadow-xs` → `-sm` → `-md` (menus) → `-lg` (popovers, toasts) → `-xl` (palette, sheets).

**Hairline recipe.** Always exactly `1px`. Never `0.5px` — Windows WebView2 at 100% DPI rounds
it to 0 or renders it blurry. Tune weight with *alpha*, not width. Pane separators use a real
`border-inline-end`. A surface that already carries a shadow tier must not also draw its own
`ring-1`: that is the ring twice, at two alphas.

---

## 7. Liquid glass

### The position

Apple's Liquid Glass adds true refraction — it distorts what sits behind it. On the web that
requires an SVG `feDisplacementMap` fed into `backdrop-filter`, which **only Chromium exposes**.
That would work in WebView2 and silently fail in WKWebView, and it costs a per-frame
rasterization of the displaced backdrop.

**Decision: Wren takes Liquid Glass's *material logic* — translucency, a specular edge, honest
depth ordering — and rejects its *refraction implementation*.** Glass here is
blur + saturate + edge sheen. No displacement maps. This ships identically on both engines.

### Recipes

`.glass` — menus, context menus, tooltips, toasts, the composer sheet:
`backdrop-filter: blur(20px) saturate(180%)`, tint `oklch(1 0 0 / 0.72)` light /
`oklch(0.262 0.015 268 / 0.68)` dark, `1px` inner light border, `inset 0 1px 0` sheen,
`--wren-shadow-lg`.

`.glass-strong` — command palette, onboarding cards:
`backdrop-filter: blur(32px) saturate(190%)`, tint `oklch(1 0 0 / 0.82)` /
`oklch(0.262 0.015 268 / 0.78)`, `--wren-shadow-xl`, plus a very low-opacity `feTurbulence`
noise layer to kill gradient banding across the large blurred area.

Both set `contain: paint` and `isolation: isolate` to bound rasterization and to stop a parent's
`opacity`/`transform` from hijacking the backdrop root.

### Where glass is allowed

**The command palette and the composer sheet. That is the whole list** (owner ruling,
2026-08-28). Both are lightened to sit with the new ~25% lighter depth.

Settings, onboarding, the "?" sheet, menus, tooltips and toasts all used to take glass and now
take the ring-plus-shadow recipe in §6 instead. Amie has zero `backdrop-filter` in its desktop
app; Wren keeps the material where it is genuinely a floating slab over live content, and drops
it everywhere it was decorating a card that could simply be opaque.

### Where glass is banned

**List rows stay solid.** So does the reading-pane body, the sidebar, every pane header, and any
scroll container or any child of one. Never behind body copy. Never nested inside other glass.

### WebView2 / WKWebView performance rules

1. **Max 2 concurrent glass layers.** A palette over a scrim is the budget. A third is a bug.
2. **Never on a scroll container, and never on a fixed element the page scrolls behind.** The
   backdrop re-rasterizes every frame; this is the documented source of Chromium scroll flicker.
3. **Never animate `backdrop-filter` or the blur radius.** Animate `opacity` and `transform`
   only. Blur animation is the single most reliable way to drop frames.
4. Keep the blurred area small. Blur cost scales with radius × area. Nothing over `blur(32px)`.
5. Do not set `will-change: backdrop-filter` permanently — it pins a GPU layer for the life of
   the element. Transient overlays do not need it.
6. Beware stacking: a parent with `opacity < 1`, `filter`, or `mix-blend-mode` becomes the
   backdrop root and the glass will blur the wrong thing. Glass mounts in a portal at the root.

### Fallbacks

```css
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .glass, .glass-strong { background: var(--wren-surface-raised); }
}
@media (prefers-reduced-transparency: reduce) { /* opaque raised surface, no blur */ }
@media (prefers-contrast: more) { /* opaque + full-strength hairline */ }
```

All three collapse to the same thing: an opaque `raised` surface with the same shadow and radius.
The layout never changes — only the material does.

---

## 8. Icons

Anron eventually; **lucide-react** tuned to approximate its rounded geometry in the interim.

- **Size grid: 16 / 18 / 20.** 16 inline with text and meta, 18 default for toolbars and menus,
  20 for sidebar nav and primary actions. Never 24 in chrome.
- **Stroke width 1.75** at 16 and 18; **1.5** at 20. Lucide's default 2 reads hard and mechanical
  next to Open Runde's soft terminals.
- `stroke-linecap: round`, `stroke-linejoin: round`, `vector-effect: non-scaling-stroke`.
- Every icon sits in a fixed `--wren-icon-box` (24px) slot with `flex-shrink: 0`, so rows align
  regardless of glyph width. Centre optically, not mathematically — chevrons and play triangles
  get a documented ±1 px nudge.
- Icons inherit the text tier they sit in. The only accent-coloured icons are active nav and the
  unread dot. Star uses the star hue.
- **Filled means selected.** Anron ships a `Style=Filled` twin for every glyph; Wren carries the
  four it actually toggles — `star`, `inbox`, `sent`, `trash` — in `ANRON_FILLED_PATHS`. A
  filled glyph is always *also* coloured (star hue, or accent for the current mailbox); Line is
  resting. A filled twin carries no stroke, or its 1.5 px outline would fatten every edge.
  Adding a fifth is a paste, not a decision. Glyphs with no twin never set `filled` — filling a
  Line path produces a blob for anything that is not a closed outline.

**Icon seam.** Every icon in the app is imported from a single `src/components/ui/icon.tsx`
mapping semantic names (`archive`, `snooze`, `unread`) to lucide components. No component
imports from `lucide-react` directly. The Anron swap is then a one-file change.

---

## 9. Motion

Three durations, two easings, one spring.

| Token | Value | Applies to |
|---|---|---|
| `--wren-dur-fast` | 120ms | hover, press, colour and fill changes, focus ring |
| `--wren-dur-base` | 200ms | menus, tooltips, tab switches, toasts |
| `--wren-dur-slow` | 320ms | sheets, command palette, pane transitions |

| Token | Curve | Applies to |
|---|---|---|
| `--wren-ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | entrances and nearly everything else |
| `--wren-ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | movement between two on-screen states |

**Spring** (command palette scale-in, composer sheet): Motion config
`{ type: 'spring', stiffness: 420, damping: 34, mass: 0.9 }`. CSS approximation
`--wren-ease-spring: cubic-bezier(0.34, 1.4, 0.64, 1)`. One spring in the whole app; if a second
is proposed, the answer is no.

Exits run at **0.7×** the entrance duration with `ease-in`. Palette enters at
`opacity 0 → 1, scale 0.96 → 1, translateY 8px → 0`.

**Reduced motion.** Under `prefers-reduced-motion: reduce`, all transform and size animation is
removed; a 120 ms opacity crossfade is retained, because an instant cut is its own kind of
jarring. Focus-ring transitions are never removed.

### The celebration register

**One confident pop, colour, and an emoji. Never a storm.** Three moments, and the whole budget
sits on the one that happens once. Spec: `AMIE-STUDY.md` §7(c).

| Moment | What happens | Particles |
|---|---|---|
| **Archive** | the row's avatar becomes a green disc with a check and pops once (320 ms); at 120 ms the row exits `translateX(-12px)` + opacity over 200 ms; rows below settle by the virtualizer's own `translateY` | **none** |
| **Send** | the arrow becomes a check, the button's fill crossfades to the green solid over 120 ms, and the button runs one 200 ms pop; the sheet exits at 200 ms | **none** |
| **Inbox zero** | one 56 px emoji from a five-deck, chosen by day-of-year, entering `scale 0.4 → 1.12 → 1` with an `-8deg` unwind | **18**, once |

Archive and send fire dozens of times a day, and **frequency is what kills delight** — a burst
on either would be wallpaper within the hour. `--wren-dur-celebrate` (520 ms) is the one
duration above `slow` and it is licensed for inbox zero and nothing else.

The burst is 18 WAAPI particles in one absolutely-positioned layer with `contain: strict`, one
`element.animate()` each, three keyframes encoding a ballistic arc so nothing integrates a
position per frame. It tears itself down on the last `finish`. Peak cost: 19 nodes for 0.6 s.

**The frequency guard is not optional.** Once per transition to zero, never twice inside 60 s,
and never on the first mount of an already-empty inbox. It is the part most likely to be
dropped in implementation and the part that decides whether this is charming or infuriating.

**Reduced motion gets the static end state, and the particle layer is never mounted at all.**
Making it invisible is not the same thing — it would still animate nineteen nodes on a machine
that asked for none. Every celebration animates `transform` and `opacity` only.

**A mail action is never lost to an animation.** The archive tick holds its mutation for exactly
the length of the animation and flushes on unmount, the same guarantee the composer's held send
makes.

---

## 10. Do / don't — the shell lane gate

1. **Do** put every measurement on the 4 px grid. Hairlines and documented optical nudges are the
   only exceptions. A stray `13px` padding fails review.
2. **Don't** ship a left accent sliver, stripe, or bar on any row or card, ever. Use a wash plus
   top/bottom hairlines, or a dot in the gutter.
2b. **Don't** spend a category hue on chrome. They bind to a Gmail label and to the sender-avatar
   hash, and to nothing else. One decoration and "one accent" becomes "no accent".
3. **Don't** carry over any MetaDAO styling, token, colour, or component. Everything here derives
   from the reference set.
4. **Do** keep list rows fully opaque. Glass is the palette and the composer, and nothing else.
5. **Don't** exceed two concurrent glass layers, or put glass on anything that scrolls.
6. **Do** use `--primary` for the brand accent. `--accent` is shadcn's hover fill — different thing.
7. **Do** give every list a fixed sender column so subjects align at the same x.
8. **Do** set `tabular-nums` on every number that can change: times, counts, sizes.
9. **Don't** introduce a second accent hue, a gradient surface, or a density toggle.
10. **Do** import icons only from `src/components/ui/icon.tsx`, so the Anron swap stays one file.
