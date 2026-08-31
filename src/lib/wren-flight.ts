// The inbox-zero flight, as ONE WAAPI timeline — P13 v2.
//
// Six tracks and a burst, all 1040 ms = 2 x --wren-dur-celebrate, on the rig's
// joints (src/components/wren-figure.tsx, layout drawn in tokens.css §7).
//
// Why WAAPI and not motion/react: no beat in this sequence has a target that
// depends on a measured value or on input, so a stage machine would pay six
// React renders for interpolation the compositor does for free — and the burst
// joins the same timeline through a keyframe delay instead of a setTimeout
// chain, which is what makes it phase-locked to the apex rather than merely
// near it. motion/react keeps the DESCENT, where two segments need different
// easings around a rebound, and the surfaces Maru mounts itself.
//
// REDUCED MOTION. Every amplitude and every easing is read back out of the
// cascade at call time through readMotion(). getComputedStyle resolves
// media-query-dependent custom properties, so the reduced-motion block in
// tokens.css reaches this file too and every keyframe collapses to identity —
// a second line of defence behind the caller's `mode === 'full'` gate, which
// this path has never had before.

import { burst, toMs } from '@/lib/celebrate'
import { DUR, EASE_IN, EASE_OUT } from '@/lib/motion'

/** A named curve from lib/motion, in the string form WAAPI wants. */
const bezier = (curve: readonly number[]) => `cubic-bezier(${curve.join(', ')})`

/** The five beats, as fractions of the sequence. */
const BEAT = {
  anticipate: 0.144, //  150 ms — the wing cocks back, the body counter-rotates
  crouch: 0.27, //       281 ms — the anticipation drops BELOW the resting line
  launch: 0.47, //       489 ms — the release
  apex: 0.62, //         645 ms — top of the arc, and the burst
} as const

const OFFSETS = [0, BEAT.anticipate, BEAT.crouch, BEAT.launch, BEAT.apex, 1] as const

export interface Motion {
  fly: number
  squash: number
  spin: number
  flap: number
  popLg: number
  float: number
  celebrate: number
  fast: number
  slow: number
  floatDur: number
  easeOut: string
  easeIn: string
  easeInOut: string
  easeSpring: string
}

const FALLBACK: Motion = {
  fly: 64,
  squash: 0.12,
  spin: -8,
  flap: 14,
  popLg: 1.12,
  float: 7,
  celebrate: 520,
  // Durations and curves come from lib/motion, which is the one place they are
  // written in JS. Spelling them again here would put the same four numbers in
  // a third file — and only on the path nobody looks at, since this object is
  // reached only when the cascade cannot be read (tests, SSR).
  fast: DUR.fast * 1000,
  slow: DUR.slow * 1000,
  floatDur: 3200,
  easeOut: bezier(EASE_OUT),
  easeIn: bezier(EASE_IN),
  easeInOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
  easeSpring: 'cubic-bezier(0.34, 1.4, 0.64, 1)',
}

/**
 * Every quantity the sequence needs, read off the document element so the
 * cascade — including `@media (prefers-reduced-motion: reduce)` — is the one
 * authority. Never cached: a preference can change inside a session.
 */
export function readMotion(): Motion {
  if (typeof window === 'undefined' || typeof getComputedStyle !== 'function') return FALLBACK
  const style = getComputedStyle(document.documentElement)
  const num = (name: string, fallback: number) => {
    const value = Number.parseFloat(style.getPropertyValue(name))
    return Number.isFinite(value) ? value : fallback
  }
  const ms = (name: string, fallback: number) =>
    toMs(style.getPropertyValue(name).trim(), fallback)
  const str = (name: string, fallback: string) =>
    style.getPropertyValue(name).trim() || fallback

  return {
    fly: num('--wren-fly', FALLBACK.fly),
    squash: num('--wren-squash', FALLBACK.squash),
    spin: num('--wren-spin', FALLBACK.spin),
    flap: num('--wren-flap', FALLBACK.flap),
    popLg: num('--wren-pop-lg', FALLBACK.popLg),
    float: num('--wren-float', FALLBACK.float),
    celebrate: ms('--wren-dur-celebrate', FALLBACK.celebrate),
    fast: ms('--wren-dur-fast', FALLBACK.fast),
    slow: ms('--wren-dur-slow', FALLBACK.slow),
    floatDur: ms('--wren-dur-float', FALLBACK.floatDur),
    easeOut: str('--wren-ease-out', FALLBACK.easeOut),
    easeIn: str('--wren-ease-in', FALLBACK.easeIn),
    easeInOut: str('--wren-ease-in-out', FALLBACK.easeInOut),
    easeSpring: str('--wren-ease-spring', FALLBACK.easeSpring),
  }
}

/** How long the airborne half lasts, and where the descent starts. */
export function flightTiming(m: Motion = readMotion()) {
  const sequence = m.celebrate * 2 // 1040 ms
  return {
    sequence,
    apex: sequence * BEAT.apex, //           645 ms
    // One full bob period after the handoff, so the fall begins at a turning
    // point of the loop — from the top of the arc, with the loop's own zero
    // velocity, continuous with it rather than cut into it.
    descentAt: sequence + m.floatDur, //     4240 ms
    descent: m.floatDur / 2, //              1600 ms
  }
}

/** Where TRACK 1 leaves the bird, plus the bob's top. The descent starts here. */
export function settleHeight(m: Motion = readMotion()): number {
  return -(0.86 * m.fly + m.float)
}

/**
 * A track builder bound to one figure. `all` runs the same track on every
 * match, which is what the wing needs: during the celebration both poses are
 * mounted, each with its own wing on its own per-pose hinge.
 *
 * The returned canceller is the teardown for everything it started. cancel()
 * reverts to the CSS value immediately and discards the fill, so no stale
 * transform survives — an inline style would. On a finished animation it is a
 * no-op, which is what makes StrictMode's double-invoke safe.
 */
function sequencer(root: HTMLElement) {
  const running: Animation[] = []
  return {
    add(
      selector: string,
      frames: Keyframe[],
      options: KeyframeAnimationOptions,
      all = false,
    ) {
      const nodes = all
        ? Array.from(root.querySelectorAll(selector))
        : [root.querySelector(selector)]
      for (const el of nodes) {
        if (el && typeof (el as HTMLElement).animate === 'function') {
          running.push((el as HTMLElement).animate(frames, options))
        }
      }
    },
    stop() {
      for (const animation of running) animation.cancel()
    },
  }
}

export interface FlightParts {
  /** The `.wren-figure` root. */
  root: HTMLElement
  /** The particle host — `.wren-burst`. Omit and no burst fires. */
  host?: HTMLElement | null
}

/**
 * The five-beat takeoff. Returns a canceller.
 *
 * The choreography, beat by beat, because the numbers alone do not say it:
 *
 *   ANTICIPATE  the wing cocks back past its rest angle while the body
 *               counter-rotates and dips a hair. Anticipation, not a wind-up.
 *   CROUCH      the body drops BELOW the resting line (+3.8 px) and squashes
 *               from the FEET, and the shadow presses and darkens under it.
 *               This beat is the difference between a hop and a jump-cut.
 *   LAUNCH      release: 64 px up in 208 ms, stretched 1.12 vertically, the
 *               wing driving down through +10°. The perched-to-flight
 *               crossfade is hidden here, under the fastest and most stretched
 *               part of the climb, where a 120 ms dissolve reads as the wings
 *               opening rather than as two birds cross-fading.
 *   APEX        the overshoot pop, and the burst, on the same timeline.
 *   SETTLE      a spring back to the hover line, wing lagging the body.
 */
export function flight({ root, host }: FlightParts, opts: { seed?: number } = {}): () => void {
  const m = readMotion()
  const { sequence, apex } = flightTiming(m)
  const q = m.squash

  const easings = [m.easeOut, m.easeIn, m.easeOut, m.easeInOut, m.easeSpring]
  const beats = (values: string[], property: 'transform'): Keyframe[] =>
    values.map((value, i) => ({
      [property]: value,
      offset: OFFSETS[i],
      ...(easings[i] ? { easing: easings[i] } : {}),
    }))

  const { add, stop } = sequencer(root)

  // TRACK 1 — the lean joint carries the whole figure's rise and rotation.
  const rise = [0, -0.03, 0.06, -1, -1.12, -0.86].map((k) => k * m.fly)
  const tilt = [0, 0.5, 0.625, -0.75, -0.25, 0].map((k) => k * m.spin)
  add(
    '.wren-lean',
    beats(
      rise.map((y, i) => `translateY(${y.toFixed(2)}px) rotate(${tilt[i].toFixed(2)}deg)`),
      'transform',
    ),
    { duration: sequence, fill: 'both' },
  )

  // TRACK 2 — squash and stretch, pivoted at the feet, which is what gives the
  // launch weight. Every value is a calc around unity on the ADDITIVE
  // --wren-squash, the only form that collapses to 1 when the token is zeroed.
  const sx = [1, 1 + q / 6, 1 + (q * 7) / 12, 1 - q / 2, m.popLg, 1]
  const sy = [1, 1 - q / 6, 1 - q, 1 + q, m.popLg, 1]
  add(
    '.wren-breath',
    beats(
      sx.map((x, i) => `scale(${x.toFixed(4)}, ${sy[i].toFixed(4)})`),
      'transform',
    ),
    { duration: sequence, fill: 'both' },
  )

  // TRACKS 3 + 4 — the pose swap, 281→401 ms. A --wren-dur-fast crossfade
  // placed inside the launch, deliberately.
  const swapIn = BEAT.crouch
  const swapOut = swapIn + m.fast / sequence
  const dissolve = (from: number, to: number): Keyframe[] => [
    { opacity: from, offset: 0, easing: 'linear' },
    { opacity: from, offset: swapIn, easing: 'linear' },
    { opacity: to, offset: swapOut, easing: 'linear' },
    { opacity: to, offset: 1 },
  ]
  add('.wren-l-form-perched', dissolve(1, 0), { duration: sequence, fill: 'both' })
  add('.wren-l-form-flight', dissolve(0, 1), { duration: sequence, fill: 'both' })

  // TRACK 5 — the wing leads the body out and lags it back. fill 'BACKWARDS'
  // and not 'both', and that is load-bearing: script animations outrank CSS
  // animations in composite order, so a forwards fill here would permanently
  // mask the hover flap that takes over at 1040 ms and the wing would simply
  // stop. It can finish without one because its last value (-flap/2) is
  // exactly the hover flap's 0% value, so the handoff is angle-identical. The
  // failure mode is silent, which is why this is written down.
  const wing = [0, -0.5, -1.15, 0.7, -0.3, -0.5].map((k) => k * m.flap)
  add(
    '.wren-l-wing',
    beats(
      wing.map((deg) => `rotate(${deg.toFixed(2)}deg)`),
      'transform',
    ),
    { duration: sequence, fill: 'backwards' },
    true,
  )

  // TRACK 6 — the cast shadow, the cheapest beat and the biggest win. It
  // presses and darkens through the crouch, then shrinks and fades as the bird
  // climbs away from it. Without it the takeoff reads as a sprite sliding up a
  // wall. The shrink IS --wren-squash read on the ground, so it takes no token
  // of its own: a second one would let the two drift apart, which is precisely
  // what would stop it reading as three-dimensional.
  const shade = [0.28, 0.32, 0.34, 0.1, 0.05, 0.1]
  const spread = [0, 0.25, 0.4, -1.5, -1.8, -1.5].map((k) => 1 + k * q)
  add(
    '.wren-l-shadow',
    OFFSETS.map((offset, i) => ({
      opacity: shade[i],
      transform: `scale(${spread[i].toFixed(4)})`,
      offset,
      ...(easings[i] ? { easing: easings[i] } : {}),
    })),
    { duration: sequence, fill: 'both' },
  )

  const stopBurst = host ? burst(host, { seed: opts.seed, delay: apex }) : () => {}

  return () => {
    stop()
    stopBurst()
  }
}

/**
 * The landing's non-React tracks: the wing braking, the shadow coming back to
 * meet the bird, and the flight-to-perched crossfade. The body's fall itself
 * is motion/react in wren-celebration.tsx, because its two halves need
 * different easings around a rebound.
 */
export function descent({ root }: { root: HTMLElement }): () => void {
  const m = readMotion()
  const duration = flightTiming(m).descent
  const q = m.squash
  const { add, stop } = sequencer(root)

  // The wing brakes: it opens hard into the air it is pushing against, then
  // folds. It starts where the hover flap left it, not at zero, so the handoff
  // back off the CSS loop has no step in it.
  add(
    '.wren-l-wing',
    [
      { transform: `rotate(${(m.flap * -0.5).toFixed(2)}deg)`, offset: 0, easing: m.easeOut },
      { transform: `rotate(${m.flap.toFixed(2)}deg)`, offset: 0.6, easing: m.easeInOut },
      { transform: 'rotate(0deg)', offset: 1 },
    ],
    { duration, fill: 'both' },
    true,
  )

  // The shadow runs TRACK 6 backwards over the last 45%, and its 1.06
  // overshoot at 0.86 lands on the same frame as the body's rebound.
  add(
    '.wren-l-shadow',
    [
      { opacity: 0.1, transform: `scale(${(1 - 1.5 * q).toFixed(4)})`, offset: 0, easing: 'linear' },
      {
        opacity: 0.1,
        transform: `scale(${(1 - 1.5 * q).toFixed(4)})`,
        offset: 0.55,
        easing: m.easeIn,
      },
      {
        opacity: 0.34,
        transform: `scale(${(1 + 0.5 * q).toFixed(4)})`,
        offset: 0.86,
        easing: m.easeOut,
      },
      { opacity: 0.28, transform: 'scale(1)', offset: 1 },
    ],
    { duration, fill: 'both' },
  )

  // Back to perched over the final --wren-dur-slow, so the bird is already
  // folded when it touches down rather than swapping pose on the ground.
  const turn = Math.max(0, 1 - m.slow / duration)
  const dissolve = (from: number, to: number): Keyframe[] => [
    { opacity: from, offset: 0, easing: 'linear' },
    { opacity: from, offset: turn, easing: 'linear' },
    { opacity: to, offset: 1 },
  ]
  add('.wren-l-form-flight', dissolve(1, 0), { duration, fill: 'both' })
  add('.wren-l-form-perched', dissolve(0, 1), { duration, fill: 'both' })

  return stop
}
