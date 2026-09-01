import type { RateLimiter } from "./types.js";

interface Bucket {
  tokens: number;
  updatedAt: number;
}

export class TokenBucketRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly nowMs: () => number = Date.now,
    private readonly capacity = 10,
    private readonly refillMs = 60_000,
  ) {}

  consume(email: string, ip: string) {
    const now = this.nowMs();
    const emailAllowed = this.consumeKey(`email:${email}`, now);
    const ipAllowed = this.consumeKey(`ip:${ip}`, now);
    return emailAllowed && ipAllowed;
  }

  private consumeKey(key: string, now: number) {
    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, updatedAt: now };
    const elapsed = Math.max(0, now - bucket.updatedAt);
    bucket.tokens = Math.min(this.capacity, bucket.tokens + (elapsed / this.refillMs) * this.capacity);
    bucket.updatedAt = now;
    if (bucket.tokens < 1) {
      this.buckets.set(key, bucket);
      return false;
    }
    bucket.tokens -= 1;
    this.buckets.set(key, bucket);
    return true;
  }
}
