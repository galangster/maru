// The category hue family — AMIE-STUDY §2.2 and §7d.5.
//
// Eight hues, three states each (solid / ink / wash), defined once in
// tokens.css. This file is the only thing that decides *which* hue a thing
// gets, and it binds to exactly two sources:
//
//   · the avatar hash — a stable hash of a sender's address
//   · a Gmail label — a stable hash of the label's name
//
// Nothing else. The moment a hue decorates chrome, "one accent" becomes "no
// accent" and DIRECTION §1's near-monochrome-at-rest promise is gone. The
// brand accent stays periwinkle indigo and stays the only accent.

import type { CSSProperties } from 'react'

/** Fixed order. The index a hash lands on is the hue, so this order is load
 *  bearing: reordering it re-colours every avatar in the app. */
export const HUES = ['green', 'teal', 'blue', 'violet', 'magenta', 'red', 'orange', 'yellow'] as const

export type Hue = (typeof HUES)[number]

/**
 * FNV-1a, 32-bit. Small, stable across sessions and machines, and — unlike
 * summing char codes — it does not put every address that shares a first
 * letter on the same hue.
 */
function hash(seed: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** The hue for an address or a label name. Case-folded, so `A@b.com` and
 *  `a@b.com` are one person. */
export function hueFor(seed: string): Hue {
  return HUES[hash(seed.trim().toLowerCase()) % HUES.length]
}

export function hueSolid(hue: Hue): string {
  return `var(--wren-hue-${hue})`
}

export function hueInk(hue: Hue): string {
  return `var(--wren-hue-${hue}-ink)`
}

export function hueWash(hue: Hue): string {
  return `var(--wren-hue-${hue}-wash)`
}

/**
 * The three states as local custom properties, so a call site can write
 * `bg-[var(--hue-wash)] text-[var(--hue-ink)]` once and stay theme-aware —
 * every value below resolves through a token that `.dark` redefines.
 */
export function hueVars(hue: Hue): CSSProperties {
  return {
    '--hue': hueSolid(hue),
    '--hue-ink': hueInk(hue),
    '--hue-wash': hueWash(hue),
  } as CSSProperties
}
