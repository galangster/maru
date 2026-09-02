// The undo toasts' options: one entry's own offer, and the answer ⌘Z gives.
//
// Here rather than in queries.ts for send-toast.ts's reason — what a toast
// looks like is not react-query's business — and under send-toast.ts's rule,
// stated there once and not restated here: sonner updates a toast by spreading
// the new options over the ones already on screen, so every key that can
// change between two updates of the same id is always present, and `undefined`
// rather than absent when it has nothing to say (issue 2).

import { UNDO_TOAST_ID, undoToastId, type Undoable } from '@/lib/undo'

export interface UndoToastOptions {
  id: string
  /** Always a key. What the offer is about — usually the subject line. */
  description: string | undefined
  action: { label: string; onClick: () => void }
}

/**
 * One entry's offer, on its own toast id.
 *
 * Per entry, never shared: a second archive raises its own toast beside the
 * first rather than replacing it, and this button reverses the entry that
 * raised it even with three newer ones above it on the stack (issue 40).
 */
export function undoToastOptions(
  entryId: string,
  description: string | undefined,
  onUndo: () => void,
): UndoToastOptions {
  return {
    id: undoToastId(entryId),
    description,
    action: { label: 'Undo', onClick: onUndo },
  }
}

export interface UndoAnswerOptions {
  id: string
  /** Always a key. The label of what was undone, or nothing at all. */
  description: string | undefined
}

/**
 * The answer, on the one id every answer shares — so a run of ⌘Z rewrites one
 * line instead of stacking a column of confirmations behind the offers.
 *
 * `description` is a key even when there is no entry: omitting it would leave
 * the last undone label standing under "Nothing to undo".
 */
export function undoAnswerOptions(entry: Undoable | null): UndoAnswerOptions {
  return { id: UNDO_TOAST_ID, description: entry?.label }
}
