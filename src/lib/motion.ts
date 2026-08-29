// Motion, in one place — DIRECTION §9.
//
// Three durations, two easings, one spring. Nothing here invents a value; the
// numbers are the same ones `tokens.css` publishes to CSS, expressed in the
// seconds that motion/react wants.
//
// Division of labour:
//   * motion/react drives the surfaces Wren mounts itself — the composer
//     sheet, the reading pane's content, the onboarding cards.
//   * CSS keyframes drive every surface Base UI mounts (dialogs, popovers,
//     tooltips, menus), because Base UI is the unmount authority there and
//     reads the CSS animation to know when it may remove the node. Wrapping
//     those in AnimatePresence would fight it. Micro-states — hover, press,
//     focus, fill — are CSS everywhere.
//
// Every preset has three modes:
//   full     — transform + opacity
//   reduced  — a 120 ms opacity crossfade, no transform (DIRECTION §9)
//   off      — nothing moves at all, for `?screenshot=1`

import { useReducedMotion } from 'motion/react'

import { isScreenshot } from '@/lib/env'

/** Seconds, because that is motion/react's unit. Milliseconds in tokens.css. */
export const DUR = { fast: 0.12, base: 0.2, slow: 0.32 } as const

/** DIRECTION §9. Entrances and nearly everything else. */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const
/**
 * DIRECTION's second easing, `--wren-ease-in-out`, is not mirrored here on
 * purpose: it is for movement between two on-screen states, which is CSS
 * transition work. Nothing motion/react drives in Wren needs it.
 */
/**
 * Exits accelerate away. Not a third named easing — it is EASE_OUT read
 * backwards, which is what "ease-in" means for a curve defined as a pair.
 */
export const EASE_IN = [0.64, 0, 0.78, 0] as const

/** The one spring in the whole app. A second one is not on the table. */
export const SPRING = { type: 'spring', stiffness: 420, damping: 34, mass: 0.9 } as const

/** Exits run at 0.7x the entrance. */
export const EXIT_DUR = Math.round(DUR.base * 0.7 * 1000) / 1000

export type MotionMode = 'full' | 'reduced' | 'off'

/**
 * What this session is allowed to animate. `?screenshot=1` turns motion off
 * outright: `.screenshot` in index.css kills CSS transitions, but motion/react
 * writes inline styles frame by frame and would ignore it.
 */
export function useMotionMode(): MotionMode {
  const reduced = useReducedMotion()
  if (isScreenshot) return 'off'
  return reduced ? 'reduced' : 'full'
}

export interface Preset {
  initial: Record<string, number>
  animate: Record<string, number>
  exit: Record<string, number>
  transition: Record<string, unknown>
}

const STILL: Preset = {
  initial: { opacity: 1 },
  animate: { opacity: 1 },
  exit: { opacity: 1 },
  transition: { duration: 0 },
}

const FADE: Preset = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: DUR.fast, ease: 'linear' },
}

/**
 * A floating surface arriving: opacity, a 4% scale step, and a short lift.
 * The spring carries the entrance; the exit is a shorter, accelerating fade so
 * leaving never reads as an entrance played backwards.
 */
export function sheetPreset(mode: MotionMode): Preset {
  if (mode === 'off') return STILL
  if (mode === 'reduced') return FADE
  return {
    initial: { opacity: 0, scale: 0.96, y: 12 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.98, y: 8 },
    transition: SPRING,
  }
}

/** The exit half of `sheetPreset`, which must not use the spring. */
export function exitTransition(mode: MotionMode): Record<string, unknown> {
  if (mode === 'off') return { duration: 0 }
  return { duration: EXIT_DUR, ease: mode === 'reduced' ? 'linear' : EASE_IN }
}

/** Nothing moves. The keyboard traversal path, and the capture path. */
export function stillPreset(): Preset {
  return STILL
}

/**
 * Reading-pane content when the thread changes.
 *
 * It was a 200 ms `opacity + y: 4` crossfade replayed on every `j` and every
 * `k`. A triage user paid 200 ms of fade per row for content that was legible
 * before the fade finished, so it read as lag rather than as feedback
 * (UI-REVIEW-2026-08-28 S1). The lift is gone and the duration is the 120 ms
 * one; the keyboard path does not call this at all — see `reading-pane.tsx`.
 */
export function crossfadePreset(mode: MotionMode): Preset {
  if (mode === 'off') return STILL
  if (mode === 'reduced') return FADE
  return {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: DUR.fast, ease: EASE_OUT },
  }
}

/**
 * A short list of blocks arriving one after another. 40 ms between them reads
 * as arrival; simultaneous reads as a flash. `step` is 0 under reduced motion,
 * so the whole group crossfades at once instead of marching.
 */
export function staggerPreset(mode: MotionMode): { item: Preset; step: number } {
  if (mode === 'off') return { item: STILL, step: 0 }
  if (mode === 'reduced') return { item: FADE, step: 0 }
  return {
    item: {
      initial: { opacity: 0, y: 8 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: 0 },
      transition: { duration: DUR.base, ease: EASE_OUT },
    },
    step: 0.04,
  }
}
