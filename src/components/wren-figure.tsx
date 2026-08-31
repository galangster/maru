// Maru the wren, as a figure — the canonical character (P13, Nick's sheet)
// rendered from the traced pose paths in src/assets/wren-poses.ts.
//
// The character's palette is its own (sheet: #FF4F87 · #FFD6E1 · #FEE9EF ·
// ink #1A1A1A) and deliberately NOT the app accent: Maru the bird is hot pink
// whatever the chrome does.
//
// THE RIG. The figure is no longer one <svg>. It is a `.wren-figure` box sized
// --wren-maru-size with composited layers stacked at inset-0, all sharing
// `viewBox 0 0 440 440` so every traced coordinate is unchanged. The layout is
// drawn out in tokens.css §7, next to the rules that drive it.
//
// Why HTML wrappers and svg roots rather than <g> joints: Blink refuses to
// composite a transform animation whose target is an SVG child
// (kTransformRelatedPropertyCannotBeAcceleratedOnTarget), so the old
// wren-breathe on `g[data-wren-body]` re-rasterised the whole SVG on the main
// thread for as long as an empty pane was open. Three DOM nodes buy the
// compositor the entire idle. The split also gives the flight sequencer its
// joints, which is the other half of why it is worth the nodes.
//
// Idle life (perched, `alive`): breath — the one perpetual loop — a blink on
// its own clock, the pupil gaze, and ONE discrete behaviour at a time drawn by
// the scheduler below. All of it is gated to full motion mode: reduced motion
// and the capture path get a perfectly still bird, and the scheduler's
// Math.random is not reachable from either.

import { useEffect, useRef } from 'react'

import { WREN_FLIGHT, WREN_PERCHED, type WrenPose } from '@/assets/wren-poses'
import { cn } from '@/lib/utils'

const WREN_PINK = '#FF4F87'
const PALE = '#FFD6E1'

/** pale[2] and pale[3] of the flight pose are sparkles, not anatomy. */
const FLIGHT_SPARKLE_FROM = 2

export type PoseKind = 'perched' | 'flight'

const POSES: Record<PoseKind, WrenPose> = { perched: WREN_PERCHED, flight: WREN_FLIGHT }

/** The wing's hinge, per pose. Measured in tokens.css; see --wren-maru-*. */
const WING_ORIGIN: Record<PoseKind, string> = {
  perched: 'var(--wren-maru-shoulder)',
  flight: 'var(--wren-maru-wing-root)',
}

/**
 * One pose as two stacked svg roots: the form, and the wing on its own joint.
 *
 * The wing is last so it paints above the pale underfeathers it overlaps —
 * perched pale[2] [131, 264, 224.2, 301.2] and flight pale[0]
 * [149.3, 239.5, 228.6, 276.7] both cross the wing's bbox, and nothing else
 * in either pose does. The eye and the beak clear it in both poses (perched
 * wing maxX 253.5 against eye x0 255), so the split is pixel-identical to the
 * single-svg rig it replaces.
 */
function PoseStack({
  kind,
  eyeRef,
  sparkleFrom,
}: {
  kind: PoseKind
  eyeRef?: React.Ref<SVGGElement>
  /** Pale paths from this index on are sparkles, each its own twinkle joint. */
  sparkleFrom?: number
}) {
  const pose = POSES[kind]
  const [x0, y0, x1, y1] = pose.eye
  const w = x1 - x0
  const h = y1 - y0
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const pales = sparkleFrom === undefined ? pose.pale : pose.pale.slice(0, sparkleFrom)
  const sparkles = sparkleFrom === undefined ? [] : pose.pale.slice(sparkleFrom)

  return (
    <span className={`wren-l-form-${kind}`}>
      <svg className="wren-l-form" viewBox="0 0 440 440" aria-hidden>
        {/* The silhouette FIRST, in white, under everything. Every other part
            is painted on top of it, so no two paths ever share an edge.
            Painting the white region alone (the old `body`) meant the body and
            the wing abutted, and two independently simplified outlines never
            agree along a shared edge — the background bled through the seam as
            a hairline. Invisible against the pale field; a black outline on
            the dark one, which is where the owner spotted it (2026-08-31). */}
        <path d={pose.silhouette} fill="#FFFFFF" />
        {pales.map((d) => (
          <path key={d.slice(0, 24)} d={d} fill={PALE} />
        ))}
        {/* pink[0] is the wing and lives in its own layer below; everything
            after it is the beak. The build script guarantees that order. */}
        {pose.pink.slice(1).map((d) => (
          <path key={d.slice(0, 24)} d={d} fill={WREN_PINK} />
        ))}
        {/* The eye stays an SVG child on purpose. It is exempt from the
            compositing rule because a 220 ms blink every 3–7 s is
            event-driven, not a forever-loop, and it must sit inside the form
            it belongs to. useBlink writes style.transform and useGaze writes
            style.translate, so the two compose without fighting for one
            property. */}
        <g ref={eyeRef} data-wren-eye style={{ transformOrigin: `${cx}px ${cy}px` }}>
          <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={w / 2} fill={WREN_PINK} />
          <circle cx={cx} cy={cy - h / 2 + w / 2} r={w / 3} fill="#FFFFFF" />
        </g>
        {/* The two flight sparkles. They used to render as static pale blobs,
            which read as a rendering fault; they twinkle twice and stop. */}
        {sparkles.map((d, index) => (
          <path
            key={d.slice(0, 24)}
            d={d}
            fill={PALE}
            data-wren-sparkle={index}
            style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
          />
        ))}
      </svg>
      <svg
        className="wren-l-wing"
        viewBox="0 0 440 440"
        aria-hidden
        style={{ transformOrigin: WING_ORIGIN[kind] }}
      >
        <path d={pose.pink[0]} fill={WREN_PINK} />
      </svg>
    </span>
  )
}

/* -- attention ---------------------------------------------------------------
 *
 * One object shared by the gaze (which writes it, off a mousemove it already
 * runs) and the behaviour scheduler (which reads it). Arousal is not a third
 * clock: it is a hypot on a frame that was going to run anyway.
 */

interface Attention {
  /** Pointer currently inside NEAR_RADIUS of the figure. */
  inside: boolean
  /** When it was last inside — NEAR has a grace period, so leaving decays. */
  lastNearAt: number
  /** Installed by the scheduler: the pointer arriving after a long absence. */
  onEnter?: () => void
}

const NEAR_RADIUS = 260
const NEAR_GRACE = 3000

/**
 * The gaze: the eye follows the pointer by up to 6 user units, written to
 * `style.translate` so it composes with the blink's `style.transform` on the
 * same group. (It was 2, which renders as 0.65 px at 144 and is invisible.)
 * Measures the STATIC figure box and derives the eye's centre from the pose
 * data — never the translated group itself, whose rect would feed each frame's
 * answer into the next.
 *
 * It also stamps `attention`, because it is already computing a distance to
 * this exact box on a frame that already runs.
 */
function useGaze(
  on: boolean,
  root: React.RefObject<HTMLElement | null>,
  eye: React.RefObject<SVGGElement | null>,
  pose: WrenPose,
  attention: React.RefObject<Attention>,
) {
  useEffect(() => {
    if (!on) return
    const [x0, y0, x1, y1] = pose.eye
    const fx = (x0 + x1) / 2 / 440
    const fy = (y0 + y1) / 2 / 440
    let frame = 0
    const onMove = (event: MouseEvent) => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const el = eye.current
        const box = root.current?.getBoundingClientRect()
        if (!box) return

        // Arousal, from the figure's centre.
        const state = attention.current
        const near =
          Math.hypot(
            event.clientX - (box.left + box.width / 2),
            event.clientY - (box.top + box.height / 2),
          ) <= NEAR_RADIUS
        if (near) {
          const away = Date.now() - state.lastNearAt
          state.lastNearAt = Date.now()
          if (!state.inside && away > 20_000) state.onEnter?.()
        }
        state.inside = near

        if (!el) return
        const dx = event.clientX - (box.left + box.width * fx)
        const dy = event.clientY - (box.top + box.height * fy)
        const distance = Math.hypot(dx, dy) || 1
        const reach = Math.min(distance / 40, 1) * 6
        el.style.translate = `${((dx / distance) * reach).toFixed(1)}px ${((dy / distance) * reach).toFixed(1)}px`
      })
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => {
      window.removeEventListener('mousemove', onMove)
      if (frame) cancelAnimationFrame(frame)
      if (eye.current) eye.current.style.translate = ''
    }
  }, [on, root, eye, pose, attention])
}

/**
 * Blink on a natural clock: 60 ms closed, 3–7 s apart, only while `on`. The
 * lid transition is --wren-dur-instant either side, so one blink is
 * 80 + 60 + 80 = 220 ms — about what a human blink measures.
 *
 * One blink in eight is a double. It costs a line and it breaks the observer's
 * prior for randomness, which is the whole reason a blink reads as alive.
 */
function useBlink(on: boolean) {
  const eye = useRef<SVGGElement>(null)

  useEffect(() => {
    if (!on) return
    const timers = new Set<ReturnType<typeof setTimeout>>()
    const after = (ms: number, run: () => void) => {
      const id = setTimeout(() => {
        timers.delete(id)
        run()
      }, ms)
      timers.add(id)
    }

    const shut = (ms: number, then: () => void) => {
      const el = eye.current
      if (!el) return then()
      el.style.transform = 'scaleY(0.12)'
      after(ms, () => {
        if (eye.current) eye.current.style.transform = ''
        then()
      })
    }

    const schedule = () => {
      after(3000 + Math.random() * 4000, () => {
        if (Math.random() < 0.12) shut(90, () => after(110, () => shut(90, schedule)))
        else shut(60, schedule)
      })
    }
    schedule()

    return () => {
      for (const id of timers) clearTimeout(id)
      timers.clear()
      if (eye.current) eye.current.style.transform = ''
    }
  }, [on])

  return eye
}

/* -- the behaviour clock -----------------------------------------------------
 *
 * The scheduler picks a NAME and writes `data-wren-do` on the figure root. It
 * never writes a transform and never holds a duration: CSS owns every quantity
 * (tokens.css §7), and a bubbling `animationend` clears the attribute and
 * schedules the next draw. One attribute with one value is also what makes
 * "one behaviour at a time" structural rather than a rule someone has to
 * remember.
 *
 * Two arousal states, not three. A third state and a weighted decay is a
 * Tamagotchi: it costs state, tests and a visibility edge case to deliver
 * something below the threshold of perception.
 */

export type IdleName =
  | 'wing-shrug'
  | 'head-tilt'
  | 'weight-shift'
  | 'weight-shift-back'
  | 'look-back'
  | 'wing-settle'

export interface IdleOpening {
  name: IdleName
  delay: number
}

interface Behaviour {
  name: IdleName
  weight: number
}

/** Full pool. Peak velocities at 144 px all clear the 34 px/s NEAR budget. */
const NEAR_POOL: Behaviour[] = [
  { name: 'wing-shrug', weight: 34 },
  { name: 'head-tilt', weight: 26 },
  { name: 'weight-shift', weight: 22 },
  { name: 'look-back', weight: 18 },
]
/** Only the two that clear 6 px/s, the budget for something in the corner of
 *  the eye of somebody working in the column beside it. */
const AWAY_POOL: Behaviour[] = [
  { name: 'weight-shift', weight: 58 },
  { name: 'wing-settle', weight: 42 },
]

const NEAR_MEAN = 4200
const AWAY_MEAN = 17_000
/** A refractory period, so two behaviours never touch. */
const MIN_GAP = 1400
const LOOK_BACK_COOLDOWN = 25_000
const GREET_COOLDOWN = 20_000
/** A mistyped selector otherwise produces a bird that silently freezes. */
const WATCHDOG = 5000

/**
 * Poisson, not uniform. Gaps between independent spontaneous events are
 * exponential, and the loose clustering that produces is what reads as an
 * animal; uniform gaps read as a metronome.
 */
function gapFor(mean: number): number {
  return Math.min(Math.max(-mean * Math.log(1 - Math.random()), MIN_GAP), mean * 3)
}

function useIdleBehaviours(
  on: boolean,
  root: React.RefObject<HTMLElement | null>,
  attention: React.RefObject<Attention>,
  opening?: IdleOpening,
) {
  // The opening beat is read once per run, not tracked as a dependency: a new
  // object identity each render would otherwise restart the clock, and a clock
  // that restarts every render is a bird that never moves.
  const first = useRef(opening)
  useEffect(() => {
    first.current = opening
  })

  useEffect(() => {
    if (!on) return
    const el = root.current
    if (!el) return

    let timer: ReturnType<typeof setTimeout> | undefined
    let guard: ReturnType<typeof setTimeout> | undefined
    let previous: IdleName | null = null
    let lastLookBackAt = 0
    let lastGreetAt = 0
    let mirrored = false
    let stopped = false

    const near = () => {
      const state = attention.current
      return state.inside || Date.now() - state.lastNearAt < NEAR_GRACE
    }

    const clear = () => {
      el.removeAttribute('data-wren-do')
      if (guard) clearTimeout(guard)
      guard = undefined
    }

    const draw = (): IdleName => {
      const now = Date.now()
      const pool = (near() ? NEAR_POOL : AWAY_POOL).filter(
        (b) => b.name !== 'look-back' || now - lastLookBackAt > LOOK_BACK_COOLDOWN,
      )
      const pick = () => {
        let roll = Math.random() * pool.reduce((sum, b) => sum + b.weight, 0)
        for (const b of pool) {
          roll -= b.weight
          if (roll <= 0) return b.name
        }
        return pool[pool.length - 1].name
      }
      // No behaviour twice in a row. One redraw, not a loop — insisting would
      // bias the distribution more than the repeat it is avoiding.
      let name = pick()
      if (name === previous) name = pick()
      return name
    }

    const perform = (choice: IdleName) => {
      if (stopped) return
      previous = choice
      if (choice === 'look-back') lastLookBackAt = Date.now()
      // Alternate the side a weight shift goes to. Always shifting the same
      // way reads as a twitch rather than as the bird changing feet, and two
      // attribute values are how that happens without the scheduler ever
      // writing a quantity.
      let name = choice
      if (choice === 'weight-shift') {
        mirrored = !mirrored
        name = mirrored ? 'weight-shift' : 'weight-shift-back'
      }
      el.setAttribute('data-wren-do', name)
      guard = setTimeout(() => {
        if (import.meta.env.DEV) {
          console.warn(`[wren] behaviour "${name}" never ended — check its selector`)
        }
        clear()
        schedule()
      }, WATCHDOG)
    }

    const schedule = (wait?: number) => {
      if (stopped) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(
        () => perform(draw()),
        wait ?? gapFor(near() ? NEAR_MEAN : AWAY_MEAN),
      )
    }

    const onEnd = () => {
      clear()
      schedule()
    }

    // The greeting: interest contingent on the observer is the only kind that
    // survives repetition, and this is the moment the character reads as
    // having noticed you.
    attention.current.onEnter = () => {
      const now = Date.now()
      if (now - lastGreetAt < GREET_COOLDOWN) return
      if (el.hasAttribute('data-wren-do')) return
      lastGreetAt = now
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => perform('head-tilt'), 250 + Math.random() * 350)
    }

    // A keyboard-only triager never moves a pointer, so without this they sit
    // in AWAY forever and the bird never wakes.
    const stamp = () => {
      attention.current.lastNearAt = Date.now()
    }
    stamp()

    const onVisibility = () => {
      if (document.hidden) {
        if (timer) clearTimeout(timer)
        clear()
      } else {
        // Come back in AWAY, not with whatever arousal the tab was hidden at.
        attention.current.inside = false
        attention.current.lastNearAt = 0
        clear()
        schedule()
      }
    }

    el.addEventListener('animationend', onEnd)
    document.addEventListener('focusin', stamp)
    document.addEventListener('visibilitychange', onVisibility)

    // The celebration hands the bird to this same clock, with the first draw
    // forced: the bird folding up after landing.
    const open = first.current
    if (open) timer = setTimeout(() => perform(open.name), open.delay)
    else schedule()

    return () => {
      stopped = true
      el.removeEventListener('animationend', onEnd)
      document.removeEventListener('focusin', stamp)
      document.removeEventListener('visibilitychange', onVisibility)
      if (timer) clearTimeout(timer)
      clear()
      attention.current.onEnter = undefined
      el.removeAttribute('data-wren-do')
    }
  }, [on, root, attention])
}

/* -- the figure ------------------------------------------------------------ */

/**
 * The rig. `alive` gates every CSS animation and every JS clock; `idle` runs
 * the behaviour scheduler, which the celebration's figure does not want
 * because the flight sequencer owns those joints for its 5.8 seconds.
 */
export function WrenFigure({
  alive,
  poses = 'perched',
  idle = false,
  flying = false,
  showing = 'perched',
  opening,
  rootRef,
  hostRef,
  className,
}: {
  alive: boolean
  poses?: PoseKind | 'both'
  idle?: boolean
  /** Sets data-wren-flight: the hover bob, the wing flap and the sparkles. */
  flying?: boolean
  /** Which pose CSS falls back to when no script animation holds the fade. */
  showing?: PoseKind
  opening?: IdleOpening
  rootRef?: React.RefObject<HTMLDivElement | null>
  /** Mount the particle host, as the last child of the figure. */
  hostRef?: React.RefObject<HTMLDivElement | null>
  className?: string
}) {
  const own = useRef<HTMLDivElement>(null)
  const root = rootRef ?? own
  const attention = useRef<Attention>({ inside: false, lastNearAt: 0 })
  const eye = useBlink(alive && idle)
  useGaze(alive && idle, root, eye, POSES[showing], attention)
  useIdleBehaviours(alive && idle, root, attention, opening)

  const both = poses === 'both'

  return (
    <div
      ref={root}
      aria-hidden
      className={cn('wren-figure', className)}
      data-wren-alive={alive || undefined}
      data-wren-flight={flying || undefined}
      data-wren-pose={both ? showing : undefined}
    >
      {/* The ground the white body needs. It travels WITH the character —
          grounding is part of how Maru is presented, not a decision the
          consumer makes — which is why onboarding gets a pool and no field.
          (It replaced a 112x144 rounded blob; the bird now has three layered
          cues instead of one: this pool, the traced cast shadow, and the fact
          that breath and lean both pivot at --wren-maru-feet, so the bird
          deforms ABOUT the ground rather than beside it.) */}
      <span className="wren-pool" />
      {/* The contact shadow: a feathered oval on the ground, and NOT the
          traced one any more. The tracer fuses the drawn shadow with the
          leg-and-thigh block above it, so the traced path reached 30 units up
          UNDER the body — "the shadow extends beneath the body, which looks
          weird" (owner, 2026-08-31). A shadow is where the bird meets the
          floor, so it is drawn as what it is rather than recovered from art
          that was never separable. It is on the ground, outside every joint
          the bird moves on, which is also why the flight pose can borrow it. */}
      <span className="wren-l-shadow" />
      <span className="wren-hover">
        <span className="wren-lean">
          <span className="wren-breath">
            {(both || poses === 'perched') && (
              <PoseStack kind="perched" eyeRef={showing === 'perched' ? eye : undefined} />
            )}
            {(both || poses === 'flight') && (
              <PoseStack
                kind="flight"
                eyeRef={showing === 'flight' ? eye : undefined}
                sparkleFrom={FLIGHT_SPARKLE_FROM}
              />
            )}
          </span>
        </span>
      </span>
      {hostRef && <div ref={hostRef} className="wren-burst" />}
    </div>
  )
}

/**
 * The perched Maru — empty states, onboarding, and where the celebration
 * lands. `alive` turns on breath, blink, gaze and the behaviour clock; still
 * otherwise (reduced motion, captures).
 */
export function WrenPerched({
  alive,
  opening,
  className,
}: {
  alive: boolean
  opening?: IdleOpening
  className?: string
}) {
  return <WrenFigure alive={alive} idle={alive} opening={opening} className={className} />
}

/** The flying Maru, on its own — sparkles included. */
/**
 * The celebration's STILL figure — reduced motion and the capture path.
 *
 * A perched bird, not a flight pose: a frozen flight pose is a bird stuck in
 * mid-air, which is worse than no celebration at all. What plays is
 * `wren-celebrate-in`, and every quantity in it — the start scale, the spin,
 * the overshoot, the duration — is a token the reduced-motion block in
 * tokens.css zeroes, so what survives there is the 120 ms opacity crossfade
 * DIRECTION §9 asks for, and `.screenshot` removes even that. A JS copy of
 * that rule would be a second answer to a question tokens.css has settled.
 */
export function WrenCelebrationStill() {
  return (
    <span
      aria-hidden
      className="inline-flex leading-none"
      style={{
        animation: 'wren-celebrate-in var(--wren-dur-celebrate) var(--wren-ease-spring) both',
      }}
    >
      <WrenPerched alive={false} />
    </span>
  )
}
