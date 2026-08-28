// UI state only. Anything that is mail data lives in react-query, keyed off
// MailService; anything that is "what is the user looking at" lives here.

import { create } from 'zustand'

import type { MailView, UnifiedFolder } from '@/core/types'
import { viewOverride } from '@/lib/env'

export type ThemeChoice = 'system' | 'light' | 'dark'

/** Stable string for a view — query keys, selection resets, DOM hooks. */
export function viewKey(view: MailView): string {
  return view.kind === 'unified' ? view.folder : `account:${view.accountId}:${view.labelId}`
}

export const UNIFIED_ORDER: UnifiedFolder[] = ['inbox', 'starred', 'sent', 'trash']

const INITIAL_VIEW: MailView = viewOverride() ?? { kind: 'unified', folder: 'inbox' }

interface UiState {
  view: MailView
  selected: string | null
  theme: ThemeChoice
  sidebarCollapsed: boolean
  /** Account sections start collapsed — DIRECTION's sidebar spec. */
  expandedAccounts: Record<string, boolean>
  /** Thread keys the user has un-blocked images for. Session scoped, on purpose. */
  imagesAllowed: Set<string>

  setView: (view: MailView) => void
  setSelected: (key: string | null) => void
  setTheme: (theme: ThemeChoice) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleAccount: (accountId: string) => void
  allowImages: (threadKey: string) => void
}

export const useUi = create<UiState>((set) => ({
  view: INITIAL_VIEW,
  selected: null,
  theme: 'system',
  sidebarCollapsed: false,
  expandedAccounts:
    INITIAL_VIEW.kind === 'account' ? { [INITIAL_VIEW.accountId]: true } : {},
  imagesAllowed: new Set<string>(),

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
  setSelected: (selected) => set({ selected }),
  setTheme: (theme) => set({ theme }),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  toggleAccount: (accountId) =>
    set((s) => ({
      expandedAccounts: { ...s.expandedAccounts, [accountId]: !s.expandedAccounts[accountId] },
    })),
  allowImages: (threadKey) =>
    set((s) => ({ imagesAllowed: new Set(s.imagesAllowed).add(threadKey) })),
}))
