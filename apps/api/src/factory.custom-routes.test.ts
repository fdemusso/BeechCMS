// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Sprint 2 — Route Integration & Injected Router Pattern.
 *
 * Verifies that `customRoutes` mounts developer-defined endpoints under
 * `/api/custom/public/*` (no auth) and `/api/custom/*` (auth enforced
 * automatically by the injected `protectedRouter`), without the developer
 * ever importing Beech's internal middleware.
 */

import { describe, it, expect } from 'vitest'
import { createBeechApp } from './factory'
import { InMemorySeedRepository } from './shared/db/repositories/in-memory-seed.repository'
import { JoseTokenService } from './auth/providers/jwt-token.service'
import { SystemClock } from '@beechcms/core'
import type { Env } from './types'

const TEST_SECRET = 'super-secret-key-used-only-in-the-vitest-suite-min-length'

function buildEnv(): Env {
  return {
    DB: {} as D1Database,
    JWT_SECRET: TEST_SECRET,
    ENV: 'test',
  } as Env
}

function buildApp() {
  return createBeechApp({
    seeds: [],
    seedRepository: new InMemorySeedRepository([]),
    customRoutes: ({ publicRouter, protectedRouter }) => {
      publicRouter.get('/hello', (c) => c.text('Hello World'))
      protectedRouter.get('/stats-summary', (c) => c.json({ ok: true }))
    },
  })
}

async function issueToken(): Promise<string> {
  const tokenService = new JoseTokenService(TEST_SECRET, {}, SystemClock)
  return tokenService.issue({ sub: 'user-1', email: 'dev@example.com' })
}

describe('customRoutes — injected router pattern (sprint 2)', () => {
  it('publicRouter route is reachable without authentication', async () => {
    const app = buildApp()
    const res = await app.request('/api/custom/public/hello', {}, buildEnv())

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('Hello World')
  })

  it('protectedRouter route returns 401 without a Bearer token, handler never runs', async () => {
    const app = buildApp()
    const res = await app.request('/api/custom/stats-summary', {}, buildEnv())

    expect(res.status).toBe(401)
  })

  it('protectedRouter route returns 200 with a valid Bearer token', async () => {
    const app = buildApp()
    const token = await issueToken()
    const res = await app.request(
      '/api/custom/stats-summary',
      { headers: { Authorization: `Bearer ${token}` } },
      buildEnv(),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('public custom routes are not intercepted by the /api auth middleware', async () => {
    const app = buildApp()
    // No Authorization header — would 401 if shadowed by apiProtected/authMiddleware.
    const res = await app.request('/api/custom/public/hello', {}, buildEnv())

    expect(res.status).toBe(200)
  })
})
