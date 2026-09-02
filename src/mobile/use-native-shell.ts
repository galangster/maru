import { useEffect, useRef, useState } from 'react'

import { useUnreadCount } from '@/features/mail/queries'
import { attachNativeShell, nativeShell, nativeShellPossible } from '@/platform/shell'

import { inboxBadgeValue, indexOfTab, nativeTabs, type MobileTab } from './state'

const INBOX_VIEW = { kind: 'unified', folder: 'inbox' } as const

/**
 * Wakes the Taptic Engine at a point where a haptic is about to be asked for.
 *
 * `prepare()` decays in a couple of seconds, so calling it one line before the
 * impact pays the cost and buys nothing. A sheet opening is the boundary that
 * makes it worth the call: Later commits an impact, the actions sheet
 * archives, and the composer ends in `notify('success')`.
 */
export function useHapticBoundary(): void {
  useEffect(() => {
    void nativeShell.prepareHaptics()
  }, [])
}

/**
 * `null` while the probe is in flight, then `true` if the native tab bar is
 * driving navigation and `false` if the web one must.
 *
 * The pending state matters: rendering the web bar for one frame on iOS and
 * then pulling it out from under the glass is a visible flinch, and the probe
 * settles in a few milliseconds. Off iOS it never starts and answers `false`
 * on the first render.
 */
export function useNativeShell(onTabSelected: (index: number) => void): boolean | null {
  const [present, setPresent] = useState<boolean | null>(nativeShellPossible ? null : false)
  const handler = useRef(onTabSelected)
  handler.current = onTabSelected

  useEffect(() => {
    let detach: (() => void) | null = null
    let live = true
    void attachNativeShell(nativeTabs(), (index) => handler.current(index)).then((result) => {
      if (!live) result?.()
      else {
        detach = result
        setPresent(result !== null)
      }
    })
    return () => {
      live = false
      detach?.()
    }
  }, [])

  return present
}

/**
 * Mirrors the web layer's state onto the native bar. The bar is a projection of
 * the reducer, never a second source of truth: `tab` is sent the same way
 * `hidden` and the badge are, so no caller has to remember to tell it.
 *
 * UIKit does not call its delegate back for a programmatic selection, so
 * mirroring cannot loop.
 *
 * `hidden` is not a nicety. The bar draws over the webview, so anything the
 * web layer puts on top of the screen — a thread, the account route, a sheet,
 * the composer — has to take the bar away or the glass floats above it.
 */
export function useNativeShellSync(
  present: boolean | null,
  { tab, hidden }: { tab: MobileTab; hidden: boolean },
): void {
  // The badge is the only thing the bar needs that is not already on screen,
  // so the count that feeds it is asked for here and only while there is a bar
  // to put it on. The effect depends on the badge string, not the raw count:
  // 100 unread going to 150 sends no IPC.
  const unread = useUnreadCount(INBOX_VIEW, { enabled: present === true })
  const badge = inboxBadgeValue(unread.data ?? 0)
  const index = indexOfTab(tab)

  useEffect(() => {
    if (present) void nativeShell.selectTab(index)
  }, [present, index])

  useEffect(() => {
    if (present) void nativeShell.setTabBarHidden(hidden)
  }, [present, hidden])

  useEffect(() => {
    if (present) void nativeShell.setBadge(indexOfTab('inbox'), badge)
  }, [present, badge])
}
