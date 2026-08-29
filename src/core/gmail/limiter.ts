// Quota discipline for the Gmail client.
//
// Gmail's 2026-05 model gives 6,000 quota units per minute per user. Wren
// budgets 4,500 (75%) so that a manual refresh, a send, or a body prefetch
// racing the poll loop still lands inside the real ceiling.

export const GMAIL_BUDGET_PER_MINUTE = 4500

export interface Clock {
  now(): number
  sleep(ms: number): Promise<void>
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}

export interface TokenBucketOptions {
  capacity: number
  refillPerMinute: number
  clock?: Clock
}

/**
 * Single-account token bucket. `acquire` serialises callers through a tail
 * promise so two concurrent requests cannot both see the same free tokens.
 */
export class TokenBucket {
  private readonly capacity: number
  private readonly perMs: number
  private readonly clock: Clock
  private tokens: number
  private lastRefill: number
  private tail: Promise<void> = Promise.resolve()

  constructor(opts: TokenBucketOptions) {
    this.capacity = opts.capacity
    this.perMs = opts.refillPerMinute / 60_000
    this.clock = opts.clock ?? systemClock
    this.tokens = opts.capacity
    this.lastRefill = this.clock.now()
  }

  private refill(): void {
    const now = this.clock.now()
    const elapsed = now - this.lastRefill
    if (elapsed <= 0) return
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.perMs)
    this.lastRefill = now
  }

  get available(): number {
    this.refill()
    return this.tokens
  }

  /** Waits until `cost` units are free, then spends them. */
  acquire(cost: number): Promise<void> {
    const wanted = Math.min(Math.max(cost, 0), this.capacity)
    const run = this.tail.then(async () => {
      this.refill()
      if (this.tokens < wanted) {
        const deficit = wanted - this.tokens
        await this.clock.sleep(Math.ceil(deficit / this.perMs))
        this.refill()
      }
      this.tokens = Math.max(0, this.tokens - wanted)
    })
    this.tail = run.catch(() => undefined)
    return run
  }
}

// ---------------------------------------------------------------------------
// Errors and retry
// ---------------------------------------------------------------------------

export class HttpError extends Error {
  readonly status: number
  readonly statusText: string
  readonly body: string
  readonly url: string

  constructor(status: number, statusText: string, body: string, url: string) {
    super(`HTTP ${status} ${statusText} for ${url}`)
    this.name = 'HttpError'
    this.status = status
    this.statusText = statusText
    this.body = body
    this.url = url
  }
}

const RETRYABLE = new Set([429, 500, 502, 503, 504])

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE.has(status)
}

export function isRetryableError(err: unknown): boolean {
  if (err instanceof HttpError) return isRetryableStatus(err.status)
  // Fetch surfaces connection failures as TypeError; those are worth a retry.
  return err instanceof TypeError
}

export interface BackoffOptions {
  /** The delay after the first failure. Doubles from there. */
  baseDelayMs?: number
  maxDelayMs?: number
  random?: () => number
}

export interface RetryOptions extends BackoffOptions {
  maxTries?: number
  clock?: Clock
  shouldRetry?: (err: unknown) => boolean
}

/**
 * How long to wait after failure number `attempt` (1-based).
 *
 * Exponential, capped, with jitter in [0.5x, 1x] of the nominal delay. Full
 * jitter would sometimes retry instantly, which is exactly the wrong move
 * against a rate limiter.
 *
 * The one backoff formula in the client: `retryWithBackoff` uses it for a whole
 * request, and `api.ts` uses it between batch retry rounds. Two spellings of
 * this arithmetic is two things to tune and one of them gets forgotten.
 */
export function backoffDelay(attempt: number, opts: BackoffOptions = {}): number {
  const base = opts.baseDelayMs ?? 500
  const maxDelay = opts.maxDelayMs ?? 32_000
  const random = opts.random ?? Math.random
  const nominal = Math.min(maxDelay, base * 2 ** (attempt - 1))
  return Math.round(nominal * (0.5 + 0.5 * random()))
}

export async function retryWithBackoff<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const maxTries = opts.maxTries ?? 5
  const clock = opts.clock ?? systemClock
  const shouldRetry = opts.shouldRetry ?? isRetryableError

  let lastError: unknown
  for (let attempt = 1; attempt <= maxTries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt === maxTries || !shouldRetry(err)) throw err
      await clock.sleep(backoffDelay(attempt, opts))
    }
  }
  throw lastError
}
