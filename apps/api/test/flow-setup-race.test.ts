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

  it('successfully completes setup with loadDemoData=true, provisioning seeds and demo entries', async () => {
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
    const body = (await res.json()) as any
    expect(body.success).toBe(true)

    // Ensure admin user was created
    const { count: userCount } = (await db.prepare('SELECT COUNT(*) as count FROM users').first()) as { count: number }
    expect(userCount).toBe(1)

    // Ensure 5 demo seeds were provisioned into D1 seeds table
    const { count: seedCount } = (await db.prepare("SELECT COUNT(*) as count FROM seeds WHERE status = 'active'").first()) as { count: number }
    expect(seedCount).toBe(5)

    // Ensure demo fixtures were ingested into content tables
    const { count: clientiCount } = (await db.prepare('SELECT COUNT(*) as count FROM content_clienti').first()) as { count: number }
    expect(clientiCount).toBe(5)

    const { count: abbonamentiCount } = (await db.prepare('SELECT COUNT(*) as count FROM content_abbonamenti').first()) as { count: number }
    expect(abbonamentiCount).toBe(3)

    const { count: ticketCount } = (await db.prepare('SELECT COUNT(*) as count FROM content_ticket').first()) as { count: number }
    expect(ticketCount).toBe(2)

    const { count: changelogCount } = (await db.prepare('SELECT COUNT(*) as count FROM content_changelog').first()) as { count: number }
    expect(changelogCount).toBe(2)

    const { count: articoliCount } = (await db.prepare('SELECT COUNT(*) as count FROM content_articoli').first()) as { count: number }
    expect(articoliCount).toBe(2)

    // Ensure custom SaaS dashboard layout was saved
    const layoutRow = (await db.prepare("SELECT layout FROM dashboard_layouts WHERE scope = 'default'").first()) as { layout: string }
    expect(layoutRow).toBeDefined()
    expect(JSON.parse(layoutRow.layout).pages.length).toBe(2)
  })
})
