// The send toast's options, at each step of the undo window.
//
// One function rather than three literals in the composer, because the whole
// contract is a relationship *between* the steps: sonner updates a toast by
// spreading the new options over the ones already on screen, so a step that
// simply omits `action` leaves the previous Undo button standing. That is how
// "Sent" came to carry an Undo that did nothing (issue 2) — the offer was
// never withdrawn, only stopped being renewed.
//
// So `action` is always present here, and is `undefined` unless the send can
// genuinely still be taken back.

import { clip } from '@/lib/format'
import { undoToastId } from '@/lib/undo'

/**
 * The send's slot in the ⌘Z registry. Withdrawn the moment the mail goes.
 *
 * Here rather than in the composer so the toast id below can be derived from
 * it instead of agreeing with it by hand.
 */
export const SEND_UNDO = 'send'

/**
 * One toast at a time. A second send replaces this one rather than stacking.
 *
 * DERIVED from the registry id, not agreed with it by hand. The two used to be
 * separate literals, so `undoAndSay` dismissing `undoToastId(entry.id)` after
 * a ⌘Z on the send named a toast that did not exist and left the spent Undo
 * standing — issue 2's own failure, reached the long way round.
 */
export const SEND_TOAST = undoToastId(SEND_UNDO)

/**
 * The longest description the toast will print.
 *
 * A toast names what happened; it is not a place to read a subject. A 5,000
 * character subject pasted into the composer printed in full and made the
 * confirmation about 3,700 px tall — a column down the left of the window for
 * the whole four seconds, with the Undo button at the bottom of it (issue 41).
 *
 * 140 is about two lines at the toast's width, which is what the sentence
 * needs to stay a sentence. The clamp is here rather than in the composer
 * because every caller of this helper has the same problem, and a subject is
 * not the only string that reaches it — a thrown error message arrives on the
 * failure path with no length of its own either.
 *
 * The character clamp is the guarantee about *content*; `[data-description]`
 * in surfaces.css clamps the rendered box to two lines, which is the guarantee
 * about *geometry* for a value that carries no spaces to break on.
 */
export const TOAST_TEXT_MAX = 140

/**
 * One or two lines, and an ellipsis for the rest.
 *
 * `clip` is the shared cut — whitespace collapses first, because a pasted
 * subject can carry newlines and a newline inside a toast is a second line of
 * height for no words at all. The only thing this adds is the number.
 */
export const clampToastText = (text: string): string => clip(text, TOAST_TEXT_MAX)

export interface SendToastOptions {
  id: string
  description: string
  duration?: number
  /** Always a key, never merely absent. See the note above. */
  action: { label: string; onClick: () => void } | undefined
}

/**
 * The send toast.
 *
 * Pass `undo` while the mail is still held and the offer is real; omit it from
 * the moment the send commits, which withdraws the button in the same update
 * that changes the words.
 */
export function sendToastOptions(
  description: string,
  undo?: { onClick: () => void; durationMs: number },
): SendToastOptions {
  return {
    id: SEND_TOAST,
    description: clampToastText(description),
    duration: undo?.durationMs,
    action: undo ? { label: 'Undo', onClick: undo.onClick } : undefined,
  }
}
