// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { CANONICAL_USERS, createTestHarness, UUID_V4_PATTERN, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

type UsersPage = { users: { id: string }[]; nextOffset: number | null }

describe('rbac users — integration (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient
  let createdIds: string[]

  beforeEach(async () => {
    __resetSeedRegistryCache()
    // Account rows outlive each test in the file's D1 storage frame.
    await env.DB.prepare('DELETE FROM users').run()
    harness = await createTestHarness({
      db: env.DB,
      users: [CANONICAL_USERS.admin],
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
    createdIds = []
    for (const name of ['one', 'two', 'three']) {
      const response = await admin.post('/api/rbac/users', { email: `${name}@beech.test`, password: CANONICAL_USERS.viewer.password })
      expect(response.status).toBe(201)
      createdIds.push((await response.json<{ id: string }>()).id)
    }
  })

  describe('GET /api/rbac/users', () => {
    it('returns accounts in pages of at most `limit`, each page pointing at the next offset', async () => {
      const firstResponse = await admin.get('/api/rbac/users?limit=2')
      const secondResponse = await admin.get('/api/rbac/users?limit=2&offset=2')

      expect(firstResponse.status).toBe(200)
      expect(secondResponse.status).toBe(200)
      const first = await firstResponse.json<UsersPage>()
      const second = await secondResponse.json<UsersPage>()
      expect(first.users).toHaveLength(2)
      expect(first.nextOffset).toBe(2)
      expect(second.users).toHaveLength(2)
      expect(second.nextOffset).toBeNull()
      // Pages must tile the table: no account twice, none missing.
      const seen = [...first.users, ...second.users].map(user => user.id).sort()
      expect(seen).toEqual([CANONICAL_USERS.admin.id, ...createdIds].sort())
    })

    it.each(['limit=0', 'limit=101', 'limit=abc', 'offset=-1'])('rejects %s with 422 validation-failed', async (query) => {
      const response = await admin.get(`/api/rbac/users?${query}`)

      expect(response.status).toBe(422)
      expect(await response.json<{ type: string }>()).toMatchObject({ type: 'https://beechcms.dev/problems/validation-failed' })
    })
  })

  describe('POST /api/rbac/users', () => {
    it('answers with the account as the listings serve it, createdAt included', async () => {
      const created = await admin.post('/api/rbac/users', { email: 'fresh@beech.test', password: CANONICAL_USERS.viewer.password })

      expect(created.status).toBe(201)
      const body = await created.json<{ id: string; createdAt: number; assignments: unknown[] }>()
      const fetched = await admin.get(`/api/rbac/users/${body.id}`)
      expect(fetched.status).toBe(200)
      expect(await fetched.json()).toEqual(body)
      expect(body.createdAt).toBeGreaterThan(0)
    })
  })

  describe('GET /api/rbac/users/:userId', () => {
    it('returns the account with its assignments', async () => {
      const response = await admin.get(`/api/rbac/users/${createdIds[0]}`)

      expect(response.status).toBe(200)
      expect(await response.json<{ id: string; email: string; assignments: unknown[] }>())
        .toMatchObject({ id: createdIds[0], email: 'one@beech.test', assignments: [] })
      expect(createdIds[0]).toMatch(UUID_V4_PATTERN)
    })

    it('answers 404 for an unknown account', async () => {
      const response = await admin.get('/api/rbac/users/00000000-0000-4000-8000-000000000000')

      expect(response.status).toBe(404)
    })
  })
})
