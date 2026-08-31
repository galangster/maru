# P14 — One color story: interface, logo, Maru  `wayfinder:task`

status: DONE (2026-08-31) · anchor: option C, shared parent hue 13

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

## Measured, 2026-08-31 — there are TWO problems, not one

In OKLCH (L / C / H):

| | L | C | H |
|---|---|---|---|
| accent, light `#C14D51` | 0.575 | 0.149 | **21** |
| accent, dark `#EE9078` | 0.746 | 0.120 | **35** |
| Nick's ref `#F08080` | 0.725 | 0.138 | 21 |
| Maru pink `#FF4F87` | 0.687 | **0.214** | **5.6** |
| Maru mid `#FF7BA1` | 0.745 | 0.164 | 3.7 |

1. **Hue is spread across three values**: Maru 5.6, accent-light 21,
   accent-dark 35. The Maru↔accent gap is 15.4° in light and 29.5° in
   dark. Worth saying plainly: **the two accents do not agree with each
   other either** — the app's own light and dark themes are 14° apart,
   which is a defect independent of the character and should be fixed
   whichever anchor wins.
2. **Chroma does not match**: Maru at 0.214 is 44% more saturated than
   the light accent and 78% more than the dark one. Even at an
   identical hue Maru will read louder than the chrome — which is
   arguably correct for a character, but it has to be a decision rather
   than an accident.

## Unblocked, 2026-08-31

The character's palette was hard-coded in `wren-figure.tsx`
(`WREN_PINK`, `PALE`), so harmonizing Maru would have been a code
change. It is now `--wren-maru-pink` / `--wren-maru-pale` alongside the
existing ground/field/shade tokens. Captures came back byte-identical,
so it is a pure refactor — and the whole pass is now a token edit.

## The three anchors, rendered — and the ruling

All three were rendered on the real app. Nick, 2026-08-31: **"i like C"**.

- A — anchor on the logo/coral (H21). Maru moves to the chrome; the
  character loses the hot pink the sheet was drawn around.
- B — anchor on Maru (H5.6). The chrome moves to the character; leaves
  the logo as the odd one out.
- **C — shared parent (H13). CHOSEN.** Both move to meet. Nothing keeps
  its exact original value; everything agrees.

## Shipped

- `--wren-accent` light: `oklch(0.575 0.149 13)` — L and C carried over
  unchanged, so **white on it measures 4.73 against 4.72 before**. The
  contrast floor never moved.
- `--wren-accent` dark: `oklch(0.745 0.12 13)` — the same hue as light
  for the first time. It was H35 against light's H21, so the two themes
  had disagreed with each other independently of the character.
- Maru: pink `oklch(0.687 0.2 13)`, pale `oklch(0.9 0.053 13)`, ground
  `oklch(0.94 0.03 13)`. Pale sits at the sRGB gamut edge at this
  lightness — 0.053 is the maximum in-gamut chroma, found by search
  rather than guessed.
- The contact shadow's tone follows to H13.
- **Chroma relationship, decided rather than inherited:** Maru keeps
  C 0.2 against the chrome's 0.149, so the character stays the most
  saturated thing on screen. It is the one place the app is allowed to
  be loud; the chrome is not.

Every value is now derived from one hue, so a future re-anchor is a
one-number edit.

## Sequencing

After the anchor decision. Touches the freeze-candidate's visuals, so
it lands either before a freeze or as the first post-submission visual
pass — Nick's call in the queue entry.
