// Inbox zero — the one milestone Maru celebrates, and the only place in the
// app that spends a particle. AMIE-STUDY §7(c).2.
//
// Everything here is bounded on purpose:
//
//   · 18 particles, one absolutely-positioned layer, torn down on the last
//     `finish`. Peak DOM cost is 19 nodes for 0.6 s.
//   · One `element.animate()` per particle, three keyframes each encoding a
//     ballistic arc. Nothing runs per frame on the main thread, and only
//     `transform` and `opacity` are ever written, so the whole burst
//     composites off it.
//   · A frequency guard: once per transition to zero, and never twice inside
//     60 s. This is the part most likely to be dropped in implementation and
//     it is the part that decides whether the feature is charming or
//     infuriating.
//   · Under reduced motion the layer is never mounted at all. Making it
//     invisible is not the same thing.

import { HUES, hueSolid } from '@/lib/hue'

/** Three of the eighteen particles are glyphs rather than discs. */
const CONFETTI = ['🎉', '✨', '🍃'] as const

/** The discs are the category hue family, in its own order — lib/hue is the
 *  one place that decides what those are, and a second list here would drift
 *  the moment a hue is added or renamed. */
const HUE_FILLS = HUES.map(hueSolid)

const PARTICLES = 18
const GLYPH_PARTICLES = 3
const STAGGER_MS = 60
/** Gravity, px/s². Baked into the keyframe offsets, never integrated in JS. */
const GRAVITY = 900

/** Used only where the cascade cannot be read — tests, SSR. */
const FALLBACK_MS = 520
const FALLBACK_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'

/**
 * Milliseconds out of a CSS time, whatever unit it arrived in.
 *
 * A custom property comes back from getPropertyValue exactly as it was
 * AUTHORED, and the production CSS minifier rewrites `520ms` as `.52s`. A bare
 * parseFloat therefore reads 520 in dev and 0.52 in the shipped build — a
 * whole celebration that happens only in development. It lives in this file,
 * rather than beside the flight sequencer that also needs it, because this is
 * the leaf: `wren-flight.ts` imports the burst, so the arrow has to run this
 * way or the two form a cycle.
 */
export function toMs(raw: string, fallback: number): number {
  const value = Number.parseFloat(raw)
  if (!Number.isFinite(value)) return fallback
  if (/ms\s*$/.test(raw)) return value
  return /s\s*$/.test(raw) ? value * 1000 : value
}

/**
 * The burst's duration and easing are --wren-dur-celebrate and
 * --wren-ease-out, read out of the cascade rather than copied into this file.
 * They used to be a `560` and a hand-typed cubic-bezier string, which had
 * already drifted 40 ms from the token they were meant to be.
 */
function readBurstTiming(): { duration: number; easing: string } {
  if (typeof window === 'undefined' || typeof getComputedStyle !== 'function') {
    return { duration: FALLBACK_MS, easing: FALLBACK_EASE }
  }
  const style = getComputedStyle(document.documentElement)
  return {
    duration: toMs(style.getPropertyValue('--wren-dur-celebrate').trim(), FALLBACK_MS),
    easing: style.getPropertyValue('--wren-ease-out').trim() || FALLBACK_EASE,
  }
}

/** Day of the year, so the deck advances once a day rather than per render. */
function dayOfYear(at: number): number {
  const d = new Date(at)
  const start = Date.UTC(d.getUTCFullYear(), 0, 0)
  return Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - start) / 86_400_000)
}

/**
 * Mulberry32. The burst is seeded from the day, so two
 * captures of the same frame are identical — `Math.random` would make the
 * screenshot gate impossible to compare, and there is nothing here that needs
 * to be unpredictable.
 */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

// -- the frequency guard ------------------------------------------------------
//
// Module scope, deliberately outside React: both facts have to survive the
// list unmounting while the user walks through other folders, and neither is
// worth persisting past the window.

const COOLDOWN_MS = 60_000
let lastFiredAt = 0

/**
 * True at most once every 60 s, and this is the **whole** frequency guard.
 *
 * It used to sit behind a once-per-session flag as well, which read as a
 * second mechanism answering the same question and made the real one look
 * optional. A refetch, a window focus and a pane remount are all stopped by
 * the cooldown alone.
 */
export function claimCelebration(now: number = Date.now()): boolean {
  if (now - lastFiredAt < COOLDOWN_MS) return false
  lastFiredAt = now
  return true
}

// -- the burst ----------------------------------------------------------------

export interface BurstOptions {
  /** Defaults to the day of the year, so two captures are identical. */
  seed?: number
  /**
   * Milliseconds before the first particle leaves. The flight sequencer passes
   * its APEX offset here rather than wrapping this call in a setTimeout: one
   * delay on eighteen already-scheduled animations phase-locks the burst to the
   * top of the arc, where a timer would only land near it.
   */
  delay?: number
}

/**
 * Fire the burst inside `host`, from its centre. Returns a canceller.
 *
 * The caller decides whether to call this at all: under reduced motion, and in
 * the capture path, it is never reached.
 */
export function burst(host: HTMLElement, opts: BurstOptions = {}): () => void {
  if (typeof host.animate !== 'function') return () => {}

  const { seed = dayOfYear(Date.now()), delay = 0 } = opts
  const { duration: BURST_MS, easing } = readBurstTiming()
  const random = rng(seed + 1)
  const layer = document.createElement('div')
  layer.setAttribute('aria-hidden', 'true')
  layer.style.cssText =
    'position:absolute;inset:0;overflow:hidden;pointer-events:none;contain:strict;'
  host.appendChild(layer)

  let live = PARTICLES
  const running: Animation[] = []
  const done = () => {
    live -= 1
    if (live <= 0) layer.remove()
  }

  for (let i = 0; i < PARTICLES; i += 1) {
    const node = document.createElement('span')
    const glyph = i < GLYPH_PARTICLES

    if (glyph) {
      node.textContent = CONFETTI[i % CONFETTI.length]
      node.style.cssText = 'position:absolute;left:50%;top:50%;font-size:12px;line-height:1;'
    } else {
      const size = 6 + Math.round(random() * 4)
      node.style.cssText =
        `position:absolute;left:50%;top:50%;width:${size}px;height:${size}px;` +
        `border-radius:50%;background:${HUE_FILLS[i % HUE_FILLS.length]};`
    }

    // A 140° fan opening upward: -160° to -20°, measured from +x with y down.
    const angle = (-160 + random() * 140) * (Math.PI / 180)
    const speed = 180 + random() * 140
    const vx = Math.cos(angle) * speed
    const vy = Math.sin(angle) * speed
    const spin = (random() * 2 - 1) * 240

    // Three keyframes. The arc lives in the offsets, so nothing integrates a
    // position per frame — the compositor interpolates between three known
    // transforms and the main thread is free for the whole 560 ms.
    const at = (t: number) => ({
      x: vx * t,
      y: vy * t + 0.5 * GRAVITY * t * t,
    })
    const half = at(BURST_MS / 2000)
    const end = at(BURST_MS / 1000)

    const animation = node.animate(
      [
        { transform: 'translate(-50%,-50%) scale(0.6)', opacity: 0 },
        {
          transform: `translate(calc(-50% + ${half.x.toFixed(1)}px), calc(-50% + ${half.y.toFixed(1)}px)) rotate(${(spin / 2).toFixed(0)}deg) scale(1)`,
          opacity: 1,
          offset: 0.5,
        },
        {
          transform: `translate(calc(-50% + ${end.x.toFixed(1)}px), calc(-50% + ${end.y.toFixed(1)}px)) rotate(${spin.toFixed(0)}deg) scale(0.9)`,
          opacity: 0,
        },
      ],
      {
        duration: BURST_MS,
        delay: delay + random() * STAGGER_MS,
        easing,
        // 'both', not 'forwards'. A particle inside its own 0–60 ms stagger is
        // in the animation's BEFORE phase, and with a forwards-only fill no
        // fill applies there — so eighteen dots rendered at full opacity,
        // unmoved, for up to four frames before they launched. With a delay
        // this large it would have been four frames at the apex.
        fill: 'both',
      },
    )
    // `once`, and both events: cancelling a FINISHED animation still fires
    // `cancel` (its play state is `finished`, not `idle`), so the teardown
    // would otherwise decrement `live` twice for the same particle.
    animation.addEventListener('finish', done, { once: true })
    animation.addEventListener('cancel', done, { once: true })
    running.push(animation)
    layer.appendChild(node)
  }

  // Removing the layer detaches the nodes but leaves eighteen WAAPI animations
  // on the document timeline, still being ticked. Cancel them first.
  return () => {
    for (const animation of running) animation.cancel()
    layer.remove()
  }
}
