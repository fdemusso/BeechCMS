// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { InMemoryRateLimiter } from './in-memory-rate-limiter'

describe('InMemoryRateLimiter', () => {
  it('allows requests up to the configured maximum hit count', async () => {
    const limiter = new InMemoryRateLimiter(3)
    expect((await limiter.checkLimit('key')).isAllowed).toBe(true)
    expect((await limiter.checkLimit('key')).isAllowed).toBe(true)
    expect((await limiter.checkLimit('key')).isAllowed).toBe(true)
  })

  it('blocks the very next request after maxAllowedHits is reached', async () => {
    const limiter = new InMemoryRateLimiter(2)
    await limiter.checkLimit('key')
    await limiter.checkLimit('key')
    expect((await limiter.checkLimit('key')).isAllowed).toBe(false)
  })

  it('tracks hit counts independently for each key', async () => {
    const limiter = new InMemoryRateLimiter(1)
    expect((await limiter.checkLimit('ip-a')).isAllowed).toBe(true)
    expect((await limiter.checkLimit('ip-b')).isAllowed).toBe(true)
    // Both keys exhausted independently
    expect((await limiter.checkLimit('ip-a')).isAllowed).toBe(false)
    expect((await limiter.checkLimit('ip-b')).isAllowed).toBe(false)
  })

  it('maxAllowedHits = 1 allows exactly one request before blocking', async () => {
    const limiter = new InMemoryRateLimiter(1)
    expect((await limiter.checkLimit('k')).isAllowed).toBe(true)
    expect((await limiter.checkLimit('k')).isAllowed).toBe(false)
  })

  it('populates retryAfterSeconds when rate limit is exceeded', async () => {
    const limiter = new InMemoryRateLimiter(1, 60)
    await limiter.checkLimit('key')
    const result = await limiter.checkLimit('key')
    expect(result.isAllowed).toBe(false)
    expect(result.retryAfterSeconds).toBe(60)
  })

  it('recovers after the window duration has elapsed (recovery test)', async () => {
    vi.useFakeTimers()
    try {
      const limiter = new InMemoryRateLimiter(1, 60)
      
      expect((await limiter.checkLimit('key')).isAllowed).toBe(true)
      expect((await limiter.checkLimit('key')).isAllowed).toBe(false)
      
      vi.advanceTimersByTime(60000)
      
      expect((await limiter.checkLimit('key')).isAllowed).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('evicts expired entries from map', async () => {
    vi.useFakeTimers()
    try {
      const limiter = new InMemoryRateLimiter(1, 60)
      
      await limiter.checkLimit('key-1')
      await limiter.checkLimit('key-2')
      
      expect((limiter as any).hitCounts.size).toBe(2)
      
      vi.advanceTimersByTime(60000)
      
      await limiter.checkLimit('key-3')
      
      expect((limiter as any).hitCounts.size).toBe(1)
      expect((limiter as any).hitCounts.has('key-1')).toBe(false)
      expect((limiter as any).hitCounts.has('key-2')).toBe(false)
      expect((limiter as any).hitCounts.has('key-3')).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})
