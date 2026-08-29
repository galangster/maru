# Wren — Magic

Owner: Nick. Lane: design research. Status: proposal, not ratified.
Companion to `DIRECTION.md`. Everything here **extends** DIRECTION; nothing here overrides it.
Where a proposal touches a DIRECTION rule, the tension is named out loud and left for the owner.

House craft bar cited throughout: `surfaces`, `better-ui`, `ui-polish`, `animations`,
`emil-design-engineering`.

---

## 1. Thesis

Polished is the absence of defects; magical is the presence of an authored moment — and the two
come from opposite disciplines. Polish is uniform: every corner concentric, every number tabular,
every transition 200 ms and interruptible. Magic is *deliberately non-uniform*. Family names the
mechanism outright as a **Delight-Impact Curve**: the less often a user hits a surface, the more
the product may spend there — a QR tap gets a ripple, a wallet backup gets confetti, and the tab
bar, hit a hundred times a day, gets only directional motion telling you where you came from
([benji.org](https://benji.org/family-values)). Linear reaches the same place from the other side,
softening borders and dimming the sidebar on the principle that *"structure should be felt not
seen"* and *"if most people don't immediately notice what changed, that's probably a good sign"*
([linear.app](https://linear.app/now/behind-the-latest-design-refresh)). So the formula is not
"add motion." It is: **spend nothing on the ninety-nine percent so you can spend conspicuously on
the one percent.** In a mail client the ninety-nine percent is `j`/`k`, opening a thread and
archiving — those stay at zero cost, because `animations` rules that a 100×/day interaction gets
no animation at all. The one percent is send, inbox-zero, first launch, the palette and the undo
window. That is where Wren buys its class. The heaviness Nick fears comes almost entirely from
spending on the wrong ninety-nine.

---

## 2. Pattern catalog

**1. Delight-Impact Curve — Family.** Delight budget is allocated inversely to frequency.
Trash gets a skeuomorphic tumble plus sound; backup completion gets confetti; stealth mode gets a
shimmer. Tab switching gets nothing but direction.
*Why:* rationing makes the rare moment read as a reward rather than as friction.
*Cost:* near zero — the expensive moments almost never fire. The risk is discipline, not ms.

**2. Directional tab motion — Family.** Tapping a tab to the left animates content leftward;
right animates rightward. Pure spatial information, no decoration.
*Why:* preserves the user's mental map for free — motion answers "where did this come from?"
*Cost:* one signed integer of state. Annoyance risk is real if the travel exceeds ~8 px.

**3. Shared-letter label morph — Family.** "Continue" → "Confirm" morphs on the shared "Con"
rather than crossfading the whole word. Number commas slide place-to-place as digits are typed.
*Why:* it says the label *changed* rather than *was replaced* — continuity of identity.
*Cost:* high build cost, needs per-glyph layout. Only worth it on a button pressed once a flow.

**4. Magic Plus — Things 3.** A single button you can *drag* to a destination; dropping it on a
list, a date, or the Inbox changes what gets created. Taptic feedback on pickup.
*Why:* one control absorbs six commands, and the drag makes the destination explicit.
*Cost:* substantial engineering; discoverability depends on onboarding.

**5. Pop-out on pickup — Things 3.** Long-pressing a row lifts it out of the list (scale + shadow
step) and the rest of the list settles around it; tapping a task pops it into a card while the
list behind fades.
*Why:* the element you are manipulating is unambiguously the one that moved.
*Cost:* incompatible with naive virtualized lists — the lifted node must escape the clip.

**6. Rubber-banding at limits — Things 3.** Resizing a pane past its clamp does not stop dead; it
resists and springs back.
*Why:* the constraint is communicated as physics, not as a dead edge, and costs nothing to a user
who never hits the limit. *Cost:* low. Must be capped (~8–12 px) or it reads as a bug.

**7. Help tags that animate in — Things 3.** Tooltips arrive with their keyboard shortcut
attached, teaching the faster path at the moment of the slower one.
*Why:* delight and pedagogy in one object. *Cost:* low, but the first-tooltip delay must be shared
across siblings (`animations`).

**8. Invisible refresh — Linear.** Borders rounded and de-contrasted, icons reduced in count and
size, sidebar dimmed a few notches, colored icon backgrounds removed, tabs compacted.
*Why:* removing weight is the cheapest way to look expensive. *Cost:* zero runtime — the highest
impact-per-gram pattern in the catalog.

**9. Sub-industry-norm durations — Linear.** Transition defaults sit well below the common
200–300 ms, and motion says where a thing came from rather than decorating
([performance.dev](https://performance.dev/how-is-linear-so-fast-a-technical-breakdown)).
*Why:* perceived speed *is* the luxury signal in a keyboard-driven tool. *Cost:* none, it is a
subtraction.

**10. Speed as the product — Superhuman.** 50 ms response budget, keyboard-first, archive
animates but never blocks, and every destructive action is fronted by an inline UNDO toast.
*Why:* an undo affordance is what licenses instant, un-confirmed action. The magic is the
*absence* of a confirm dialog.
*Cost:* requires optimistic mutation and a real rollback path — engineering, not design.

**11. Attention-cued sound — Arc.** A soft pulse when a tab auto-suspends: information delivered
to a user who is not looking at that pixel.
*Why:* sound carries state to peripheral attention, which no visual can do. *Cost:* the highest
annoyance risk in this document. Needs frequency guards, default-off, and a settings toggle.

**12. Native inertia, and the system under it — Copilot Money.** Ex-Apple team; the founder's
position is that native interaction is felt *"the moment you start interacting with it"*
([developer.apple.com](https://developer.apple.com/articles/copilot-money)) — the class signal is
latency and inertia, not ornament. Their own account also records that building *without* a design
system produced rebuilt UI and inconsistency ([Matt Ström-Awn](https://mattstromawn.com/projects/copilotmoney/)).
*Why:* magic does not survive without a token layer to keep it consistent.
*Cost:* on the web, composite-only animation plus virtualization discipline. Wren has already paid
the system half — `tokens.css` and `lib/motion.ts` — which is why the moments below are cheap.

**13. Completion as a fully-authored beat — Things 3 / Family.** A checkbox fill, a settle, a
list close-up, and (on Family) confetti reserved for once-per-lifetime completions.
*Why:* completion is the only moment a productivity tool gets to say thank you.
*Cost:* fires on the most repeated action in the app, so the beat must be ~200 ms and silent by
default, with the loud version gated to a threshold event.

---

## 3. Wren application list — ranked by impact-per-gram

Grams = build cost. All values reuse existing tokens; **no second spring is proposed**
(DIRECTION §9). Every item ships a `prefers-reduced-motion` path.

### 1. Sidebar and border de-weighting — 0 runtime grams
*Surface:* `src/styles/tokens.css`, `src/features/sidebar/sidebar.tsx`.
*Recipe:* audit every `border-hairline` in the shell for whether it separates or merely decorates;
delete the decorative ones. Drop the collapsed sidebar's resting icon tier from `text-ink-2` to
`text-ink-3`, restoring on hover. Replace any remaining depth-borders on `card.tsx` with
`--wren-shadow-sm`.
*Skill rule:* `surfaces` §2 "shadows over borders for depth"; Linear's *structure felt not seen*.
*Restraint:* separation borders stay (`surfaces` explicitly protects dividers, table gridlines,
input edges). Never drop a tier that carries a contrast floor from DIRECTION §3.

### 2. Press feedback on every chrome button — 1 gram
*Surface:* `src/components/ui/button.tsx`, `src/components/wren-controls.tsx`.
*Recipe:* `transition: scale var(--wren-dur-fast) var(--wren-ease-out); :active { scale: 0.96 }`.
Exactly `0.96` — never below `0.95`.
*Skill rule:* `better-ui` §9, `ui-polish` §6, `animations` §6.
*Restraint:* skip on `thread-row` (100+×/day) and on anything the keyboard triggers. Reduced
motion drops the scale, keeps the color transition.

### 3. Send: optimistic dispatch + inline undo — 3 grams · **the flagship moment**
*Surface:* `src/features/compose/composer.tsx`, `use-compose-actions.ts`,
`src/components/ui/sonner.tsx`.
*Recipe:* one sequence, ~420 ms total. (a) Button label morphs to "Sent" — Family's shared-letter
principle degrades gracefully to a crossfade at `--wren-dur-fast`. (b) The composer sheet exits
via `exitTransition()` — `opacity 1→0, scale 1→0.98, y 0→8`, 140 ms `--wren-ease-in`. (c) At
+80 ms the Superhuman toast rises bottom-left with `UNDO` (DIRECTION §2 says steal it verbatim).
The mail is genuinely held for the undo window; the UI never blocks.
*Skill rule:* Superhuman pattern 11; `animations` §7 "exits are quieter than enters".
*Restraint:* one toast at a time — a second send replaces rather than stacks. No confetti, ever.

### 4. Star pop, refined — 1 gram
*Surface:* `tokens.css` `@keyframes wren-pop` (already exists), `thread-row.tsx`.
*Recipe:* keep the 200 ms `--wren-ease-spring` pop; add an opacity+fill crossfade on the glyph
swap (outline → filled) at `--wren-dur-fast` so the star *fills* rather than *replaces*. Optional
one-frame star-hue ring at 12% alpha, fading over the same 200 ms.
*Skill rule:* `better-ui` §14 "outline default, fill for active"; §7 contextual icon animation.
*Restraint:* press only, never on mount (already enforced). Never on bulk-star. `[data-wren-pop]`
already zeroes under reduced motion — keep that.

### 5. Command palette entrance, origin-corrected — 1 gram
*Surface:* `src/features/palette/command-palette.tsx`, `sheetPreset()`.
*Recipe:* the existing `opacity 0→1, scale 0.96→1, y 12→0` on `SPRING` is right. Two additions:
set `transform-origin` toward the top so it grows from the search field rather than from its
center; and stagger the *first render* of result groups by `step: 0.04` from `staggerPreset()` —
but only on open, never on keystroke re-filter.
*Skill rule:* `animations` §4 origin-aware scaling; `better-ui` §5 split-and-stagger.
*Restraint:* re-filtering is a 100×/session interaction — results must swap instantly with zero
motion. Arrow-key selection never animates (`animations` framework 1).

### 6. Empty-inbox moment — 2 grams
*Surface:* `src/features/list/empty-state.tsx`.
*Recipe:* two tiers. **Ambient tier** (every empty folder): the existing decorative circles fade
and lift in via `staggerPreset()` at `step: 0.04`, headline then subtitle. **Earned tier** (inbox
transitioned from ≥1 unread to 0 *in this session*): the circles perform one slow settle —
`scale 0.94→1` over `--wren-dur-slow` with `--wren-ease-out` — and the copy changes to an
achievement line. No confetti, no particles.
*Skill rule:* `ui-polish` §11 "empty states teach"; Family's Delight-Impact Curve.
*Restraint:* the earned tier fires at most once per session and never on app launch into an
already-empty inbox. Decorative circles get `pointer-events: none` + `user-select: none`
(`ui-polish` §12).

### 7. Archive completion — 2 grams
*Surface:* `src/features/list/thread-list.tsx` (virtualized: rows are absolutely positioned with
`transform: translateY(...)`).
*Recipe:* the departing row fades and slides 8 px in the archive direction over
`--wren-dur-exit` (140 ms); rows below animate their existing `translateY` to the new offset over
`--wren-dur-base` with `--wren-ease-in-out` (on-screen movement, per `animations` framework 2).
Selection advances to the next thread *immediately* — never wait for the animation.
*Skill rule:* `animations` §1 composite-only; framework 2 easing.
*Restraint:* **hard frequency guard.** If more than one archive fires inside 400 ms (held `e`,
mass archive), disable the close-up entirely and re-layout instantly. Never animate a row the
keyboard is moving through.

### 8. Reading-pane arrival, sender-anchored — 2 grams
*Surface:* `src/features/reading/reading-pane.tsx`, `crossfadePreset()`.
*Recipe:* keep the 200 ms `opacity 0→1, y 4→0` crossfade. Add: the avatar and sender line resolve
~40 ms before the body (one `staggerPreset()` step), so the eye lands on *who* before *what*.
*Skill rule:* `better-ui` §5; Linear pattern 10 — motion doing spatial work.
*Restraint:* `j`/`k` traversal is high-frequency. Gate the stagger to pointer-initiated selection;
keyboard traversal gets the flat crossfade only.

### 9. New-mail arrival — 2 grams · **needs an owner ruling**
*Surface:* `src/features/list/thread-list.tsx`, `src/core/sync/engine.ts`,
`src/features/sidebar/sidebar.tsx`.
*Recipe:* the arriving row enters at `opacity 0→1, y -8→0`, `--wren-dur-base`, `--wren-ease-out`;
the sidebar unread count crossfades (already `tabular-nums`, so no jiggle — `ui-polish` §3).
*Skill rule:* Arc pattern 12 — peripheral-attention information.
*Restraint:* DIRECTION §1 says Wren refuses to *"animate anything the user did not ask for."* This
is the one proposal that touches that rule, so it is a decision, not a default. Suggested shape:
animate only when the list is scrolled to top **and** the window is focused **and** ≤3 threads
arrived in the batch; otherwise insert silently. Never move the scroll position under the user.

### 10. Glass edge and light treatment — 1 gram
*Surface:* `tokens.css` `.glass` / `.glass-strong`.
*Recipe:* the `inset 0 1px 0` sheen is there; add a *bottom* counter-edge at half strength
(`inset 0 -1px 0 var(--wren-glass-edge)`) so the palette reads as a slab with two lit surfaces
rather than one. In dark mode raise the top sheen alpha — `surfaces` §3 notes a shadow stack does
nothing against dark, so the ring *is* the depth.
*Skill rule:* `surfaces` §3 dark-mode rings; §5 eased gradients.
*Restraint:* still no gradient *as a surface* (DIRECTION §1). This is an edge treatment, 1 px.
Blur radius stays ≤ 32 px and is never animated (DIRECTION §7).

### 11. Pane-resize rubber-band — 2 grams
*Surface:* `src/components/ui/resizable.tsx`, clamped by `--wren-list-w-min/-max`.
*Recipe:* past the clamp, allow 8 px of over-travel at ~0.35× drag ratio; on release settle back
via `--wren-ease-spring` over `--wren-dur-base`.
*Skill rule:* Things 3 pattern 7; `animations` §"springs for gesture-driven motion" — reuse
`SPRING`, do not introduce a second.
*Restraint:* off entirely under reduced motion (the clamp becomes hard). 8 px is the ceiling.

### 12. Onboarding first-run sequence — 2 grams
*Surface:* `src/features/onboarding/onboarding.tsx`.
*Recipe:* the one place in Wren licensed to be elaborate — it fires once per lifetime. Cards enter
on `sheetPreset()` with `staggerPreset()` at `step: 0.04`; the account-connected state gets a
single slow settle at `--wren-dur-slow`.
*Skill rule:* `animations` framework 1 "rare or first-time moment → can be more elaborate";
Family's curve at its far end.
*Restraint:* never replays. `initial={false}` everywhere else in the app so returning users never
see an entrance (`better-ui` §10).

---

## 4. Sound-design hooks

Assets are being sourced in a parallel lane — nothing is sourced here. Ship **default-off** with a
single Settings toggle ("Interface sounds"), one shared gain node, and a global rule: no sound
fires within 250 ms of another, and none fires while the window is unfocused (except #4).
All volumes are relative to a master at ~30% of system.

1. **Send confirmed** — the primary earned moment. A short, soft, downward-resolving tone at the
   *end* of the undo window, not at button press; a sound at press would be lying about state.
   Volume 100%. Frequency: bounded by human typing speed, no guard needed.
2. **Undo invoked** — the same tone inverted (upward), quieter at 70%. Rare by construction.
3. **Inbox zero (earned tier only)** — the loudest thing in the app, and still gentle. Fires with
   §3.6's earned tier: once per session maximum, never on launch. Volume 100%.
4. **New mail arrival** — Arc's suspend-pulse model: very quiet (50%), single, and the *only*
   sound licensed to fire while unfocused. Hard guard: at most one per 60 s regardless of batch
   size; silent entirely if >3 threads arrive at once.
5. **Archive / trash** — Family's trash tumble is the reference, but this is a 100×/day action in
   a mail client. Ship it **off by default even when sounds are on**, behind its own sub-toggle,
   at 40%, with a 400 ms rate limit shared with §3.7's animation guard.
6. **Palette open** — optional, 40%, a near-subliminal tick. Test it; a keyboard-first user hits
   this dozens of times a day and it is the most likely candidate to be cut.

Never: error beeps, keystroke sounds, hover sounds, or looping ambience. Sound is muted under
`prefers-reduced-motion` as well — the two settings travel together for vestibular and sensory
sensitivity.

---

## 5. Anti-goals

1. **No confetti, particles, mascots, or bounce.** Family earns confetti on a once-per-lifetime
   wallet backup; Wren has no event of that weight. Bounce stays at `0` everywhere.
2. **No motion on the ninety-nine percent.** `j`/`k`, arrow keys, palette re-filter, tab switching,
   hover — instant or ≤150 ms color only. `animations` framework 1 is a hard gate, not advice.
3. **No new tokens, no second spring, no second accent hue, no gradient as a surface.** Every
   recipe above resolves to values already in `tokens.css` and `lib/motion.ts`.
4. **Nothing that blocks or delays a user action.** Optimistic mutation with undo, never a confirm
   dialog and never a "please wait" animation. The moment motion gates input, it is weight.
5. **No animated `backdrop-filter`, `width`, `height`, `top/left`, or `transition: all`.**
   Composite-only (`transform`/`opacity`), ≤2 glass layers, never on a scroll container —
   DIRECTION §7 and `animations` §1. A dropped frame reads as cheap faster than any missing
   flourish reads as plain.

---

*Sources:* [Family design values](https://benji.org/family-values) · [Linear design refresh](https://linear.app/now/behind-the-latest-design-refresh) ·
[How is Linear so fast](https://performance.dev/how-is-linear-so-fast-a-technical-breakdown) · [Things 3, MacStories](https://www.macstories.net/reviews/things-3-beauty-and-delight-in-a-task-manager/) ·
[Copilot Money & Swift Charts](https://developer.apple.com/articles/copilot-money) · [Copilot Money design system](https://mattstromawn.com/projects/copilotmoney/) ·
[Superhuman: speed as the product](https://blakecrosley.com/guides/design/superhuman) · [Being smart with sound](https://www.awwwards.com/being-smart-with-sound.html)
