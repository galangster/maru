// Bulk triage — P11. One batch, one mutation per thread, ONE undo.
//
// The batch is orchestrated here rather than in the bar or the keymap so the
// two entry points (the bulk bar's buttons, and `e`/`#`/`u` pressed while
// threads are checked) cannot disagree about ordering, the follow selection,
// or what ⌘Z puts back.

import { reverseAction } from '@/core/service/actions'
import type { MailAction, MailActionType, Thread } from '@/core/types'
import { UNDO_LABELS, showUndoToast } from '@/features/mail/queries'
import { useUi } from '@/features/mail/ui-store'

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
