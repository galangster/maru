// The tinted fills, enumerated once.
//
// DIRECTION §3 certifies the text tiers against `base`, `surface` and `raised`.
// It certifies nothing against the fills the app actually paints — the sunken
// well, the selected row's accent wash, the halo behind the character — and
// every contrast failure the 2026-09-02 desktop review found was the same
// certified tier standing on one of them (issues #26, #27, #29, #30).
//
// This file is the missing row of that table, and it is one file because
// `scripts/contrast-audit.mjs` (the report) and `tests/contrast.test.ts` (the
// gate) both have to measure the same list. Two copies of it is how a palette
// gets certified against a set of fills the report no longer prints.

import { over } from './color.mjs'
import { tokenReader } from './tokens.mjs'

const { token, raw } = tokenReader()

const rgb = (name, theme) => token(name, theme).rgb

/** The alpha DIRECTION §3 gives the selected-row wash, per theme. */
export const SELECTED_ALPHA = { light: 0.08, dark: 0.14 }

/**
 * The neutral hover fill, composited on a backdrop.
 *
 * It was left off this list for a wave because it is *neutral* — 4.5% black in
 * light, 5% white in dark — and a fill that faint reads as no fill at all. It
 * is a fill, and in dark it is the one under the **highlighted** row of a menu:
 * the Save for later picker opens with its first row already highlighted, and
 * the return time on it measured 3.94:1 while the same time on the rows below
 * it measured 4.61 (issue #55).
 *
 * The alpha is read off the token rather than restated, because the whole point
 * of this file is that the gate measures what ships.
 */
export function hoverOver(theme, backdrop) {
  const value = raw('wren-fill-hover', theme)
  const alpha = value.match(/\/\s*([\d.]+)\s*\)/)
  if (!alpha) throw new Error(`--wren-fill-hover carries no alpha for ${theme}: ${value}`)
  return over(rgb('wren-fill-hover', theme), backdrop, Number(alpha[1]))
}

/**
 * The character's halo, in light only.
 *
 * It is a radial gradient of Maru's own pink over the pane, so no single token
 * states it; this is the value the 2026-09-02 review sampled in the page under
 * "Nothing open", where the subtitle measured 4.46 (issue #30). It is lighter
 * than `sunken`, so `sunken` remains the governing light fill — the sampled
 * value is here because it is the pair that was filed, not because it decides
 * anything on its own.
 */
export const HALO = [251, 235, 236]

/** Every backdrop beyond the three certified surfaces that carries small text. */
export function fillsFor(theme) {
  const accent = rgb('wren-accent', theme)
  const alpha = SELECTED_ALPHA[theme]
  return [
    ['sunken', rgb('wren-surface-sunken', theme)],
    ['selected wash over surface', over(accent, rgb('wren-surface', theme), alpha)],
    ['selected wash over base', over(accent, rgb('wren-surface-base', theme), alpha)],
    // The hover fill sits on all three certified surfaces: list rows on
    // `surface`, menu and popover rows on `raised`, sidebar rows on the card.
    // `raised` is the picker's, and it is the one that failed.
    ['hover fill over surface', hoverOver(theme, rgb('wren-surface', theme))],
    ['hover fill over base', hoverOver(theme, rgb('wren-surface-base', theme))],
    ['hover fill over raised', hoverOver(theme, rgb('wren-surface-raised', theme))],
    ...(theme === 'light' ? [['halo (sampled)', HALO]] : []),
  ]
}

/**
 * Everything the focus ring can be drawn on: the three certified surfaces AND
 * the fills. One ring, one token, every control — so the worst of these is the
 * number that matters (issue #22).
 */
export function backdropsFor(theme) {
  return [
    ['surface', rgb('wren-surface', theme)],
    ['base', rgb('wren-surface-base', theme)],
    ['raised', rgb('wren-surface-raised', theme)],
    ...fillsFor(theme),
  ]
}
