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

## Sequencing

After the verification submission (map 3's one priority). A character
rig is exactly the kind of joyful lane that fits while waiting out
Google's review clock.
