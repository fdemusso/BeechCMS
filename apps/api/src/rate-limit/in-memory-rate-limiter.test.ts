// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

// InMemoryRateLimiter is now an alias for TokenBucketRateLimiter.
// These tests verify the alias export is functional and TokenBucket semantics hold.
import { describe, it, expect } from 'vitest'
import { InMemoryRateLimiter } from './in-memory-rate-limiter'

describe('InMemoryRateLimiter (alias → TokenBucketRateLimiter)', () => {
  it('allows requests up to the configured capacity', async () => {
    // capacity=3 means 3 tokens available on first call
    const limiter = new InMemoryRateLimiter({ capacity: 3, refillRatePerSecond: 0 })
    expect((await limiter.checkLimit('key')).isAllowed).toBe(true)
    expect((await limiter.checkLimit('key')).isAllowed).toBe(true)
    expect((await limiter.checkLimit('key')).isAllowed).toBe(true)
  })

  it('blocks the next request when capacity is exhausted', async () => {
    const limiter = new InMemoryRateLimiter({ capacity: 2, refillRatePerSecond: 0 })
    await limiter.checkLimit('key')
    await limiter.checkLimit('key')
    expect((await limiter.checkLimit('key')).isAllowed).toBe(false)
  })

  it('tracks buckets independently for each key', async () => {
    const limiter = new InMemoryRateLimiter({ capacity: 1, refillRatePerSecond: 0 })
    expect((await limiter.checkLimit('ip-a')).isAllowed).toBe(true)
    expect((await limiter.checkLimit('ip-b')).isAllowed).toBe(true)
    expect((await limiter.checkLimit('ip-a')).isAllowed).toBe(false)
    expect((await limiter.checkLimit('ip-b')).isAllowed).toBe(false)
  })

  it('capacity=1 allows exactly one request before blocking', async () => {
    const limiter = new InMemoryRateLimiter({ capacity: 1, refillRatePerSecond: 0 })
    expect((await limiter.checkLimit('k')).isAllowed).toBe(true)
    expect((await limiter.checkLimit('k')).isAllowed).toBe(false)
  })

  it('populates retryAfterSeconds when rate limit is exceeded', async () => {
    const limiter = new InMemoryRateLimiter({ capacity: 1, refillRatePerSecond: 1 })
    await limiter.checkLimit('key')
    const result = await limiter.checkLimit('key')
    expect(result.isAllowed).toBe(false)
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1)
  })

  it('resets all buckets via reset()', async () => {
    const limiter = new InMemoryRateLimiter({ capacity: 1, refillRatePerSecond: 0 })
    await limiter.checkLimit('key')
    expect((await limiter.checkLimit('key')).isAllowed).toBe(false)
    limiter.reset()
    expect((await limiter.checkLimit('key')).isAllowed).toBe(true)
  })
})
