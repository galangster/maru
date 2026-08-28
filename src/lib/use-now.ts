// One clock for every relative date on screen. Frozen under ?screenshot=1, and
// otherwise nudged once a minute so "Yesterday" becomes "Sat" without a reload.

import { useEffect, useState } from 'react'

import { isScreenshot, now } from './env'

export function useNow(): number {
  const [value, setValue] = useState(() => now())
  useEffect(() => {
    if (isScreenshot) return
    const id = window.setInterval(() => setValue(now()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  return value
}
