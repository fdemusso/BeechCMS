// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi } from 'vitest'
import { fetchTimeTrapToken } from '../core/time-trap.js'

describe('time-trap', () => {
  it('fetches timetrap token from endpoint successfully', async () => {
    const mockToken = 'test-hmac-token-12345'
    const customFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: mockToken }),
    }) as unknown as typeof fetch

    const result = await fetchTimeTrapToken('http://localhost:8787', customFetch)

    expect(customFetch).toHaveBeenCalledWith(
      'http://localhost:8787/api/v1/public/timetrap/token',
      { method: 'GET' }
    )
    expect(result).not.toBeNull()
    expect(result?.token).toBe(mockToken)
    expect(typeof result?.timestamp).toBe('number')
  })

  it('handles trailing slashes gracefully', async () => {
    const customFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'token-abc' }),
    }) as unknown as typeof fetch

    await fetchTimeTrapToken('http://localhost:8787///', customFetch)

    expect(customFetch).toHaveBeenCalledWith(
      'http://localhost:8787/api/v1/public/timetrap/token',
      { method: 'GET' }
    )
  })

  it('returns null on fetch error or non-200 response', async () => {
    const errorFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    }) as unknown as typeof fetch

    const result = await fetchTimeTrapToken('http://localhost:8787', errorFetch)
    expect(result).toBeNull()

    const rejectingFetch = vi.fn().mockRejectedValue(new Error('Network error')) as unknown as typeof fetch
    const networkFailResult = await fetchTimeTrapToken('http://localhost:8787', rejectingFetch)
    expect(networkFailResult).toBeNull()
  })
})
