// The tinted-fill contrast trap, held shut.
//
// DIRECTION §3 certifies the text tiers against `base`, `surface` and
// `raised`. The 2026-09-02 desktop review found six failures and every one was
// the same certified tier standing on a fill that table does not cover: the
// sunken well, the selected row's accent wash, the count wash, the halo behind
// the character. Fixing the colours without fixing the *table* leaves the trap
// armed, so this file is the table — it recomputes each cited pair from the
// shipped token values, with the formula the review used, and fails when a
// token moves back under its floor.
//
// The maths is `scripts/lib/color.mjs`, shared with `scripts/contrast-audit.mjs`
// so the gate and the report can never disagree.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

// @ts-expect-error -- plain-JS helpers, shared with the audit script.
import { over, ratio } from '../scripts/lib/color.mjs'
// @ts-expect-error -- plain-JS helpers, shared with the audit script.
import { tokenReader } from '../scripts/lib/tokens.mjs'

type Rgb = [number, number, number]
type Theme = 'light' | 'dark'

const { token } = tokenReader() as {
  token: (name: string, theme: Theme) => { rgb: Rgb; clipped: boolean }
}

const rgb = (name: string, theme: Theme): Rgb => token(name, theme).rgb

/** WCAG AA for text below 18.66px — every label in the review's list. */
const TEXT = 4.5
/** WCAG 2.2 SC 1.4.11 for a non-text indicator. */
const INDICATOR = 3

/** DIRECTION §3: the selected row is the accent at 8% light, 14% dark. */
const SELECTED_ALPHA: Record<Theme, number> = { light: 0.08, dark: 0.14 }

/** Every backdrop beyond the three certified surfaces that carries small text. */
function fills(theme: Theme): Array<[string, Rgb]> {
  const accent = rgb('wren-accent', theme)
  const alpha = SELECTED_ALPHA[theme]
  return [
    ['sunken', rgb('wren-surface-sunken', theme)],
    ['selected wash over surface', over(accent, rgb('wren-surface', theme), alpha) as Rgb],
    ['selected wash over base', over(accent, rgb('wren-surface-base', theme), alpha) as Rgb],
  ]
}

describe('focus ring — issue #22', () => {
  // It was the accent at 50% alpha: 2.05 on a white card, 2.77 in dark. The
  // ring is one token drawn on every control, so one number covers the app.
  const backdrops = (theme: Theme): Array<[string, Rgb]> => [
    ['surface', rgb('wren-surface', theme)],
    ['base', rgb('wren-surface-base', theme)],
    ['raised', rgb('wren-surface-raised', theme)],
    ...fills(theme),
  ]

  for (const theme of ['light', 'dark'] as const) {
    it(`clears 3:1 on every ${theme} surface it is drawn on`, () => {
      const ring = rgb('wren-focus-ring', theme)
      for (const [name, bg] of backdrops(theme)) {
        expect(ratio(ring, bg), `focus ring on ${theme} ${name}`).toBeGreaterThanOrEqual(INDICATOR)
      }
    })
  }

  it('is drawn at full strength, not at the half alpha that failed', () => {
    // The regression this guards is not the token's value but the *alpha* the
    // call sites used to apply on top of it. `ring-ring/50` composited the
    // certified colour down to 2.05:1 and no token change could have saved it.
    expect(focusRingUtility()).not.toMatch(/ring-ring\/\d+/)
  })
})

function focusRingUtility(): string {
  // Only the @utility body decides the ring; the comment above it quotes the
  // old spelling on purpose, as the record of what was wrong.
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const css = readFileSync(join(root, 'src/index.css'), 'utf8')
  const match = css.match(/@utility focus-ring \{[\s\S]*?\n\}/)
  if (!match) throw new Error('the focus-ring utility moved out of src/index.css')
  return match[0]
}

export { fills, TEXT }
