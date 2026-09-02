// The queue's age column.
//
// `elapsedTime` exists because `relativeTime` answered "00:59" for a request
// that had been waiting 59 minutes, which reads as 12:59 AM on the one surface
// whose whole question is how long something has waited (UI-REVIEW-2026-08-29
// S4). The boundaries are what that bug was made of, so they are pinned here.

import { describe, it, expect } from 'vitest'

import { elapsedTime, relativeTime, wakeGroup, wakeStamp } from '../src/lib/format'

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

// The Later list's meta column.
//
// It exists because `relativeTime` cannot answer this question: it buckets the
// PAST, so every future timestamp satisfies its first branch and comes back as
// a clock time whatever day it lands on. The Later list groups by the day the
// mail is due back and its rows were printing the day it arrived, which put a
// "Today" header over a "Yesterday" row (issue #38). These are the boundaries
// that bug is made of.
describe('wakeStamp', () => {
  // Local midnights, because the buckets are counted between them.
  const local = (y: number, m: number, d: number, h = 9) => new Date(y, m, d, h).getTime()
  const NOON = local(2026, 7, 29, 12)

  it('proves relativeTime cannot be used for a future date', () => {
    // The whole reason the function exists: a week out still reads as a clock.
    expect(relativeTime(local(2026, 8, 5), NOON)).toMatch(/^\d/)
  })

  it('gives the time for today and tomorrow, where the header has the day', () => {
    expect(wakeStamp(local(2026, 7, 29, 18), NOON)).toMatch(/18|6:00/)
    expect(wakeGroup(local(2026, 7, 30, 9), NOON)).toBe('Tomorrow')
    expect(wakeStamp(local(2026, 7, 30, 9), NOON)).toMatch(/9:00/)
  })

  it('gives the weekday inside the week, where the header does not', () => {
    const inWeek = local(2026, 8, 2, 9)
    expect(wakeGroup(inWeek, NOON)).toBe('This week')
    expect(wakeStamp(inWeek, NOON)).not.toMatch(/:/)
    expect(wakeStamp(inWeek, NOON)).toHaveLength(3)
  })

  it('gives a date past the week, and carries the year when it crosses one', () => {
    expect(wakeStamp(local(2026, 8, 20, 9), NOON)).toMatch(/Sep/)
    // MAX_DEFER_DAYS is 30, so a deferral made in late December crosses.
    const newYear = local(2027, 0, 5, 9)
    expect(wakeStamp(newYear, local(2026, 11, 20, 12))).toMatch(/2027/)
  })
})
