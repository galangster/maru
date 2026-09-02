// UI state only. Anything that is mail data lives in react-query, keyed off
// MailService; anything that is "what is the user looking at" lives here.

import { create } from 'zustand'


import type { MailView } from '@/core/types'
import { viewOverride } from '@/lib/env'
import {
  findUndoable,
  newestUndoable,
  pushUndoable,
  withoutUndoable,
  type Undoable,
  type UndoStack,
} from '@/lib/undo'

export type ListSort = 'newest' | 'oldest'
export type ListFilter = 'all' | 'unread' | 'starred' | 'attachments'

/**
 * How one view's list is ordered and which threads it shows. State lives here
 * with the rest of "what is the user looking at"; the lens that applies it is
 * list domain (`features/list/list-prefs.ts`).
 */
export interface ListPrefs {
  sort: ListSort
  filter: ListFilter
}

/** Most recent on top, everything shown — the default every view starts at. */
export const DEFAULT_LIST_PREFS: ListPrefs = { sort: 'newest', filter: 'all' }

export function isDefaultPrefs(prefs: ListPrefs): boolean {
  return prefs.sort === DEFAULT_LIST_PREFS.sort && prefs.filter === DEFAULT_LIST_PREFS.filter
}

/**
 * How much of the open conversation is unfolded. `default` is the rule the
 * pane derives (the newest message open, the rest collapsed); `all` and
 * `none` are the keyboard's and the palette's blunt verbs; a Set is the
 * state after a person has toggled individual messages.
 */
export type ReadingExpansion = 'default' | 'all' | 'none' | ReadonlySet<string>

export type ThemeChoice = 'system' | 'light' | 'dark'

/**
 * How the current thread came to be selected.
 *
 * `keyboard` means j/k traversal — a 100+/day action that gets no motion at
 * all. `pointer` covers a click and a palette jump: rare enough that the
 * reading pane is licensed to animate its arrival (UI-REVIEW S1, MAGIC §3.8).
 */
export type SelectionSource = 'keyboard' | 'pointer'

/** Stable string for a view — query keys, selection resets, DOM hooks. */
export function viewKey(view: MailView): string {
  if (view.kind === 'later') return 'later'
  return view.kind === 'unified' ? view.folder : `account:${view.accountId}:${view.labelId}`
}

// The folder order is the engine's one folder table, not a second list here.
export { UNIFIED_ORDER } from '@/core/defaults'

const INITIAL_VIEW: MailView = viewOverride() ?? { kind: 'unified', folder: 'inbox' }

interface UiState {
  view: MailView
  selected: string | null
  selectionSource: SelectionSource
  theme: ThemeChoice
  sidebarCollapsed: boolean
  /** Account sections start collapsed — DIRECTION's sidebar spec. */
  expandedAccounts: Record<string, boolean>
  /** The whole Accounts group, folded to one header row. */
  accountsGroupCollapsed: boolean
  /**
   * Thread keys the user has un-blocked images for. Session scoped, on purpose.
   *
   * Only reachable while `Settings.imagePolicy` is `block` — under the default
   * (`allow`, since 2026-08-31) images already load, the banner that populates
   * this never renders, and `allowImages` is never called. It is the
   * per-conversation override for the blocking mode, not dead code.
   */
  imagesAllowed: Set<string>
  /**
   * Accounts whose "mail has stopped arriving" notice has been dismissed.
   *
   * Session scoped, and never persisted — deliberately. A dead grant lasts
   * until a person acts on it, so a permanently dismissed notice would
   * recreate exactly the silence this notice exists to end. Dismissing lets
   * you read the mail you have; the next launch tells you again. The footer
   * line and the Settings row stay put either way, so this never removes the
   * last trace.
   */
  syncNoticeDismissed: Set<string>
  /**
   * Bulk selection: the threads marked (`x`, shift-click, select-all) for one
   * batch action. Distinct from `selected`, which is the thread being *read*.
   * Session scoped and dropped on view change — a batch is an intent about
   * the list on screen, not a persistent set.
   */
  checked: ReadonlySet<string>
  /** The last key toggled — the fixed end of a shift-click range. */
  checkAnchor: string | null
  /**
   * Addresses a settings import brought over that this device has not signed
   * in to yet — G2's map-4 v1 payload, the half that needs no server.
   *
   * Here rather than in the Settings dialog because the dialog unmounts: a
   * person who imports, closes Settings to look at something, and comes back
   * would otherwise find the queue gone with no way to recover it but pasting
   * again. Session scoped like the rest of this store — an unfinished sign-in
   * is an intent about this sitting, and a fresh launch should not nag about
   * a decision made yesterday. NO TOKEN is held here, only addresses.
   */
  pendingAccounts: string[]
  /**
   * Per-view list preferences, keyed by `viewKey`. Sparse: a view absent here
   * is at `DEFAULT_LIST_PREFS`. Session scoped like the rest of this store —
   * a filter is a way of looking, not a setting.
   */
  listPrefs: Record<string, ListPrefs>
  /** Expansion of the open conversation. Reset whenever the selection moves. */
  readingExpansion: ReadingExpansion
  /**
   * What ⌘Z would put back, newest first — a bounded stack, see lib/undo.ts.
   *
   * It is UI state and not mail data: the mutations themselves have already
   * gone through react-query, and what is held here is only the offers to
   * reverse them.
   */
  undoStack: UndoStack

  setView: (view: MailView) => void
  setSelected: (key: string | null, source?: SelectionSource) => void
  setTheme: (theme: ThemeChoice) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleSidebar: () => void
  toggleAccount: (accountId: string) => void
  toggleAccountsGroup: () => void
  allowImages: (threadKey: string) => void
  dismissSyncNotice: (accountIds: string[]) => void
  toggleChecked: (threadKey: string) => void
  /** Add a batch (a shift-click range, or select-all). Never removes. */
  checkMany: (threadKeys: string[]) => void
  clearChecked: () => void
  setPendingAccounts: (emails: string[]) => void
  /** Change part of a view's list lens; the rest keeps its current value. */
  setListPrefs: (view: MailView, patch: Partial<ListPrefs>) => void
  setReadingExpansion: (next: ReadingExpansion) => void
  /**
   * Offer an undo, on top of the ones already there. Stamps `at` here so no
   * caller can hand in its own clock. Re-registering an id replaces it.
   */
  registerUndo: (entry: Omit<Undoable, 'at'>) => void
  /** Withdraw one offer by name, wherever in the stack it is. */
  clearUndo: (id: string) => void
  /**
   * Drop every offer. Sign-out and a mailbox reset, and nothing else: an undo
   * that outlived the mail it names would reverse an action against threads
   * that are no longer there.
   */
  clearUndoStack: () => void
  /**
   * Run the newest undo still inside its window and report the entry, so the
   * caller can say what it was and take that entry's own offer off the screen.
   * Null means there was nothing live, which is a sentence and not a silence.
   *
   * The entry leaves the stack *before* it runs, which is what stops a double
   * ⌘Z reversing the same action twice.
   */
  runUndo: (now?: number) => Undoable | null
  /**
   * Run one named offer — the toast's own Undo button, which reverses the
   * action that raised it even when newer ones sit above it in the stack.
   */
  undoEntry: (id: string, now?: number) => Undoable | null
}

/**
 * One key survives a relaunch: `sidebarCollapsed`.
 *
 * The sidebar toggle used to be the most visible control in the app, in the
 * titlebar. It now lives in the sidebar footer, so a person who collapsed the
 * sidebar and quit would have had to re-find that button every launch. Nothing
 * else here is persisted on purpose — a view, a selection, a lens and a batch
 * are all "what am I looking at right now", and two of them hold a Set that
 * does not survive JSON at all.
 *
 * It is one boolean, read once at startup and written only when it changes,
 * and it is deliberately NOT zustand's `persist`. That middleware wraps
 * `setState` and calls `setItem` on EVERY mutation — `partialize` only shrinks
 * the payload, it does not gate the write — so this one preference would have
 * cost a JSON.stringify plus a synchronous localStorage write on every `j`,
 * every `k`, every `x` and every archive: the app's hottest path paying for
 * its least volatile fact.
 */
const SIDEBAR_KEY = 'wren-sidebar-collapsed-v1'

function storedSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === '1'
  } catch {
    // Private windows and blocked site data throw on access, not on read.
    return false
  }
}

export const useUi = create<UiState>()((set, get) => ({
  view: INITIAL_VIEW,
  selected: null,
  selectionSource: 'pointer',
  theme: 'system',
  sidebarCollapsed: storedSidebarCollapsed(),
  expandedAccounts:
    INITIAL_VIEW.kind === 'account' ? { [INITIAL_VIEW.accountId]: true } : {},
  accountsGroupCollapsed: false,
  imagesAllowed: new Set<string>(),
  syncNoticeDismissed: new Set<string>(),
  checked: new Set<string>(),
  checkAnchor: null,
  pendingAccounts: [],
  listPrefs: {},
  readingExpansion: 'default',
  undoStack: [],

  // Changing view always drops the selection: keeping a thread from another
  // folder open while its row is gone reads as a bug. Opening a label also
  // opens its account section, so the sidebar never hides the current view.
  setView: (view) =>
    set((s) => ({
      view,
      selected: null,
      checked: new Set<string>(),
      checkAnchor: null,
      readingExpansion: 'default',
      expandedAccounts:
        view.kind === 'account'
          ? { ...s.expandedAccounts, [view.accountId]: true }
          : s.expandedAccounts,
      // Navigating into an account must reveal it, whatever the group was.
      accountsGroupCollapsed: view.kind === 'account' ? false : s.accountsGroupCollapsed,
    })),
  toggleAccountsGroup: () =>
    set((s) => ({ accountsGroupCollapsed: !s.accountsGroupCollapsed })),
  setSelected: (selected, selectionSource = 'pointer') =>
    set({ selected, selectionSource, readingExpansion: 'default' }),
  setTheme: (theme) => set({ theme }),
  // Guarded: the resize handle calls this on every layout tick of a drag, and
  // an unguarded `set` would notify every subscriber sixty times a second for
  // a value that did not move.
  setSidebarCollapsed: (sidebarCollapsed) =>
    set((s) => (s.sidebarCollapsed === sidebarCollapsed ? s : { sidebarCollapsed })),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  toggleAccount: (accountId) =>
    set((s) => ({
      expandedAccounts: { ...s.expandedAccounts, [accountId]: !s.expandedAccounts[accountId] },
    })),
  allowImages: (threadKey) =>
    set((s) => ({ imagesAllowed: new Set(s.imagesAllowed).add(threadKey) })),
  dismissSyncNotice: (accountIds) =>
    set((s) => {
      const next = new Set(s.syncNoticeDismissed)
      for (const id of accountIds) next.add(id)
      return { syncNoticeDismissed: next }
    }),
  toggleChecked: (threadKey) =>
    set((s) => {
      const checked = new Set(s.checked)
      if (checked.has(threadKey)) checked.delete(threadKey)
      else checked.add(threadKey)
      return { checked, checkAnchor: threadKey }
    }),
  checkMany: (threadKeys) =>
    set((s) => {
      const checked = new Set(s.checked)
      for (const key of threadKeys) checked.add(key)
      return { checked }
    }),
  clearChecked: () => set({ checked: new Set<string>(), checkAnchor: null }),
  setPendingAccounts: (pendingAccounts) => set({ pendingAccounts }),
  setReadingExpansion: (readingExpansion) => set({ readingExpansion }),
  setListPrefs: (view, patch) =>
    set((s) => {
      const key = viewKey(view)
      const current = s.listPrefs[key] ?? DEFAULT_LIST_PREFS
      const next = { ...current, ...patch }
      // A re-picked verb is a no-op: keeping the map's identity is what keeps
      // the list from re-filtering and re-rendering for nothing.
      if (next.sort === current.sort && next.filter === current.filter) return s
      // A lens change replaces the list on screen, and the batch was an
      // intent about that list — so it is dropped here, by the state's owner,
      // rather than survived invisibly and re-materialized by a later toggle.
      return {
        listPrefs: { ...s.listPrefs, [key]: next },
        checked: new Set<string>(),
        checkAnchor: null,
      }
    }),

  registerUndo: (entry) =>
    set((s) => ({ undoStack: pushUndoable(s.undoStack, { ...entry, at: Date.now() }) })),
  clearUndo: (id) => set((s) => ({ undoStack: withoutUndoable(s.undoStack, id) })),
  clearUndoStack: () => set((s) => (s.undoStack.length === 0 ? s : { undoStack: [] })),
  runUndo: (now = Date.now()) => runEntry(newestUndoable(get().undoStack, now)),
  undoEntry: (id, now = Date.now()) => runEntry(findUndoable(get().undoStack, id, now)),
}))

/**
 * Take one entry out of the stack, then run it — in that order, so a second
 * press during the reversal finds it gone. Shared by ⌘Z and by the toast
 * button, because "which entry" is the only thing the two disagree about.
 */
function runEntry(entry: Undoable | null): Undoable | null {
  if (!entry) return null
  useUi.setState((s) => ({ undoStack: withoutUndoable(s.undoStack, entry.id) }))
  entry.run()
  return entry
}

// Fires only when the boolean actually changes, so the write happens on a
// deliberate toggle and never during triage or a resize drag.
useUi.subscribe((state, previous) => {
  if (state.sidebarCollapsed === previous.sidebarCollapsed) return
  try {
    localStorage.setItem(SIDEBAR_KEY, state.sidebarCollapsed ? '1' : '0')
  } catch {
    // Not being able to remember the sidebar is not worth an error.
  }
})

/** The current view's lens. Stable references: a stored object or the default. */
export function useListPrefs(): ListPrefs {
  return useUi((s) => s.listPrefs[viewKey(s.view)] ?? DEFAULT_LIST_PREFS)
}
