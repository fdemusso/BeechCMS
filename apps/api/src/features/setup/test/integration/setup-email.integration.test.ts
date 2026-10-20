// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { CANONICAL_USERS, createTestHarness, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

// Account writes must reject every address login rejects, before changing persisted state.
const invalidEmails = ['admin@example..com', 'admin@.example.com', 'admin@example.com.', `${'a'.repeat(244)}@beech.test`]
// Login's existing limit is 254 characters, including the 11-character domain suffix.
const validEmails = [CANONICAL_USERS.viewer.email, `${'a'.repeat(243)}@beech.test`]

describe('setup slice — integration (real D1)', () => {
  let harness: TestHarness
  const settings = { language: 'en', timezone: 'UTC', currency: 'EUR' }

  beforeEach(async () => {
    __resetSeedRegistryCache()
    // Workerd isolates D1 per file; setup needs an empty user table before every case.
    await env.DB.prepare('DELETE FROM users').run()
    await env.DB.prepare('DELETE FROM site_settings').run()
    await env.DB.prepare('DELETE FROM setup_completed').run()
    harness = await createTestHarness({
      db: env.DB,
      users: [],
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
  })

  it.each(invalidEmails)('rejects %s without completing setup or writing settings', async (email) => {
    const payload = { email, password: CANONICAL_USERS.admin.password, settings }

    const response = await harness.anonymous().post('/auth/setup', payload)

    expect(response.status).toBe(422)
    expect(await response.json<{ type: string }>()).toMatchObject({ type: 'https://beechcms.dev/problems/validation-error' })

    expect(await harness.db.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>()).toEqual({ n: 0 })
    expect(await harness.db.prepare('SELECT COUNT(*) AS n FROM user_role_assignments').first<{ n: number }>()).toEqual({ n: 0 })
    expect(await harness.db.prepare('SELECT COUNT(*) AS n FROM site_settings').first<{ n: number }>()).toEqual({ n: 0 })
    expect(await harness.db.prepare('SELECT COUNT(*) AS n FROM setup_completed').first<{ n: number }>()).toEqual({ n: 0 })
    const status = await harness.anonymous().get('/auth/setup')
    expect(status.status).toBe(200)
    expect(await status.json<{ needsSetup: boolean }>()).toMatchObject({ needsSetup: true })
  })

  it.each(validEmails)('logs in with the normalized setup address %s', async (email) => {
    const created = await harness.anonymous().post('/auth/setup', {
      email: `  ${email.toUpperCase()}  `, password: CANONICAL_USERS.admin.password, settings,
    })
    expect(created.status).toBe(201)

    const response = await harness.anonymous().post('/auth/login', { email, password: CANONICAL_USERS.admin.password })

    expect(response.status).toBe(200)
    expect(await response.json<{ token: string }>()).toMatchObject({ token: expect.any(String) })

    expect(await harness.db.prepare('SELECT email FROM users').first<{ email: string }>()).toEqual({ email })
    expect(await harness.db.prepare('SELECT COUNT(*) AS n FROM refresh_tokens').first<{ n: number }>()).toEqual({ n: 1 })
  })
})
