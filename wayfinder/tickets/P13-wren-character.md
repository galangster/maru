# P13 — The wren becomes a character  `wayfinder:task`

status: in progress (rig v1 shipped 2026-08-31) · claimed: autonomous run 5 · blocked by: —

## The ask

Nick, 2026-08-31: "the character we need to create needs to be much
better than what we currently have. This person made a bunny with GSAP
and DialKit. We need to do something similar."

Reference: https://x.com/kolbeyang/status/2094156852011450626
(kolbeyang's bunny — GSAP + DialKit; X blocks agent fetch, view it
logged in before starting).

## Design canvas

The character sheet lives on a Claude Design canvas Nick can edit
directly (construction + rig joints, five poses, five expressions, the
inbox-zero storyboard; body colour is a tweak):
https://claude.ai/code/artifact/1b29708d-84f6-4ea3-b2c3-b08553228a87
The code rig implements whatever the sheet settles.

## Where we are

The current marks (`src/components/empty-state.tsx`) are the logo's
geometry in CSS shapes: a perched silhouette whose pupil follows the
cursor, and a flat-colour flight pose that bobs at inbox zero. Charming,
but they are *poses*, not a character — no rig, no life between states.

## What "much better" means

A rigged SVG wren with a small behavior system, not more poses:

- **Anatomy as a rig**: body, head (independent tilt), wing, tail,
  beak, eye — separate SVG groups with named transform origins, so
  motion is joints moving, not frames swapping.
- **Idle life**: breathing (2–3% body scale, slow), blink cycle
  (randomized 3–7s), occasional head tilt toward pointer activity. The
  existing cursor-gaze survives as the eye layer of the rig.
- **Reactions** keyed to real app moments, each a short storyboard:
  inbox zero (the flight, upgraded), new mail while empty (perk up,
  look at the list), long sync (preen), error states (ruffle).
- **Tuning workflow**: build with the `interface-craft` skill's
  DialKit — live sliders for every spring/duration/angle — exactly the
  workflow the reference used. Storyboard DSL for the sequences.
- **Library**: GSAP is the reference's tool; ours can be motion/react +
  WAAPI on the SVG rig unless a sequence genuinely needs GSAP's
  timeline. The bar is the craft, not the dependency — but do not
  hand-roll a timeline system to avoid a library the sequence needs.
- **Doctrine holds**: reduced motion = breathing and blinks off, gaze
  off, crossfades only; capture path perfectly still; the frequency
  framework still gates where reactions may fire (rare surfaces only —
  the character must never perform during triage).

## Scope of surfaces

Empty states (both tiers), onboarding, and the sync footer at most.
The character is a companion in the quiet moments, not a mascot in the
chrome.

## Rig v1 — shipped (2026-08-31)

Nick delivered canonical art (a full character sheet: bio, turnaround,
palette #FF4F87/#FF7BA1/#FFD6E1/#FEE9EF/ink #1A1A1A) plus perched,
flight and two preen references. All pixel-traced
(docs/design/wren-character/), the canvas rebuilt around them, and the
character landed in-app: `src/components/wren-figure.tsx` renders the
traced poses with idle life — breathing (3.4s, from the feet), blinks
on a 3–7s clock, pointer gaze — on a WrenBlob ground; inbox zero flies
the real flight pose. Reduced motion and captures get a still bird.

Remaining for v2: the full five-beat inbox-zero sequence (notice/
crouch/leap/apex/settle) with DialKit tuning; perk + ruffle poses
(need art or sketches); turnaround views into the trace set; preen for
long syncs.

## v2 prep — scaffolded (2026-08-31, later run)

Canvas diff first (resume-note protocol): all 26 traced path lines and
the full palette verified byte-identical between the design canvas
artifact and docs/design/wren-character/ — no owner edits, no re-trace
needed.

No-art prep shipped:

- **Assembly scripted** — `scripts/build-wren-poses.mjs` now owns step 3
  of the regeneration chain (traces → wren-poses.ts). Reproduces the
  hand-assembled module byte-identically; `--check` flags staleness. The
  preens are traced but stay out of its manifest until their
  choreography exists.
- **Five-beat sequence** — `src/components/wren-celebration.tsx`, the
  storyboard-pattern scaffold (TIMING + per-beat configs + stage
  machine): notice 0ms / crouch 180 / leap 330 (perched→flight
  crossfade) / apex 560 (pop + the existing burst) / settle 900 (hands
  off to wren-float). Reduced motion/captures get the still bird.
- **Tuning stage** — `?tune=1` lazy-mounts `src/dev/wren-stage.tsx`
  instead of the app: DialKit panel (dialkit@1.4.3) with every beat
  value + spring on sliders, click-to-replay. dialkit never enters the
  mail bundle. Spring defaults = lib/motion's SPRING; anything the
  tuning settles on is ratified at seal, never a silent second spring.

## v2 — SHIPPED (2026-08-31, e9718a6)

Nick's verdicts on the rig v1 screenshots drove the rest: bigger bird,
background filling the pane, one shadow not two, warmer copy, and "a
fluid animation that feels like a real motion designer made it. for
both animations."

- **The two shadows were a tracer bug**, not a rig bug. The cast shadow
  in Nick's art is darker than the plate, so the flood left it
  classified pink — and it is bigger than the beak, so the "first
  remaining pink" rule labelled the shadow BEAK and dropped the real
  beak. The rig painted it in full #FF4F87 under the feet and added its
  own ellipse on top. `trace.mjs` now separates the shadow by the two
  things only a cast shadow is (wide-and-flat, at the bottom); the
  build script rejects any pose whose pink layer is not [wing, beak].
- **Ground**: the blob is gone. A pane-filling field plus a radial pool
  anchored at the traced shadow's own centre, so it follows the bird.
  96 → 144px.
- **Idle is a behaviour clock**, not a bigger loop: breath is the only
  perpetual animation; one behaviour at a time (wing shrug, head tilt,
  weight shift, look-back) on a Poisson clock with two arousal levels
  gated on pointer proximity, so it goes quiet during triage. Plus a
  greeting when you return after 20s.
- **Inbox zero** is one 1040ms WAAPI timeline over six tracks —
  anticipate, crouch below the line, launch with the pose crossfade
  hidden under the climb, apex pop with the burst phase-locked, settle
  — then hover, a descent starting at a bob's turning point, and a
  landing that hands the bird to the same idle clock.
- **`?tune=1`** now drives the SHIPPED sequence (the dials write the
  real tokens), so there is no scaffold that can drift from what ships.

Still open for v3: perk + ruffle poses (need art), turnaround views,
preen for long syncs. And the tuned numbers are still Nick's to
ratify — `?tune=1`, then the settled values go into tokens.css.

## Sequencing

After the verification submission (map 3's one priority). A character
rig is exactly the kind of joyful lane that fits while waiting out
Google's review clock.
