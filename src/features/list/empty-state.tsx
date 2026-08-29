// Calm empty states. One line, one explanatory subtitle (Family 2), and a soft
// illustration built from CSS shapes — no images, nothing to load, and it
// re-tints itself with the theme.
//
// Two tiers, per MAGIC §3.6 and Family's Delight-Impact Curve. Every empty
// folder gets the *ambient* tier: the blocks arrive one after another at
// `staggerPreset`'s 40 ms step, which is arrival, not celebration. An inbox the
// user emptied **in this session** gets the *earned* tier: a day-seeded emoji
// at 56 px and a single 18-particle burst, once per transition to zero and
// never twice inside a minute (AMIE-STUDY §7c.2, `./celebrate`).
//
// That burst is the only one in the app. Archive and send are the actions that
// repeat forty times a day and they get one pop each and nothing else, because
// frequency is what kills delight.

import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'

import type { MailView } from '@/core/types'
import { DUR, EASE_OUT, staggerPreset, useMotionMode } from '@/lib/motion'
import { cn } from '@/lib/utils'

import { burst, celebrationEmoji, claimCelebration } from './celebrate'

/** Three overlapping discs and a bar: a cloud, at 10% opacity. */
export function CloudMark({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      // Decoration must never eat a click or land in a text selection
      // (`ui-polish` §12).
      className={cn('relative h-16 w-28 select-none pointer-events-none', className)}
    >
      <span className="bg-ink-3/12 absolute bottom-4 left-0 size-12 rounded-full" />
      <span className="bg-ink-3/12 absolute bottom-6 left-7 size-16 rounded-full" />
      <span className="bg-ink-3/12 absolute right-0 bottom-4 size-11 rounded-full" />
      <span className="bg-ink-3/12 absolute bottom-4 left-2 h-6 w-24 rounded-full" />
    </div>
  )
}

export interface EmptyCopy {
  title: string
  subtitle: string
}

export type EmptyTier = 'ambient' | 'earned'

export function emptyCopyFor(view: MailView, labelName?: string): EmptyCopy {
  if (view.kind === 'unified') {
    switch (view.folder) {
      case 'inbox':
        return { title: 'Inbox zero', subtitle: 'Nothing waiting. Wren will say when that changes.' }
      case 'starred':
        return { title: 'Nothing starred', subtitle: 'Star a thread and it will wait for you here.' }
      case 'sent':
        return { title: 'Nothing sent yet', subtitle: 'Mail you send from Wren collects here.' }
      case 'trash':
        return { title: 'Trash is empty', subtitle: 'Deleted threads rest here before Gmail clears them.' }
    }
  }
  return {
    title: 'Nothing here yet',
    subtitle: labelName
      ? `Threads labelled ${labelName} will collect in this view.`
      : 'Threads with this label will collect in this view.',
  }
}

/** What the earned tier says instead. It reports an event, not an absence. */
const EARNED_COPY: EmptyCopy = {
  title: 'Inbox zero',
  subtitle: 'You cleared it. Nothing else is waiting.',
}

// Session state, deliberately outside React: "did this window ever hold inbox
// mail" has to survive the list unmounting while the user walks through other
// folders, and it is not worth persisting past the window.
//
// It is a *precondition*, not a frequency guard — it answers "did the user
// clear this, or was it always quiet". How often the moment may fire is
// `claimCelebration`'s job and only its job.
let sawInboxMail = false

/**
 * The tier the inbox's empty state has earned.
 *
 * `count` is the number of rows the inbox currently holds, or a negative number
 * while the query is still pending — which is how "not loaded yet" stays
 * distinct from "loaded and empty". Launching straight into an already-empty
 * inbox is the ambient case: nothing was achieved, the mailbox was just quiet.
 */
export function useInboxZeroTier(view: MailView, count: number): EmptyTier {
  const isInbox = view.kind === 'unified' && view.folder === 'inbox'
  const [tier, setTier] = useState<EmptyTier>('ambient')

  useEffect(() => {
    if (!isInbox || count < 0) return
    if (count > 0) {
      sawInboxMail = true
      setTier('ambient')
      return
    }
    // One guard on frequency, not three: `claimCelebration`'s 60 s cooldown is
    // what stops a refetch, a window focus or a pane remount from replaying the
    // moment. A once-per-session flag on top of it said the same thing a second
    // time and made the cooldown look decorative.
    if (sawInboxMail && claimCelebration()) setTier('earned')
  }, [isInbox, count])

  return isInbox ? tier : 'ambient'
}

/**
 * The earned mark: one 56 px glyph from a five-deck, chosen from the day so it
 * varies without being noise, plus the burst.
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
        className="text-[56px] leading-none"
        style={{
          animation: 'wren-celebrate-in var(--wren-dur-celebrate) var(--wren-ease-spring) both',
        }}
      >
        {celebrationEmoji()}
      </span>
    </div>
  )
}

/**
 * `mark` is off in the 400 px list column and on in the reading pane. An empty
 * label beside an empty reading pane used to put two identical clouds on screen
 * at once, which read as a rendering fault; and the mark is cramped at 400 px
 * anyway. One cloud, in the pane that has room for it — except on the earned
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
      earned ? <CelebrationMark key="mark" mode={mode} /> : <CloudMark key="mark" />
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
