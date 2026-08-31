// Calm empty states. One line, one explanatory subtitle (Family 2), and a soft
// illustration built from CSS shapes — no images, nothing to load, and it
// re-tints itself with the theme.
//
// Two tiers, per MAGIC §3.6 and Family's Delight-Impact Curve. Every empty
// folder gets the *ambient* tier: the blocks arrive one after another at
// `staggerPreset`'s 40 ms step, which is arrival, not celebration. An inbox the
// user emptied **in this session** gets the *earned* tier: the wren in
// flight and a single 18-particle burst, once per transition to zero and
// never twice inside a minute (AMIE-STUDY §7c.2, `./celebrate`).
//
// That burst is the only one in the app. Archive and send are the actions that
// repeat forty times a day and they get one pop each and nothing else, because
// frequency is what kills delight.

import { useEffect, useRef } from 'react'
import { motion } from 'motion/react'

import { DUR, EASE_OUT, staggerPreset, useMotionMode } from '@/lib/motion'
import { cn } from '@/lib/utils'

import { burst } from '@/lib/celebrate'

/**
 * The pupil that watches the pointer. One rAF-throttled mousemove listener,
 * a clamped 2 px offset, and a direct transform write — no React state, so a
 * cursor sweep costs zero renders. Gated to `mode === 'full'`: reduced motion
 * and the capture path get a still, centered eye.
 */
function useWatchingEye(enabled: boolean) {
  const pupil = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!enabled) return
    let frame = 0
    const onMove = (event: MouseEvent) => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const el = pupil.current
        if (!el) return
        // Measure the static eye well (the previous sibling), not the pupil:
        // the pupil's rect includes its own current offset, which would feed
        // the last answer back into the next one.
        const box = (el.previousElementSibling ?? el).getBoundingClientRect()
        const dx = event.clientX - (box.left + box.width / 2)
        const dy = event.clientY - (box.top + box.height / 2)
        const distance = Math.hypot(dx, dy) || 1
        const reach = Math.min(distance / 40, 1) * 2
        el.style.transform = `translate(${((dx / distance) * reach).toFixed(1)}px, ${((dy / distance) * reach).toFixed(1)}px)`
      })
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => {
      window.removeEventListener('mousemove', onMove)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [enabled])

  return pupil
}

/**
 * The resting wren — the logo's geometry (a body disc, a head disc, a beak
 * triangle) rebuilt from CSS shapes at the cloud's old opacity, perched on a
 * thin bar. Ambient tier: it should register as "Maru is here, nothing is",
 * not as an illustration demanding attention. The beak carries the one
 * whisper of brand colour, and the eye quietly follows the pointer.
 */
export function WrenMark({ className }: { className?: string }) {
  const mode = useMotionMode()
  const pupil = useWatchingEye(mode === 'full')

  return (
    <div
      aria-hidden
      // Decoration must never eat a click or land in a text selection
      // (`ui-polish` §12).
      className={cn('relative h-16 w-28 select-none pointer-events-none', className)}
    >
      {/* perch */}
      <span className="bg-ink-3/25 absolute bottom-0 left-4 h-[3px] w-20 rounded-full" />
      {/* tail */}
      <span className="bg-ink-3/12 absolute bottom-[10px] left-[22px] h-2 w-5 -rotate-[24deg] rounded-full" />
      {/* body */}
      <span className="bg-ink-3/12 absolute bottom-[3px] left-[34px] size-11 rounded-full" />
      {/* head */}
      <span className="bg-ink-3/12 absolute bottom-[32px] left-[60px] size-7 rounded-full" />
      {/* eye well + watching pupil */}
      <span className="bg-canvas absolute bottom-[42px] left-[70px] size-[9px] rounded-full" />
      <span
        ref={pupil}
        className="bg-ink-3/60 absolute bottom-[44px] left-[72px] size-[5px] rounded-full will-change-transform"
      />
      {/* beak — the whisper of coral */}
      <span
        className="absolute bottom-[42px] left-[86px] size-0 border-y-[4px] border-l-[8px] border-y-transparent"
        style={{ borderLeftColor: 'color-mix(in oklch, var(--wren-accent) 45%, transparent)' }}
      />
    </div>
  )
}

/**
 * The inbox-zero wren — the same geometry in full brand colour, one wing up,
 * bobbing on `wren-float` once `wren-celebrate-in` has landed it. The float
 * distance is a token the reduced-motion block zeroes, so a machine that
 * asked for stillness gets the arrival crossfade and a still bird.
 */
function WrenFlightMark() {
  return (
    <div aria-hidden className="relative h-16 w-28 select-none pointer-events-none">
      {/* tail */}
      <span className="bg-brand-hover absolute bottom-[14px] left-[20px] h-[9px] w-[22px] -rotate-[28deg] rounded-full" />
      {/* body */}
      <span className="bg-brand absolute bottom-[6px] left-[34px] size-11 rounded-full" />
      {/* wing, lifted */}
      <span className="bg-brand-hover absolute bottom-[30px] left-[38px] h-[16px] w-[28px] -rotate-[32deg] rounded-full" />
      {/* head */}
      <span className="bg-brand absolute bottom-[34px] left-[62px] size-7 rounded-full" />
      {/* eye — the logo's slit */}
      <span className="bg-canvas absolute bottom-[44px] left-[74px] h-[7px] w-[3px] rounded-full" />
      {/* beak */}
      <span
        className="absolute bottom-[44px] left-[88px] size-0 border-y-[4px] border-l-[9px] border-y-transparent"
        style={{ borderLeftColor: 'var(--wren-star)' }}
      />
    </div>
  )
}

export interface EmptyCopy {
  title: string
  subtitle: string
}

export type EmptyTier = 'ambient' | 'earned'

/** What the earned tier says instead. It reports an event, not an absence. */
const EARNED_COPY: EmptyCopy = {
  title: 'Inbox zero',
  subtitle: 'You cleared it. Nothing else is waiting.',
}

/**
 * The earned mark: the wren in flight, arriving on `wren-celebrate-in` and
 * bobbing on `wren-float`, plus the burst. (It replaced the day-seeded emoji
 * deck in the 2026-08-31 brand pass — the celebration is the bird now.)
 *
 * The particle layer is *never mounted* under reduced motion or in the capture
 * path — `mode` gates the effect, not the CSS. Making it invisible would still
 * put nineteen animating nodes on a machine that asked for none.
 */
function CelebrationMark({ mode }: { mode: 'full' | 'reduced' | 'off' }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (mode !== 'full' || !host.current) return
    return burst(host.current)
  }, [mode])

  return (
    <div ref={host} className="relative flex h-16 w-28 items-center justify-center select-none">
      {/* The keyframe is unconditional. Every quantity in it — the start
          scale, the overshoot, the spin, the duration — is a token the
          reduced-motion block zeroes, so what plays there is the 120 ms
          opacity crossfade DIRECTION §9 asks for, and `.screenshot` removes
          it outright in the capture path. A JS copy of that rule was a second
          answer to a question tokens.css had already settled. */}
      <span
        aria-hidden
        className="inline-flex leading-none"
        style={{
          animation:
            'wren-celebrate-in var(--wren-dur-celebrate) var(--wren-ease-spring) both, ' +
            'wren-float var(--wren-dur-float) ease-in-out var(--wren-dur-celebrate) infinite alternate',
        }}
      >
        <WrenFlightMark />
      </span>
    </div>
  )
}

/**
 * `mark` is off in the 400 px list column and on in the reading pane. An empty
 * label beside an empty reading pane used to put two identical marks on screen
 * at once, which read as a rendering fault; and the mark is cramped at 400 px
 * anyway. One wren, in the pane that has room for it — except on the earned
 * tier, which is the one moment worth the 400 px.
 */
export function EmptyState({
  copy,
  mark = false,
  tier = 'ambient',
  className,
}: {
  copy: EmptyCopy
  mark?: boolean
  tier?: EmptyTier
  className?: string
}) {
  const mode = useMotionMode()
  const { item, step } = staggerPreset(mode)
  const earned = tier === 'earned'
  const shown = earned ? EARNED_COPY : copy
  const showMark = mark || earned

  // The earned mark animates itself — `wren-celebrate-in` owns its scale and
  // its rotation — so its wrapper must not add a second transform on top of
  // that. It gets opacity and nothing else. `mode === 'off'` is the capture
  // path and stays perfectly still either way.
  const settle =
    mode === 'full'
      ? {
          initial: { opacity: 0 },
          animate: { opacity: 1 },
          transition: { duration: DUR.fast, ease: EASE_OUT },
        }
      : { initial: item.initial, animate: item.animate, transition: item.transition }

  const rows = [
    showMark ? (
      earned ? <CelebrationMark key="mark" mode={mode} /> : <WrenMark key="mark" />
    ) : null,
    <p
      key="title"
      className={cn('font-ui text-ink font-medium text-balance', showMark ? 'text-xl' : 'text-base')}
    >
      {shown.title}
    </p>,
    <p key="subtitle" className="text-ink-3 text-sm text-pretty">
      {shown.subtitle}
    </p>,
  ].filter(Boolean)

  return (
    <div
      className={cn('flex h-full flex-col items-center justify-center gap-4 px-8 pb-16', className)}
    >
      <div className="flex max-w-80 flex-col items-center gap-1 text-center">
        {rows.map((row, index) => {
          const isMark = index === 0 && showMark
          const preset = isMark && earned ? settle : item
          return (
            <motion.div
              key={index}
              initial={preset.initial}
              animate={preset.animate}
              transition={{ ...preset.transition, delay: index * step }}
              // The mark keeps the 16 px it used to get from the parent's gap.
              className={cn(isMark && 'mb-3')}
            >
              {row}
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
