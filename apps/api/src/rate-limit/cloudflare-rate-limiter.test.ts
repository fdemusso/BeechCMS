// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { describe, it, expect, vi } from 'vitest'
import { CloudflareRateLimiter } from './cloudflare-rate-limiter'

function createMockBinding(outcome: RateLimitOutcome): RateLimit {
  return { limit: vi.fn().mockResolvedValue(outcome) }
}

function createFailingBinding(error: Error): RateLimit {
  return { limit: vi.fn().mockRejectedValue(error) }
}

describe('CloudflareRateLimiter', () => {
  it('returns isAllowed: true when the Cloudflare binding grants the request', async () => {
    const mockBinding = createMockBinding({ success: true })
    const limiter = new CloudflareRateLimiter(mockBinding)
    const result = await limiter.checkLimit('192.168.1.1:login')
    expect(result.isAllowed).toBe(true)
  })

  it('returns isAllowed: false when the Cloudflare binding blocks the request', async () => {
    const mockBinding = createMockBinding({ success: false })
    const limiter = new CloudflareRateLimiter(mockBinding)
    const result = await limiter.checkLimit('192.168.1.1:login')
    expect(result.isAllowed).toBe(false)
  })

  it('forwards the exact key to the binding so per-key accounting is correct', async () => {
    const mockBinding = createMockBinding({ success: true })
    const limiter = new CloudflareRateLimiter(mockBinding)
    const key = '10.0.0.1:some-seed:publicApiRead'
    await limiter.checkLimit(key)
    expect(mockBinding.limit).toHaveBeenCalledWith({ key })
  })

  it('fails open (returns isAllowed: true) and warns when the Cloudflare binding rejects by default', async () => {
    const mockBinding = createFailingBinding(new Error('Cloudflare connection error'))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const limiter = new CloudflareRateLimiter(mockBinding)
    const result = await limiter.checkLimit('192.168.1.1:login')
    expect(result.isAllowed).toBe(true)
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('fails closed (returns isAllowed: false) and warns when the Cloudflare binding rejects with failClosed enabled', async () => {
    const mockBinding = createFailingBinding(new Error('Cloudflare connection error'))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const limiter = new CloudflareRateLimiter(mockBinding, { failClosed: true })
    const result = await limiter.checkLimit('192.168.1.1:login')
    expect(result.isAllowed).toBe(false)
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('returns retryAfterSeconds derived from configured periodSeconds when Cloudflare blocks', async () => {
    const mockBinding = createMockBinding({ success: false })
    const limiter = new CloudflareRateLimiter(mockBinding, { periodSeconds: 30 })
    const result = await limiter.checkLimit('192.168.1.1:login')
    expect(result.isAllowed).toBe(false)
    expect(result.retryAfterSeconds).toBe(30)
  })

  it('defaults retryAfterSeconds to 60 when Cloudflare blocks and no periodSeconds is configured', async () => {
    const mockBinding = createMockBinding({ success: false })
    const limiter = new CloudflareRateLimiter(mockBinding)
    const result = await limiter.checkLimit('192.168.1.1:login')
    expect(result.isAllowed).toBe(false)
    expect(result.retryAfterSeconds).toBe(60)
  })

  it('does not log raw key or email PII in warnings when the binding rejects', async () => {
    const mockBinding = createFailingBinding(new Error('Cloudflare connection error'))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const sensitiveKey = 'sensitive-user@corporate-target.org'
    const limiter = new CloudflareRateLimiter(mockBinding, { limiterName: 'login' })
    await limiter.checkLimit(sensitiveKey)

    expect(warnSpy).toHaveBeenCalled()
    const warningMessage = warnSpy.mock.calls.map((c) => c.join(' ')).join(' ')
    expect(warningMessage).not.toContain(sensitiveKey)
    expect(warningMessage).toContain('login')
    warnSpy.mockRestore()
  })
})
