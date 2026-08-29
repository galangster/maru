// Which floating surface is open. One store, so the Esc handler and the
// shortcut layer never have to guess what is on top.
//
// The four dialog surfaces (palette, settings, shortcuts, onboarding) trap
// focus and own their own Escape. The two inline surfaces (list search, the
// composer) do not, so `topmostInline` is what the global Esc handler reads.

import { create } from 'zustand'

export type SettingsSection = 'accounts' | 'appearance' | 'google' | 'sync' | 'about'

export const SETTINGS_SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: 'accounts', label: 'Accounts' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'google', label: 'Google API' },
  { id: 'sync', label: 'Sync' },
  { id: 'about', label: 'About' },
]

interface SurfaceState {
  palette: boolean
  /** The open section, or null when Settings is closed. */
  settings: SettingsSection | null
  shortcuts: boolean
  onboarding: boolean
  /** The list header's inline search field, and what is in it. */
  searchOpen: boolean
  searchQuery: string

  setPalette: (open: boolean) => void
  openSettings: (section?: SettingsSection) => void
  closeSettings: () => void
  setShortcuts: (open: boolean) => void
  setOnboarding: (open: boolean) => void
  openSearch: () => void
  closeSearch: () => void
  setSearchQuery: (q: string) => void
}

export const useSurfaces = create<SurfaceState>((set) => ({
  palette: false,
  settings: null,
  shortcuts: false,
  onboarding: false,
  searchOpen: false,
  searchQuery: '',

  setPalette: (palette) => set({ palette }),
  openSettings: (section = 'accounts') => set({ settings: section, palette: false }),
  closeSettings: () => set({ settings: null }),
  setShortcuts: (shortcuts) => set({ shortcuts }),
  setOnboarding: (onboarding) => set({ onboarding }),
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
  s.palette || s.settings !== null || s.shortcuts || s.onboarding

export function anyDialogOpen(): boolean {
  return selectAnyDialogOpen(useSurfaces.getState())
}

export function useAnyDialogOpen(): boolean {
  return useSurfaces(selectAnyDialogOpen)
}

/** Where focus goes when a surface closes: back to the list, per DIRECTION. */
export function focusThreadList(): void {
  document.querySelector<HTMLElement>('section[aria-label="Threads"]')?.focus()
}
