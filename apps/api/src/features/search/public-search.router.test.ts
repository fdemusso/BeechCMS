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
    const json = await res.json() as any
    expect(json.error).toContain("Parametro 'q' obbligatorio")
  })

  it('returns 400 when q parameter exceeds 150 characters', async () => {
    const app = new Hono<AppEnv>()
    app.route('/search', publicSearchRouter)

    const longQuery = 'a'.repeat(151)
    const res = await app.request(`/search/embed?q=${longQuery}`)
    expect(res.status).toBe(400)
    const json = await res.json() as any
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
    const json = await res.json() as any
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

    const json = await res.json() as any
    expect(aiMock.run).toHaveBeenCalledWith('@cf/baai/bge-small-en-v1.5', { text: 'deep learning' })
    expect(json.data).toEqual([0.11999999731779099, -0.3400000035762787, 0.5600000023841858])
  })

  it('serves the compiled manifest.json for a seed', async () => {
    const app = new Hono<AppEnv>()
    app.route('/search', publicSearchRouter)

    const manifestBody = JSON.stringify({
      model: '@cf/baai/bge-small-en-v1.5',
      dimensions: 384,
      fingerprint: 'abc123',
      records: [{ id: 'art-1', title: 'Hello' }],
    })
    const getMock = vi.fn().mockResolvedValue({
      body: manifestBody,
      httpEtag: '"etag-1"',
    })
    const envMock = { SEARCH_R2: { get: getMock } }

    const res = await app.request('/search/index/articles/manifest.json', {}, envMock as any)

    expect(getMock).toHaveBeenCalledWith('articles/manifest.json')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/json')
    expect(res.headers.get('ETag')).toBe('"etag-1"')
    expect(await res.text()).toBe(manifestBody)
  })

  it('serves the compiled vectors.bin for a seed', async () => {
    const app = new Hono<AppEnv>()
    app.route('/search', publicSearchRouter)

    const vectorBuffer = new Float32Array([0.1, 0.2, 0.3]).buffer
    const getMock = vi.fn().mockResolvedValue({ body: vectorBuffer, httpEtag: undefined })
    const envMock = { SEARCH_R2: { get: getMock } }

    const res = await app.request('/search/index/articles/vectors.bin', {}, envMock as any)

    expect(getMock).toHaveBeenCalledWith('articles/vectors.bin')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/octet-stream')
    expect(await res.arrayBuffer()).toEqual(vectorBuffer)
  })

  it('returns 404 when the seed has no compiled index yet', async () => {
    const app = new Hono<AppEnv>()
    app.route('/search', publicSearchRouter)

    const getMock = vi.fn().mockResolvedValue(null)
    const envMock = { SEARCH_R2: { get: getMock } }

    const res = await app.request('/search/index/unknown/manifest.json', {}, envMock as any)
    expect(res.status).toBe(404)
  })

  it('returns 404 for an unrecognised file name', async () => {
    const app = new Hono<AppEnv>()
    app.route('/search', publicSearchRouter)

    const res = await app.request('/search/index/articles/secrets.txt', {}, {} as any)
    expect(res.status).toBe(404)
  })
})
