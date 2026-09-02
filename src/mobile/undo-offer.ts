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
//
// **Where the fork lives.** At the one seam every inline Undo already passes
// through — `showUndoToast` — and nowhere else. The phone used to let each
// per-entry toast go up and then sweep it away again, from four call sites in
// the shell, so every new surface that offered an Undo was a new pile the
// sweep had to be taught about. `setUndoPresenter` replaces the draw instead
// of chasing it, which is why `runBatchAction` and `runBatchDefer` need no
// phone branch of their own: they offer through `offerUndo`, `offerUndo` draws
// through `showUndoToast`, and the phone never builds the pile in the first
// place.

import { useEffect } from 'react'
import { toast } from 'sonner'

import { setUndoPresenter, undoAndSay } from '@/features/mail/queries'
import { useUi } from '@/features/mail/ui-store'
import { MOBILE_UNDO_TOAST_ID, UNDO_WINDOW_MS, isLive, type UndoStack } from '@/lib/undo'

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
 * Draw the one offer, from whatever the registry holds right now.
 *
 * It reads the stack rather than being told about one entry, because the whole
 * point is that the offer is about all of them. With nothing live it is
 * withdrawn rather than drawn empty, which is also what makes the last press of
 * a burst clear the screen.
 */
function showMobileUndoOffer(description?: string, now = Date.now()): void {
  const offer = coalescedOffer(useUi.getState().undoStack, now)
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
 * Walk back one action, then draw whatever is left under it.
 *
 * By the entry's identity rather than by "the newest", so the offer that was on
 * screen when the finger landed is the one that is reversed even if something
 * registered in between. `undoAndSay` says what happened, exactly as ⌘Z does,
 * and the re-draw either counts down or withdraws the offer.
 *
 * **After the answer, never before.** Sonner draws the newest toast in FRONT,
 * and on a 393 px screen the front toast covers the ones behind it — which is
 * the whole of issue 65. This offer is the phone's one undo door, so it has to
 * end up in front of "Undone" rather than behind it, and `undoAndSay` raises
 * "Undone" partway through its own body.
 *
 * The subscription below will already have redrawn the count by the time this
 * runs, because running an entry takes it off the stack. That update is in
 * place and idempotent; this call is here for the ordering above, and for the
 * one ending the subscription cannot see — a press that finds nothing live
 * changes no stack, and the spent offer still has to come off the screen.
 */
let popping = false

export function popMobileUndo(now = Date.now()): void {
  const offer = coalescedOffer(useUi.getState().undoStack, now)
  // ONE draw per press, and it is the one below. Running the entry changes the
  // stack, which the subscription is watching, so without this flag a press
  // draws the offer twice: once from inside `undoAndSay` before it has raised
  // "Undone", and once here after. Measured at 393x852 with injected touch,
  // that cost the second press of a burst — the offer was created before the
  // answer and stayed behind it, so the finger landed on "Undone" instead of
  // on the button, and five conversations came back out of six.
  popping = true
  try {
    undoAndSay(offer?.entryId)
  } finally {
    popping = false
  }
  showMobileUndoOffer()
}

/**
 * Make this shell the one that draws undo offers, for as long as it is mounted.
 *
 * Two halves, and they answer different questions:
 *
 *   - The **presenter** is what makes the phone's offer the only offer. It
 *     replaces the desktop's per-entry draw at the seam every inline Undo
 *     passes through, so a pile is never raised rather than being raised and
 *     swept.
 *   - The **subscription** is what keeps the count true. The stack also moves
 *     when nobody is offering anything new — an Undo runs an entry, a
 *     registration sweeps the expired ones out from under it — and the number
 *     on the button has to come down with it.
 *
 * Keyed on the stack's identity alone, so the offer is redrawn when the
 * registry moves and at no other time: `useUi` holds the selection, the
 * checkmarks and the reading expansion too, and every one of those changes
 * several times per screenful.
 */
export function useMobileUndoOffer(): void {
  useEffect(() => {
    setUndoPresenter((_entryId, _label, description) => showMobileUndoOffer(description))
    const unsubscribe = useUi.subscribe((state, previous) => {
      if (popping) return
      if (state.undoStack !== previous.undoStack) showMobileUndoOffer()
    })
    return () => {
      setUndoPresenter(null)
      unsubscribe()
    }
  }, [])
}
