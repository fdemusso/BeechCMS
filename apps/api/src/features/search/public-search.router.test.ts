// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { publicSearchRouter } from './public-search.router'
import { Hono } from 'hono'
import type { AppEnv } from '../../types'

describe('publicSearchRouter', () => {
  it('returns 400 when q parameter is missing or empty', async () => {
    const app = new Hono<AppEnv>()
    app.route('/search', publicSearchRouter)

    const res = await app.request('/search/embed')
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain("Parametro 'q' obbligatorio")
  })

  it('returns 400 when q parameter exceeds 150 characters', async () => {
    const app = new Hono<AppEnv>()
    app.route('/search', publicSearchRouter)

    const longQuery = 'a'.repeat(151)
    const res = await app.request(`/search/embed?q=${longQuery}`)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('150 caratteri')
  })

  it('enforces rate limits when limiter blocks the request', async () => {
    const app = new Hono<AppEnv>()

    const limiterMock = {
      checkLimit: vi.fn().mockResolvedValue({ isAllowed: false, retryAfterSeconds: 60 }),
    }
    const registryMock = {
      getLimiter: vi.fn().mockReturnValue(limiterMock),
    }

    app.use('*', async (c, next) => {
      c.set('rateLimiters', registryMock as any)
      await next()
    })
    app.route('/search', publicSearchRouter)

    const res = await app.request('/search/embed?q=test')
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('60')
    const json = await res.json()
    expect(json.error).toBe('Too Many Requests')
  })

  it('returns 503 if AI binding is missing', async () => {
    const app = new Hono<AppEnv>()
    app.route('/search', publicSearchRouter)

    const res = await app.request('/search/embed?q=valid+query', {}, {})
    expect(res.status).toBe(503)
  })

  it('generates embedding and sets Edge-Control and Cache-Control headers', async () => {
    const app = new Hono<AppEnv>()

    const aiMock = {
      run: vi.fn().mockResolvedValue({
        shape: [1, 3],
        data: [[0.12, -0.34, 0.56]],
      }),
    }

    const envMock = {
      AI: aiMock,
    }

    app.route('/search', publicSearchRouter)

    const res = await app.request('/search/embed?q=deep+learning', {}, envMock as any)
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=604800')
    expect(res.headers.get('Edge-Control')).toBe('s-maxage=604800')

    const json = await res.json()
    expect(aiMock.run).toHaveBeenCalledWith('@cf/baai/bge-small-en-v1.5', { text: 'deep learning' })
    expect(json.data).toEqual([0.11999999731779099, -0.3400000035762787, 0.5600000023841858])
  })
})
