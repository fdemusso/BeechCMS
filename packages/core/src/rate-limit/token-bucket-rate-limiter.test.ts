// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { TokenBucketRateLimiter } from './token-bucket-rate-limiter.js'
import type { IClock } from '../common/clock.js'

class MutableClock implements IClock {
  private currentMs: number

  constructor(initialMs: number = 1000000) {
    this.currentMs = initialMs
  }

  now(): number {
    return this.currentMs
  }

  nowSeconds(): number {
    return Math.floor(this.currentMs / 1000)
  }

  advanceSeconds(seconds: number): void {
    this.currentMs += seconds * 1000
  }

  advanceMs(ms: number): void {
    this.currentMs += ms
  }
}

describe('TokenBucketRateLimiter', () => {
  it('allows up to capacity requests initially', async () => {
    const clock = new MutableClock(1000000)
    const limiter = new TokenBucketRateLimiter({ capacity: 17, refillRatePerSecond: 1 / 3.53, clock })

    for (let i = 0; i < 17; i++) {
      const result = await limiter.checkLimit('ip:1.2.3.4')
      expect(result.isAllowed).toBe(true)
    }

    const blockedResult = await limiter.checkLimit('ip:1.2.3.4')
    expect(blockedResult.isAllowed).toBe(false)
    expect(blockedResult.retryAfterSeconds).toBe(4) // Math.ceil(1 / (1 / 3.53)) = Math.ceil(3.53) = 4
  })

  it('refills tokens continuously over time', async () => {
    const clock = new MutableClock(1000000)
    const limiter = new TokenBucketRateLimiter({ capacity: 5, refillRatePerSecond: 1, clock })

    for (let i = 0; i < 5; i++) {
      expect((await limiter.checkLimit('test-key')).isAllowed).toBe(true)
    }
    expect((await limiter.checkLimit('test-key')).isAllowed).toBe(false)

    // Advance clock by 2 seconds -> should refill 2 tokens
    clock.advanceSeconds(2)

    expect((await limiter.checkLimit('test-key')).isAllowed).toBe(true)
    expect((await limiter.checkLimit('test-key')).isAllowed).toBe(true)
    expect((await limiter.checkLimit('test-key')).isAllowed).toBe(false)
  })

  it('does not exceed maximum capacity on refill', async () => {
    const clock = new MutableClock(1000000)
    const limiter = new TokenBucketRateLimiter({ capacity: 3, refillRatePerSecond: 1, clock })

    // Idle for 100 seconds
    clock.advanceSeconds(100)

    for (let i = 0; i < 3; i++) {
      expect((await limiter.checkLimit('test-key')).isAllowed).toBe(true)
    }
    expect((await limiter.checkLimit('test-key')).isAllowed).toBe(false)
  })

  it('maintains independent buckets for different keys', async () => {
    const clock = new MutableClock(1000000)
    const limiter = new TokenBucketRateLimiter({ capacity: 2, refillRatePerSecond: 0.1, clock })

    expect((await limiter.checkLimit('user:1')).isAllowed).toBe(true)
    expect((await limiter.checkLimit('user:1')).isAllowed).toBe(true)
    expect((await limiter.checkLimit('user:1')).isAllowed).toBe(false)

    expect((await limiter.checkLimit('user:2')).isAllowed).toBe(true)
    expect((await limiter.checkLimit('user:2')).isAllowed).toBe(true)
    expect((await limiter.checkLimit('user:2')).isAllowed).toBe(false)
  })

  it('resets all buckets when reset is called', async () => {
    const clock = new MutableClock(1000000)
    const limiter = new TokenBucketRateLimiter({ capacity: 1, refillRatePerSecond: 0.1, clock })

    expect((await limiter.checkLimit('key')).isAllowed).toBe(true)
    expect((await limiter.checkLimit('key')).isAllowed).toBe(false)

    limiter.reset()

    expect((await limiter.checkLimit('key')).isAllowed).toBe(true)
  })

  it('exposes limit and remaining on allowed responses', async () => {
    const clock = new MutableClock(1000000)
    const limiter = new TokenBucketRateLimiter({ capacity: 5, refillRatePerSecond: 1, clock })

    const first = await limiter.checkLimit('key')
    expect(first.isAllowed).toBe(true)
    expect(first.limit).toBe(5)
    expect(first.remaining).toBe(4)

    const second = await limiter.checkLimit('key')
    expect(second.isAllowed).toBe(true)
    expect(second.limit).toBe(5)
    expect(second.remaining).toBe(3)
  })

  it('exposes limit and remaining=0 on rejected responses', async () => {
    const clock = new MutableClock(1000000)
    const limiter = new TokenBucketRateLimiter({ capacity: 1, refillRatePerSecond: 0.1, clock })

    await limiter.checkLimit('key') // allowed, drains the bucket
    const rejected = await limiter.checkLimit('key')
    expect(rejected.isAllowed).toBe(false)
    expect(rejected.limit).toBe(1)
    expect(rejected.remaining).toBe(0)
    expect(rejected.retryAfterSeconds).toBeGreaterThanOrEqual(1)
  })

  it('retryAfterSeconds uses Math.ceil', async () => {
    const clock = new MutableClock(1000000)
    // 1 token / 3.53 seconds — fractional wait, must ceil
    const limiter = new TokenBucketRateLimiter({ capacity: 1, refillRatePerSecond: 1 / 3.53, clock })

    await limiter.checkLimit('key')
    const result = await limiter.checkLimit('key')
    expect(result.isAllowed).toBe(false)
    // tokensNeeded = 1, rate = 1/3.53 => wait = 3.53 => ceil => 4
    expect(result.retryAfterSeconds).toBe(4)
  })

  it('prunes expired buckets when bucket count exceeds 500', async () => {
    const clock = new MutableClock(1000000)
    // maxIdleTimeSeconds = 1 second so buckets expire quickly
    const limiter = new TokenBucketRateLimiter({ capacity: 5, refillRatePerSecond: 1, clock, maxIdleTimeSeconds: 1 })

    // Fill 501 buckets (trigger prune threshold)
    for (let i = 0; i < 501; i++) {
      await limiter.checkLimit(`key-${i}`)
    }

    // Advance clock past idle TTL so all old buckets are expired
    clock.advanceSeconds(2)

    // Next call on a new key triggers pruneExpiredBuckets
    await limiter.checkLimit('trigger-prune')

    // Check that an old key now starts fresh (full capacity)
    const result = await limiter.checkLimit('key-0')
    expect(result.isAllowed).toBe(true)
    // key-0 was pruned so it was re-created with full capacity and then consumed once
    expect(result.remaining).toBe(4)
  })

  it('evicts the oldest bucket once it has idled back up to full capacity', async () => {
    const clock = new MutableClock(1000000)
    const limiter = new TokenBucketRateLimiter({ capacity: 5, refillRatePerSecond: 1, clock, maxBuckets: 3 })
    await limiter.checkLimit('key-1')
    await limiter.checkLimit('key-2')
    await limiter.checkLimit('key-3')
    // Let every bucket refill back to full capacity (5s at rate 1/s) before overflowing.
    clock.advanceSeconds(5)

    await limiter.checkLimit('key-4')
    const result = await limiter.checkLimit('key-1')

    // key-1 was the oldest and had refilled to capacity, so it was eligible for eviction;
    // checking it now creates a fresh bucket with capacity 5 minus 1.
    expect(result.remaining).toBe(4)
  })

  it('does not evict any bucket, and instead grows past maxBuckets, when no bucket has refilled to capacity', async () => {
    const clock = new MutableClock(1000000)
    const limiter = new TokenBucketRateLimiter({ capacity: 5, refillRatePerSecond: 0, clock, maxBuckets: 3 })
    await limiter.checkLimit('key-1')
    await limiter.checkLimit('key-2')
    await limiter.checkLimit('key-3')

    // No refill (rate 0), so none of the existing buckets are eligible for eviction.
    await limiter.checkLimit('key-4')
    const result = await limiter.checkLimit('key-1')

    // key-1 survived the overflow: its consumed token is still gone, not reset to capacity - 1.
    expect(result.remaining).toBe(3)
  })

  it('regression #458: an exhausted bucket stays blocked after maxBuckets is overflowed by unique keys', async () => {
    const clock = new MutableClock(1000000)
    const limiter = new TokenBucketRateLimiter({ capacity: 1, refillRatePerSecond: 0, clock, maxBuckets: 5 })

    // Exhaust the victim's bucket.
    await limiter.checkLimit('victim')
    const victimBeforeFlood = await limiter.checkLimit('victim')
    expect(victimBeforeFlood.isAllowed).toBe(false)

    // Flood with far more unique keys than maxBuckets. With rate 0, no bucket ever refills,
    // so eviction never finds an eligible candidate and none of these calls can reset 'victim'.
    for (let i = 0; i < 50; i++) {
      await limiter.checkLimit(`flood-${i}`)
    }

    const victimAfterFlood = await limiter.checkLimit('victim')

    expect(victimAfterFlood.isAllowed).toBe(false)
  })

  it('skips pruning idle buckets when called within pruneIntervalSeconds', async () => {
    const clock = new MutableClock(1000000)
    const limiter = new TokenBucketRateLimiter({
      capacity: 5,
      refillRatePerSecond: 0,
      clock,
      maxIdleTimeSeconds: 1,
      pruneIntervalSeconds: 60,
    })
    for (let i = 0; i < 501; i++) {
      await limiter.checkLimit(`key-${i}`)
    }
    // Deplete key-0 completely
    for (let i = 0; i < 4; i++) {
      await limiter.checkLimit('key-0')
    }
    clock.advanceSeconds(5)
    await limiter.checkLimit('trigger-key')

    const result = await limiter.checkLimit('key-0')

    // Prune was throttled (< 60s), so key-0 was not reset and remains exhausted
    expect(result.isAllowed).toBe(false)
  })

  it('prunes idle buckets once pruneIntervalSeconds has elapsed', async () => {
    const clock = new MutableClock(1000000)
    const limiter = new TokenBucketRateLimiter({
      capacity: 5,
      refillRatePerSecond: 0,
      clock,
      maxIdleTimeSeconds: 1,
      pruneIntervalSeconds: 60,
    })
    for (let i = 0; i < 501; i++) {
      await limiter.checkLimit(`key-${i}`)
    }
    // Deplete key-0 completely
    for (let i = 0; i < 4; i++) {
      await limiter.checkLimit('key-0')
    }
    clock.advanceSeconds(65)
    await limiter.checkLimit('trigger-key')

    const result = await limiter.checkLimit('key-0')

    // Prune ran after 65s (> 60s), so key-0 was evicted and recreated fresh
    expect(result.isAllowed).toBe(true)
    expect(result.remaining).toBe(4)
  })

  it('stops pruning early as soon as the first active bucket is encountered', async () => {
    const clock = new MutableClock(1000000)
    const limiter = new TokenBucketRateLimiter({
      capacity: 5,
      refillRatePerSecond: 0,
      clock,
      maxIdleTimeSeconds: 10,
      pruneIntervalSeconds: 0,
    })
    for (let i = 0; i < 500; i++) {
      await limiter.checkLimit(`filler-${i}`)
    }
    // key-old added at t=1000000
    await limiter.checkLimit('key-old')
    // Advance 8s (t=1000008), key-recent added
    clock.advanceSeconds(8)
    await limiter.checkLimit('key-recent')
    // Advance 4s (t=1000012). key-old is idle for 12s (> 10s TTL), key-recent is idle for 4s (< 10s TTL)
    clock.advanceSeconds(4)
    await limiter.checkLimit('trigger-prune')

    const result = await limiter.checkLimit('key-recent')

    // key-recent was not pruned because loop stopped early upon encountering it; consumes 2nd token
    expect(result.remaining).toBe(3)
  })
})
