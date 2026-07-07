// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { rateLimiterMiddleware } from './rate-limit.middleware'

describe('rateLimiterMiddleware', () => {
  it('does not throw in development even if rate limiter bindings are missing', async () => {
    const app = new Hono()
    app.use('*', rateLimiterMiddleware())
    app.get('/test', (c) => c.text('ok'))

    const env = {
      ENV: 'development',
    }

    const res = await app.request('/test', undefined, env)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok')
  })

  it('throws an error in production if any rate limiter binding is missing', async () => {
    const app = new Hono()
    app.use('*', rateLimiterMiddleware())
    app.get('/test', (c) => c.text('ok'))

    let thrownError: Error | null = null
    app.onError((err, c) => {
      thrownError = err
      return c.json({ error: err.message }, 500)
    })

    const env = {
      ENV: 'production',
      // Missing rate limiter bindings (like LOGIN_RATE_LIMITER)
    }

    const res = await app.request('/test', undefined, env)
    expect(res.status).toBe(500)
    expect(thrownError).not.toBeNull()
    expect(thrownError!.message).toContain('Missing rate limiter binding: LOGIN_RATE_LIMITER')
  })

  it('succeeds in production when all rate limiter bindings are defined', async () => {
    const app = new Hono()
    app.use('*', rateLimiterMiddleware())
    app.get('/test', (c) => c.text('ok'))

    const dummyBinding = {
      limit: () => Promise.resolve({ success: true, limit: 10, remaining: 9, reset: 0 }),
    }

    const env = {
      ENV: 'production',
      LOGIN_RATE_LIMITER: dummyBinding,
      REFRESH_RATE_LIMITER: dummyBinding,
      FORGOT_PASSWORD_RATE_LIMITER: dummyBinding,
      RESET_PASSWORD_RATE_LIMITER: dummyBinding,
      PUBLIC_READ_RATE_LIMITER: dummyBinding,
      PUBLIC_WRITE_RATE_LIMITER: dummyBinding,
    }

    const res = await app.request('/test', undefined, env)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok')
  })
})
