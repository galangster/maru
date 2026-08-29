// One clock for every relative date on screen. Frozen under ?screenshot=1, and
// otherwise nudged once a minute so "Yesterday" becomes "Sat" without a reload.
//
// One interval for the whole app, not one per caller: every visible row asks
// for the time, and a virtualized list is dozens of rows.

import { useSyncExternalStore } from 'react'

import { isScreenshot, now } from './env'

let current = now()
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (!isScreenshot && timer === null) {
    timer = setInterval(() => {
      current = now()
      for (const l of listeners) l()
    }, 60_000)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }
}

function getSnapshot(): number {
  return current
}

export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
