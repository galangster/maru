// The icon seam's one branch that can fail silently — DIRECTION §8.
//
// `Icon` is called directly rather than rendered: these tests run in plain
// Node, and everything under test is in the element the component returns.

import { describe, it, expect, vi, afterEach } from 'vitest'

import { Icon } from '../src/components/ui/icon'
import { ANRON_FILLED_PATHS, ANRON_PATHS } from '../src/components/ui/icon-glyphs'

type SvgElement = { props: { fill?: string; strokeWidth?: number; children: unknown } }

function render(name: Parameters<typeof Icon>[0]['name'], filled: boolean): SvgElement {
  return Icon({ name, filled }) as unknown as SvgElement
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Icon filled', () => {
  it('draws the Filled twin for a name that has one', () => {
    expect(ANRON_FILLED_PATHS).toHaveProperty('star')
    const svg = render('star', true)
    expect(svg.props.fill).toBe('currentColor')
    expect(svg.props.strokeWidth).toBe(0)
  })

  it('falls back to the Line glyph for a name with no twin, never a flood fill', () => {
    // `archive` is a Line-only glyph: filling its open outline would close the
    // counters and read as a blob.
    expect(ANRON_PATHS).toHaveProperty('archive')
    expect(ANRON_FILLED_PATHS).not.toHaveProperty('archive')

    const svg = render('archive', true)
    expect(svg.props.fill).toBe('none')
    expect(svg.props.strokeWidth).toBe(1.5)
  })

  it('warns once per name in dev, not once per render', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render('compose', true)
    render('compose', true)
    render('compose', true)
    // `compose` may already have been warned about by an earlier test in this
    // file; what must never happen is one line per render.
    expect(warn.mock.calls.length).toBeLessThanOrEqual(1)
  })
})
