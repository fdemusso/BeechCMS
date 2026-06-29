// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Sprint 04-pre Part B5 — JWT claims pass-through test.
 *
 * Verifies that `role` and `surname` claims issued in a JWT token are
 * preserved end-to-end through the authMiddleware and available on
 * `context.get('jwtPayload')`. Without the JwtClaims unification these
 * fields would be type-erased and come back undefined.
 */

import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { SystemClock } from '@beechcms/core'
import type { JwtClaims } from '@beechcms/core'
import { JoseTokenService } from './providers/jwt-token.service'
import { authMiddleware } from '../middleware/auth.middleware'
import type { Env, Variables } from '../types'

const TEST_SECRET = 'super-secret-key-used-only-in-the-vitest-suite-min-length'

describe('JWT claims pass-through (sprint 04-pre)', () => {
  const tokenService = new JoseTokenService(TEST_SECRET, {}, SystemClock)

  async function buildApp() {
    const app = new Hono<{ Bindings: Env; Variables: Variables }>()

    app.use('*', async (c, next) => {
      c.set('tokenService', tokenService)
      await next()
    })

    app.use('/protected', authMiddleware())

    app.get('/protected', (c) => {
      const payload = c.get('jwtPayload')
      return c.json(payload)
    })

    return app
  }

  it('role and surname claims survive the authMiddleware round-trip', async () => {
    const app = await buildApp()

    const claims: JwtClaims = {
      sub: 'user-123',
      email: 'admin@example.com',
      name: 'Admin',
      surname: 'User',
      role: 'admin',
    }

    const token = await tokenService.issue(claims)

    const res = await app.request('/protected', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(200)
    const body = await res.json<JwtClaims>()
    expect(body.sub).toBe('user-123')
    expect(body.role).toBe('admin')
    expect(body.surname).toBe('User')
    expect(body.email).toBe('admin@example.com')
  })

  it('a token without role/surname returns undefined for those fields', async () => {
    const app = await buildApp()

    const token = await tokenService.issue({ sub: 'user-456', email: 'plain@example.com' })

    const res = await app.request('/protected', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(200)
    const body = await res.json<JwtClaims>()
    expect(body.sub).toBe('user-456')
    expect(body.role).toBeUndefined()
    expect(body.surname).toBeUndefined()
  })
})
