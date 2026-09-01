// Which floating surface is open. One store, so the Esc handler and the
// shortcut layer never have to guess what is on top.
//
// The four dialog surfaces (palette, settings, shortcuts, onboarding) trap
// focus and own their own Escape. The two inline surfaces (list search, the
// composer) do not, so `topmostInline` is what the global Esc handler reads.

import { create } from 'zustand'

export type SettingsSection =
  | 'accounts'
  | 'agents'
  | 'appearance'
  | 'google'
  | 'sync'
  | 'about'

// Agents sits second, immediately under Accounts: both answer "who can touch
// this mailbox", and a person looking for one will look where the other is.
export const SETTINGS_SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: 'accounts', label: 'Accounts' },
  { id: 'agents', label: 'Agents' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'google', label: 'Google API' },
  { id: 'sync', label: 'Sync' },
  { id: 'about', label: 'About' },
]

/**
 * What the Later picker is about: the threads it will save, and whether this
 * came from a batch — which decides the toast's wording and the undo's id, and
 * is not derivable from `keys.length` because a batch of one is still a batch.
 */
export interface LaterTarget {
  keys: string[]
  bulk: boolean
}

interface SurfaceState {
  palette: boolean
  /** The open section, or null when Settings is closed. */
  settings: SettingsSection | null
  shortcuts: boolean
  onboarding: boolean
  /** The approval queue — M1. Opened from the sidebar footer's badge. */
  approvals: boolean
  /**
   * The audit timeline, and which agent it is filtered to. `null` is closed;
   * `'all'` is open with no filter. One field rather than two, so "open it on
   * this agent" is a single call and cannot half-apply.
   */
  audit: string | null
  /**
   * The Later picker — P21. Held here rather than in the list because three
   * doors open it (`h`, the row's hover cluster, the palette) and one of them
   * is a global key handler with no component to hang state on.
   */
  later: LaterTarget | null
  /** The list header's inline search field, and what is in it. */
  searchOpen: boolean
  searchQuery: string

  setPalette: (open: boolean) => void
  openSettings: (section?: SettingsSection) => void
  closeSettings: () => void
  setShortcuts: (open: boolean) => void
  setOnboarding: (open: boolean) => void
  setApprovals: (open: boolean) => void
  openAudit: (agentId?: string) => void
  closeAudit: () => void
  openLater: (keys: string[], bulk?: boolean) => void
  closeLater: () => void
  openSearch: () => void
  closeSearch: () => void
  setSearchQuery: (q: string) => void
}

export const useSurfaces = create<SurfaceState>((set) => ({
  palette: false,
  settings: null,
  shortcuts: false,
  onboarding: false,
  approvals: false,
  audit: null,
  later: null,
  searchOpen: false,
  searchQuery: '',

  setPalette: (palette) => set({ palette }),
  openSettings: (section = 'accounts') => set({ settings: section, palette: false }),
  closeSettings: () => set({ settings: null }),
  setShortcuts: (shortcuts) => set({ shortcuts }),
  setOnboarding: (onboarding) => set({ onboarding }),
  setApprovals: (approvals) => set({ approvals }),
  // The timeline is reached from Settings and from the queue, and it is the
  // taller surface of the two, so it closes whichever one summoned it rather
  // than stacking a third dialog on top of them.
  openAudit: (agentId = 'all') => set({ audit: agentId, approvals: false, settings: null }),
  closeAudit: () => set({ audit: null }),
  // Opening it closes the palette, which is one of the three doors onto it: a
  // picker floating over a palette would be the third glass layer DIRECTION §7
  // rule 1 calls a bug.
  openLater: (keys, bulk = false) => set(keys.length ? { later: { keys, bulk }, palette: false } : {}),
  closeLater: () => set({ later: null }),
  openSearch: () => set({ searchOpen: true }),
  closeSearch: () => set({ searchOpen: false, searchQuery: '' }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
}))

/**
 * True while a focus-trapping dialog is up. One predicate, two call shapes:
 * the keymap asks once per keypress, and the composer has to re-render when
 * the answer changes — it drops its blur so glass never stacks three deep.
 */
export const selectAnyDialogOpen = (s: SurfaceState): boolean =>
  s.palette ||
  s.settings !== null ||
  s.shortcuts ||
  s.onboarding ||
  s.approvals ||
  s.audit !== null ||
  s.later !== null

export function anyDialogOpen(): boolean {
  return selectAnyDialogOpen(useSurfaces.getState())
}

export function useAnyDialogOpen(): boolean {
  return useSurfaces(selectAnyDialogOpen)
}

/**
 * Where focus goes when a surface closes: back to the list, per DIRECTION.
 *
 * The listbox itself when there is one, so `aria-activedescendant` is live and
 * the selection is announced; the pane is the fallback for an empty or
 * searching list, which has no listbox to land on.
 */
export function focusThreadList(): void {
  const listbox = document.querySelector<HTMLElement>('[data-wren-listbox]')
  if (listbox) {
    listbox.focus()
    return
  }
  document.querySelector<HTMLElement>('section[aria-label="Threads"]')?.focus()
}
