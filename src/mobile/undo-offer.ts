// One undo offer on the phone, however many actions are behind it.
//
// The desktop raises a toast per entry and stacks them: ten deep, each with
// its own Undo, each reversing the action that raised it. On a 393 px screen
// that stack is not a stack — the newest sits in FRONT of the others and the
// ones behind it cannot be tapped at all. Six archives in a row left five
// recoverable, one tap at a time, and the sixth ran out of its ten-second
// window while its offer was still buried (issue 65).
//
// **The stack is not what changed.** `UNDO_DEPTH`, `UNDO_WINDOW_MS`,
// `pushUndoable` and every entry's own reversal are exactly as they were, and
// the desktop's ten-deep per-entry offers are untouched. What changed is how
// many DOORS the phone puts on that stack: one, always in front, always
// tappable, that says how many offers are behind it and pops the newest each
// time it is pressed. Choosing this over shake-to-undo was not a close call —
// shake needs a motion bridge the web layer does not have, and a native
// gesture nothing on screen mentions is not a way out a person can find.
//
// The one door is a real door onto the whole registry: `undoAndSay` is the
// same body ⌘Z runs, so a phone tapping Undo four times and a desktop pressing
// ⌘Z four times walk back the same four actions in the same order.

import { toast } from 'sonner'

import { registerActionUndo, undoAndSay } from '@/features/mail/queries'
import { useUi } from '@/features/mail/ui-store'
import type { MailAction } from '@/core/types'
import { UNDO_WINDOW_MS, isLive, undoToastId, type UndoStack } from '@/lib/undo'

/**
 * The one id every undo offer on the phone is drawn under.
 *
 * Sonner replaces a toast that carries an id it already has, so a burst of
 * archives rewrites one line instead of building a pile. It is deliberately
 * NOT `UNDO_TOAST_ID` — that id belongs to the *answer* ("Undone", "Nothing to
 * undo"), and an offer that overwrote the answer would take away the only
 * confirmation the press gives.
 */
export const MOBILE_UNDO_TOAST_ID = 'wren-undo-mobile'

export interface MobileUndoOffer {
  /** The entry this offer's button reverses: the newest still inside its window. */
  entryId: string
  /** What the toast says: "Archived", "Archived · 6", "3 actions". */
  title: string
  /** How many offers are live behind the button. */
  count: number
}

/**
 * Every live offer, read as one.
 *
 * Three sentences, and the difference between them is whether the count and
 * the verb can both be true at once:
 *
 * - One offer says what it was: "Archived".
 * - Several of the same thing count themselves: "Archived · 6", which is the
 *   sentence the report asked for and the only one that tells you the burst is
 *   fully recoverable.
 * - Several DIFFERENT things cannot share a verb, so they drop it rather than
 *   claim the newest one's: "3 actions". A star, an archive and a batch put
 *   away for later are three offers and none of them is "Archived".
 *
 * Expired entries are not counted. They are still on the stack until the next
 * registration sweeps them (`pushUndoable`), and counting them would offer to
 * undo something the window has already closed on.
 */
export function coalescedOffer(stack: UndoStack, now: number): MobileUndoOffer | null {
  const live = stack.filter((entry) => isLive(entry, now))
  const newest = live[0]
  if (!newest) return null
  const uniform = live.every((entry) => entry.label === newest.label)
  const title =
    live.length === 1 ? newest.label
    : uniform ? `${newest.label} · ${live.length}`
    : `${live.length} actions`
  return { entryId: newest.id, title, count: live.length }
}

/**
 * Draw the one offer, and take every other one off the screen.
 *
 * The sweep is what makes this the phone's ONLY undo door. A bulk archive and
 * a Later batch raise their own per-entry toasts from `bulk.ts`, which is
 * right on the desktop and is a second pile here — so every per-entry offer
 * the registry knows about is dismissed and this one is raised over all of
 * them. Nothing is lost by that: the entries themselves are untouched and this
 * button reaches all of them.
 *
 * With nothing live the offer is withdrawn rather than drawn empty, which is
 * also what makes the last press of a burst clear the screen.
 */
export function showMobileUndoOffer(description?: string, now = Date.now()): void {
  const stack = useUi.getState().undoStack
  for (const entry of stack) toast.dismiss(undoToastId(entry.id))
  const offer = coalescedOffer(stack, now)
  if (!offer) {
    toast.dismiss(MOBILE_UNDO_TOAST_ID)
    return
  }
  toast(offer.title, {
    id: MOBILE_UNDO_TOAST_ID,
    // Sonner spreads new options over the ones on screen, so this is always a
    // key — send-toast.ts's rule. The subject belongs to a single offer; over
    // a count it would name one of six and look like the whole story.
    description: offer.count === 1 ? description : undefined,
    action: {
      label: 'Undo',
      // `preventDefault` is load-bearing. Sonner withdraws a toast whose
      // action has been pressed, and this offer is the one thing on the phone
      // that must NOT go after one press: the burst is six deep and the
      // button counts down. Preventing the default keeps the id alive for the
      // re-draw below, which either counts down or withdraws it deliberately.
      onClick: (event) => {
        event.preventDefault()
        popMobileUndo()
      },
    },
    // As long as the window it is a door onto, and not the toaster's four
    // seconds. On the desktop a withdrawn offer still leaves ⌘Z; on the phone
    // this IS the undo, so an offer that leaves at four seconds takes six
    // seconds of a live stack with it — which is the half of issue 65 that is
    // about time rather than about reach.
    duration: UNDO_WINDOW_MS,
  })
}

/**
 * Walk back one action, then re-draw whatever is left under it.
 *
 * By the entry's identity rather than by "the newest", so the offer that was on
 * screen when the finger landed is the one that is reversed even if something
 * registered in between. `undoAndSay` says what happened, exactly as ⌘Z does,
 * and the re-draw either counts down or withdraws the offer.
 */
export function popMobileUndo(now = Date.now()): void {
  const offer = coalescedOffer(useUi.getState().undoStack, now)
  undoAndSay(offer?.entryId)
  showMobileUndoOffer()
}

/**
 * Register a single-thread action's undo and put the phone's one offer up.
 *
 * `registerUndoable`'s phone-shaped twin: same registration, different door.
 * The registration is the desktop's own `registerActionUndo`, so what the
 * entry reverses and what it is called are not decided twice.
 */
export function offerMobileUndo(
  mutate: (action: MailAction) => void,
  action: MailAction,
  description?: string,
): void {
  registerActionUndo(mutate, action)
  showMobileUndoOffer(description)
}
