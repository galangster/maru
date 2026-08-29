// The queue's age column.
//
// `elapsedTime` exists because `relativeTime` answered "00:59" for a request
// that had been waiting 59 minutes, which reads as 12:59 AM on the one surface
// whose whole question is how long something has waited (UI-REVIEW-2026-08-29
// S4). The boundaries are what that bug was made of, so they are pinned here.

import { describe, it, expect } from 'vitest'

import { elapsedTime } from '../src/lib/format'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// A fixed clock: the function takes `now` explicitly for exactly this reason.
const NOW = Date.UTC(2026, 7, 29, 12, 0, 0)

describe('elapsedTime', () => {
  it('says "just now" under a minute', () => {
    expect(elapsedTime(NOW, NOW)).toBe('just now')
    expect(elapsedTime(NOW - 59_000, NOW)).toBe('just now')
  })

  it('counts minutes up to the hour', () => {
    expect(elapsedTime(NOW - MINUTE, NOW)).toBe('1m ago')
    // The value that used to render "00:59".
    expect(elapsedTime(NOW - 59 * MINUTE, NOW)).toBe('59m ago')
  })

  it('counts hours up to the day', () => {
    expect(elapsedTime(NOW - HOUR, NOW)).toBe('1h ago')
    expect(elapsedTime(NOW - 23 * HOUR - 59 * MINUTE, NOW)).toBe('23h ago')
  })

  it('counts days past that', () => {
    expect(elapsedTime(NOW - DAY, NOW)).toBe('1d ago')
    expect(elapsedTime(NOW - 3 * DAY, NOW)).toBe('3d ago')
  })

  it('never reads as the future when a clock skews', () => {
    expect(elapsedTime(NOW + 5 * MINUTE, NOW)).toBe('just now')
  })
})
