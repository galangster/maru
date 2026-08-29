// The list's own empty-state knowledge: which copy a mail view earns, and
// whether this window's inbox zero was achieved or merely found. The
// presentational half lives in `@/components/empty-state`; this half switches
// on MailView folders and holds session state, which is list domain, not kit.

import { useEffect, useState } from 'react'

import type { EmptyCopy, EmptyTier } from '@/components/empty-state'
import type { MailView } from '@/core/types'
import { claimCelebration } from '@/lib/celebrate'

export function emptyCopyFor(view: MailView, labelName?: string): EmptyCopy {
  if (view.kind === 'unified') {
    switch (view.folder) {
      case 'inbox':
        return { title: 'Inbox zero', subtitle: 'Nothing waiting. Wren will say when that changes.' }
      case 'starred':
        return { title: 'Nothing starred', subtitle: 'Star a thread and it will wait for you here.' }
      case 'sent':
        return { title: 'Nothing sent yet', subtitle: 'Mail you send from Wren collects here.' }
      case 'trash':
        return { title: 'Trash is empty', subtitle: 'Deleted threads rest here before Gmail clears them.' }
    }
  }
  return {
    title: 'Nothing here yet',
    subtitle: labelName
      ? `Threads labelled ${labelName} will collect in this view.`
      : 'Threads with this label will collect in this view.',
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
