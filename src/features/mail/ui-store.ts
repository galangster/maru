// UI state only. Anything that is mail data lives in react-query, keyed off
// MailService; anything that is "what is the user looking at" lives here.

import { create } from 'zustand'

import type { MailView } from '@/core/types'
import { viewOverride } from '@/lib/env'
import { clearedUndoable, liveUndoable, type Undoable } from '@/lib/undo'

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
  /** Thread keys the user has un-blocked images for. Session scoped, on purpose. */
  imagesAllowed: Set<string>
  /**
   * Per-view list preferences, keyed by `viewKey`. Sparse: a view absent here
   * is at `DEFAULT_LIST_PREFS`. Session scoped like the rest of this store —
   * a filter is a way of looking, not a setting.
   */
  listPrefs: Record<string, ListPrefs>
  /**
   * The one thing ⌘Z would put back. One slot, not a stack — see lib/undo.ts.
   *
   * It is UI state and not mail data: the mutation itself has already gone
   * through react-query, and what is held here is only the offer to reverse it.
   */
  undoable: Undoable | null

  setView: (view: MailView) => void
  setSelected: (key: string | null, source?: SelectionSource) => void
  setTheme: (theme: ThemeChoice) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleAccount: (accountId: string) => void
  allowImages: (threadKey: string) => void
  /** Change part of a view's list lens; the rest keeps its current value. */
  setListPrefs: (view: MailView, patch: Partial<ListPrefs>) => void
  /** Offer an undo. Stamps `at` here so no caller can hand in its own clock. */
  registerUndo: (entry: Omit<Undoable, 'at'>) => void
  /** Withdraw the offer, if it is still the one on the table. */
  clearUndo: (id: string) => void
  /**
   * Run the pending undo if it is still inside its window, and report what it
   * was so the caller can say so. The entry is cleared *before* it runs, which
   * is what stops a double ⌘Z reversing the same action twice.
   */
  runUndo: (now?: number) => string | null
}

export const useUi = create<UiState>((set, get) => ({
  view: INITIAL_VIEW,
  selected: null,
  selectionSource: 'pointer',
  theme: 'system',
  sidebarCollapsed: false,
  expandedAccounts:
    INITIAL_VIEW.kind === 'account' ? { [INITIAL_VIEW.accountId]: true } : {},
  imagesAllowed: new Set<string>(),
  listPrefs: {},
  undoable: null,

  // Changing view always drops the selection: keeping a thread from another
  // folder open while its row is gone reads as a bug. Opening a label also
  // opens its account section, so the sidebar never hides the current view.
  setView: (view) =>
    set((s) => ({
      view,
      selected: null,
      expandedAccounts:
        view.kind === 'account'
          ? { ...s.expandedAccounts, [view.accountId]: true }
          : s.expandedAccounts,
    })),
  setSelected: (selected, selectionSource = 'pointer') => set({ selected, selectionSource }),
  setTheme: (theme) => set({ theme }),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  toggleAccount: (accountId) =>
    set((s) => ({
      expandedAccounts: { ...s.expandedAccounts, [accountId]: !s.expandedAccounts[accountId] },
    })),
  allowImages: (threadKey) =>
    set((s) => ({ imagesAllowed: new Set(s.imagesAllowed).add(threadKey) })),
  setListPrefs: (view, patch) =>
    set((s) => {
      const key = viewKey(view)
      const current = s.listPrefs[key] ?? DEFAULT_LIST_PREFS
      const next = { ...current, ...patch }
      // A re-picked verb is a no-op: keeping the map's identity is what keeps
      // the list from re-filtering and re-rendering for nothing.
      if (next.sort === current.sort && next.filter === current.filter) return s
      return { listPrefs: { ...s.listPrefs, [key]: next } }
    }),

  registerUndo: (entry) => set({ undoable: { ...entry, at: Date.now() } }),
  clearUndo: (id) => set((s) => ({ undoable: clearedUndoable(s.undoable, id) })),
  runUndo: (now = Date.now()) => {
    const entry = liveUndoable(get().undoable, now)
    if (!entry) return null
    set({ undoable: null })
    entry.run()
    return entry.label
  },
}))

/** The current view's lens. Stable references: a stored object or the default. */
export function useListPrefs(): ListPrefs {
  return useUi((s) => s.listPrefs[viewKey(s.view)] ?? DEFAULT_LIST_PREFS)
}
