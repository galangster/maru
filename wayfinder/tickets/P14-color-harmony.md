# P14 — One color story: interface, logo, Maru  `wayfinder:task`

status: queued (2026-08-31) · claimed: — · blocked by: owner anchor decision (NICK-QUEUE)

## The ask

Nick, 2026-08-31: "the colors aren't harmonious yet at all. from the
interface colors, to the app logo color, to the new Maru character. we
need to make them consistent."

## The three color systems today

1. **Interface** — the coral brand system (2026-08-31 pass): accent from
   the logo hue; dark theme lands on the logo colour itself, light is
   Nick's #F08080 reference darkened to the white-text floor; warm
   neutrals, gold star, semantic icon fills.
2. **Logo** — the coral the accent was derived from.
3. **Maru** — the character sheet's own palette (#FF4F87 / #FF7BA1 /
   #FFD6E1 / #FEE9EF / ink #1A1A1A), deliberately independent —
   `wren-figure.tsx` says "Maru the bird is hot pink whatever the
   chrome does." That ruling is now superseded by the ask above.

The disharmony is real: coral (~#F08080, low-chroma warm red) and
Maru's hot pink (#FF4F87, high-chroma pink) sit on visibly different
hues, and both claim brand-accent duty on the same screens.

## The work (once the anchor is decided)

- Owner picks the anchor: (a) the logo/coral — recolor Maru's palette
  toward it (canvas palette edit → re-trace chain → wren-poses), (b)
  Maru's #FF4F87 — re-derive the interface accent ramp from it, or (c)
  a shared parent hue both are re-derived from.
- Build the ramp in OKLCH (the `color` skill): equal-lightness accent
  steps, dark/light theme landings re-checked against the white-text
  contrast floor, WrenBlob grounds re-derived.
- One sweep: tokens.css accents, semantic icon fills, WrenBlob,
  celebration particles (lib/hue), logo asset if (b)/(c), the design
  canvas palette swatches.
- Regenerate the 15-frame capture sweep; re-review.

## Sequencing

After the anchor decision. Touches the freeze-candidate's visuals, so
it lands either before a freeze or as the first post-submission visual
pass — Nick's call in the queue entry.
