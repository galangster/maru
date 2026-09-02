import type { RateLimiter } from "./types.js";
import { RATE_LIMIT_CAPACITY, RATE_LIMIT_REFILL_MS } from "./constants.js";

interface Bucket {
  tokens: number;
  updatedAt: number;
}

// One refilling bucket per key. Callers choose what a key means.
export class KeyedRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly nowMs: () => number = Date.now,
    private readonly capacity = RATE_LIMIT_CAPACITY,
    private readonly refillMs = RATE_LIMIT_REFILL_MS,
  ) {}

  consume(key: string) {
    const now = this.nowMs();
    let bucket = this.buckets.get(key);
    if (!bucket) {
      this.sweep(now);
      bucket = { tokens: this.capacity, updatedAt: now };
    }
    const elapsed = Math.max(0, now - bucket.updatedAt);
    bucket.tokens = Math.min(this.capacity, bucket.tokens + (elapsed / this.refillMs) * this.capacity);
    bucket.updatedAt = now;
    this.buckets.set(key, bucket);
    if (bucket.tokens < 1) {
      return false;
    }
    bucket.tokens -= 1;
    return true;
  }

  private sweep(now: number) {
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.updatedAt > this.refillMs) this.buckets.delete(key);
    }
  }
}

export class TokenBucketRateLimiter implements RateLimiter {
  private readonly keyed: KeyedRateLimiter;

  constructor(
    nowMs: () => number = Date.now,
    capacity = RATE_LIMIT_CAPACITY,
    refillMs = RATE_LIMIT_REFILL_MS,
  ) {
    this.keyed = new KeyedRateLimiter(nowMs, capacity, refillMs);
  }

  consume(email: string, ip: string) {
    // Both buckets always pay, so one exhausted key cannot shield the other.
    const emailAllowed = this.keyed.consume(`email:${email}`);
    const ipAllowed = this.keyed.consume(`ip:${ip}`);
    return emailAllowed && ipAllowed;
  }
}
