// The native iOS shell: the system tab bar around the web content, and the
// system haptic generators. Backed by the `maru-shell` Tauri plugin.
//
// Deliberately thin, like platform/tauri.ts, and for the same reason: none of
// it can run under Node, so none of it is unit-tested. The one piece with a
// decision in it — what the Inbox badge should say — lives in mobile/state.ts
// where the tests can reach it.
//
// Every method is a no-op off iOS. The browser preview at `?mobile=1` and the
// desktop app therefore need no branch of their own; they simply never see a
// native bar, and MobileApp keeps rendering the web one.

import { Channel, invoke } from '@tauri-apps/api/core'

import { isTauri, platformOS } from '@/lib/env'

export type HapticImpact = 'light' | 'medium' | 'heavy' | 'soft' | 'rigid'
export type HapticNotice = 'success' | 'warning' | 'error'

/** The plugin only exists in the iOS bundle. Everywhere else, skip the invoke. */
export const nativeShellPossible = isTauri() && platformOS === 'ios'

/**
 * Fire and forget. A haptic that fails must never reject the archive it was
 * decorating, and a badge write that arrives before the bar is installed is
 * not news — the plugin resolves those quietly and this swallows the rest.
 */
async function call(command: string, args: Record<string, unknown> = {}): Promise<void> {
  if (!nativeShellPossible) return
  try {
    await invoke(`plugin:maru-shell|${command}`, args)
  } catch {
    // The shell is optional. Nothing the web layer can do about it.
  }
}

export const nativeShell = {
  /** Index into the bar: 0 Inbox, 1 Search, 2 Settings. */
  selectTab: (index: number) => call('select_tab', { index }),
  /** `null` clears it. The web layer owns the "99+" rollover. */
  setBadge: (index: number, value: string | null) => call('set_badge', { index, value }),
  setTabBarHidden: (hidden: boolean) => call('set_tab_bar_hidden', { hidden }),
  impact: (style: HapticImpact) => call('impact', { style }),
  notify: (kind: HapticNotice) => call('notify', { kind }),
  /** Unused for tab changes — UIKit already plays that one itself. */
  selection: () => call('selection'),
}

/**
 * Subscribes to native tab taps. Resolves true when the plugin answered, which
 * is the runtime proof that the native bar is there and the web one must not be.
 */
export async function attachNativeShell(onSelect: (index: number) => void): Promise<boolean> {
  if (!nativeShellPossible) return false
  try {
    const channel = new Channel<{ index: number }>()
    channel.onmessage = (message) => onSelect(message.index)
    await invoke('plugin:maru-shell|watch_tabs', { channel })
    return true
  } catch {
    return false
  }
}
