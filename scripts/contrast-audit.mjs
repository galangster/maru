#!/usr/bin/env node
// Measure the shipped palette. Reads src/styles/tokens.css and src/lib/hue.ts,
// converts every OKLCH value the way a browser does, and prints the WCAG 2.x
// ratios DIRECTION §3 certifies.
//
// It exists because that section is headed "computed not estimated" and was
// certifying a palette the build no longer has: DIRECTION documented hue-286
// neutrals and an indigo hue-268 accent months after P14 shipped hue-50
// neutrals and a coral hue-13 accent. A table of ratios for colours nobody
// renders is worse than no table, because it is the one document somebody
// would check a colour against.
//
// Run it after any token change:  node scripts/contrast-audit.mjs
// `--check` exits non-zero if a text tier fails AA on a surface it is
// permitted to sit on, so CI or a pre-seal gate can hold the line.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// -- colour ------------------------------------------------------------------

/** OKLab → linear sRGB (Björn Ottosson's matrices). */
function oklabToLinearSrgb(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ ** 3
  const m = m_ ** 3
  const s = s_ ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

const encode = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055)
const decode = (x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)

/**
 * An OKLCH triple as the 8-bit sRGB a screen actually shows.
 *
 * Clamped and rounded on purpose: an out-of-gamut value is CLIPPED by the
 * browser, and a ratio computed from the unclipped maths would certify a colour
 * nobody can see. `clipped` reports when that happened, because DIRECTION
 * claims every value is in gamut and that claim should be checked rather than
 * repeated.
 */
function oklchToRgb(L, C, h) {
  const rad = (h * Math.PI) / 180
  const linear = oklabToLinearSrgb(L, C * Math.cos(rad), C * Math.sin(rad))
  const encoded = linear.map(encode)
  const clipped = encoded.some((v) => v < -0.0005 || v > 1.0005)
  const rgb = encoded.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255))
  return { rgb, clipped }
}

const hex = ([r, g, b]) =>
  '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0').toUpperCase()).join('')

/** WCAG relative luminance, from the 8-bit values a screen receives. */
const luminance = ([r, g, b]) =>
  0.2126 * decode(r / 255) + 0.7152 * decode(g / 255) + 0.0722 * decode(b / 255)

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const r2 = (n) => Math.round(n * 100) / 100

/**
 * Composite a translucent colour over its backdrop before measuring.
 *
 * A ratio taken against a colour with an alpha channel is meaningless — what
 * the eye receives is the blend, and that is what has to clear 4.5.
 */
function over(fg, bg, alpha) {
  return fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha)))
}

// -- reading the shipped tokens ----------------------------------------------

const css = readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8')

/**
 * Pull one token out of a theme block.
 *
 * The dark theme redefines the same names further down the file, so "which
 * block" is decided by position rather than by a smarter parser: everything
 * before the dark selector is light, everything after is dark.
 */
const DARK_AT = css.search(/^\.dark\s*\{/m)
if (DARK_AT === -1) throw new Error('no `.dark` block in tokens.css — the theme split moved')

function token(name, theme) {
  const pattern = new RegExp(`--${name}:\\s*oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)`, 'g')
  let found = null
  for (const m of css.matchAll(pattern)) {
    const isDark = m.index > DARK_AT
    if (isDark === (theme === 'dark')) {
      found = [Number(m[1]), Number(m[2]), Number(m[3])]
      if (theme === 'light') break
    }
  }
  if (!found) throw new Error(`token --${name} not found for ${theme}`)
  return oklchToRgb(...found)
}

const HUES = ['green', 'teal', 'blue', 'violet', 'magenta', 'red', 'orange', 'yellow']

const SURFACES = ['wren-surface-base', 'wren-surface', 'wren-surface-raised']
const INKS = [
  ['text-1', 'wren-text-1', 4.5],
  ['text-2', 'wren-text-2', 4.5],
  ['text-3', 'wren-text-3', 4.5],
  ['accent', 'wren-accent', 4.5],
  ['destructive', 'wren-destructive', 4.5],
  ['success', 'wren-success', 4.5],
  // A star is a non-text glyph, so 3.0 is its floor, not 4.5.
  ['star', 'wren-star', 3.0],
]

const failures = []
const lines = []

for (const theme of ['light', 'dark']) {
  lines.push(`\n## ${theme.toUpperCase()}\n`)
  const surfaces = SURFACES.map((s) => ({ name: s.replace('wren-surface', 'surface'), ...token(s, theme) }))
  lines.push(
    `surfaces: ${surfaces.map((s) => `${s.name || 'surface'} ${hex(s.rgb)}`).join(' · ')}`,
  )

  for (const [label, name, floor] of INKS) {
    const ink = token(name, theme)
    const cells = surfaces.map((s) => {
      const v = ratio(ink.rgb, s.rgb)
      if (v < floor) failures.push(`${theme}: ${label} on ${s.name || 'surface'} = ${r2(v)} (needs ${floor})`)
      return `${s.name || 'surface'} ${r2(v)}${v < floor ? ' ✗' : ''}`
    })
    lines.push(`${label.padEnd(12)} ${hex(ink.rgb)}${ink.clipped ? ' [CLIPPED]' : ''}  ${cells.join(' · ')}`)
  }

  // The one pair that is not ink-on-surface: every primary button. Read from
  // `--wren-accent-fg` rather than assumed to be white — dark's is near-black,
  // and measuring white there would report a 2.39 failure that does not exist.
  const accent = token('wren-accent', theme)
  const accentFg = token('wren-accent-fg', theme)
  const onAccent = ratio(accentFg.rgb, accent.rgb)
  if (onAccent < 4.5) failures.push(`${theme}: accent-fg on accent = ${r2(onAccent)}`)
  lines.push(`accent-fg on accent  ${hex(accentFg.rgb)} on ${hex(accent.rgb)}  ${r2(onAccent)}`)

  // The eight category hues. DIRECTION certifies that every ink clears 4.5 on
  // `surface` AND on `base` — a claim worth re-running, because `base` moved
  // from #F4F4F5 to #F6F4F3 when the neutral ramp went warm and nobody
  // re-measured the family against it.
  const surfaceRgb = token('wren-surface', theme).rgb
  const baseRgb = token('wren-surface-base', theme).rgb
  const inks = HUES.map((h) => {
    const ink = token(`wren-hue-${h}-ink`, theme)
    const onSurface = ratio(ink.rgb, surfaceRgb)
    const onBase = ratio(ink.rgb, baseRgb)
    if (onSurface < 4.5) failures.push(`${theme}: hue ${h} ink on surface = ${r2(onSurface)}`)
    if (onBase < 4.5) failures.push(`${theme}: hue ${h} ink on base = ${r2(onBase)}`)
    return `${h} ${r2(onSurface)}/${r2(onBase)}`
  })
  lines.push(`hue inks (surface/base)  ${inks.join(' · ')}`)
}

// -- the fills, which are translucent and must be composited ------------------

lines.push('\n## FILLS (composited over their backdrop)\n')
for (const theme of ['light', 'dark']) {
  const accent = token('wren-accent', theme)
  const base = token('wren-surface-base', theme)
  const surface = token('wren-surface', theme)
  const alpha = theme === 'light' ? 0.08 : 0.14
  for (const [bgName, bg] of [['base', base], ['surface', surface]]) {
    const filled = over(accent.rgb, bg.rgb, alpha)
    const ink = token('wren-text-1', theme)
    const v = ratio(ink.rgb, filled)
    if (v < 4.5) failures.push(`${theme}: text-1 on fill-selected over ${bgName} = ${r2(v)}`)
    lines.push(`${theme.padEnd(6)} text-1 on fill-selected over ${bgName.padEnd(8)} ${r2(v)}`)
  }
}

console.log(lines.join('\n'))

if (failures.length) {
  console.log('\n## FAILURES\n')
  for (const f of failures) console.log('  ' + f)
} else {
  console.log('\nEvery tier clears its floor on every surface measured.')
}

if (process.argv.includes('--check') && failures.length) process.exit(1)
