// Domain defaults and the view rules, kept out of store/db.ts so the demo
// service can share them without pulling the SQLite layer into its bundle.

import type { MailView, Settings, Thread, UnifiedFolder } from './types'

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  imagePolicy: 'block',
  pollIntervalSec: 60,
  sounds: false,
  conversationOrder: 'chronological',
}

export const DEFAULT_PAGE_SIZE = 100

/**
 * Icon names the UI resolves against its own glyph map. Declared here as a
 * literal union rather than imported, because core must not depend on the
 * component layer — the four names below are a subset of IconName, so the
 * compiler still checks the join at the point of use.
 */
export type FolderIcon = 'inbox' | 'star' | 'sent' | 'trash'

export interface FolderSpec {
  folder: UnifiedFolder
  /** The Gmail system label this folder *is*. */
  label: string
  /** What the sidebar, the palette and the list header call it. */
  name: string
  icon: FolderIcon
}

/**
 * The one folder table. Its order is the sidebar's order, the per-account
 * label tree's order, and ⌘1..⌘4. Everything that names, orders, icons or
 * label-maps a unified folder derives from here.
 */
export const FOLDERS: FolderSpec[] = [
  { folder: 'inbox', label: 'INBOX', name: 'Inbox', icon: 'inbox' },
  { folder: 'starred', label: 'STARRED', name: 'Starred', icon: 'star' },
  { folder: 'sent', label: 'SENT', name: 'Sent', icon: 'sent' },
  { folder: 'trash', label: 'TRASH', name: 'Trash', icon: 'trash' },
]

export const UNIFIED_ORDER: UnifiedFolder[] = FOLDERS.map((f) => f.folder)

export const FOLDER_LABELS = Object.fromEntries(
  FOLDERS.map((f) => [f.folder, f.label]),
) as Record<UnifiedFolder, string>

/** Gmail system label id -> folder spec. Empty for a user label. */
export const FOLDER_BY_LABEL: Record<string, FolderSpec | undefined> = Object.fromEntries(
  FOLDERS.map((f) => [f.label, f]),
)

/**
 * Which folder owns a thread that carries several folder labels at once.
 * Trash first: a trashed thread lives in trash whatever else it is in.
 */
export const FOLDER_PRECEDENCE: UnifiedFolder[] = ['trash', 'inbox', 'sent', 'starred']

export function isUnifiedFolder(value: string): value is UnifiedFolder {
  return (UNIFIED_ORDER as string[]).includes(value)
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
