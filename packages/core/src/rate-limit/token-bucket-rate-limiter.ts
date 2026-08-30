// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { IRateLimiter, RateLimitResult } from './rate-limiter.js'
import type { IClock } from '../common/clock.js'
import { SystemClock } from '../common/clock.js'

interface BucketState {
  tokens: number
  lastRefillTimestamp: number
}

export interface TokenBucketOptions {
  capacity?: number
  refillRatePerSecond?: number
  clock?: IClock
  maxIdleTimeSeconds?: number
}

export class TokenBucketRateLimiter implements IRateLimiter {
  private readonly buckets = new Map<string, BucketState>()
  private readonly capacity: number
  private readonly refillRatePerSecond: number
  private readonly clock: IClock
  private readonly maxIdleTimeSeconds: number

  constructor(options?: TokenBucketOptions) {
    this.capacity = options?.capacity ?? 17
    // Default: 1 token every 3.53 seconds (~0.283286 tokens/sec)
    this.refillRatePerSecond = options?.refillRatePerSecond ?? (1 / 3.53)
    this.clock = options?.clock ?? SystemClock
    this.maxIdleTimeSeconds = options?.maxIdleTimeSeconds ?? 3600 // 1 hour idle TTL
  }

  private pruneExpiredBuckets(now: number): void {
    if (this.buckets.size < 500) return
    for (const [key, state] of this.buckets.entries()) {
      if (now - state.lastRefillTimestamp > this.maxIdleTimeSeconds) {
        this.buckets.delete(key)
      }
    }
  }

  async checkLimit(key: string): Promise<RateLimitResult> {
    const now = this.clock.now() / 1000 // fractional seconds for continuous refill
    this.pruneExpiredBuckets(now)

    let bucket = this.buckets.get(key)
    if (!bucket) {
      bucket = {
        tokens: this.capacity,
        lastRefillTimestamp: now,
      }
    } else {
      const elapsed = Math.max(0, now - bucket.lastRefillTimestamp)
      bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsed * this.refillRatePerSecond)
      bucket.lastRefillTimestamp = now
    }

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1
      this.buckets.set(key, bucket)
      return {
        isAllowed: true,
        limit: this.capacity,
        remaining: Math.floor(bucket.tokens),
      }
    }

    this.buckets.set(key, bucket)
    const tokensNeeded = 1 - bucket.tokens
    const retryAfterSeconds = Math.max(1, Math.ceil(tokensNeeded / this.refillRatePerSecond))

    return {
      isAllowed: false,
      retryAfterSeconds,
      limit: this.capacity,
      remaining: Math.max(0, Math.floor(bucket.tokens)),
    }
  }

  reset(): void {
    this.buckets.clear()
  }
}
