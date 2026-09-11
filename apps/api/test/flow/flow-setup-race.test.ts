// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, beforeEach } from 'vitest'
import { GLOBAL_SCOPE, SUPER_ADMIN_ROLE_NAME } from '@beechcms/core'
import { createBeechApp } from '../../src/factory'
import { D1TestDatabase } from '../helpers/d1-test-database'
import { TEST_ENV } from '../fixtures'

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

  it('POST /auth/setup creates exactly one SuperAdmin assignment at GLOBAL_SCOPE, and the account then reaches a protected route', async () => {
    const res = await setupRequest('admin-lockout@beech.local')
    expect(res.status).toBe(201)

    const row = await db
      .prepare(
        `SELECT a.scope, r.name FROM user_role_assignments a JOIN roles r ON r.id = a.role_id`
      )
      .first<{ scope: string; name: string }>()
    expect(row).toEqual({ scope: GLOBAL_SCOPE, name: SUPER_ADMIN_ROLE_NAME })

    const { count } = (await db.prepare('SELECT COUNT(*) as count FROM user_role_assignments').first()) as { count: number }
    expect(count).toBe(1)

    const loginRes = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin-lockout@beech.local', password: 'password123' }),
    }, { ...TEST_ENV, DB: db })
    const { token } = await loginRes.json<{ token: string }>()

    const settingsRes = await app.request('/api/settings/me', {
      headers: { Authorization: `Bearer ${token}` },
    }, { ...TEST_ENV, DB: db })
    expect(settingsRes.status).toBe(200)
  })

  it('setup called twice does not produce a duplicate assignment', async () => {
    await setupRequest('admin-a@beech.local')
    await setupRequest('admin-b@beech.local')

    const { count } = (await db.prepare('SELECT COUNT(*) as count FROM user_role_assignments').first()) as { count: number }
    expect(count).toBe(1)
  })

  it('provisions the canonical demo seeds and ingests fixtures when loadDemoData is true (#387)', async () => {
    const res = await app.request('/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin-demo@beech.local',
        password: 'password123',
        settings: { language: 'en', timezone: 'Europe/Rome', currency: 'EUR' },
        track: 'developer',
        loadDemoData: true,
      }),
    }, { ...TEST_ENV, DB: db })

    expect(res.status).toBe(201)

    const seedRows = (await db.prepare(`SELECT slug FROM seeds WHERE status = 'active'`).all()).results as { slug: string }[]
    const seedSlugs = seedRows.map((r) => r.slug).sort()
    expect(seedSlugs).toEqual(['abbonamenti', 'articoli', 'changelog', 'clienti', 'ticket'])

    const { count: clientiCount } = (await db.prepare('SELECT COUNT(*) as count FROM content_clienti').first()) as { count: number }
    expect(clientiCount).toBeGreaterThan(0)
  })
})
