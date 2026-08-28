// Domain defaults and the view rules, kept out of store/db.ts so the demo
// service can share them without pulling the SQLite layer into its bundle.

import type { MailView, Settings, Thread, UnifiedFolder } from './types'

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  imagePolicy: 'block',
  pollIntervalSec: 60,
}

export const DEFAULT_PAGE_SIZE = 100

export const FOLDER_LABELS: Record<UnifiedFolder, string> = {
  inbox: 'INBOX',
  starred: 'STARRED',
  sent: 'SENT',
  trash: 'TRASH',
}

export function viewLabel(view: MailView): string {
  return view.kind === 'unified' ? FOLDER_LABELS[view.folder] : view.labelId
}

/**
 * The one definition of what a folder contains. The store expresses the same
 * rule in SQL for indexed paging; this predicate is what everything in memory
 * uses, so the two cannot drift on the trash exclusion.
 */
export function threadMatchesView(thread: Thread, view: MailView): boolean {
  const label = viewLabel(view)
  if (!thread.labelIds.includes(label)) return false
  if (label !== 'TRASH' && thread.labelIds.includes('TRASH')) return false
  return view.kind !== 'account' || thread.accountId === view.accountId
}
