// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, beforeEach } from 'vitest'
import { createBeechApp } from '../src/factory'
import { D1TestDatabase } from './helpers/d1-test-database'
import { TEST_ENV } from './fixtures'

describe('Flow: /auth/setup race condition (#233)', () => {
  let db: D1TestDatabase
  let app: ReturnType<typeof createBeechApp>

  beforeEach(() => {
    db = new D1TestDatabase()
    app = createBeechApp({ seeds: [] })
  })

  function setupRequest(email: string) {
    return app.request('/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'password123',
        settings: { language: 'en', timezone: 'Europe/Rome', currency: 'EUR' },
        track: 'developer',
      }),
    }, { ...TEST_ENV, DB: db })
  }

  it('two concurrent requests: exactly one succeeds, the other is rejected as already-done', async () => {
    const [resA, resB] = await Promise.all([
      setupRequest('admin-a@beech.local'),
      setupRequest('admin-b@beech.local'),
    ])

    const statuses = [resA.status, resB.status].sort()
    expect(statuses).toEqual([201, 403])

    const { count } = (await db.prepare('SELECT COUNT(*) as count FROM users').first()) as { count: number }
    expect(count).toBe(1)
  })

  it('a request after setup already completed is rejected without creating a second admin', async () => {
    const first = await setupRequest('admin-a@beech.local')
    expect(first.status).toBe(201)

    const second = await setupRequest('admin-b@beech.local')
    expect(second.status).toBe(403)

    const { count } = (await db.prepare('SELECT COUNT(*) as count FROM users').first()) as { count: number }
    expect(count).toBe(1)
  })
})
