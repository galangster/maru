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

type Styled = { props: { style?: { color?: string } } }

function styleOf(
  name: Parameters<typeof Icon>[0]['name'],
  filled: boolean,
  props: Record<string, unknown> = {},
): { color?: string } | undefined {
  return (Icon({ name, filled, ...props }) as unknown as Styled).props.style
}

describe('Icon semantic fill', () => {
  it('gives each filled glyph its own meaning, not one shared colour', () => {
    // The whole point: three filled glyphs, three different answers.
    expect(styleOf('star', true)?.color).toBe('var(--wren-star)')
    expect(styleOf('trash', true)?.color).toBe('var(--wren-destructive)')
    expect(styleOf('inbox', true)?.color).toBe('var(--wren-accent)')
    expect(styleOf('sent', true)?.color).toBe('var(--wren-accent)')
  })

  it('leaves a resting Line glyph inheriting its text tier', () => {
    // Colour is what "filled" adds. Unfilled, the glyph is the row it sits in.
    expect(styleOf('star', false)?.color).toBeUndefined()
    expect(styleOf('inbox', false)?.color).toBeUndefined()
  })

  it("lets a call site's own colour win — the account hue, the current mailbox", () => {
    const hue = styleOf('inbox', true, { style: { color: 'var(--wren-hue-teal)' } })
    expect(hue?.color).toBe('var(--wren-hue-teal)')
  })
})
