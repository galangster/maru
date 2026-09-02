// Which floating surface is open. One store, so the Esc handler and the
// shortcut layer never have to guess what is on top.
//
// The four dialog surfaces (palette, settings, shortcuts, onboarding) trap
// focus and own their own Escape. The two inline surfaces (list search, the
// composer) do not, so `topmostInline` is what the global Esc handler reads.

import { create } from 'zustand'

export type SettingsSection =
  | 'maru'
  | 'accounts'
  | 'agents'
  | 'appearance'
  | 'google'
  | 'sync'
  | 'about'

// Agents sits second, immediately under Accounts: both answer "who can touch
// this mailbox", and a person looking for one will look where the other is.
export const SETTINGS_SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: 'maru', label: 'Maru account' },
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

  // The palette remembers where the keyboard was on the way IN, and hands it
  // back on the way out — issue #58. It is the one dialog that opens OVER
  // another surface rather than replacing it, so "the screen was yours before
  // this, take it back" is a real answer for it and is not for the other four.
  setPalette: (palette) => {
    if (palette) rememberFocusOrigin('palette')
    set({ palette })
  },
  // These two close the palette by TAKING the screen from it, so the slot is
  // dropped rather than spent: the surface that is arriving owns focus, and a
  // restore here would pull the keyboard back out of it.
  openSettings: (section = 'accounts') => {
    forgetFocusOrigin('palette')
    return set({ settings: section, palette: false })
  },
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
  openLater: (keys, bulk = false) => {
    if (!keys.length) return
    forgetFocusOrigin('palette')
    set({ later: { keys, bulk }, palette: false })
  },
  closeLater: () => set({ later: null }),
  openSearch: () => {
    rememberFocusOrigin('search')
    set({ searchOpen: true })
  },
  closeSearch: () => {
    set({ searchOpen: false, searchQuery: '' })
    restoreFocusOrigin('search')
  },
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
 * The two inline surfaces that have somewhere of their own to go back to.
 *
 * The four dialogs trap focus and hand it back to the thread list, which is
 * right for them: they take the screen, so there is no "where you were" left
 * to return to. The composer and the search field do not take the screen — a
 * keyboard user reaches them from wherever they had tabbed to, and dropping
 * focus on the page throws that position away. The next Tab then starts again
 * at the first control in the app (issue 44).
 *
 * One slot per surface rather than one shared slot: both can be open at once,
 * and a search opened from inside a compose must not overwrite where the
 * composer has to go back to.
 */
/**
 * The surfaces that have somewhere of their own to go back to.
 *
 * The composer and the search field, because they do not take the screen —
 * and the palette, because it is the one dialog that opens ON TOP of another
 * surface instead of replacing it (issue #58). Closing it over the Save for
 * later menu used to drop the keyboard on the thread list while the menu was
 * still covering the window: one Tab then walked the page underneath a dialog,
 * and the only way back into the menu was the mouse.
 */
export type InlineSurface = 'composer' | 'search' | 'palette'

const focusOrigin = new Map<InlineSurface, HTMLElement>()

/**
 * Called as the surface opens, before it takes focus.
 *
 * **Only on the way in, and the rule lives here.** The composer re-opens
 * itself on an account switch and on a failed send, and by then the thing
 * holding focus is the composer — which is about to be replaced, and is not
 * where the person was standing when they pressed C. A filled slot therefore
 * wins over a later remember. `restoreFocusOrigin` spends the slot, so the
 * next genuine open records again, and no caller has to carry an
 * `if (!alreadyOpen)` of its own.
 */
export function rememberFocusOrigin(surface: InlineSurface): void {
  if (focusOrigin.has(surface)) return
  if (typeof document === 'undefined') return
  const active = document.activeElement
  if (active instanceof HTMLElement && active !== document.body) {
    focusOrigin.set(surface, active)
  } else {
    focusOrigin.delete(surface)
  }
}

/**
 * Drop a slot without spending it. For the case where the surface is being
 * REPLACED rather than closed: the arriving surface takes focus, and handing
 * it back to where the outgoing one was opened from would pull the keyboard
 * straight out of it.
 */
export function forgetFocusOrigin(surface: InlineSurface): void {
  focusOrigin.delete(surface)
}

/**
 * Spend the slot and answer with the element to focus, without focusing it.
 *
 * Base UI's Dialog moves focus itself when it closes, so the palette hands it
 * this through `finalFocus` rather than racing it with a `focus()` call of its
 * own — which is how the keyboard ended up on the thread list behind a menu
 * that was still on screen (issue #58).
 *
 * `null` means "this surface has no origin left". The caller decides what that
 * is worth: nothing, when another dialog is on screen and owns the keyboard.
 */
export function takeFocusOrigin(surface: InlineSurface): HTMLElement | null {
  if (typeof document === 'undefined') return null
  const origin = focusOrigin.get(surface)
  focusOrigin.delete(surface)
  // `getClientRects` rather than `offsetParent`: a control inside a fixed or
  // collapsed region is still focusable, and an element with no boxes at all
  // is the case that has to fall through.
  if (origin?.isConnected && origin.getClientRects().length > 0) return origin
  return null
}

/**
 * Called as the surface closes. Back to the element that opened it, or to the
 * thread list when that element has gone — the search field's own trigger is
 * replaced by the field, so closing search lands on the list, which is where
 * every other surface lands too.
 */
export function restoreFocusOrigin(surface: InlineSurface): void {
  if (typeof document === 'undefined') return
  const origin = takeFocusOrigin(surface)
  if (origin) {
    origin.focus()
    return
  }
  focusThreadList()
}

/**
 * Where focus goes when a surface closes: back to the list, per DIRECTION.
 *
 * The listbox itself when there is one, so `aria-activedescendant` is live and
 * the selection is announced; the pane is the fallback for an empty or
 * searching list, which has no listbox to land on.
 */
export function threadListElement(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>('[data-wren-listbox]') ??
    document.querySelector<HTMLElement>('section[aria-label="Threads"]')
  )
}

export function focusThreadList(): void {
  threadListElement()?.focus()
}
