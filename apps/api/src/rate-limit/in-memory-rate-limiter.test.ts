// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from 'vitest'
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
})
