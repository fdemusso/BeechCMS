// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it, vi } from 'vitest'
import { withCachedResponse } from './cache-utils'

describe('withCachedResponse', () => {
  it('returns the response unchanged when there is no edge cache', () => {
    const response = new Response('body', { status: 200 })

    const result = withCachedResponse(null, new Request('http://localhost/x'), response)

    expect(result).toBe(response)
  })

  it('schedules a short-lived cache write and returns the original response untouched', async () => {
    const put = vi.fn().mockResolvedValue(undefined)
    const waitUntil = vi.fn()
    const edgeCache = { cache: { put } as unknown as Cache, executionCtx: { waitUntil } }
    const response = new Response('body', { status: 200, headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } })

    const result = withCachedResponse(edgeCache, new Request('http://localhost/x'), response)

    expect(result).toBe(response)
    expect(waitUntil).toHaveBeenCalledTimes(1)
    await waitUntil.mock.calls[0][0]
    const [, cachedResponse] = put.mock.calls[0]
    expect(cachedResponse.headers.get('Cache-Control')).toBe('public, max-age=60')
  })
})
