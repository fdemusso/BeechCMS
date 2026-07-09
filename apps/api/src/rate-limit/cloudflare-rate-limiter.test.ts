// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { CloudflareRateLimiter } from './cloudflare-rate-limiter'

describe('CloudflareRateLimiter', () => {
  it('returns isAllowed: true when the Cloudflare binding grants the request', async () => {
    const mockBinding = { limit: vi.fn().mockResolvedValue({ success: true }) }
    const limiter = new CloudflareRateLimiter(mockBinding as any)
    const result = await limiter.checkLimit('192.168.1.1:login')
    expect(result.isAllowed).toBe(true)
  })

  it('returns isAllowed: false when the Cloudflare binding blocks the request', async () => {
    const mockBinding = { limit: vi.fn().mockResolvedValue({ success: false }) }
    const limiter = new CloudflareRateLimiter(mockBinding as any)
    const result = await limiter.checkLimit('192.168.1.1:login')
    expect(result.isAllowed).toBe(false)
  })

  it('forwards the exact key to the binding so per-key accounting is correct', async () => {
    const mockBinding = { limit: vi.fn().mockResolvedValue({ success: true }) }
    const limiter = new CloudflareRateLimiter(mockBinding as any)
    const key = '10.0.0.1:some-seed:publicApiRead'
    await limiter.checkLimit(key)
    expect(mockBinding.limit).toHaveBeenCalledWith({ key })
  })

  it('fails open (returns isAllowed: true) and warns when the Cloudflare binding rejects by default', async () => {
    const mockBinding = { limit: vi.fn().mockRejectedValue(new Error('Cloudflare connection error')) }
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const limiter = new CloudflareRateLimiter(mockBinding as any)
    const result = await limiter.checkLimit('192.168.1.1:login')
    expect(result.isAllowed).toBe(true)
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('fails closed (returns isAllowed: false) and warns when the Cloudflare binding rejects with failClosed enabled', async () => {
    const mockBinding = { limit: vi.fn().mockRejectedValue(new Error('Cloudflare connection error')) }
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const limiter = new CloudflareRateLimiter(mockBinding as any, { failClosed: true })
    const result = await limiter.checkLimit('192.168.1.1:login')
    expect(result.isAllowed).toBe(false)
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})
