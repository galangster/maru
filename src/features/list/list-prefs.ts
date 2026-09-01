// How a view's list is ordered and which threads it shows. Pure list domain:
// the service always returns newest-first, and these preferences are a lens
// the list applies on top — the mailbox itself never re-sorts.
//
// The lens sees what the list sees: the service's newest page (100 threads,
// `DEFAULT_PAGE_SIZE`) of a 90-day sync window. On a view larger than that,
// "oldest first" means the oldest *of the newest hundred* — honest about the
// page, silent about the archive. Pushing the order into `listThreads` is the
// deeper fix and is recorded in the M7 ticket, not smuggled in here.

import { deferSortKey } from '@/core/defaults'
import type { Thread } from '@/core/types'
import type { EmptyCopy } from '@/components/empty-state'
import {
  DEFAULT_LIST_PREFS,
  useUi,
  viewKey,
  type ListFilter,
  type ListPrefs,
} from '@/features/mail/ui-store'
import { keys as queryKeys } from '@/features/mail/queries'
import type { QueryClient } from '@tanstack/react-query'

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
 * Apply the lens. Sorting is by `deferSortKey` with the thread key as the
 * tiebreak, matching the service's own ordering rule, so `newest` returns the
 * service's order rather than a rival implementation of it.
 *
 * It is `deferSortKey` and not `lastMessageAt` because the store's ORDER BY is
 * `MAX(last_message_at, COALESCE(woke_at, 0))`: a thread from three weeks ago
 * that has just come back from Later belongs at the top, and a lens that
 * re-sorted on the raw timestamp would silently bury it again the moment
 * anybody chose "oldest first".
 */
export function applyListPrefs(threads: Thread[], prefs: ListPrefs): Thread[] {
  // The default lens is the service's own order: hand the array back rather
  // than re-proving the sort on every clock tick.
  if (prefs.sort === 'newest' && prefs.filter === 'all') return threads
  const shown = threads.filter(PASSES[prefs.filter])
  const direction = prefs.sort === 'newest' ? -1 : 1
  return shown.sort(
    (a, b) =>
      direction * (deferSortKey(a) - deferSortKey(b)) || a.key.localeCompare(b.key),
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
    // All three share the phrase "in this view", because the one job an empty
    // FILTER has is to reassure you the mail is not gone, only out of frame.
    // The titles stay distinct from the folder set in inbox-zero.ts: "No stars
    // here" rather than "Nothing starred", which that file already owns and
    // which is reachable in the same session.
    case 'unread':
      return { title: 'Nothing unread', subtitle: "You've read everything in this view." }
    case 'starred':
      return { title: 'No stars here', subtitle: 'Nothing in this view is starred yet.' }
    case 'attachments':
      return { title: 'No attachments', subtitle: 'Nothing in this view carries a file.' }
  }
}

/**
 * Where the selection lands after the selected thread leaves the view
 * (archive, trash): the next thread down, the previous when it was last,
 * nothing when it was alone. One keystroke per message — e, e, e — is the
 * whole point (P10 ruling), so this is computed *before* the row goes.
 */
export function nextAfterRemoval(
  visible: Thread[],
  removed: string | ReadonlySet<string>,
): string | null {
  const gone = typeof removed === 'string' ? new Set([removed]) : removed
  const index = visible.findIndex((t) => gone.has(t.key))
  if (index === -1) return null
  for (let i = index + 1; i < visible.length; i++)
    if (!gone.has(visible[i].key)) return visible[i].key
  for (let i = index - 1; i >= 0; i--) if (!gone.has(visible[i].key)) return visible[i].key
  return null
}

/**
 * The visible list, read at event time: the current view's cached threads
 * through the current lens. The keyboard and the reading toolbar both need
 * "the list the person is looking at" inside a handler without subscribing
 * a whole surface to the cache — this is that one spelling.
 */
export function visibleThreadsSnapshot(client: QueryClient): Thread[] {
  const s = useUi.getState()
  const raw = client.getQueryData<Thread[]>(queryKeys.threads(s.view)) ?? []
  return applyListPrefs(raw, s.listPrefs[viewKey(s.view)] ?? DEFAULT_LIST_PREFS)
}
