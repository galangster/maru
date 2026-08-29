// Calm empty states. One line, one explanatory subtitle (Family 2), and a soft
// illustration built from CSS shapes — no images, nothing to load, and it
// re-tints itself with the theme.
//
// Two tiers, per MAGIC §3.6 and Family's Delight-Impact Curve. Every empty
// folder gets the *ambient* tier: the blocks arrive one after another at
// `staggerPreset`'s 40 ms step, which is arrival, not celebration. An inbox the
// user emptied **in this session** gets the *earned* tier once: the mark settles
// rather than lifting, and the copy says what happened instead of what is
// missing. No confetti, no particles — Wren has no once-per-lifetime event.

import { useEffect, useState } from 'react'
import { motion } from 'motion/react'

import type { MailView } from '@/core/types'
import { DUR, EASE_OUT, staggerPreset, useMotionMode } from '@/lib/motion'
import { cn } from '@/lib/utils'

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
// mail" and "has the moment already been spent" both have to survive the list
// unmounting when the user walks through other folders, and neither is worth
// persisting past the window.
let sawInboxMail = false
let earnedSpent = false

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
    if (sawInboxMail && !earnedSpent) {
      earnedSpent = true
      setTier('earned')
    }
  }, [isInbox, count])

  return isInbox ? tier : 'ambient'
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

  // The earned tier settles rather than arriving: one slow scale step on the
  // mark, which is the opposite gesture to the ambient lift. `mode === 'off'`
  // is the capture path and stays perfectly still.
  const settle =
    mode === 'full'
      ? {
          initial: { opacity: 0, scale: 0.94 },
          animate: { opacity: 1, scale: 1 },
          transition: { duration: DUR.slow, ease: EASE_OUT },
        }
      : { initial: item.initial, animate: item.animate, transition: item.transition }

  const rows = [
    showMark ? <CloudMark key="mark" /> : null,
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
