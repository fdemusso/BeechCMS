// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from 'vitest'
import { NoOpRateLimiter } from './no-op-rate-limiter'

describe('NoOpRateLimiter', () => {
  it('always returns isAllowed: true regardless of the key', async () => {
    const limiter = new NoOpRateLimiter()
    for (let i = 0; i < 100; i++) {
      expect((await limiter.checkLimit('any-key')).isAllowed).toBe(true)
    }
  })

  it('allows all keys without accumulating state', async () => {
    const limiter = new NoOpRateLimiter()
    expect((await limiter.checkLimit('ip-a')).isAllowed).toBe(true)
    expect((await limiter.checkLimit('ip-b')).isAllowed).toBe(true)
    expect((await limiter.checkLimit('ip-a')).isAllowed).toBe(true)
  })
})
