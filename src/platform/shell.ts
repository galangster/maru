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

/** One item on the native bar. Swift writes no tab list; it is handed these. */
export interface NativeTab {
  /** The label under the symbol. */
  title: string
  /** An SF Symbol name. */
  symbol: string
}

/** The plugin only exists in the iOS bundle. Everywhere else, skip the invoke. */
export const nativeShellPossible = isTauri() && platformOS === 'ios'

/**
 * Fire and forget. A haptic that fails must never reject the archive it was
 * decorating, and a badge write that arrives before the bar is installed is
 * not news — the plugin resolves those quietly and this swallows the rest.
 *
 * Resolves `true` when the plugin answered, which is what `attachNativeShell`
 * reads as proof that the native bar is there.
 */
async function call(command: string, args: Record<string, unknown> = {}): Promise<boolean> {
  if (!nativeShellPossible) return false
  try {
    await invoke(`plugin:maru-shell|${command}`, args)
    return true
  } catch {
    // The shell is optional. Nothing the web layer can do about it.
    return false
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
  /**
   * Wake the Taptic Engine at the start of a gesture that is about to end in a
   * haptic — a pull, a sheet opening. `prepare()` is asynchronous and stays
   * warm for a couple of seconds, so it only buys latency at a boundary; one
   * line before the impact it costs and buys nothing.
   */
  prepareHaptics: () => call('prepare_haptics'),
}

/**
 * Subscribes to native tab taps, and in the same call says what the bar
 * carries. Resolves with a detach function when the plugin answered, and
 * `null` when there is no native bar — which is the runtime proof that the web
 * bar must render instead.
 *
 * The descriptors travel with the subscription because the bar cannot exist
 * before them: the plugin installs itself on this call.
 */
let subscription = 0

export async function attachNativeShell(
  tabs: readonly NativeTab[],
  onSelect: (index: number) => void,
): Promise<(() => void) | null> {
  const mine = ++subscription
  const channel = new Channel<{ index: number }>()
  channel.onmessage = (message) => onSelect(message.index)
  if (!(await call('watch_tabs', { channel, tabs }))) return null
  return () => {
    channel.onmessage = () => {}
    // Only the newest subscription may clear the native side. React's
    // development double-mount attaches twice and tears the first one down
    // after the second has landed, and an unconditional `unwatch_tabs` there
    // takes the live channel with it: the bar highlights the tab it was tapped
    // on and the route never moves.
    if (mine === subscription) void call('unwatch_tabs')
  }
}
