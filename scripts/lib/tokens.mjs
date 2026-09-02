// Reading the shipped tokens, for anything that wants to measure them.
//
// The parser is deliberately positional rather than clever: the dark theme
// redefines the same names further down `tokens.css`, so "which block" is
// decided by where the match sits relative to the `.dark` selector.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { oklchToRgb } from './color.mjs'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')

export function readTokensCss() {
  return readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8')
}

/**
 * A reader bound to one copy of the stylesheet.
 *
 * `token(name, theme)` returns `{ rgb, clipped }`. A token defined as
 * `var(--other)` is followed, so `--wren-focus-ring: var(--wren-accent)` reads
 * as the accent rather than failing to parse — an alias is a real answer here,
 * and the point of the audit is that it stays a measured one.
 */
export function tokenReader(css = readTokensCss()) {
  const darkAt = css.search(/^\.dark\s*\{/m)
  if (darkAt === -1) throw new Error('no `.dark` block in tokens.css — the theme split moved')

  function raw(name, theme) {
    const pattern = new RegExp(`--${name}:\\s*([^;]+);`, 'g')
    let found = null
    for (const m of css.matchAll(pattern)) {
      const isDark = m.index > darkAt
      if (isDark === (theme === 'dark')) {
        found = m[1].trim()
        if (theme === 'light') break
      }
    }
    return found
  }

  function token(name, theme, depth = 0) {
    const value = raw(name, theme)
    if (value === null) throw new Error(`token --${name} not found for ${theme}`)
    const alias = value.match(/^var\(--([\w-]+)\)$/)
    if (alias) {
      if (depth > 4) throw new Error(`--${name} aliases in a loop`)
      return token(alias[1], theme, depth + 1)
    }
    const oklch = value.match(/^oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)/)
    if (!oklch) throw new Error(`token --${name} is not an oklch triple for ${theme}: ${value}`)
    return oklchToRgb(Number(oklch[1]), Number(oklch[2]), Number(oklch[3]))
  }

  return { token, raw }
}
