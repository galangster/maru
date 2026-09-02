// Bulk triage — P11. One batch, one mutation per thread, ONE undo.
//
// The batch is orchestrated here rather than in the bar or the keymap so the
// two entry points (the bulk bar's buttons, and `e`/`#`/`u` pressed while
// threads are checked) cannot disagree about ordering, the follow selection,
// or what ⌘Z puts back.

import { reverseAction } from '@/core/service/actions'
import type { MailAction, MailActionType, Thread } from '@/core/types'
import { showUndoToast } from '@/features/mail/queries'
import { LEAVES_THE_LIST, UNDO_LABELS } from '@/lib/undo'
import { useUi } from '@/features/mail/ui-store'
import { plural, wakeTime } from '@/lib/format'

import { nextAfterRemoval } from './list-prefs'

/** The actions a batch accepts. Star is deliberately absent: starring is a
 *  per-thread judgment, and a bulk star is how forty threads end up starred
 *  and the star stops meaning anything. */
const BULK_TYPES = new Set(['archive', 'trash', 'untrash', 'markRead', 'markUnread'] as const)

export type BulkActionType = typeof BULK_TYPES extends ReadonlySet<infer T> ? T : never

/**
 * What a shell calls the object a batch acts on. The desktop list says thread,
 * the phone says conversation, and nothing else about a batch differs between
 * them — so the word is a parameter and the union is written down once.
 */
export type BatchNoun = 'thread' | 'conversation'

/** The desktop's word, and the default every entry point below takes. */
const DEFAULT_NOUN: BatchNoun = 'thread'

/** A positive narrow, so no caller needs a cast to route a triage key here. */
export function isBulkAction(type: MailActionType): type is BulkActionType {
  return (BULK_TYPES as ReadonlySet<MailActionType>).has(type)
}

/**
 * The checked threads, in the order the person sees them. Checked keys that
 * the current lens no longer shows are ignored rather than acted on — a
 * filter must never widen what a visible batch does.
 */
export function checkedInView(visible: Thread[]): Thread[] {
  const checked = useUi.getState().checked
  return visible.filter((t) => checked.has(t.key))
}

/**
 * Run one batch. Dispatches through the caller's mutation (so optimistic
 * updates, sounds and rollback stay `usePerformAction`'s), registers a single
 * undoable that reverses the whole batch, clears the checkmarks, and says
 * what it did. Returns how many threads it acted on — zero when nothing
 * visible is checked, which is how the keymap knows to fall through to the
 * single-thread path.
 */
export function bulkAction(
  mutate: (action: MailAction) => void,
  visible: Thread[],
  type: BulkActionType,
): number {
  const targets = checkedInView(visible)
  if (targets.length === 0) return 0
  const keys = new Set(targets.map((t) => t.key))

  const ui = useUi.getState()
  // `LEAVES_THE_LIST` also holds unarchive, which `BULK_TYPES` excludes, so
  // reading the shared set rather than a local copy changes no batch.
  if (LEAVES_THE_LIST.has(type) && ui.selected && keys.has(ui.selected)) {
    ui.setSelected(nextAfterRemoval(visible, keys), 'keyboard')
  }

  runBatchAction(mutate, targets.map((t) => t.key), type)
  ui.clearChecked()
  return targets.length
}

/**
 * What a batch's confirmation says: "2 threads archived", "3 conversations
 * moved to trash". The count leads, and the verb is the same past-tense
 * vocabulary every single-thread toast uses.
 *
 * Module-private: the label is not a thing a caller composes, it is what a
 * batch says, and `runBatchAction` returns it. Tested through that return
 * value, so the sentence is checked where it is actually produced.
 */
function batchActionLabel(type: BulkActionType, count: number, noun: BatchNoun): string {
  const verb = UNDO_LABELS[type]
  return `${plural(count, noun)} ${verb[0].toLowerCase() + verb.slice(1)}`
}

/**
 * ONE batch, one mutation per thread, ONE undo, one toast.
 *
 * This is the mechanism issue 8 was about. The phone had no batch at all: its
 * bulk bar looped the single-thread path, and every pass registered its own
 * undoable into a store that holds exactly one (lib/undo.ts). The last write
 * won, so Undo returned a single conversation out of forty and said nothing
 * about the other thirty-nine.
 *
 * Both bulk bars come through here now, so the count in the toast and the
 * breadth of the undo cannot disagree with each other or with the desktop.
 * The selection each shell keeps is its own — the desktop's checkmarks live in
 * `useUi`, the phone's live in the inbox screen — so the caller clears its own
 * and hands the keys in.
 */
export function runBatchAction(
  mutate: (action: MailAction) => void,
  threadKeys: readonly string[],
  type: BulkActionType,
  noun: BatchNoun = DEFAULT_NOUN,
): string {
  for (const key of threadKeys) mutate({ type, threadKey: key })

  const label = batchActionLabel(type, threadKeys.length, noun)
  const reverse = reverseAction(type)
  useUi.getState().registerUndo({
    id: `bulk:${type}`,
    label,
    run: () => {
      for (const key of threadKeys) mutate({ type: reverse, threadKey: key })
    },
  })
  showUndoToast(label)
  return label
}

/**
 * Save the checked threads for later — a SIBLING of `bulkAction`, not a member.
 *
 * `BULK_TYPES` is typed off `MailActionType` and `bulkAction` reverses through
 * `reverseAction(type)`, which is total over that union and has no Later case.
 * Routing Later through it would compile and would ship an undo that silently
 * does nothing, which is the worst of the three possible outcomes.
 *
 * The shape is mirrored exactly: checked-in-view, the follow selection computed
 * before the rows go, ONE undoable for the whole batch, the checkmarks cleared,
 * one toast. Returns how many it acted on, so the keymap knows whether to fall
 * through to the single-thread path.
 *
 * The prior wake times are captured rather than assumed, so undoing "bring them
 * back now" puts each thread back on its own schedule instead of on one shared
 * guess.
 */
export function bulkDefer(
  defer: (threadKey: string, wakeAt: number | null) => void,
  visible: Thread[],
  wakeAt: number | null,
  now: number,
): number {
  const targets = checkedInView(visible)
  if (targets.length === 0) return 0
  const byKey = new Map(targets.map((t) => [t.key, t]))
  const keys = new Set(byKey.keys())

  const ui = useUi.getState()
  // Both directions remove rows from the list on screen: saving takes them out
  // of the inbox, and bringing them back takes them out of Later.
  if (ui.selected && keys.has(ui.selected)) {
    ui.setSelected(nextAfterRemoval(visible, keys), 'keyboard')
  }

  runBatchDefer(
    defer,
    targets.map((t) => t.key),
    (key) => byKey.get(key)?.deferredUntil ?? null,
    wakeAt,
    now,
  )
  ui.clearChecked()
  return targets.length
}

/**
 * "3 threads saved for tomorrow morning", "2 conversations back in the inbox".
 *
 * Module-private for `batchActionLabel`'s reason: `runBatchDefer` returns it.
 */
function batchDeferLabel(
  count: number,
  wakeAt: number | null,
  now: number,
  noun: BatchNoun,
): string {
  const what = plural(count, noun)
  return wakeAt === null ? `${what} back in the inbox` : `${what} saved for ${wakeTime(wakeAt, now)}`
}

/**
 * `runBatchAction`'s Later sibling, and the same promise: one undoable for the
 * whole batch, one toast, and the count said out loud.
 *
 * It takes the keys and a function from key to prior wake time, rather than a
 * map of one to the other, because the two shells hold that time in different
 * shapes: the desktop has the `Thread` objects the list is drawn from, the
 * phone has the rows the sheet was opened over. Each answers the question from
 * what it already has, and neither has to build the other's map to ask.
 *
 * The prior wake times are taken rather than assumed, so undoing puts each
 * thread back on its own schedule instead of on one shared guess.
 */
export function runBatchDefer(
  defer: (threadKey: string, wakeAt: number | null) => void,
  threadKeys: readonly string[],
  priorFor: (threadKey: string) => number | null,
  wakeAt: number | null,
  now: number,
  noun: BatchNoun = DEFAULT_NOUN,
): string {
  // Read before the deferrals land, not inside the undo: by the time anyone
  // presses ⌘Z the prior time is whatever this batch just wrote.
  const before = threadKeys.map((key) => [key, priorFor(key)] as const)
  for (const key of threadKeys) defer(key, wakeAt)

  const label = batchDeferLabel(threadKeys.length, wakeAt, now, noun)
  useUi.getState().registerUndo({
    id: 'bulk:later',
    label,
    run: () => {
      for (const [key, prior] of before) defer(key, prior)
    },
  })
  showUndoToast(label)
  return label
}
