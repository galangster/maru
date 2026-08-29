// How a view's list is ordered and which threads it shows. Pure list domain:
// the service always returns newest-first, and these preferences are a lens
// the list applies on top — the mailbox itself never re-sorts.
//
// The lens sees what the list sees: the service's newest page (100 threads,
// `DEFAULT_PAGE_SIZE`) of a 90-day sync window. On a view larger than that,
// "oldest first" means the oldest *of the newest hundred* — honest about the
// page, silent about the archive. Pushing the order into `listThreads` is the
// deeper fix and is recorded in the M7 ticket, not smuggled in here.

import type { Thread } from '@/core/types'
import type { EmptyCopy } from '@/components/empty-state'
import type { ListFilter, ListPrefs } from '@/features/mail/ui-store'

const PASSES: Record<ListFilter, (thread: Thread) => boolean> = {
  all: () => true,
  unread: (t) => t.unread,
  starred: (t) => t.starred,
  attachments: (t) => t.hasAttachments,
}

/** The popover's and the palette's shared words for each filter. */
export const FILTER_LABELS: Record<ListFilter, string> = {
  all: 'Everything',
  unread: 'Unread',
  starred: 'Starred',
  attachments: 'Has attachment',
}

/**
 * Apply the lens. Sorting is by `lastMessageAt` with the thread key as the
 * tiebreak, matching the service's own ordering rule, so `newest` returns the
 * service's order rather than a rival implementation of it.
 */
export function applyListPrefs(threads: Thread[], prefs: ListPrefs): Thread[] {
  // The default lens is the service's own order: hand the array back rather
  // than re-proving the sort on every clock tick.
  if (prefs.sort === 'newest' && prefs.filter === 'all') return threads
  const shown = threads.filter(PASSES[prefs.filter])
  const direction = prefs.sort === 'newest' ? -1 : 1
  return shown.sort(
    (a, b) =>
      direction * (a.lastMessageAt - b.lastMessageAt) || a.key.localeCompare(b.key),
  )
}

/**
 * What an empty *filtered* list says. Distinct from `emptyCopyFor`: a folder
 * with no unread threads is not an empty folder, and must never borrow "Inbox
 * zero" — the celebration tier guards on `filter === 'all'` for the same
 * reason.
 */
export function filterEmptyCopy(filter: Exclude<ListFilter, 'all'>): EmptyCopy {
  switch (filter) {
    case 'unread':
      return { title: 'Nothing unread', subtitle: 'Every thread here has been read.' }
    case 'starred':
      return { title: 'Nothing starred', subtitle: 'No starred threads in this view.' }
    case 'attachments':
      return { title: 'No attachments', subtitle: 'Nothing here carries a file.' }
  }
}
