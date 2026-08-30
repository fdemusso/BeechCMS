// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { publicRateLimitMiddleware } from './rate-limit-middleware'

function buildApp(
  knownSlugs: string[],
  limiterResult: { isAllowed: boolean; retryAfterSeconds?: number; limit?: number; remaining?: number } = { isAllowed: true, limit: 60, remaining: 59 }
) {
  const checkedKeys: string[] = []
  const seedRegistry = {
    get: (slug: string) => (knownSlugs.includes(slug) ? { slug } : null),
  }
  const rateLimiters = {
    getLimiter: () => ({
      checkLimit: async (key: string) => {
        checkedKeys.push(key)
        return limiterResult
      },
    }),
  }

  const app = new Hono<AppEnv>()
  app.use('*', async (c, next) => {
    c.set('seedRegistry', seedRegistry as never)
    c.set('rateLimiters', rateLimiters as never)
    await next()
  })
  app.use('*', publicRateLimitMiddleware())
  app.get('*', (c) => c.text('ok'))

  return { app, checkedKeys }
}

describe('publicRateLimitMiddleware', () => {
  it('collapses unregistered seed segments into a single shared bucket', async () => {
    const { app, checkedKeys } = buildApp(['articles'])

    await app.request('/api/v1/public/aaaa1')
    await app.request('/api/v1/public/aaaa2')
    await app.request('/api/v1/public/aaaa3')

    expect(checkedKeys).toHaveLength(3)
    const seeds = checkedKeys.map((k) => k.split(':')[1])
    expect(new Set(seeds)).toEqual(new Set(['invalid-seed']))
  })

  it('keeps a dedicated bucket per registered seed', async () => {
    const { app, checkedKeys } = buildApp(['articles', 'authors'])

    await app.request('/api/v1/public/articles')
    await app.request('/api/v1/public/authors')

    expect(checkedKeys[0].split(':')[1]).toBe('articles')
    expect(checkedKeys[1].split(':')[1]).toBe('authors')
  })

  it('does not treat reserved prototype keys as valid seeds', async () => {
    const { app, checkedKeys } = buildApp(['articles'])

    await app.request('/api/v1/public/constructor')
    await app.request('/api/v1/public/__proto__')
    await app.request('/api/v1/public/toString')

    for (const key of checkedKeys) {
      expect(key.split(':')[1]).toBe('invalid-seed')
    }
  })

  it('still special-cases health/timetrap segments as no-seed', async () => {
    const { app, checkedKeys } = buildApp(['articles'])

    await app.request('/api/v1/public/health')
    await app.request('/api/v1/public/timetrap/token')

    for (const key of checkedKeys) {
      expect(key.split(':')[1]).toBe('no-seed')
    }
  })

  it('injects X-RateLimit-Limit and X-RateLimit-Remaining on 2xx responses', async () => {
    const { app } = buildApp(['articles'], { isAllowed: true, limit: 60, remaining: 42 })

    const res = await app.request('/api/v1/public/articles')
    expect(res.status).toBe(200)
    expect(res.headers.get('X-RateLimit-Limit')).toBe('60')
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('42')
  })

  it('injects Retry-After and rate-limit headers on 429 responses', async () => {
    const { app } = buildApp(
      ['articles'],
      { isAllowed: false, retryAfterSeconds: 15, limit: 60, remaining: 0 }
    )

    const res = await app.request('/api/v1/public/articles')
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('15')
    expect(res.headers.get('X-RateLimit-Limit')).toBe('60')
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('0')
  })

  it('omits rate-limit headers when limiter does not return them', async () => {
    const { app } = buildApp(['articles'], { isAllowed: true })

    const res = await app.request('/api/v1/public/articles')
    expect(res.status).toBe(200)
    expect(res.headers.get('X-RateLimit-Limit')).toBeNull()
    expect(res.headers.get('X-RateLimit-Remaining')).toBeNull()
  })
})
