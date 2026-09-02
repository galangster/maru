#!/usr/bin/env node
// Measure the shipped palette. Reads src/styles/tokens.css, converts every
// OKLCH value the way a browser does, and prints the WCAG 2.x ratios
// DIRECTION §3 certifies.
//
// It exists because that section is headed "computed not estimated" and was
// certifying a palette the build no longer has: DIRECTION documented hue-286
// neutrals and an indigo hue-268 accent months after P14 shipped hue-50
// neutrals and a coral hue-13 accent. A table of ratios for colours nobody
// renders is worse than no table, because it is the one document somebody
// would check a colour against.
//
// The colour maths and the token parser live in `scripts/lib/`, because
// `tests/contrast.test.ts` asserts the same numbers and two copies of an sRGB
// decode is how a palette gets certified by one formula and drawn by another.
//
// Run it after any token change:  node scripts/contrast-audit.mjs
// `--check` exits non-zero if a text tier fails AA on a surface it is
// permitted to sit on, so CI or a pre-seal gate can hold the line.

import { hex, r2, ratio } from './lib/color.mjs'
import { backdropsFor, fillsFor } from './lib/fills.mjs'
import { tokenReader } from './lib/tokens.mjs'

const { token } = tokenReader()

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
//
// The list itself is `scripts/lib/fills.mjs`, shared with the gate in
// `tests/contrast.test.ts`, and it says there why it is one list. Here it is
// only measured: every tier that is allowed to sit on a fill, against it.

lines.push('\n## TINTED FILLS (composited over their backdrop)\n')
for (const theme of ['light', 'dark']) {
  const fills = fillsFor(theme)
  lines.push(`${theme}: ${fills.map(([n, rgb]) => `${n} ${hex(rgb)}`).join(' · ')}`)

  for (const [label, name] of [
    ['text-1', 'wren-text-1'],
    ['text-3', 'wren-text-3'],
    ['on-fill', 'wren-text-on-fill'],
    ['accent-on-fill', 'wren-accent-on-fill'],
  ]) {
    const ink = token(name, theme)
    // text-3 is reported for the record, not gated: it is the tier that fails
    // on a fill, and `on-fill` is the answer. Gating it here would re-file
    // issues #26 and #27 against a build that has already answered them.
    const gated = label !== 'text-3'
    const cells = fills.map(([n, rgb]) => {
      const v = ratio(ink.rgb, rgb)
      if (gated && v < 4.5) failures.push(`${theme}: ${label} on ${n} = ${r2(v)}`)
      return `${n} ${r2(v)}${v < 4.5 ? ' ✗' : ''}`
    })
    lines.push(`  ${label.padEnd(15)} ${hex(ink.rgb)}  ${cells.join(' · ')}`)
  }
}

// -- the focus ring, which is an indicator and takes the 3:1 floor -----------
//
// One token, one ring, every control. It is drawn on all three surfaces and on
// the selected row's wash, so the worst of those four is the number that
// matters. Issue #22: at 50% alpha it was 2.05 light and 2.77 dark.

lines.push('\n## FOCUS RING (WCAG 2.2 SC 1.4.11, 3:1)\n')
for (const theme of ['light', 'dark']) {
  const ring = token('wren-focus-ring', theme)
  const cells = backdropsFor(theme).map(([n, rgb]) => {
    const v = ratio(ring.rgb, rgb)
    if (v < 3) failures.push(`${theme}: focus ring on ${n} = ${r2(v)} (needs 3)`)
    return `${n} ${r2(v)}${v < 3 ? ' ✗' : ''}`
  })
  lines.push(`${theme.padEnd(6)} ${hex(ring.rgb)}  ${cells.join(' · ')}`)
}

console.log(lines.join('\n'))

if (failures.length) {
  console.log('\n## FAILURES\n')
  for (const f of failures) console.log('  ' + f)
} else {
  console.log('\nEvery tier clears its floor on every surface measured.')
}

if (process.argv.includes('--check') && failures.length) process.exit(1)
