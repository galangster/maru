# Amie — visual study and Wren translation

Lane: design study. **Status: SHIPPED 2026-08-28**, with four owner rulings and two
contrast corrections. This file is kept as the *why* behind the deltas; `DIRECTION.md`
is the current law and wins any disagreement.

**Applied in full:** the de-tinted neutral ramp (§2.1, §2.3), the eight-hue category family
bound to labels and the avatar hash (§2.2, §7d.5), the eyebrow role and the xs tracking change
(§3), the desktop radius scale and `--wren-radius-row` (§4.1), the ring-plus-shadow elevation
tiers (§4.2), inset rounded rows with no in-group divider (§5), pill buttons and badges, the
sidebar's inline count, the composer's field wells, the settings tiles, and all three
celebrations (§7c.1–3) with their frequency guards.

**Owner rulings that override this document:**

1. **Accent holds at hue 268.** §7(e) question 1 is answered "no" — the accent is Wren's
   identity anchor. The hue family's *blue* still sits at 258; it is a category, not the brand.
2. **Glass is the command palette and the composer, and nothing else.** §7(d).8 recommended
   keeping it broadly; the ruling narrows it and lightens what remains. Settings, onboarding
   and the "?" sheet took the ring recipe this document itself proposes.
3. **Filled icons carry state.** Anron `Style=Filled` twins ship for `star`, `inbox`, `sent`
   and `trash`. Filled plus colour is selected; Line is resting.
4. **Subject-emoji inference (§7c.4) is deferred.** Not built. It returns later as an
   off-by-default toggle, which answers §7(e) question 3 by not asking it yet.

**Two corrections this document's own instruction ("re-derive, do not trust the hexes")
required:**

- `--wren-star` **holds** at `oklch(0.63 0.15 58)`. The proposed `oklch(0.72 0.155 80)` is
  outside sRGB and measures 2.52:1 on white, under the 3.0 a non-text mark needs.
- Every hue chroma is clamped to the sRGB boundary for its lightness (teal, orange and yellow
  in light; five of eight inks in dark), and the ink on a hue solid is a fixed dark
  `--wren-hue-fg` rather than Amie's white, which fails 3:1 on four of the eight solids.
Source: Mobbin, 36 Amie screens read directly — 30 iOS, 6 web/desktop.
Diffed against: `docs/design/DIRECTION.md` and `src/styles/tokens.css` as of 2026-08-28.

**Colour values below are read off rendered Mobbin captures, not from Amie's stylesheet.**
They are accurate to roughly ±0.01 L and ±0.01 C. Every hex is written `≈`. The
implementation lane must round-trip each OKLCH value through a converter and
re-run the contrast table before shipping; do not copy the hexes as gospel.

Wren keeps regardless of anything here: Open Runde 500/600 + DM Sans 400/500,
Anron Line icons, the three-pane mail layout, light + dark themes, the 4 px grid.

---

## 1. What Amie actually is, visually

Two different densities under one identity.

- **iOS** — generous. Radius 12–24, 48 px rows, big pill buttons, a floating black
  dock. Reads as a toy in the good sense.
- **Web/desktop** — dense and tight. Radius 4–8, 24 px todo rows, a 32 px icon rail,
  keycap chips everywhere. Reads as a pro tool.

Wren is desktop, so the **web register is the one to translate** and the iOS register
is where the *personality* lives. The study takes shape and density from web, and
colour, emoji and celebration from iOS.

The single most important finding: **Amie's fun does not come from its typeface, its
shadows, or from confetti.** It comes from four things — a large user-assigned hue
family, emoji promoted into first-class content, hand-drawn marks in onboarding, and
exactly one confident pop per action. In 36 screens I found **no particle burst**. I
am not going to invent one and attribute it to them. Wren's celebration spec below is
written *in* their register, and where it adds a burst it says so as a Wren decision.

---

## 2. Palette

### 2.1 Light — neutrals

Amie's greys are **achromatic**. There is no hue tint in the ramp at all. This is the
clearest single delta from Wren, whose whole neutral ramp is periwinkle-tinted at
hue 268 / chroma 0.006–0.020.

| Role | Amie ≈ hex | OKLCH | Wren today |
|---|---|---|---|
| canvas / base | `#F4F4F5` | `0.968 0.002 286` | `0.967 0.006 268` |
| well / sunken (form fields, inputs) | `#EDEDEF` | `0.949 0.003 286` | `0.945 0.008 268` |
| surface (cards, list rows, sheets) | `#FFFFFF` | `1 0 0` | same |
| raised (popover, toast) | `#FFFFFF` | `1 0 0` | same |
| hairline | `#E6E6E9` | `0.923 0.003 286` | `0.905 0.010 268` |
| text primary | `#141416` | `0.205 0.004 286` | `0.235 0.020 268` |
| text secondary | `#6B6B70` | `≈0.500 0.004 286` | `0.470 0.019 268` |
| text meta | `#9A9A9F` | `≈0.680 0.004 286` | `0.535 0.017 268` |

Two honest notes. Amie's primary text is **blacker** than Wren's — nearly pure
neutral black, not a soft charcoal. And Amie's meta tier is **far lighter** than
Wren's: their timestamps measure roughly **2.8:1** on white, well under AA. That is a
defect, not a style, and Wren does not take it (see §7).

### 2.2 The accent family — the headline finding

**Amie runs eight accents, not one.** They are a fixed set of *list colours* the user
assigns: green, teal/cyan, blue, violet, magenta/pink, red/coral, orange, yellow,
plus a neutral grey for "Other". Sampled off the ring icons, checkbox fills, settings
tiles and event blocks:

| Hue | Amie ≈ hex | Where seen |
|---|---|---|
| green | `#22C55E` | Work ring, completed checkbox, toast success mark |
| teal / cyan | `#22C6E0` | "Confirm" button in the time picker, notifications |
| blue | `#3B82F6` | web "Share" button, the AI send button, Accounts tile |
| violet | `#8B5CF6` | Family ring, Events settings tile |
| magenta / pink | `#EC4899` | Personal ring, Integrations tile |
| red / coral | `#F43F5E` | Travel ring, Delete, priority flag, Log out tile |
| orange | `#F97316` | avatar, Notifications tile, "Moved to" toast mark |
| yellow / amber | `#FACC15` | House ring, Calendars tile, birthday event |

Critically, these are **identity, not brand**. The brand element — the primary CTA —
is *black* on iOS (`#1C1C1E` pill) and *blue* on web. The eight hues never decorate
chrome; they always stand for a thing the user named.

Each hue appears in three states, which is the pattern worth stealing verbatim:

1. **Solid** — the 16–20 px ring, dot, or filled checkbox. Full saturation.
2. **Wash** — the event block fill: the same hue at roughly **10–14% alpha** in light.
3. **Ink** — the label text sitting on the wash: the same hue pushed dark, roughly
   L 0.47–0.54, so it stays legible on its own wash.

### 2.3 Dark

Amie's dark is a **true black-based** dark, more contrasty than Wren's.

| Role | Amie ≈ hex | OKLCH |
|---|---|---|
| base | `#0A0A0B` | `0.145 0.002 286` |
| sunken | `#000000` | `0 0 0` |
| surface (row card) | `#1C1C1F` | `0.235 0.003 286` |
| raised | `#28282C` | `0.295 0.004 286` |
| hairline | white @ ~8% | `1 0 0 / 0.08` |
| text primary | `#F5F5F6` | `0.968 0.001 286` |

Their dark-mode rule for colour is notable and counter-intuitive: **the saturated
solids do not mute.** The settings tiles stay fully saturated in dark; if anything
they lift slightly. What changes is the *wash* — the pastel event fills become
low-lightness washes of the same hue at higher alpha (~20–22%), with the ink flipping
to a **light** tint of the hue rather than a dark one. Wren's dark accent already
follows this logic; the family should too.

---

## 3. Type

**Identity.** Amie's UI face is a neutral grotesque — Inter / SF Pro territory.
Slightly humanist `g`, closed apertures, no rounded terminals, tight negative tracking
on headlines, and heavy weight doing the hierarchy work. The **all-caps eyebrow** is
their most distinctive typographic move: 11 px, ~700, wide positive tracking, and set
in a *saturated hue* rather than grey (`CUSTOMIZATION` in amber, `ACCOUNTS` in violet,
`PUSH NOTIFICATIONS` in cyan). Inside sheets the same eyebrow appears in grey at ~10 px
above every field well.

Weights in use: roughly 400 body, 500 rows, 600 titles, 700 eyebrows.
Sizes: ~10 / 11 / 12 / 13 / 15 / 17 / 20 / 28 on iOS; ~11 / 12 / 13 on web, where the
whole app lives in three sizes.

**Verdict on Open Runde + DM Sans: keep both, re-role. Do not replace.**

Reasoning, stated plainly rather than deferentially. Amie's letterforms are the *least*
playful part of Amie — the personality is carried entirely by colour, emoji and shape.
Swapping Open Runde for a neutral grotesque to "match Amie" would trade away Wren's
one soft-terminal asset and buy nothing, because the thing that makes Amie feel fun
would still be missing. Open Runde is *closer to Amie's intent* than Inter is. Keep it.

If the owner ever does want the grotesque, the open-licensed candidates are
**Inter** (OFL, Google Fonts) or **Geist Sans** (OFL). Neither is recommended here.

Re-role instead:

- **Open Runde 600** picks up the eyebrow role (all-caps, +0.06em, saturated hue) and
  the pane titles. It already owns buttons, sender names and chrome.
- **Open Runde 500** picks up counts and keycaps from DM Sans, because Amie's numerals
  sit in the UI voice, not the body voice.
- **DM Sans 400/500** narrows to exactly what it is good at: message body, snippet,
  timestamps, form values.

Scale change: **one**. `--text-xs--letter-spacing` goes `0.01em → 0.02em`, because the
xs tier now carries the all-caps eyebrow and 0.01em is too tight for caps. Every size
and line-height stays as-is; they are already verified and Amie gives no reason to move
them.

---

## 4. Shape and depth

### 4.1 Radius, measured

| Element | Amie iOS | Amie web |
|---|---|---|
| list row card | 14 | 6 (hover fill) |
| card / panel | 14–16 | 8 |
| sheet / modal top | 20–24 | 8 |
| input, field well | 12 | 8 |
| primary button | 14 (h 52) | 6 (h 28) |
| chip / badge / keycap | 999 | 4–6 |
| nav dock, pill nav | 999 | — |
| checkbox | 6 (box 20) | 999 (circle 16) |
| settings icon tile | 9 (box 28) | — |
| calendar event block | 8 | 4–6 |

Character: **generous on mobile, tight on desktop, pills used liberally for anything
that is a button or a badge.** Wren's current scale (6/8/12/16/20/28) is a mobile scale
wearing a desktop app. The 28 px palette radius in particular reads as an iOS sheet on
a 640 px floating card.

### 4.2 Depth

Amie's depth is **much lighter than Wren's**, and it is composed differently:

- In-pane elements have essentially **no shadow**. A list row card on iOS is
  `0 1px 3px rgba(0,0,0,0.05)` — barely present. Depth comes from the white-on-grey
  fill step, exactly as DIRECTION already argues.
- Floating surfaces on web compose **a 1 px hairline ring together with the shadow**:
  approximately `0 0 0 1px #E6E6E9, 0 1px 2px rgba(0,0,0,0.05), 0 8px 24px rgba(0,0,0,0.08)`.
  The ring is what actually separates the toast from the calendar behind it; the blur
  only softens.
- There is **no `backdrop-filter` anywhere in the desktop app.** Zero glass. iOS sheets
  dim with a flat grey scrim.

Estimated tiers, translated: contact `0 1px 2px @ 3–4%`, ambient `0 8px 20px @ 6%`,
overlay `0 20px 48px @ 10%`, each with a `0 0 0 1px @ 5%` ring. That is roughly
**25–30% less alpha than Wren carries today**, plus a ring Wren does not have.

---

## 5. Density and row anatomy

**iOS list row** — 48 px tall, 12 px horizontal padding, its own rounded rect at
radius 14, separated from its neighbours by a **4 px gap**. No dividers anywhere.
Anatomy: 20 px colour ring · label at 15/500 · **count in grey immediately after the
label, not right-aligned** · chevron in a fixed right slot.

That count-after-label detail is a small, very Amie move: `Work 4`, the 4 muted and
inline. It reads as part of the name rather than as a metric.

**Web todo row** — ~24 px tall, 8 px padding, 16 px circular checkbox at 1.5 px stroke,
title at 12–13 px, right-aligned date in ~11 px muted, priority flag inline in red.
Hover paints a light grey rounded rect at radius 6. Section headers are `No date 1`,
`Later 2`, `Completed 0` — sentence case, muted, small, with a disclosure chevron and
an inline count.

**Web expanded row** — the row lifts into a floating white card with a shadow, layered
over the list, carrying an inline chip bar (`Subtodo` · `60m` · colour dot · `Repeat` · `…`).
The row does not push its neighbours; it floats.

**Sheet field group** — tiny grey all-caps label above each field well, wells in
`#EDEDEF` at radius 12, ~16 px vertical rhythm between groups.

The transferable lesson for Wren is the **inset rounded row**: every row is its own
rounded rect with a small gap, hover and selection fill that rect, and no divider is
needed at all. This is independently what DIRECTION already wanted from the Family
reference, and it is strictly better than the current inset-hairline approach.

---

## 6. Motion and fun — the catalogue

What I actually observed, with physics estimated from the captures and from how these
interactions conventionally behave. Marked honestly where it is inference.

1. **Todo completion.** Circle → green filled disc with a white check. Observed
   states, inferred physics: disc scales ~1 → 1.3 → 1 over ~250 ms with overshoot; the
   check strokes in over ~150 ms. The row then greys, strikes through, and migrates to
   a `Completed` / `Hide 1 done` group. **This is Amie's single most-used celebration
   and it is one pop.** No particles.
2. **Emoji as content.** Users and Amie's own inference put emoji directly in titles:
   `Lunch 🎪`, `Make dinner for 4 🍩`, `Jane's Birthday 🎂`, `Lunch at resto with Bill 🍽️`.
   This is the highest-leverage, lowest-cost thing in the entire study — it makes every
   screen feel fun, not just the milestone screens.
3. **Undo toast.** Web: bottom-right, white, radius 8, hairline ring + soft shadow,
   green check disc, two lines (`Updated: Event brief with Sam` / `Guests got a
   notification`), an `Undo` button with a **`⌘Z` keycap chip** beside it. iOS: same
   pattern anchored top, orange arrow disc, `Undo` pill. Steal this verbatim.
4. **The dock pill.** The floating black nav pill morphs between states — `Todos` ↔
   `Calendar` ↔ a two-up `Event | Todo` segmented control. A shared-element width morph,
   not a crossfade.
5. **Onboarding hero.** Todo cards tumbled at random rotations across the canvas, a
   hand-drawn green arrow, and a handwritten annotation in a green highlighter blob
   (`Hey you, You're invited to drop #1.`). Hand-drawn marks, not vector polish.
6. **3D glossy squircles** on the paywall — rendered tactile objects, with the app icon
   as a physical thing. Personality as a first-class onboarding *step* (`What app icon
   do you want?` — Peachy / Gray / Black).
7. **Bulk-select bar.** A floating white pill bar with actions each carrying a keycap:
   `Done D`, `Priority P`, `Apr 18 H`, `Today K`.
8. **Progress rings.** List avatars are partial arcs, not full circles — the ring shows
   completion for that list.

**Register, stated as a rule:** one confident pop, colour, and an emoji. Never a storm.

---

## 7. Wren translation

### (a) Token diffs — see `tokens-proposal.css` for the applyable file

**Neutrals, light** — de-tint the whole ramp, blacken primary text.

| Token | Old | New |
|---|---|---|
| `--wren-surface-base` | `oklch(0.967 0.006 268)` | `oklch(0.968 0.002 286)` |
| `--wren-surface-sunken` | `oklch(0.945 0.008 268)` | `oklch(0.949 0.003 286)` |
| `--wren-hairline` | `oklch(0.905 0.010 268)` | `oklch(0.923 0.003 286)` |
| `--wren-hairline-strong` | `oklch(0.86 0.012 268)` | `oklch(0.872 0.004 286)` |
| `--wren-text-1` | `oklch(0.235 0.02 268)` | `oklch(0.205 0.004 286)` |
| `--wren-text-2` | `oklch(0.47 0.019 268)` | `oklch(0.470 0.004 286)` |
| `--wren-text-3` | `oklch(0.535 0.017 268)` | `oklch(0.535 0.004 286)` |

**Deliberate constraint: text-2 and text-3 keep their lightness exactly.** Only chroma
and hue move. That preserves the verified AA table in DIRECTION §3 essentially
unchanged and refuses Amie's under-contrast meta tier. text-1 only ever gets darker,
which is strictly safe. This is the one place the study declines to match Amie.

**Neutrals, dark** — go blacker, matching Amie's true-black base.

| Token | Old | New |
|---|---|---|
| `--wren-surface-base` | `oklch(0.185 0.013 268)` | `oklch(0.160 0.003 286)` |
| `--wren-surface-sunken` | `oklch(0.155 0.012 268)` | `oklch(0.110 0.002 286)` |
| `--wren-surface` | `oklch(0.222 0.014 268)` | `oklch(0.225 0.004 286)` |
| `--wren-surface-raised` | `oklch(0.262 0.015 268)` | `oklch(0.285 0.005 286)` |
| `--wren-text-1` | `oklch(0.966 0.004 268)` | `oklch(0.968 0.002 286)` |
| `--wren-text-2` | `oklch(0.742 0.014 268)` | `oklch(0.742 0.004 286)` |
| `--wren-text-3` | `oklch(0.66 0.016 268)` | `oklch(0.660 0.004 286)` |

Dark text tiers keep their lightness for the same reason. `surface-raised` lifts
0.262 → 0.285 so the fill step is still readable against the darker base.

**Accent** — a small hue nudge toward Amie's internet blue, or no change.

| Token | Old | Proposed |
|---|---|---|
| `--wren-accent` (light) | `oklch(0.545 0.185 268)` ≈ `#4364DA` | `oklch(0.550 0.192 258)` ≈ `#2C68E8` |
| `--wren-accent-hover` (light) | `oklch(0.495 0.185 268)` | `oklch(0.500 0.192 258)` |
| `--wren-accent` (dark) | `oklch(0.745 0.12 268)` | `oklch(0.750 0.125 258)` |
| `--wren-accent-hover` (dark) | `oklch(0.815 0.09 268)` | `oklch(0.818 0.095 258)` |

Lightness is held so white-on-accent stays ≈5.1:1. This is a genuinely small delta and
it is offered as owner question 1, not asserted. **The accent is not where Amie lives.**

**New: the category hue family.** This is the substantive addition. Eight hues × three
states, replacing the vestigial `--chart-1..5`, which nothing in Wren reads
meaningfully. Values in `tokens-proposal.css` §4. Light solids sit at L ≈ 0.61–0.72
with per-hue lightness compensation (yellow and orange run lighter — a fixed-L rainbow
is a myth, not a system); inks at L ≈ 0.47–0.54 so they clear 4.5:1 on white; washes
are the solid at 12% light / 22% dark.

**Radius** — retune from mobile to desktop.

| Token | Old | New | Why |
|---|---|---|---|
| `--wren-radius-xs` | 6 | 6 | keep — chips, badges, keycaps |
| `--wren-radius-sm` | 8 | 8 | keep — inputs, small buttons |
| `--wren-radius-md` | 12 | 12 | keep — buttons, menu items |
| `--wren-radius-lg` | 16 | **14** | Amie's card radius, measured |
| `--wren-radius-xl` | 20 | **18** | sheets, popovers |
| `--wren-radius-2xl` | 28 | **24** | 28 reads as an iOS sheet on a 640 px palette |
| `--wren-radius-row` | — | **10 (new)** | the inset list-row rect |
| `--wren-radius-full` | 999 | 999 | keep |

**Shadow** — lighter, and each tier gains Amie's 1 px ring as its first layer. Alphas
drop roughly 25%. Full recipes in the proposal file. The ring is what makes a toast
read as floating without a heavy blur, and it is what Wren's non-glass fallback path
has been missing.

**Motion** — three additions, no doctrine breakage:

| Token | Value | Note |
|---|---|---|
| `--wren-pop` | `1.28 → 1.32` | Amie's completion pop is bigger |
| `--wren-dur-celebrate` | `520ms` (new) | the one duration above `slow`, milestone only |
| `--wren-hue-*` washes | — | see family |

**No second spring.** DIRECTION §9 permits exactly one, `{stiffness: 420, damping: 34,
mass: 0.9}`. The celebrations below get their bounce from keyframe overshoot inside
that spring, never from a second config.

### (b) Surface by surface

**Sidebar.** Adopt Amie's list-row anatomy directly: 20 px hue ring (from the label's
assigned `--wren-hue-*`) · label at Open Runde 500 · **count in `text-3` inline right
after the label**, not right-aligned · chevron in the fixed 24 px slot. Rows become
inset rounded rects at `--wren-radius-row`, 4 px apart, hover and active fill the rect.
Section headers take the new saturated eyebrow role at `--text-xs` / 600 / +0.02em.

**List rows.** Keep 68 px, keep the 152 px fixed sender column, keep opaque. Change
three things: (1) inset the row 8 px and round it to `--wren-radius-row`, drop the
inset-hairline divider entirely — the gap does the grouping, per Family and per Amie;
(2) hover and selection fill the *rounded* rect, so selection finally has a shape;
(3) the leading avatar takes its hue from the family via a stable hash of the sender
address, replacing whatever ad-hoc colour it uses now. Optional per question 3: a
14 px inferred emoji sits before the subject.

**Reading pane.** Header gets the eyebrow treatment for `FROM` / `TO` / `SUBJECT`-class
metadata at `--text-xs` 600 in `text-3`. Labels render as hue chips: wash background,
ink text, `--wren-radius-xs`, 20 px tall. Body copy untouched — 68ch, DM Sans, no tint,
ever. The action bar keeps its equal-width tiles and gains `--wren-radius-md`.

**Composer.** Field wells adopt Amie's sheet pattern: `--wren-surface-sunken` fill,
`--wren-radius-md`, tiny grey eyebrow above each, no borders. Send button stays accent;
its celebration is in (c). Sheet radius follows `--wren-radius-xl` (now 18).

**Command palette.** Radius `--wren-radius-2xl` (now 24). Keep the glass, keep the
keycap footer. Amie's contribution here is the **bulk-action bar**: when rows are
multi-selected, a floating pill bar appears with each action carrying its keycap
(`Archive E`, `Snooze H`, `Read U`), radius 999, `--wren-shadow-lg`.

**Settings.** Take Amie's coloured tile pattern wholesale — a 28 px squircle at
`--wren-radius-sm` filled with a `--wren-hue-*` solid, white Anron glyph inside, label,
chevron. Group into one card with hairline dividers under small muted eyebrows. It is
the cheapest place in the app to buy a lot of personality.

**Toasts.** Rebuild to Amie's exact anatomy: hue-solid disc mark · two lines (what
happened / consequence) · `Undo` button · **keycap chip showing `⌘Z`**. Bottom-left,
`--wren-radius-sm`, `--wren-shadow-lg` with its new ring.

### (c) Celebration spec for mail

Constraints binding every item: transform and opacity only; ≤24 DOM particles or a
single canvas; total ≤600 ms; WAAPI so the work is composited off the main thread;
reduced motion swaps to a static end-state; every effect carries a frequency guard.

**1 — Archive tick.** *No particles.* Archive fires forty times a day; a burst would
become wallpaper within an hour, and Amie's own most-repeated action is a single pop.

- Trigger: `e`, the toolbar archive, or a swipe, on one thread.
- Recipe: the row's avatar crossfades to a disc filled `--wren-hue-green` carrying a
  white check; the disc runs `scale 0.7 → 1.32 → 1` over **260 ms** on the app spring
  via keyframe overshoot. At 120 ms the row begins its exit: `translateX(-12px)` +
  `opacity → 0` over **200 ms** on `--wren-ease-in`. Rows below settle by FLIP
  `translateY` over 200 ms — transform only, never `height`.
- Toast: `Archived` · `Moved to All Mail` · `Undo` · `⌘Z` keycap.
- Reduced motion: no scale, no translate. The check disc crossfades in over 120 ms and
  the row crossfades out. Nothing moves.

**2 — Inbox zero.** This is where the budget gets spent, because it happens once.

- Trigger: the inbox unread count transitions **to** 0 while the Inbox folder is
  mounted and visible. Never on first mount of an already-empty inbox — that gets the
  static empty state and nothing else.
- Emoji: one 56 px glyph from a small fixed deck (🎉 🌤️ 🥳 🧘 🍃), chosen
  deterministically from the day-of-year so it varies without being random noise.
  Enters `scale 0.4 → 1.12 → 1`, `rotate -8deg → 0`, **420 ms**, app spring, overshoot
  in the keyframes.
- Burst: **18 particles**, each a 6–10 px filled circle drawn from `--wren-hue-*`
  (three of the eighteen may be 12 px emoji glyphs). One absolutely-positioned layer
  with `contain: strict` and `pointer-events: none`; one `element.animate()` per
  particle; three keyframes each encoding a ballistic arc (140° upward emission,
  180–320 px/s initial, ≈900 px/s² gravity baked into the keyframe offsets — no
  per-frame JS anywhere). **560 ms**, stagger 0–60 ms. The layer removes itself on the
  last `finish` event. Peak DOM cost: 19 nodes, for 0.6 s.
- Copy: `Inbox zero.` + a one-line subtitle, fading up 8 px at a 120 ms delay — the
  Family "every card carries a why" rule from DIRECTION §2.
- Frequency guard: at most once per transition, and never twice inside 60 s. A session
  flag prevents re-fire on pane remount, refetch, or window focus. This guard is the
  part most likely to be dropped in implementation and it is the part that decides
  whether the feature is charming or infuriating.
- Reduced motion: emoji at final scale and rotation, **zero particles**, headline
  crossfade at 120 ms.

**3 — Send.** The button is the celebration; the sheet exit is the punctuation.

- Trigger: send resolves successfully.
- Recipe: the send button's Anron arrow crossfades to a check, the button fill
  transitions to `--wren-hue-green` over 120 ms, and the button runs
  `scale 1 → 1.12 → 1` over **240 ms** on the app spring. At 200 ms the composer exits:
  `translateY(16px)` + `scale(0.98)` + `opacity → 0` over **224 ms**, which is 0.7× the
  320 ms entrance, per DIRECTION §9.
- Toast: `Sent` · recipient · `Undo` · `⌘Z`, with a 5 s undo window.
- *No particles.* Same reasoning as archive — frequency kills delight.
- Reduced motion: colour change and check swap only, both as 120 ms crossfades.

**4 — Subject emoji (the real one).** Not a milestone, and the highest-value item in
this document. Infer a leading emoji for a thread from its subject using a **static
local keyword map** of roughly 120 entries — never a network call, never a model call.
Render at 14 px before the subject in the list row, 20 px in the reading-pane header.
Falls back to nothing, silently, on no match. Settings toggle, default per question 3.
This is what makes Wren feel like Amie on every screen rather than twice a week.

### (d) What Wren does not take from Amie, and why

1. **The saturated left rule on event blocks.** Amie's calendar blocks carry a colour
   bar down their left edge. Nick's ratified rule bans left slivers outright. Use the
   wash plus hue ink instead — which is what Amie's *todo* rows already do.
2. **Amie's meta contrast.** Their timestamps measure ≈2.8:1. Wren's `text-3` holds its
   lightness and its AA margin. This is the one deliberate refusal in the palette.
3. **Tinting a row behind text.** Amie fills whole event blocks including their titles.
   Wren's message rows stay opaque and untinted — DIRECTION's no-row-tint rule and the
   a11y fixes from the 2026-08-28 UI review both depend on it. Hue lives in the avatar,
   the label chip, and the settings tile. Never behind a subject line.
4. **The 24 px desktop row.** That density serves one-line todos. A mail row carries
   sender, subject and snippet; 68 px stays, and so does the 152 px sender column.
5. **Eight hues as decoration.** Amie's hues are *user-assigned identity*. In Wren they
   bind to real Gmail labels and to the sender-avatar hash, and to nothing else. The
   moment a hue decorates chrome, "one accent" becomes "no accent" and DIRECTION §1's
   near-monochrome-at-rest promise is gone.
6. **Everything calendar-shaped**: the time grid, the all-day rail, the now-line,
   drag-to-create, duration chips, the week/month switcher. None of it has a mail analogue.
7. **The black primary button.** On iOS it reads as friendly. On a three-pane desktop
   app a black filled button reads as a blocking modal CTA. Wren's primary stays accent.
8. **Deleting the glass system.** Amie has zero `backdrop-filter`. That is a mobile
   constraint, not a considered position. Wren's glass is ratified, cross-engine tested,
   and cheap at two layers. Recommendation is to keep it — raised as question 2.

### (e) Open questions for the owner

1. **Accent.** Hold periwinkle indigo `#4364DA`, or take Amie's cooler internet blue
   `≈#2C68E8` (hue 268 → 258)? The category hue family lands either way; this only moves
   the brand mark and the focus ring. My recommendation: **nudge it**, because the
   de-tinted neutral ramp makes the current periwinkle read slightly purple by contrast.
2. **Glass.** Keep Wren's ratified glass on floating surfaces (my recommendation), or
   flatten to Amie's opaque-card-plus-hairline-ring everywhere? The proposal file adds
   the ring to the shadow tiers either way, so the flat path is already half-built.
3. **Subject emoji.** On by default, or opt-in? It is the single biggest fun lever and
   the only one that touches every screen — but it also writes glyphs into a work inbox
   without being asked.
