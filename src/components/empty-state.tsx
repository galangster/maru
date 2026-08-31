// Calm empty states. One line, one explanatory subtitle (Family 2), and Maru
// the wren (wren-figure) — inline SVG, nothing to load. The character keeps
// its own palette; only its blob ground adapts to the theme.
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

import { WrenBlob, WrenFlying, WrenPerched } from './wren-figure'

/**
 * The resting Maru — the canonical character (P13 sheet), perched on a soft
 * pale-pink blob so the white body has ground in both themes. Alive (breath,
 * blink, gaze) only in full motion mode; still under reduced motion and in
 * captures.
 */
export function WrenMark({ className }: { className?: string }) {
  const mode = useMotionMode()

  return (
    // Decoration must never eat a click or land in a text selection
    // (`ui-polish` §12) — WrenBlob carries pointer-events-none/select-none.
    <div aria-hidden className={className}>
      <WrenBlob align="end">
        <WrenPerched alive={mode === 'full'} className="h-24 w-24" />
      </WrenBlob>
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
    <div ref={host} className="relative flex h-28 w-36 items-center justify-center select-none">
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
        <WrenBlob>
          <WrenFlying className="h-24 w-24" />
        </WrenBlob>
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
