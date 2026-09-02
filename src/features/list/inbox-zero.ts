// The list's own empty-state knowledge: which copy a mail view earns, and
// whether this window's inbox zero was achieved or merely found. The
// presentational half lives in `@/components/empty-state`; this half switches
// on MailView folders and holds session state, which is list domain, not kit.

import { useEffect, useState } from 'react'

import type { EmptyCopy, EmptyTier } from '@/components/empty-state'
import type { MailView } from '@/core/types'
import { claimCelebration } from '@/lib/celebrate'

/**
 * Which shell is asking.
 *
 * The two columns below disagree deliberately and are kept side by side so the
 * disagreement stays deliberate. The desktop says thread; the phone says
 * conversation, and its empty mailbox is the only screen on which it can
 * explain the swipe that fills the mailbox — a phone has the room for the
 * sentence and a list header does not.
 */
export type EmptySurface = 'desktop' | 'phone'

/**
 * What an empty mail view says.
 *
 * `labelName` names a user label, and on the phone it is the mailbox title the
 * picker was closed on, which for a label view is the same string.
 */
export function emptyCopyFor(
  view: MailView,
  labelName?: string,
  surface: EmptySurface = 'desktop',
): EmptyCopy {
  const phone = surface === 'phone'
  // Later, empty, is the ordinary state and not an achievement — nothing was
  // cleared, there was simply nothing put off. The subtitle carries the
  // one-line why DIRECTION §2 Family 2 requires: an empty view has to say what
  // WOULD be here, or it reads as a broken one.
  if (view.kind === 'later') {
    return phone
      ? {
          title: 'Nothing saved for later',
          subtitle:
            'Swipe a conversation left to put it off until a better time. It comes back to your inbox on its own.',
        }
      : {
          title: 'Nothing waiting',
          subtitle: 'Threads you save for later come back here, then to your inbox.',
        }
  }
  if (view.kind === 'unified') {
    switch (view.folder) {
      // "Inbox zero" belongs to the EARNED tier alone (empty-state.tsx). An
      // inbox that was already quiet when you arrived is not an achievement,
      // and congratulating someone for it is the same mistake as
      // congratulating them for an empty Trash.
      //
      // The phone never asks for this cell: inbox zero earns the character and
      // its own screen there, and every other mailbox gets this table instead.
      case 'inbox':
        return {
          title: 'The inbox is quiet',
          subtitle: 'Maru will tell you the moment something lands.',
        }
      case 'starred':
        return {
          title: 'Nothing starred',
          subtitle: phone
            ? 'Star a conversation to keep it within reach.'
            : 'Star a thread and it keeps its place here for you.',
        }
      // Not "sent from Maru" — Sent is Gmail's own mailbox, so it holds mail
      // sent from any client.
      case 'sent':
        return {
          title: 'Nothing sent yet',
          subtitle: phone
            ? 'Messages you send show up here.'
            : 'The first thing you send will show up here.',
        }
      case 'trash':
        return {
          title: 'Trash is empty',
          subtitle: phone
            ? 'Conversations you delete wait here before they go.'
            : 'Deleted threads rest here before Gmail clears them.',
        }
    }
  }
  if (phone) {
    return {
      title: labelName ? `Nothing in ${labelName}` : 'Nothing here yet',
      subtitle: 'Mail with this label shows up here.',
    }
  }
  return {
    title: 'Nothing here yet',
    subtitle: labelName
      ? `Threads labelled ${labelName} will gather here.`
      : 'Threads with this label will gather here.',
  }
}

// Session state, deliberately outside React: "did this window ever hold inbox
// mail" has to survive the list unmounting while the user walks through other
// folders, and it is not worth persisting past the window.
//
// It is a *precondition*, not a frequency guard — it answers "did the user
// clear this, or was it always quiet". How often the moment may fire is
// `claimCelebration`'s job and only its job.
let sawInboxMail = false

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
    // One guard on frequency, not three: `claimCelebration`'s 60 s cooldown is
    // what stops a refetch, a window focus or a pane remount from replaying the
    // moment. A once-per-session flag on top of it said the same thing a second
    // time and made the cooldown look decorative.
    if (sawInboxMail && claimCelebration()) setTier('earned')
  }, [isInbox, count])

  return isInbox ? tier : 'ambient'
}
