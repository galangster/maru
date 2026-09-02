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
const HALO: Rgb = [251, 235, 236]

/** Every backdrop beyond the three certified surfaces that carries small text. */
function fills(theme: Theme): Array<[string, Rgb]> {
  const accent = rgb('wren-accent', theme)
  const alpha = SELECTED_ALPHA[theme]
  return [
    ['sunken', rgb('wren-surface-sunken', theme)],
    ['selected wash over surface', over(accent, rgb('wren-surface', theme), alpha) as Rgb],
    ['selected wash over base', over(accent, rgb('wren-surface-base', theme), alpha) as Rgb],
    ...(theme === 'light' ? ([['halo (sampled)', HALO]] as Array<[string, Rgb]>) : []),
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

describe('the on-fill tier — issues #26, #27, #29, #30', () => {
  // Every failure the review found was a certified tier standing on a fill
  // DIRECTION §3's table does not cover. These are the fills, and this is the
  // tier that is certified on them.
  for (const theme of ['light', 'dark'] as const) {
    it(`carries small ${theme} text on every tinted fill`, () => {
      const ink = rgb('wren-text-on-fill', theme)
      for (const [name, bg] of fills(theme)) {
        expect(ratio(ink, bg), `on-fill ink on ${theme} ${name}`).toBeGreaterThanOrEqual(TEXT)
      }
    })

    it(`carries the ${theme} accent on every tinted fill`, () => {
      // The sidebar's unread count is the accent drawn on a wash of itself.
      const ink = rgb('wren-accent-on-fill', theme)
      for (const [name, bg] of fills(theme)) {
        expect(ratio(ink, bg), `accent-on-fill on ${theme} ${name}`).toBeGreaterThanOrEqual(TEXT)
      }
    })
  }

  it('is a step of the same colour, not a second palette', () => {
    // The guard against "fix the ratio, lose the palette": the on-fill tier
    // must stay the same hue and chroma as the tier it steps from, so a future
    // accent or neutral retune moves both together. DIRECTION's palette is
    // ruled; this row of the table is execution.
    const { raw } = tokenReader() as { raw: (n: string, t: Theme) => string }
    const coords = (value: string) => value.match(/oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)/)!.slice(1)
    for (const theme of ['light', 'dark'] as const) {
      const [, textC, textH] = coords(raw('wren-text-3', theme))
      const [, fillC, fillH] = coords(raw('wren-text-on-fill', theme))
      expect([fillC, fillH], `${theme} on-fill ink hue and chroma`).toEqual([textC, textH])

      const [, accentC, accentH] = coords(raw('wren-accent', theme))
      const [, onFillC, onFillH] = coords(raw('wren-accent-on-fill', theme))
      expect([onFillC, onFillH], `${theme} accent-on-fill hue and chroma`).toEqual([accentC, accentH])
    }
  })

  it('leaves the ruled wash alphas alone', () => {
    // DIRECTION §3 rules the selected row as the accent at 8% light and 14%
    // dark. The trap was fixed by certifying a tier against those fills, not by
    // weakening them, and this is the line that says so.
    const { raw } = tokenReader() as { raw: (n: string, t: Theme) => string }
    expect(raw('wren-fill-selected', 'light')).toContain('8%')
    expect(raw('wren-fill-selected', 'dark')).toContain('14%')
  })
})
