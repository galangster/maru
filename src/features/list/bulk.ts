// Bulk triage — P11. One batch, one mutation per thread, ONE undo.
//
// The batch is orchestrated here rather than in the bar or the keymap so the
// two entry points (the bulk bar's buttons, and `e`/`#`/`u` pressed while
// threads are checked) cannot disagree about ordering, the follow selection,
// or what ⌘Z puts back.

import { reverseAction } from '@/core/service/actions'
import type { MailAction, MailActionType, Thread } from '@/core/types'
import { showUndoToast } from '@/features/mail/queries'
import { UNDO_LABELS } from '@/lib/undo'
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

const REMOVES: ReadonlySet<MailActionType> = new Set(['archive', 'trash', 'untrash'])

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
  if (REMOVES.has(type) && ui.selected && keys.has(ui.selected)) {
    ui.setSelected(nextAfterRemoval(visible, keys), 'keyboard')
  }

  for (const key of keys) mutate({ type, threadKey: key })

  // "2 threads archived", "3 threads moved to trash" — the count leads, and
  // the verb is the same past-tense vocabulary every single-thread toast uses.
  const verb = UNDO_LABELS[type]
  const label = `${targets.length} thread${targets.length === 1 ? '' : 's'} ${
    verb[0].toLowerCase() + verb.slice(1)
  }`
  const reverse = reverseAction(type)
  ui.registerUndo({
    id: `bulk:${type}`,
    label,
    run: () => {
      for (const key of keys) mutate({ type: reverse, threadKey: key })
    },
  })
  ui.clearChecked()
  showUndoToast(label)
  return targets.length
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

  for (const key of keys) defer(key, wakeAt)

  const count = targets.length
  const plural = `${count} thread${count === 1 ? '' : 's'}`
  const label =
    wakeAt === null ? `${plural} back in the inbox` : `${plural} saved for ${wakeTime(wakeAt, now)}`
  ui.registerUndo({
    id: 'bulk:later',
    label,
    run: () => {
      for (const [key, prior] of before) defer(key, prior)
    },
  })
  ui.clearChecked()
  showUndoToast(label)
  return count
}
