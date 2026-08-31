// Calm empty states. One line, one explanatory subtitle (Family 2), and Maru
// the wren (wren-figure) — inline SVG, nothing to load. The character keeps
// its own palette; the field and pool it stands on adapt to the theme.
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

import { motion } from 'motion/react'

import { DUR, EASE_OUT, staggerPreset, useMotionMode } from '@/lib/motion'
import { cn } from '@/lib/utils'

import { WrenCelebration } from './wren-celebration'
import { WrenPerched } from './wren-figure'

/**
 * The resting Maru — the canonical character (P13 sheet). The figure carries
 * its own ground (a radial pool anchored under the feet, plus the traced cast
 * shadow), so it grounds the white body wherever it is mounted, including
 * onboarding where there is no field behind it. Alive (breath, blink, gaze and
 * the behaviour clock) only in full motion mode; still under reduced motion
 * and in captures.
 */
export function WrenMark({ className }: { className?: string }) {
  const mode = useMotionMode()

  return (
    // Decoration must never eat a click or land in a text selection
    // (`ui-polish` §12) — `.wren-figure` carries pointer-events/select none.
    <div aria-hidden className={className}>
      <WrenPerched alive={mode === 'full'} />
    </div>
  )
}

export interface EmptyCopy {
  title: string
  subtitle: string
}

export type EmptyTier = 'ambient' | 'earned'

/**
 * What the earned tier says instead. It reports an event, not an absence —
 * and it is the ONLY place "Inbox zero" appears. An inbox that was already
 * quiet when you arrived gets `inbox-zero.ts`'s ambient line instead, because
 * congratulating someone for a mailbox they did not clear is the same mistake
 * as congratulating them for an empty Trash.
 *
 * Two sentences, the only subtitle in the app licensed to have them: it does
 * two jobs — credit the act, then hand the time back. The second clause rhymes
 * with the ambient promise on purpose, so Maru's job reads the same in both.
 */
const EARNED_COPY: EmptyCopy = {
  title: 'Inbox zero',
  // The picture changed, so the sentence had to. "Keep watch from here" was
  // written for a bird that lands and settles; this one takes off and keeps
  // flying. It still credits the act, still hands the time back, and still
  // rhymes with the ambient line ("Maru will tell you the moment something
  // lands") the way the original was built to.
  subtitle: 'You cleared it. Maru has the sky until something lands.',
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
    // The earned mark is the whole takeoff, hover, descent and landing —
    // `wren-celebration.tsx` owns the choreography, `lib/wren-flight.ts` the
    // timeline. It STARTS perched, which is the point: the bird the user has
    // been looking at all week is the one that leaves the ground. The particle
    // layer is never MOUNTED under reduced motion or in the capture path, so
    // `mode` goes through rather than being read again down there.
    showMark ? (
      earned ? <WrenCelebration key="mark" mode={mode} /> : <WrenMark key="mark" />
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
      className={cn(
        'flex h-full flex-col items-center justify-center gap-4 px-8 pb-16',
        // The FIELD, and only where there is a bird to ground. A flat opaque
        // colour, so its edges ARE the pane's edges and the hairlines already
        // there sit on top of it unchanged; `contain: paint` (tokens.css §7)
        // clips the pool and the burst host to the pane. Gating on showMark
        // keeps the list column's two markless empty states — search, and a
        // filter with no hits — on bg-surface, so no second pink column
        // appears beside the reading pane.
        // The character's two homes, and the whole colour rule in one line.
        // A perched bird stands in a FIELD — the reading pane at rest, and
        // onboarding. An earned bird is airborne, so it gets containment only
        // and its sky is the bounded disc on the white list card: "only the
        // inbox zero bird should have that masked bg, but the threads/messages
        // bird should have the full color bg" (owner, 2026-08-31).
        // Markless empty states (search, a filter with no hits) take neither,
        // so no pink column ever appears beside the reading pane.
        showMark && (earned ? 'wren-stage' : 'wren-empty'),
        className,
      )}
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
              // The mark keeps the 16 px it used to get from the parent's gap;
              // every other row reads ON the character's ground pool rather
              // than under it (`.wren-copy`, tokens.css §7).
              className={cn(isMark ? 'mb-3' : 'wren-copy')}
            >
              {row}
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
