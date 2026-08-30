// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from 'vitest'
import { checkDualKeyRateLimit, normalizeAccountKey } from './dual-key-rate-limiter'
import type { IRateLimiter, RateLimitResult } from '@beechcms/core'

function makeAllowedLimiter(): IRateLimiter {
  return {
    checkLimit: async (): Promise<RateLimitResult> => ({ isAllowed: true }),
  }
}

function makeBlockedLimiter(retryAfterSeconds: number = 10): IRateLimiter {
  return {
    checkLimit: async (): Promise<RateLimitResult> => ({ isAllowed: false, retryAfterSeconds }),
  }
}

describe('normalizeAccountKey', () => {
  it('trims whitespace and lowercases', () => {
    expect(normalizeAccountKey('  USER@EXAMPLE.COM  ')).toBe('user@example.com')
  })

  it('handles already-normalized keys', () => {
    expect(normalizeAccountKey('user@example.com')).toBe('user@example.com')
  })

  it('handles empty string', () => {
    expect(normalizeAccountKey('')).toBe('')
  })
})

describe('checkDualKeyRateLimit', () => {
  it('allows when both IP and account buckets have capacity', async () => {
    const result = await checkDualKeyRateLimit({
      ipLimiter: makeAllowedLimiter(),
      accountLimiter: makeAllowedLimiter(),
      clientIp: '1.2.3.4',
      accountKey: 'user@example.com',
    })
    expect(result.isAllowed).toBe(true)
    expect(result.blockedBy).toBeUndefined()
    expect(result.retryAfterSeconds).toBeUndefined()
  })

  it('rejects with blockedBy=ip when only IP bucket is exhausted', async () => {
    const result = await checkDualKeyRateLimit({
      ipLimiter: makeBlockedLimiter(5),
      accountLimiter: makeAllowedLimiter(),
      clientIp: '1.2.3.4',
      accountKey: 'user@example.com',
    })
    expect(result.isAllowed).toBe(false)
    expect(result.blockedBy).toBe('ip')
    expect(result.retryAfterSeconds).toBe(5)
  })

  it('rejects with blockedBy=account when only account bucket is exhausted', async () => {
    const result = await checkDualKeyRateLimit({
      ipLimiter: makeAllowedLimiter(),
      accountLimiter: makeBlockedLimiter(8),
      clientIp: '1.2.3.4',
      accountKey: 'user@example.com',
    })
    expect(result.isAllowed).toBe(false)
    expect(result.blockedBy).toBe('account')
    expect(result.retryAfterSeconds).toBe(8)
  })

  it('rejects with blockedBy=both when both buckets are exhausted', async () => {
    const result = await checkDualKeyRateLimit({
      ipLimiter: makeBlockedLimiter(3),
      accountLimiter: makeBlockedLimiter(7),
      clientIp: '1.2.3.4',
      accountKey: 'user@example.com',
    })
    expect(result.isAllowed).toBe(false)
    expect(result.blockedBy).toBe('both')
    expect(result.retryAfterSeconds).toBe(7) // max of 3, 7
  })

  it('retryAfterSeconds is at least 1 even when limiter returns 0', async () => {
    const result = await checkDualKeyRateLimit({
      ipLimiter: { checkLimit: async () => ({ isAllowed: false, retryAfterSeconds: 0 }) },
      accountLimiter: makeAllowedLimiter(),
      clientIp: '1.2.3.4',
      accountKey: 'user@example.com',
    })
    expect(result.isAllowed).toBe(false)
    expect(result.retryAfterSeconds).toBe(1)
  })

  it('normalizes the account key before checking the account limiter', async () => {
    const calledWith: string[] = []
    const accountLimiter: IRateLimiter = {
      checkLimit: async (key) => {
        calledWith.push(key)
        return { isAllowed: true }
      },
    }
    await checkDualKeyRateLimit({
      ipLimiter: makeAllowedLimiter(),
      accountLimiter,
      clientIp: '1.2.3.4',
      accountKey: '  ADMIN@EXAMPLE.COM  ',
    })
    expect(calledWith).toEqual(['admin@example.com'])
  })
})
