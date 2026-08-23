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
})
