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

  // Bound the eviction scan so a flood of unique keys (each forcing an eviction attempt)
  // cannot turn checkLimit into an O(maxBuckets) operation per request. Only the oldest
  // slice of the map is examined; if nothing there qualifies, the map is allowed to grow
  // past maxBuckets rather than evict something it shouldn't (see below).
  private static readonly MAX_EVICTION_SCAN = 32

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

  // Evicts the oldest bucket ONLY if it has refilled to full capacity, in which case it is
  // behaviourally equivalent to an absent bucket and dropping it loses no state. A bucket
  // that hasn't refilled — including one sitting at 0 tokens and actively blocking its key —
  // is never evicted: doing so would let an attacker flood distinct keys to silently reset a
  // victim's exhausted bucket and bypass its limit (#458).
  private evictRefilledBucket(now: number): void {
    let scanned = 0
    for (const [key, state] of this.buckets.entries()) {
      if (scanned >= TokenBucketRateLimiter.MAX_EVICTION_SCAN) return
      scanned++

      const elapsed = Math.max(0, now - state.lastRefillTimestamp)
      const refilled = Math.min(this.capacity, state.tokens + elapsed * this.refillRatePerSecond)
      if (refilled >= this.capacity) {
        this.buckets.delete(key)
        return
      }
    }
  }

  async checkLimit(key: string): Promise<RateLimitResult> {
    const now = this.clock.now() / 1000 // fractional seconds for continuous refill
    this.pruneExpiredBuckets(now)

    let bucket = this.buckets.get(key)
    if (!bucket) {
      if (this.buckets.size >= this.maxBuckets) {
        this.evictRefilledBucket(now)
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
