// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { rateLimiterMiddleware, buildDefaultRegistry, type RateLimiterName } from './rate-limit.middleware'

describe('rateLimiterMiddleware', () => {
  it('injects a registry into context and forwards to handler', async () => {
    const app = new Hono()
    app.use('*', rateLimiterMiddleware())
    app.get('/test', (c) => c.text('ok'))

    const res = await app.request('/test', undefined, { ENV: 'development' })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok')
  })

  it('works without any env bindings in any environment', async () => {
    for (const env of ['development', 'test', 'production'] as const) {
      const app = new Hono()
      app.use('*', rateLimiterMiddleware())
      app.get('/test', (c) => c.text('ok'))

      const res = await app.request('/test', undefined, { ENV: env })
      expect(res.status).toBe(200)
    }
  })

  it('uses the injected override registry when provided', async () => {
    let called = false
    const fakeRegistry = {
      getLimiter: (_name: RateLimiterName) => ({
        checkLimit: async () => {
          called = true
          return { isAllowed: true as const }
        },
      }),
    }

    const app = new Hono()
    app.use('*', rateLimiterMiddleware({ registry: fakeRegistry }))
    app.get('/test', async (c) => {
      await c.get('rateLimiters').getLimiter('login').checkLimit('x')
      return c.text('ok')
    })

    const res = await app.request('/test')
    expect(res.status).toBe(200)
    expect(called).toBe(true)
  })
})

describe('buildDefaultRegistry', () => {
  const expectedLimiters: RateLimiterName[] = [
    'login',
    'loginAccount',
    'tokenRefresh',
    'forgotPassword',
    'forgotPasswordAccount',
    'resetPassword',
    'publicApiRead',
    'publicApiWrite',
  ]

  it('provides a limiter for every configured name', () => {
    const registry = buildDefaultRegistry()
    for (const name of expectedLimiters) {
      expect(registry.getLimiter(name)).toBeDefined()
    }
  })

  it('returns distinct limiter instances per name', () => {
    const registry = buildDefaultRegistry()
    const login = registry.getLimiter('login')
    const loginAccount = registry.getLimiter('loginAccount')
    expect(login).not.toBe(loginAccount)
  })

  it('resetAll clears all bucket states without throwing', () => {
    const registry = buildDefaultRegistry()
    expect(() => registry.resetAll?.()).not.toThrow()
  })

  it('limiters are functional and allow initial requests', async () => {
    const registry = buildDefaultRegistry()
    const result = await registry.getLimiter('login').checkLimit('1.2.3.4')
    expect(result.isAllowed).toBe(true)
    expect(result.limit).toBeDefined()
    expect(result.remaining).toBeDefined()
  })
})
