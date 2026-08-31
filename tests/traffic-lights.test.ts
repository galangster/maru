// The macOS traffic lights are positioned by Rust and reserved for by CSS, and
// until this file existed nothing checked the two against each other.
//
// The previous incarnation of this pair drifted exactly that way: the deleted
// `--wren-titlebar-lights-w` was derived in a comment from a
// `trafficLightPosition` key that tauri.conf.json does not contain, and from a
// 20px inset the Rust never used. The sidebar card's whole geometry — where
// the card's top edge sits, where the first control lands — is arithmetic on
// this one number, and a mismatch is invisible in the browser captures because
// the lights are not drawn there at all.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const RUST = readFileSync(join(ROOT, 'src-tauri/src/lib.rs'), 'utf8')
const TOKENS = readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8')

describe('traffic-light geometry', () => {
  it('CSS reserves the gap the Rust actually applies', () => {
    // `const GAP: f64 = 16.0;` in place_traffic_lights
    const rust = RUST.match(/GAP\s*:\s*f64\s*=\s*([\d.]+)/)
    expect(rust, 'GAP not found in src-tauri/src/lib.rs — did place_traffic_lights move?').toBeTruthy()

    const css = TOKENS.match(/--wren-lights-gap:\s*(\d+)px/)
    expect(css, '--wren-lights-gap not found in tokens.css').toBeTruthy()

    expect(
      Number(css![1]),
      'tokens.css --wren-lights-gap and lib.rs GAP disagree; the sidebar card ' +
        'geometry is derived from this number, so edit both in one commit',
    ).toBe(Number(rust![1]))
  })

  it('the card band clears the lights', () => {
    // The reserve is a calc, so assert the inputs rather than the result: the
    // band must be at least tall enough for a light plus its top gap.
    const gap = Number(TOKENS.match(/--wren-lights-gap:\s*(\d+)px/)![1])
    const toolbar = Number(TOKENS.match(/--wren-toolbar-h:\s*(\d+)px/)![1])
    const gutter = Number(TOKENS.match(/--wren-sidebar-gutter:\s*(\d+)px/)![1])

    // reserve = toolbar - gutter, and the card starts `gutter` from the top,
    // so the band's bottom edge in window coordinates is `toolbar`.
    // A light occupies gap..gap+12 vertically.
    expect(toolbar).toBeGreaterThanOrEqual(gap + 12)
    expect(gutter).toBeLessThan(gap)
  })
})
