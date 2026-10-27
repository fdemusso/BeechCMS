// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Setup slice — order of the checks on POST /auth/setup, integration tier. The route is open to
 * anyone until the first admin exists, so the throttle and the "already done" answer come before
 * the body is read: a caller learns nothing about the payload contract from a refused request.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { CANONICAL_USERS, createTestHarness, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

// Matches the setup IP bucket capacity in rate-limit.middleware.ts.
const IP_BUCKET_CAPACITY = 5

describe('setup slice — order of checks integration (real D1)', () => {
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

  function postRaw(body: string): Promise<Response> {
    return harness.anonymous().request('/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
  }

  async function countUsers(): Promise<number> {
    const row = await harness.db.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>()
    return row?.n ?? -1
  }

  it('a body that is not JSON is refused with 400 bad-request and creates no account', async () => {
    const response = await postRaw('{not json')

    expect(response.status).toBe(400)
    expect(await response.json<{ type: string }>()).toMatchObject({ type: 'https://beechcms.dev/problems/bad-request' })
    expect(await countUsers()).toBe(0)
  })

  it('JSON null is refused with 400 bad-request and creates no account', async () => {
    const response = await postRaw('null')

    expect(response.status).toBe(400)
    expect(await response.json<{ type: string }>()).toMatchObject({ type: 'https://beechcms.dev/problems/bad-request' })
    expect(await countUsers()).toBe(0)
  })

  it('once an admin exists, a body that is not JSON still gets 403 setup-already-done', async () => {
    const created = await harness.anonymous().post('/auth/setup', {
      email: CANONICAL_USERS.admin.email, password: CANONICAL_USERS.admin.password, settings,
    })
    expect(created.status).toBe(201)

    const response = await postRaw('{not json')

    expect(response.status).toBe(403)
    expect(await response.json<{ type: string }>()).toMatchObject({ type: 'https://beechcms.dev/problems/setup-already-done' })
    expect(await countUsers()).toBe(1)
  })

  it('a throttled client gets 429 whatever the body, before the body is read', async () => {
    for (let attempt = 0; attempt < IP_BUCKET_CAPACITY; attempt += 1) {
      await postRaw('{not json')
    }

    const response = await postRaw('{not json')

    expect(response.status).toBe(429)
    expect(await countUsers()).toBe(0)
  })
})
