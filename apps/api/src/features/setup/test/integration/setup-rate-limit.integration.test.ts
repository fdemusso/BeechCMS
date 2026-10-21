// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Setup slice — rate limit, integration tier. POST /auth/setup is mounted outside both the public
 * and the protected API groups, so before the first admin exists it accepts unlimited anonymous
 * attempts. The limiter must answer from the real app, with the real registry, before the handler
 * touches the user table.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { CANONICAL_USERS, createTestHarness, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

// Matches the setup IP bucket capacity in rate-limit.middleware.ts.
const IP_BUCKET_CAPACITY = 5

describe('setup slice — rate limit integration (real D1)', () => {
  let harness: TestHarness
  const settings = { language: 'en', timezone: 'UTC', currency: 'EUR' }

  beforeEach(async () => {
    __resetSeedRegistryCache()
    await env.DB.prepare('DELETE FROM users').run()
    await env.DB.prepare('DELETE FROM site_settings').run()
    await env.DB.prepare('DELETE FROM setup_completed').run()
    harness = await createTestHarness({
      db: env.DB,
      users: [],
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
  })

  async function countUsers(): Promise<number> {
    const row = await harness.db.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>()
    return row?.n ?? -1
  }

  it('answers 429 with Retry-After once one client exhausts the setup bucket', async () => {
    const statuses: number[] = []
    let last: Response | undefined
    for (let attempt = 0; attempt <= IP_BUCKET_CAPACITY; attempt += 1) {
      last = await harness.anonymous().post('/auth/setup', { password: CANONICAL_USERS.admin.password, settings })
      statuses.push(last.status)
    }

    expect(statuses).toEqual([...Array<number>(IP_BUCKET_CAPACITY).fill(422), 429])
    expect(Number(last?.headers.get('Retry-After'))).toBeGreaterThan(0)
    expect(await countUsers()).toBe(0)
  })

  it('refuses a valid setup payload from a throttled client without creating the admin', async () => {
    for (let attempt = 0; attempt < IP_BUCKET_CAPACITY; attempt += 1) {
      await harness.anonymous().post('/auth/setup', { password: CANONICAL_USERS.admin.password, settings })
    }

    const response = await harness.anonymous().post('/auth/setup', {
      email: CANONICAL_USERS.admin.email, password: CANONICAL_USERS.admin.password, settings,
    })

    expect(response.status).toBe(429)
    expect(await countUsers()).toBe(0)
    const status = await harness.anonymous().get('/auth/setup')
    expect(await status.json<{ needsSetup: boolean }>()).toMatchObject({ needsSetup: true })
  })
})
