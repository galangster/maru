// One debounce, shared by the palette and the list search, so both wait the
// same amount before they ask MailService anything.

import { useEffect, useState } from 'react'

/** 160 ms: below a comfortable typing cadence, above a per-keystroke query. */
export const SEARCH_DEBOUNCE_MS = 160

export function useDebounced<T>(value: T, ms: number = SEARCH_DEBOUNCE_MS): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return settled
}
