import { useEffect, useRef, useState } from 'react'

import { attachNativeShell, nativeShellPossible } from '@/platform/shell'

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
    if (!nativeShellPossible) return
    let live = true
    void attachNativeShell((index) => handler.current(index)).then((ok) => {
      if (live) setPresent(ok)
    })
    return () => {
      live = false
    }
  }, [])

  return present
}
