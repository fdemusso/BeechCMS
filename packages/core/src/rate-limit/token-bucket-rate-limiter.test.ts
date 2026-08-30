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
})
