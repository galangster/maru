import { useEffect, useRef, useState } from 'react'

import { attachNativeShell, nativeShell, nativeShellPossible } from '@/platform/shell'

import { indexOfTab, nativeTabs } from './state'

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
 * Mirrors the web layer's state onto the native bar.
 *
 * `hidden` is not a nicety. The bar draws over the webview, so anything the
 * web layer puts on top of the screen — a thread, the account route, a sheet,
 * the composer — has to take the bar away or the glass floats above it.
 */
export function useNativeShellSync(
  present: boolean | null,
  { hidden, badge }: { hidden: boolean; badge: string | null },
): void {
  useEffect(() => {
    if (present) void nativeShell.setTabBarHidden(hidden)
  }, [present, hidden])

  useEffect(() => {
    if (present) void nativeShell.setBadge(indexOfTab('inbox'), badge)
  }, [present, badge])
}
