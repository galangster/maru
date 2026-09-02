// Domain defaults and the view rules, kept out of store/db.ts so the demo
// service can share them without pulling the SQLite layer into its bundle.

import type { MailView, Settings, Thread, UnifiedFolder } from './types'

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  imagePolicy: 'allow',
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

/**
 * Later returns `INBOX`, and that is a true statement rather than a fiction: a
 * deferred thread IS an inbox thread that Maru has declined to list yet. It is
 * what keeps this function total — nothing becomes partial, no caller has to
 * learn to handle null, and the SQL and in-memory twins keep reading the label
 * rule from one place.
 */
export function viewLabel(view: MailView): string {
  if (view.kind === 'later') return 'INBOX'
  return view.kind === 'unified' ? FOLDER_LABELS[view.folder] : view.labelId
}

/**
 * The one definition of what a folder contains. The store expresses the same
 * rule in SQL for indexed paging; this predicate is what everything in memory
 * uses, so the two cannot drift on the trash exclusion.
 *
 * `now` is required rather than defaulted, so no caller can silently forget the
 * deferral half and put a thread the person saved for later straight back into
 * the list they took it out of.
 */
export function threadMatchesView(thread: Thread, view: MailView, now: number): boolean {
  const label = viewLabel(view)
  if (!thread.labelIds.includes(label)) return false
  if (label !== 'TRASH' && thread.labelIds.includes('TRASH')) return false
  const deferred = isDeferred(thread, now)
  // Later's own view is exactly the live deferrals. Note the INBOX ∧ ¬TRASH
  // checks above still ran: a deferred thread archived from the phone drops out
  // of Later for free, with no reconciliation to write.
  if (view.kind === 'later') return deferred
  // Deferral is about the INBOX and nothing else. A deferred thread that is
  // also starred still appears under Starred — it was taken out of the surface
  // you triage in, not out of the mailbox.
  if (label === 'INBOX' && deferred) return false
  return view.kind !== 'account' || thread.accountId === view.accountId
}

/**
 * Saved for later, and not yet due. One spelling, because the view rules, the
 * action descriptor and the picker all ask it and a fourth hand-written
 * `> now` is how one of them ends up off by a boundary.
 */
export function isDeferred(thread: Pick<Thread, 'deferredUntil'>, now: number): boolean {
  return thread.deferredUntil !== undefined && thread.deferredUntil > now
}

/**
 * Where a thread sorts in a list. The in-memory twin of the SQL expression in
 * `Store.listThreads`, exported here so `applyListPrefs` and `buildRows` cannot
 * drift from the query that produced their rows.
 *
 * Without the `wokeAt` term a thread from three weeks ago that was saved until
 * tomorrow comes back at list position ninety and is never seen again — the
 * feature would have eaten the mail it promised to give back.
 */
export function deferSortKey(thread: Thread): number {
  return Math.max(thread.lastMessageAt, thread.wokeAt ?? 0)
}

// -- Later's presets ---------------------------------------------------------

/**
 * The furthest out a thread may be saved, and the reason there is no "Someday".
 *
 * `WINDOW_QUERY` is `newer_than:90d` and `resyncWindow` DELETES local threads
 * absent from that window. A thread deferred six months out whose last message
 * is already 89 days old would be evicted with its defer row, and the deferral
 * would evaporate silently. Every peer offers Someday; Maru cannot offer it
 * honestly, so it does not.
 */
export const MAX_DEFER_DAYS = 30
export const EVENING_HOUR = 18
export const MORNING_HOUR = 9
/**
 * How long a woken deferral row survives after its wake time.
 *
 * It is the lifetime of the "back at the top" treatment, not bookkeeping: while
 * the row lives, `wokeAt` is the thread's sort key. A day is long enough that a
 * thread waking at 09:00 is still near the top when its person sits down, and
 * short enough that yesterday's returns have gone back to sorting by their own
 * last message. Shared by the store and the demo service so the two cannot
 * drift on how long a return stays at the top.
 */
export const WOKE_RETENTION_MS = 86_400_000
/**
 * How long a deferral fact keeps travelling in the Maru vault — A9, owner
 * ruling 2026-09-02, and MARU-ACCOUNT.md §6.
 *
 * It bounds two things with one number: a cleared-deferral tombstone, which
 * exists only to outlive the stale `until` it cancels, and a live entry whose
 * moment has passed. `MAX_DEFER_DAYS` is the same 30 days, so no live deferral
 * can ever be older than its own stamp by more than this. That is what keeps
 * the vault document inside its 256 KiB cap with no server-side sweep.
 *
 * Here rather than in the account layer because the store prunes tombstones on
 * the same lazy sweep that wakes deferrals, and the two must not drift.
 */
export const DEFERRAL_TTL_MS = 30 * 86_400_000
/** "This evening" stops being offered once the evening is close enough to be now. */
export const EVENING_CUTOFF_HOUR = 16

export interface DeferPreset {
  id: string
  /** What the picker calls it: "Tomorrow". */
  label: string
  /** The time it lands, spelled out: "9:00". */
  detail: string
  wakeAt: number
}

/**
 * Calendar arithmetic, never `+ 86_400_000`.
 *
 * A day is not 24 hours twice a year. Adding milliseconds puts "tomorrow 9:00"
 * at 08:00 on one spring morning and 10:00 on one autumn morning, and "this
 * weekend" is off by a whole hour for the entire week containing a transition.
 * `setDate`/`setHours` on a local Date is what the person's calendar actually
 * says.
 */
function atLocalHour(now: number, addDays: number, hour: number): number {
  const d = new Date(now)
  d.setDate(d.getDate() + addDays)
  d.setHours(hour, 0, 0, 0)
  return d.getTime()
}

/** Days from `now` forward to the next `weekday` (0=Sun). 7 when today is it. */
function daysUntil(now: number, weekday: number): number {
  const today = new Date(now).getDay()
  return ((weekday - today + 7) % 7) || 7
}

/**
 * The presets the picker offers at `now`, in order, plus what each one means in
 * words. Two are conditional, and both conditions are about not offering a time
 * that has effectively already passed: "This evening" disappears after 16:00,
 * and "This weekend" only makes sense Monday to Thursday — on Friday it is
 * tomorrow, and on the weekend it is now.
 */
export function deferPresets(now: number): DeferPreset[] {
  const presets: DeferPreset[] = []
  const hour = new Date(now).getHours()
  const day = new Date(now).getDay()

  if (hour < EVENING_CUTOFF_HOUR) {
    presets.push({
      id: 'evening',
      label: 'This evening',
      detail: `${EVENING_HOUR}:00`,
      wakeAt: atLocalHour(now, 0, EVENING_HOUR),
    })
  }
  presets.push({
    id: 'tomorrow',
    label: 'Tomorrow',
    detail: `${MORNING_HOUR}:00`,
    wakeAt: atLocalHour(now, 1, MORNING_HOUR),
  })
  // Monday to Thursday only (1..4). Friday's "this weekend" is tomorrow, and
  // Saturday's is today — both are lies dressed as a shortcut.
  if (day >= 1 && day <= 4) {
    presets.push({
      id: 'weekend',
      label: 'This weekend',
      detail: `Sat ${MORNING_HOUR}:00`,
      wakeAt: atLocalHour(now, daysUntil(now, 6), MORNING_HOUR),
    })
  }
  presets.push({
    id: 'nextweek',
    label: 'Next week',
    detail: `Mon ${MORNING_HOUR}:00`,
    wakeAt: atLocalHour(now, daysUntil(now, 1), MORNING_HOUR),
  })
  return presets
}

/** The last date a custom pick may name — the cap, as a local date at 9:00. */
export function maxDeferAt(now: number): number {
  return atLocalHour(now, MAX_DEFER_DAYS, MORNING_HOUR)
}

/** A custom date from the picker, landing at the morning hour like the presets. */
export function deferAtDate(year: number, month: number, day: number): number {
  const d = new Date(year, month, day)
  d.setHours(MORNING_HOUR, 0, 0, 0)
  return d.getTime()
}
