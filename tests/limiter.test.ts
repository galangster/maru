import { describe, it, expect } from 'vitest'
import {
  TokenBucket,
  retryWithBackoff,
  HttpError,
  isRetryableStatus,
  GMAIL_BUDGET_PER_MINUTE,
  type Clock,
} from '../src/core/gmail/limiter'

class FakeClock implements Clock {
  t = 0
  now(): number {
    return this.t
  }
  async sleep(ms: number): Promise<void> {
    this.t += Math.max(0, ms)
    await Promise.resolve()
  }
}

describe('TokenBucket', () => {
  it('budgets 4,500 units a minute, below the 6,000 hard quota', () => {
    expect(GMAIL_BUDGET_PER_MINUTE).toBe(4500)
  })

  it('serves a burst up to capacity without waiting', async () => {
    const clock = new FakeClock()
    const bucket = new TokenBucket({ capacity: 4500, refillPerMinute: 4500, clock })
    for (let i = 0; i < 45; i++) await bucket.acquire(100)
    expect(clock.now()).toBe(0)
    expect(bucket.available).toBe(0)
  })

  it('waits exactly long enough for the tokens it needs', async () => {
    const clock = new FakeClock()
    const bucket = new TokenBucket({ capacity: 4500, refillPerMinute: 4500, clock })
    await bucket.acquire(4500)
    await bucket.acquire(150) // 75 units/sec -> 2000 ms
    expect(clock.now()).toBe(2000)
  })

  it('holds the steady-state rate once the initial burst is spent', async () => {
    const clock = new FakeClock()
    const bucket = new TokenBucket({ capacity: 4500, refillPerMinute: 4500, clock })
    await bucket.acquire(4500)
    const start = clock.now()
    for (let i = 0; i < 45; i++) await bucket.acquire(100)
    expect(clock.now() - start).toBeGreaterThanOrEqual(60_000)
    expect(clock.now() - start).toBeLessThan(61_000)
  })

  it('never refills past capacity however long it idles', async () => {
    const clock = new FakeClock()
    const bucket = new TokenBucket({ capacity: 4500, refillPerMinute: 4500, clock })
    await bucket.acquire(4500)
    clock.t += 10 * 60_000
    expect(bucket.available).toBe(4500)
  })

  it('clamps a request larger than capacity instead of deadlocking', async () => {
    const clock = new FakeClock()
    const bucket = new TokenBucket({ capacity: 100, refillPerMinute: 6000, clock })
    await bucket.acquire(5000)
    expect(clock.now()).toBe(0)
    expect(bucket.available).toBe(0)
  })
})

describe('isRetryableStatus', () => {
  it('retries throttling and transient server errors only', () => {
    expect([429, 500, 502, 503].map(isRetryableStatus)).toEqual([true, true, true, true])
    expect([200, 400, 401, 403, 404].map(isRetryableStatus)).toEqual([false, false, false, false, false])
  })
})

describe('retryWithBackoff', () => {
  const opts = (clock: Clock) => ({ clock, baseDelayMs: 500, random: () => 1, maxTries: 5 })

  it('returns the first success without sleeping', async () => {
    const clock = new FakeClock()
    const result = await retryWithBackoff(async () => 'ok', opts(clock))
    expect(result).toBe('ok')
    expect(clock.now()).toBe(0)
  })

  it('retries a 503 and returns the eventual success', async () => {
    const clock = new FakeClock()
    let calls = 0
    const result = await retryWithBackoff(async () => {
      calls++
      if (calls < 3) throw new HttpError(503, 'Service Unavailable', '', 'https://x')
      return 'recovered'
    }, opts(clock))
    expect(result).toBe('recovered')
    expect(calls).toBe(3)
    expect(clock.now()).toBe(1500) // 500 + 1000
  })

  it('backs off exponentially and gives up after five tries', async () => {
    const clock = new FakeClock()
    let calls = 0
    await expect(
      retryWithBackoff(async () => {
        calls++
        throw new HttpError(429, 'Too Many Requests', 'rateLimitExceeded', 'https://x')
      }, opts(clock)),
    ).rejects.toBeInstanceOf(HttpError)
    expect(calls).toBe(5)
    expect(clock.now()).toBe(500 + 1000 + 2000 + 4000)
  })

  it('applies jitter within [0.5x, 1x] of the nominal delay', async () => {
    const clock = new FakeClock()
    let calls = 0
    await retryWithBackoff(
      async () => {
        calls++
        if (calls < 2) throw new HttpError(500, 'Server Error', '', 'https://x')
        return 1
      },
      { clock, baseDelayMs: 500, random: () => 0, maxTries: 5 },
    )
    expect(clock.now()).toBe(250)
  })

  it('does not retry a non-retryable status', async () => {
    const clock = new FakeClock()
    let calls = 0
    await expect(
      retryWithBackoff(async () => {
        calls++
        throw new HttpError(404, 'Not Found', '', 'https://x')
      }, opts(clock)),
    ).rejects.toMatchObject({ status: 404 })
    expect(calls).toBe(1)
    expect(clock.now()).toBe(0)
  })
})
