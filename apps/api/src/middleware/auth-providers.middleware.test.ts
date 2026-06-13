// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import { authProvidersMiddleware } from './auth-providers.middleware'

describe('authProvidersMiddleware', () => {
  it('throws an error if ENV is production and JWT_SECRET is the development default', async () => {
    const app = new Hono()
    app.use('*', authProvidersMiddleware())
    app.get('/test', (c) => c.text('ok'))

    const env = {
      ENV: 'production',
      JWT_SECRET: 'sviluppo-secret-cambiami-almeno-32-byte-per-sicurezza-hono',
    }

    // Since throwing in Hono middleware returns an unhandled exception or 500 error,
    // let's run app.request and inspect if the error is thrown. Hono's default errorHandler
    // catches it, or we can add a custom error handler to catch it.
    let thrownError: Error | null = null
    app.onError((err, c) => {
      thrownError = err
      return c.json({ error: err.message }, 500)
    })

    const res = await app.request('/test', undefined, env)
    expect(res.status).toBe(500)
    expect(thrownError).not.toBeNull()
    expect(thrownError!.message).toContain('JWT_SECRET non configurato')
  })

  it('injects hashProvider and tokenService when configuration is correct', async () => {
    const app = new Hono()
    app.use('*', authProvidersMiddleware())
    app.get('/test', (c) => {
      const hash = c.get('hashProvider' as never)
      const token = c.get('tokenService' as never)
      return c.json({
        hasHash: !!hash,
        hasToken: !!token,
      })
    })

    const env = {
      ENV: 'development',
      JWT_SECRET: 'custom-secret-key-that-is-secure-enough',
      JWT_ISSUER: 'issuer',
      JWT_AUDIENCE: 'audience',
    }

    const res = await app.request('/test', undefined, env)
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.hasHash).toBe(true)
    expect(body.hasToken).toBe(true)
  })

  it('respects overrides when provided', async () => {
    const app = new Hono()
    const mockHash = { hash: vi.fn(), verify: vi.fn() }
    const mockToken = { sign: vi.fn(), verify: vi.fn() }

    app.use('*', authProvidersMiddleware({
      hashProvider: mockHash as any,
      tokenService: mockToken as any,
    }))

    app.get('/test', (c) => {
      const hash = c.get('hashProvider' as never)
      const token = c.get('tokenService' as never)
      return c.json({
        hashIsOverridden: hash === mockHash,
        tokenIsOverridden: token === mockToken,
      })
    })

    const res = await app.request('/test')
    const body = await res.json() as any
    expect(body.hashIsOverridden).toBe(true)
    expect(body.tokenIsOverridden).toBe(true)
  })
})
