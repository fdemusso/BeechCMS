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
  maxBuckets?: number
  pruneIntervalSeconds?: number
}

export class TokenBucketRateLimiter implements IRateLimiter {
  private readonly buckets = new Map<string, BucketState>()
  private readonly capacity: number
  private readonly refillRatePerSecond: number
  private readonly clock: IClock
  private readonly maxIdleTimeSeconds: number
  private readonly maxBuckets: number
  private readonly pruneIntervalSeconds: number
  private lastPruneTimestamp = 0

  constructor(options?: TokenBucketOptions) {
    this.capacity = options?.capacity ?? 17
    // Default: 1 token every 3.53 seconds (~0.283286 tokens/sec)
    this.refillRatePerSecond = options?.refillRatePerSecond ?? (1 / 3.53)
    this.clock = options?.clock ?? SystemClock
    this.maxIdleTimeSeconds = options?.maxIdleTimeSeconds ?? 3600 // 1 hour idle TTL
    this.maxBuckets = options?.maxBuckets ?? 5000 // Prevent unbounded memory growth
    this.pruneIntervalSeconds = options?.pruneIntervalSeconds ?? 60 // Throttle O(n) scans
  }

  private pruneExpiredBuckets(now: number): void {
    if (this.buckets.size < 500) return
    if (now - this.lastPruneTimestamp < this.pruneIntervalSeconds) return
    this.lastPruneTimestamp = now

    for (const [key, state] of this.buckets.entries()) {
      if (now - state.lastRefillTimestamp > this.maxIdleTimeSeconds) {
        this.buckets.delete(key)
      } else {
        // Since Map preserves insertion order and checkLimit re-inserts on every access,
        // entries are monotonically ordered by lastRefillTimestamp. The first non-expired
        // entry guarantees all subsequent entries are also active, allowing an immediate O(1) exit.
        break
      }
    }
  }

  async checkLimit(key: string): Promise<RateLimitResult> {
    const now = this.clock.now() / 1000 // fractional seconds for continuous refill
    this.pruneExpiredBuckets(now)

    let bucket = this.buckets.get(key)
    if (!bucket) {
      if (this.buckets.size >= this.maxBuckets) {
        // LRU / FIFO eviction: delete oldest inserted bucket
        const oldestKey = this.buckets.keys().next().value
        if (oldestKey !== undefined) {
          this.buckets.delete(oldestKey)
        }
      }
      bucket = {
        tokens: this.capacity,
        lastRefillTimestamp: now,
      }
    } else {
      const elapsed = Math.max(0, now - bucket.lastRefillTimestamp)
      bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsed * this.refillRatePerSecond)
      bucket.lastRefillTimestamp = now
      // Re-insert to maintain LRU access order
      this.buckets.delete(key)
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
    this.lastPruneTimestamp = 0
  }
}
