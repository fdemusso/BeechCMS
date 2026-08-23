// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { IRateLimiter, RateLimitResult } from './rate-limiter.js'
import type { IClock } from '../common/clock.js'
import { SystemClock } from '../common/clock.js'

interface BucketState {
  tokens: number
  lastRefillTimestamp: number
}

export class TokenBucketRateLimiter implements IRateLimiter {
  private readonly buckets = new Map<string, BucketState>()
  private readonly capacity: number
  private readonly refillRatePerSecond: number
  private readonly clock: IClock

  constructor(options?: {
    capacity?: number
    refillRatePerSecond?: number
    clock?: IClock
  }) {
    this.capacity = options?.capacity ?? 17
    // Default: 1 token every 3.53 seconds (~0.283286 tokens/sec)
    this.refillRatePerSecond = options?.refillRatePerSecond ?? (1 / 3.53)
    this.clock = options?.clock ?? SystemClock
  }

  async checkLimit(key: string): Promise<RateLimitResult> {
    const now = this.clock.now() / 1000 // fractional seconds for smooth refill

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
      return { isAllowed: true }
    }

    this.buckets.set(key, bucket)
    const tokensNeeded = 1 - bucket.tokens
    const retryAfterSeconds = Math.max(1, Math.ceil(tokensNeeded / this.refillRatePerSecond))

    return {
      isAllowed: false,
      retryAfterSeconds,
    }
  }

  /** Clears cached state (primarily for test cleanup) */
  reset(): void {
    this.buckets.clear()
  }
}
