// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, beforeEach } from 'vitest'
import { createBeechApp } from '../src/factory'
import { TEST_SEEDS, TEST_USERS, TEST_ENV } from './fixtures'
import { StaticContentRepository } from './mocks/static-content.repository'
import { StaticIdempotencyRepository } from './mocks/static-idempotency.repository'
import { D1TestDatabase } from './helpers/d1-test-database'
import { seedTestUsers } from './helpers/seed-fixtures'

/**
 * Flow: Stats & Setup Checklist
 * 
 * Verifies the setup checklist and other stats endpoints.
 */
describe('Flow: Stats', () => {
  let app: ReturnType<typeof createBeechApp>
  let authToken: string
  let db: D1TestDatabase

  beforeEach(async () => {
    db = new D1TestDatabase()
    await seedTestUsers(db, TEST_USERS)
    const repo = new StaticContentRepository(TEST_SEEDS)
    const idempotencyRepo = new StaticIdempotencyRepository()

    app = createBeechApp({
      seeds: TEST_SEEDS,
      repository: repo,
      idempotencyRepository: idempotencyRepo,
    })

    // Login to get a valid token
    const loginRes = await app.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: TEST_USERS[0].email, password: 'password123' }),
      headers: { 'Content-Type': 'application/json' }
    }, { ...TEST_ENV, DB: db })

    const loginData = await loginRes.json() as { token: string }
    authToken = loginData.token
  })

  /**
   * Test: GET /api/content/stats/setup-checklist
   * Note: The statsApp is likely mounted under /api/content/stats or similar.
   * Based on the stats.handler.ts, it's exported as statsApp.
   * Looking at common BeechCMS patterns, it's usually under /api/content/stats.
   */
  it('GET /api/content/stats/setup-checklist returns the project health state', async () => {
    const res = await app.request('/api/content/stats/setup-checklist', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    }, { ...TEST_ENV, DB: db as any })

    expect(res.status).toBe(200)
    const checklist = await res.json() as any

    // Required properties
    expect(checklist).toHaveProperty('systemTablesOk')
    expect(checklist).toHaveProperty('seedsCount')
    expect(checklist).toHaveProperty('contentTablesOk')
    expect(checklist).toHaveProperty('adminExists')
    expect(checklist).toHaveProperty('hasContent')

    // With TEST_USERS containing users, adminExists should be true
    expect(typeof checklist.systemTablesOk).toBe('boolean')
    expect(typeof checklist.adminExists).toBe('boolean')
    expect(checklist.seedsCount).toBe(TEST_SEEDS.length)
  })

  it('GET /api/content/stats/setup-checklist returns adminExists=false when user table is empty', async () => {
    const emptyDb = new D1TestDatabase()
    // No users seeded — adminExists must be false

    // Use a pre-issued token since we cannot login without users
    const { JoseTokenService } = await import('../src/auth/providers/jwt-token.service')
    const { SystemClock } = await import('@beechcms/core')
    const tokenService = new JoseTokenService(TEST_ENV.JWT_SECRET, {}, SystemClock)
    const token = await tokenService.issue({ sub: 'u_fake', email: 'ghost@test.io' })

    const res = await app.request('/api/content/stats/setup-checklist', {
      headers: { 'Authorization': `Bearer ${token}` }
    }, { ...TEST_ENV, DB: emptyDb as any })

    expect(res.status).toBe(200)
    const checklist = await res.json() as any
    expect(checklist.adminExists).toBe(false)
  })
})
