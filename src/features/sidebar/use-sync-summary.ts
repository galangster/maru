// The sync state, for the two shells that say it out loud.
//
// `describeSync` stays a pure function over accounts, statuses and a clock, so
// the sentences can be tested as data (sync-summary.ts). This is the small
// amount of React that has to sit above it, and it lives beside it rather than
// in either shell because both had assembled the same four ingredients
// separately: the app-wide clock, when this window started waiting, the sync
// statuses, and `demo && !syncPreview`. Four ingredients copied is four places
// for the desktop's sentence and the phone's to drift apart.

import { useRef } from 'react'

import type { Account } from '@/core/types'
import { useSyncStatus } from '@/features/mail/queries'
import { useMailMode } from '@/features/mail/service'
import { syncPreview } from '@/lib/env'
import { useNow } from '@/lib/use-now'
import { describeSync, type SyncSummary } from './sync-summary'

/**
 * Subscribes to the minute tick, so whatever calls this re-renders once a
 * minute — `detail` carries an elapsed time. Call it from the component that
 * draws or speaks the summary, not from one above a screen's worth of tree.
 */
export function useSyncSummary(accounts: Account[]): SyncSummary {
  const statuses = useSyncStatus()
  const { demo } = useMailMode()
  const now = useNow()
  // When this window started waiting, so "Starting…" can escalate rather than
  // stand forever. A ref, not state: it is read during render and never drives
  // one, and it must survive the minute tick that re-renders the caller.
  const startedAt = useRef(now)
  // `demo && !syncPreview`: demo outranks every other state, which is right —
  // "Demo data" is the truest thing to say about a demo window. But the demo
  // service is the only way to reach the failure states in a browser, so
  // `?sync=` has to be allowed past it or the flag could never show anything.
  return describeSync(accounts, statuses, demo && !syncPreview, now, startedAt.current)
}
