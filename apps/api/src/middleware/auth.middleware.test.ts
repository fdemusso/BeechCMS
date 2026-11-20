// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import type { OAuthScope } from '@beechcms/core'
import { authMiddleware } from './auth.middleware'
import { withIntentReplay, type IntentReplay } from '../shared/agent-intents/replay'
import type { Env, Variables } from '../types'

function buildApp(verify: (token: string) => Promise<unknown>) {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>()
  app.use('*', async (c, next) => {
    c.set('tokenService', { verify } as any)
    await next()
  })
  app.use('/protected', authMiddleware())
  app.get('/protected', (c) => c.json({ ok: true, payload: c.get('jwtPayload') }))
  return app
}

describe('authMiddleware', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const app = buildApp(vi.fn())
    const res = await app.request('/protected')
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  it('returns 401 when Authorization header does not start with "Bearer "', async () => {
    const app = buildApp(vi.fn())
    const res = await app.request('/protected', { headers: { Authorization: 'Basic abc123' } })
    expect(res.status).toBe(401)
  })

  it('returns 401 when Bearer prefix is present but token is empty (line 32)', async () => {
    // The Fetch Headers API trims trailing whitespace, so a real 'Bearer '
    // header always normalizes to 'Bearer' before Hono reads it — this branch
    // is unreachable via app.request(). Invoke the middleware directly against
    // a stub Context to exercise it.
    const verify = vi.fn()
    let nextCalled = false
    const c = {
      req: { header: () => 'Bearer ' },
      get: () => ({ verify }),
      set: vi.fn(),
    } as any
    const middleware = authMiddleware()
    await expect(middleware(c, async () => { nextCalled = true })).rejects.toMatchObject({ status: 401 })
    expect(verify).not.toHaveBeenCalled()
    expect(nextCalled).toBe(false)
  })

  it('returns 401 when tokenService.verify resolves null (invalid/expired token)', async () => {
    const app = buildApp(vi.fn().mockResolvedValue(null))
    const res = await app.request('/protected', { headers: { Authorization: 'Bearer bad-token' } })
    expect(res.status).toBe(401)
  })

  it('sets jwtPayload and calls next() when the token verifies', async () => {
    const claims = { sub: 'user-1', email: 'a@b.com' }
    const app = buildApp(vi.fn().mockResolvedValue(claims))
    const res = await app.request('/protected', { headers: { Authorization: 'Bearer good-token' } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, payload: claims })
  })
})

describe('authMiddleware intent replay', () => {
  const REPLAY: IntentReplay = {
    intentId: 'intent-1',
    userId: 'user-1',
    clientId: 'beech-mcp',
    scope: ['schema:write' satisfies OAuthScope],
    payloadHash: 'hash',
  }
  const ENV = {} as Env

  function buildReplayApp(options: { acceptOAuth: boolean; owner: { id: string; email: string; isActive: boolean } | null }) {
    const app = new Hono<{ Bindings: Env; Variables: Variables }>()
    app.use('*', async (c, next) => {
      c.set('userRepository', { findById: vi.fn().mockResolvedValue(options.owner) } as never)
      c.set('tokenService', { verify: vi.fn().mockResolvedValue(null) } as never)
      await next()
    })
    app.use('/protected', authMiddleware({ acceptOAuth: options.acceptOAuth }))
    app.get('/protected', (c) => c.json({ payload: c.get('jwtPayload'), grant: c.get('oauthGrant') }))
    return app
  }

  it('authenticates an in-process replay as the intent owner without an Authorization header', async () => {
    const app = buildReplayApp({ acceptOAuth: true, owner: { id: 'user-1', email: 'a@b.com', isActive: true } })

    const response = await app.request('/protected', {}, withIntentReplay(ENV, REPLAY))

    expect(response.status).toBe(200)
    const body = await response.json<{ payload: { sub: string }; grant: unknown }>()
    expect(body.payload.sub).toBe('user-1')
    expect(body.grant).toEqual({ clientId: 'beech-mcp', userId: 'user-1', scope: ['schema:write'] })
  })

  it('refuses a replay for an inactive owner with 401', async () => {
    const app = buildReplayApp({ acceptOAuth: true, owner: { id: 'user-1', email: 'a@b.com', isActive: false } })

    const response = await app.request('/protected', {}, withIntentReplay(ENV, REPLAY))

    expect(response.status).toBe(401)
  })

  it('ignores the replay marker when OAuth is not accepted', async () => {
    const app = buildReplayApp({ acceptOAuth: false, owner: { id: 'user-1', email: 'a@b.com', isActive: true } })

    const response = await app.request('/protected', {}, withIntentReplay(ENV, REPLAY))

    expect(response.status).toBe(401)
  })
})
