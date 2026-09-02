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
import { wakeTime } from '@/lib/format'

import { nextAfterRemoval } from './list-prefs'

/** The actions a batch accepts. Star is deliberately absent: starring is a
 *  per-thread judgment, and a bulk star is how forty threads end up starred
 *  and the star stops meaning anything. */
const BULK_TYPES = new Set(['archive', 'trash', 'untrash', 'markRead', 'markUnread'] as const)

export type BulkActionType = typeof BULK_TYPES extends ReadonlySet<infer T> ? T : never

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

  runBatchAction(mutate, [...keys], type)
  ui.clearChecked()
  return targets.length
}

/**
 * What a batch's confirmation says: "2 threads archived", "3 conversations
 * moved to trash". The count leads, and the verb is the same past-tense
 * vocabulary every single-thread toast uses.
 *
 * The noun is a parameter because the two shells name the same object
 * differently — the desktop list calls it a thread, the phone calls it a
 * conversation — and nothing else about a batch differs between them.
 */
export function batchActionLabel(type: BulkActionType, count: number, noun = 'thread'): string {
  const verb = UNDO_LABELS[type]
  return `${count} ${noun}${count === 1 ? '' : 's'} ${verb[0].toLowerCase() + verb.slice(1)}`
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
  noun = 'thread',
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
  const before = new Map(targets.map((t) => [t.key, t.deferredUntil ?? null]))
  const keys = new Set(before.keys())

  const ui = useUi.getState()
  // Both directions remove rows from the list on screen: saving takes them out
  // of the inbox, and bringing them back takes them out of Later.
  if (ui.selected && keys.has(ui.selected)) {
    ui.setSelected(nextAfterRemoval(visible, keys), 'keyboard')
  }

  runBatchDefer(defer, before, wakeAt, now)
  ui.clearChecked()
  return targets.length
}

/** "3 threads saved for tomorrow morning", "2 conversations back in the inbox". */
export function batchDeferLabel(
  count: number,
  wakeAt: number | null,
  now: number,
  noun = 'thread',
): string {
  const plural = `${count} ${noun}${count === 1 ? '' : 's'}`
  return wakeAt === null ? `${plural} back in the inbox` : `${plural} saved for ${wakeTime(wakeAt, now)}`
}

/**
 * `runBatchAction`'s Later sibling, and the same promise: one undoable for the
 * whole batch, one toast, and the count said out loud.
 *
 * The prior wake times are taken rather than assumed, so undoing puts each
 * thread back on its own schedule instead of on one shared guess.
 */
export function runBatchDefer(
  defer: (threadKey: string, wakeAt: number | null) => void,
  before: ReadonlyMap<string, number | null>,
  wakeAt: number | null,
  now: number,
  noun = 'thread',
): string {
  for (const key of before.keys()) defer(key, wakeAt)

  const label = batchDeferLabel(before.size, wakeAt, now, noun)
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
