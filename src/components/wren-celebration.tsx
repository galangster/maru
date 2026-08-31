// The five-beat inbox-zero flight — P13 v2 SCAFFOLDING.
//
// Only the ?tune=1 stage (src/dev/wren-stage.tsx) mounts this today. The
// shipped celebration is still CelebrationMark in empty-state.tsx; this
// sequence replaces it only after DialKit tuning settles the numbers and the
// owner ratifies them. Until then nothing in the app tree imports this file.
//
// Doctrine carried over from the shipped choreography: the burst mounts only
// in full motion mode; reduced motion and captures get the still bird with at
// most a 120 ms crossfade; lib/celebrate's frequency guard stays with the
// caller (EmptyState), not here.
//
// The transitions lean on lib/motion's SPRING — the one spring in the app.
// The tuning stage may bend stiffness/damping while exploring; whatever it
// settles on either becomes SPRING or arrives as a ratified exception at
// seal, never as a silent second spring.
//
/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — inbox zero, five beats
 *
 * Read top-to-bottom. Each value is ms after trigger.
 *
 *    0ms   NOTICE  perched Maru perks: tilts back 3°, lifts 2px
 *  180ms   CROUCH  anticipation squash from the feet (scaleY → 0.9)
 *  330ms   LEAP    springs off: rises 18px, perched → flight crossfade
 *  560ms   APEX    overshoot pop (scale → 1.12) + the particle burst
 *  900ms   SETTLE  eases to rest and hands off to the wren-float bob
 * ───────────────────────────────────────────────────────── */

import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'

import { WrenBlob, WrenFlying, WrenFlyingArrival, WrenPerched } from '@/components/wren-figure'
import { burst } from '@/lib/celebrate'
import { DUR, EASE_OUT, SPRING, type MotionMode } from '@/lib/motion'

const TIMING = {
  notice: 0, //   Maru perks up
  crouch: 180, // anticipation squash
  leap: 330, //   leaves the ground, pose swaps
  apex: 560, //   top of the arc, burst fires
  settle: 900, // rests into the float loop
}

/* Beat 1 — the perk. */
const NOTICE = {
  tilt: -3, // deg, back on the heels
  lift: 2, //  px up
}

/* Beat 2 — the anticipation squash, planted on the feet. */
const CROUCH = {
  squashY: 0.9, //  scaleY at the bottom of the crouch
  stretchX: 1.05, // scaleX, mass goes sideways
  sink: 3, //       px down
}

/* Beat 3 — the launch. */
const LEAP = {
  rise: 18, //                  px off the ground
  tilt: 4, //                   deg, nose into the climb
  crossfadeMs: DUR.fast * 1000, // perched → flight opacity swap; the dial may explore above it
}

/* Beat 4 — the pop at the top. Starts as --wren-pop-lg's 1.12; whatever the
   tuning settles on gets written back into that token at seal, so the two
   celebrations never carry two different overshoots. */
const APEX = {
  pop: 1.12,
}

/* Beat 5 — where the bird rests while wren-float bobs it. */
const SETTLE = {
  hover: 8, // px above the ground line
}

export const CELEBRATION_DEFAULTS = {
  timing: TIMING,
  notice: NOTICE,
  crouch: CROUCH,
  leap: LEAP,
  apex: APEX,
  settle: SETTLE,
  spring: { stiffness: SPRING.stiffness as number, damping: SPRING.damping as number },
}

export type WrenCelebrationParams = typeof CELEBRATION_DEFAULTS

/**
 * The five-beat sequence. `replayTrigger` restarts it (the tuning stage's
 * replay button); timing tweaks from `params` apply on the next replay, the
 * per-beat values apply live.
 */
export function WrenCelebration({
  mode,
  params = CELEBRATION_DEFAULTS,
  replayTrigger = 0,
}: {
  mode: MotionMode
  params?: WrenCelebrationParams
  replayTrigger?: number
}) {
  const host = useRef<HTMLDivElement>(null)
  const [stage, setStage] = useState(0)
  const timing = useRef(params.timing)
  timing.current = params.timing

  useEffect(() => {
    if (mode !== 'full') return
    setStage(0)
    // TIMING's key order is the beat order; stage n is beat n.
    const timers = Object.values(timing.current).map((ms, index) =>
      setTimeout(() => setStage(index + 1), ms),
    )
    return () => timers.forEach(clearTimeout)
  }, [mode, replayTrigger])

  const atApex = stage >= 4
  useEffect(() => {
    if (!atApex || mode !== 'full' || !host.current) return
    return burst(host.current)
  }, [atApex, mode])

  // Reduced motion and captures: the exact markup the shipped mark renders —
  // WrenFlyingArrival owns that contract (tokens zero it to the 120 ms
  // crossfade; `.screenshot` stills it outright).
  if (mode !== 'full') {
    return (
      <div className="relative flex h-28 w-36 items-center justify-center select-none">
        <WrenFlyingArrival />
      </div>
    )
  }

  const spring = { ...SPRING, ...params.spring }
  const crossfade = { duration: params.leap.crossfadeMs / 1000, ease: 'linear' as const }
  const crouching = stage === 2

  // One row per beat — the storyboard again, as numbers. The squash joint
  // below stays separate: it scales from the feet while these move the whole
  // figure from its centre.
  const frames = [
    { y: 0, rotate: 0, scale: 1 },
    { y: -params.notice.lift, rotate: params.notice.tilt, scale: 1 }, // NOTICE
    { y: params.crouch.sink, rotate: params.notice.tilt, scale: 1 }, //  CROUCH
    { y: -params.leap.rise, rotate: params.leap.tilt, scale: 1 }, //     LEAP
    { y: -params.settle.hover, rotate: 0, scale: params.apex.pop }, //   APEX
    { y: -params.settle.hover, rotate: 0, scale: 1 }, //                 SETTLE
  ]

  return (
    <div ref={host} className="relative flex h-28 w-36 items-center justify-center select-none">
      <WrenBlob align="end">
        {/* The float layer: CSS owns the bob after SETTLE, so it never fights
            the motion values below, which have finished by then. */}
        <span
          aria-hidden
          className="inline-flex leading-none"
          style={
            stage >= 5
              ? { animation: 'wren-float var(--wren-dur-float) ease-in-out infinite alternate' }
              : undefined
          }
        >
          {/* The flight joint: rise, tilt and the apex pop, from the centre. */}
          <motion.span className="inline-flex" animate={frames[stage]} transition={spring}>
            {/* The squash joint: anticipation only, planted on the feet. */}
            <motion.span
              className="relative inline-flex h-24 w-24 origin-bottom"
              animate={{
                scaleX: crouching ? params.crouch.stretchX : 1,
                scaleY: crouching ? params.crouch.squashY : 1,
              }}
              transition={{ duration: DUR.fast, ease: EASE_OUT }}
            >
              <motion.span
                className="absolute inset-0"
                animate={{ opacity: stage >= 3 ? 0 : 1 }}
                transition={crossfade}
              >
                <WrenPerched alive={false} className="h-24 w-24" />
              </motion.span>
              <motion.span
                className="absolute inset-0"
                initial={{ opacity: 0 }}
                animate={{ opacity: stage >= 3 ? 1 : 0 }}
                transition={crossfade}
              >
                <WrenFlying className="h-24 w-24" />
              </motion.span>
            </motion.span>
          </motion.span>
        </span>
      </WrenBlob>
    </div>
  )
}
