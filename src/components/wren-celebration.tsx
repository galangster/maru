// The inbox-zero celebration — the one milestone Maru celebrates.
//
// This is the SHIPPED sequence. `CelebrationMark` in empty-state.tsx renders
// it, and the `?tune=1` stage (src/dev/wren-stage.tsx) mounts the same
// component against the same amplitude tokens, so there is no scaffold that
// can drift from what ships.
//
/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — inbox zero
 *
 * Read top-to-bottom. Each value is ms after the trigger. The airborne half is
 * one WAAPI timeline (lib/wren-flight.ts); the fall is motion/react.
 *
 *      0ms   PERCHED      the bird is ALREADY on the ground, at rest
 *    150ms   ANTICIPATE   wing cocks back, body counter-rotates
 *    281ms   CROUCH       drops BELOW the resting line, squashes from the
 *                         feet, and the shadow presses and darkens
 *    489ms   LAUNCH       64px up in 208ms; the perched→flight crossfade is
 *                         hidden here, where it reads as wings opening
 *    645ms   APEX         overshoot pop, and the 18-particle burst, phase-
 *                         locked to this frame by a keyframe delay
 *   1040ms   SETTLE       springs onto the hover line, wing lagging behind
 *   1040ms   HOVER        CSS takes over: a 3200ms bob, the wing beating
 *                         twice per cycle, two sparkle twinkles and no more
 *   4240ms   DESCENT      one full bob period later, so the fall begins at a
 *                         turning point with the loop's own zero velocity
 *   5840ms   LANDED       the ordinary perched bird, handed to the same idle
 *                         clock every other quiet surface runs, with its
 *                         first behaviour forced to wing-settle at +600ms
 * ───────────────────────────────────────────────────────── */

import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'

import { WrenCelebrationStill, WrenFigure, WrenPerched } from '@/components/wren-figure'
import { EASE_IN, EASE_OUT, type MotionMode } from '@/lib/motion'
import { descent, flightTiming, flight, readMotion, settleHeight } from '@/lib/wren-flight'

type Phase = 'flight' | 'descent' | 'landed'

/** The bird folding up after it lands, 600 ms later. */
const LANDING_BEAT = { name: 'wing-settle', delay: 600 } as const

/**
 * The fall, as the fraction of the drop still remaining at each keyframe time:
 * the bird falls, arrives at 72%, rebounds, and stops. Two segments of
 * --wren-ease-in (gravity taking over) then two of --wren-ease-out.
 *
 * The rebound is 2 px flat rather than a fraction of the drop, because it is a
 * hop off the ground and not a proportion of however high the bird went.
 */
const FALL_TIMES = [0, 0.35, 0.72, 0.86, 1]
const REBOUND = -2
const fallFrom = (drop: number) => [drop, drop * 0.553, 0, REBOUND, 0]

/**
 * The whole celebration. `replayTrigger` restarts it, which is what the tuning
 * stage's replay button changes.
 *
 * The amplitudes are not props. They are the seven tokens in tokens.css, which
 * the sequencer reads through getComputedStyle at call time — so the tuning
 * stage tunes by writing those custom properties, the reduced-motion block
 * reaches the WAAPI path, and there is exactly one place any of these numbers
 * is written down.
 */
export function WrenCelebration({
  mode,
  land = false,
  replayTrigger = 0,
}: {
  mode: MotionMode
  /**
   * Fire the descent. The app leaves this false — "the bird should just be
   * flying continuously for the inbox zero animation" (owner, 2026-08-31) —
   * so Maru takes off and then cruises until the surface unmounts.
   *
   * The descent is DISARMED, never deleted: `?tune=1` passes this so the full
   * arc stays replayable and tunable, and it is the exit if the bird is ever
   * wanted home again. Deleting descent(), settleHeight(), FALL_TIMES and the
   * 'descent'/'landed' phases would have been the smaller diff and would have
   * thrown all of that away.
   */
  land?: boolean
  replayTrigger?: number
}) {
  const figure = useRef<HTMLDivElement>(null)
  const host = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<Phase>('flight')
  const [drop, setDrop] = useState(0)
  const [fallSec, setFallSec] = useState(1.6)

  useEffect(() => {
    if (mode !== 'full') return
    const root = figure.current
    if (!root) return

    setPhase('flight')
    const timing = flightTiming(readMotion())
    let stopSequence = flight({ root, host: host.current })
    const timers: ReturnType<typeof setTimeout>[] = []

    // Only these two timers are conditional. The 0 → hand-off takeoff above is
    // byte-unchanged, which is why the bird still LAUNCHES rather than simply
    // appearing airborne — the arc a person sees is earned, and only its
    // ending changed.
    if (land) {
      timers.push(
        setTimeout(() => {
          // Hand the settle offset AND the top of the bob to the fall in the
          // same commit that cancels the tracks holding them, so the swap has
          // no step: the lean's -0.86 x --wren-fly and the bob's --wren-float
          // leave the figure exactly where this wrapper picks it up.
          setDrop(settleHeight())
          setFallSec(timing.descent / 1000)
          setPhase('descent')
          stopSequence()
          stopSequence = descent({ root })
        }, timing.descentAt),
      )
      timers.push(
        setTimeout(() => setPhase('landed'), timing.descentAt + timing.descent),
      )
    }

    return () => {
      for (const id of timers) clearTimeout(id)
      stopSequence()
    }
  }, [mode, land, replayTrigger])

  // Reduced motion and captures: a still PERCHED bird. The branch lives here
  // rather than inside the figure because this is the component that already
  // receives `mode`, and wren-figure.tsx reserves the reduced-motion answer for
  // the token layer — a JS copy down there would be a second answer to it.
  if (mode !== 'full') {
    return (
      <div className="relative flex items-center justify-center select-none">
        <WrenCelebrationStill />
      </div>
    )
  }

  if (phase === 'landed') {
    // One resting state for the character in the whole app: the celebration
    // hands the bird to the same clock that runs every other quiet surface.
    return (
      <div className="relative flex items-center justify-center select-none">
        <WrenPerched alive opening={LANDING_BEAT} />
      </div>
    )
  }

  const falling = phase === 'descent'

  return (
    <div className="relative flex items-center justify-center select-none">
      <motion.div
        className="inline-flex"
        animate={falling ? { y: fallFrom(drop) } : { y: 0 }}
        transition={
          falling
            ? {
                duration: fallSec,
                times: FALL_TIMES,
                ease: [EASE_IN, EASE_IN, EASE_OUT, EASE_OUT],
              }
            : { duration: 0 }
        }
      >
        <WrenFigure
          alive
          poses="both"
          flying={phase === 'flight'}
          cruising={phase === 'flight'}
          showing={falling ? 'flight' : 'perched'}
          rootRef={figure}
          hostRef={host}
        />
      </motion.div>
    </div>
  )
}
