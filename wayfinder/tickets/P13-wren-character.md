# P13 — The wren becomes a character  `wayfinder:task`

status: open · claimed: — · blocked by: nothing; do after the map-3 submission

## The ask

Nick, 2026-08-31: "the character we need to create needs to be much
better than what we currently have. This person made a bunny with GSAP
and DialKit. We need to do something similar."

Reference: https://x.com/kolbeyang/status/2094156852011450626
(kolbeyang's bunny — GSAP + DialKit; X blocks agent fetch, view it
logged in before starting).

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

## Sequencing

After the verification submission (map 3's one priority). A character
rig is exactly the kind of joyful lane that fits while waiting out
Google's review clock.
