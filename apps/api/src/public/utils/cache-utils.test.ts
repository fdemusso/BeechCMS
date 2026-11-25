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

  it('the response served on a miss carries the same Cache-Control as the copy stored for hits', async () => {
    const put = vi.fn().mockResolvedValue(undefined)
    const waitUntil = vi.fn()
    const edgeCache = { cache: { put } as unknown as Cache, executionCtx: { waitUntil } }
    const response = new Response('body', { status: 200, headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } })

    const served = withCachedResponse(edgeCache, new Request('http://localhost/x'), response)

    await waitUntil.mock.calls[0][0]
    const [, cachedResponse] = put.mock.calls[0]
    // A hit answers with the stored copy: a miss without the same header made browsers cache hits only.
    expect(served.headers.get('Cache-Control')).toBe('public, max-age=60')
    expect(cachedResponse.headers.get('Cache-Control')).toBe('public, max-age=60')
    expect(await served.text()).toBe('body')
  })
})
