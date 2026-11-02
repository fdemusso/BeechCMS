// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Which refusal an RBAC write answers first. The body contract moved from each handler into
 * `zodJson`, so the order of its refusals relative to the id and resource checks is pinned here.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { CANONICAL_USERS, createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

const PROBLEM = 'https://beechcms.dev/problems/'
// A well-formed id that no row carries: it passes the id check and fails the lookup.
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000'

describe('rbac request order — integration (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    // Custom roles and created accounts outlive each test in the file's D1 storage frame.
    await env.DB.prepare('DELETE FROM roles WHERE is_system = 0').run()
    await env.DB.prepare('DELETE FROM users').run()
    harness = await createTestHarness({
      db: env.DB,
      users: [CANONICAL_USERS.admin],
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
  })

  const sendRaw = (method: string, path: string, body: string) =>
    admin.request(path, { method, headers: { 'Content-Type': 'application/json' }, body })

  const countRows = async () => {
    const counts: Record<string, number> = {}
    for (const table of ['users', 'roles', 'user_role_assignments', 'invitations']) {
      counts[table] = (await harness.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())?.n ?? -1
    }
    return counts
  }

  const writes: { name: string; method: string; path: string; invalidBody: unknown }[] = [
    { name: 'create user', method: 'POST', path: '/api/rbac/users', invalidBody: { email: 'new@beech.test', password: 'short' } },
    { name: 'create role', method: 'POST', path: '/api/rbac/roles', invalidBody: { name: 'Empty', permissions: [] } },
    { name: 'create assignment', method: 'POST', path: '/api/rbac/assignments', invalidBody: { userId: '', roleId: UNKNOWN_ID, scope: '*' } },
    { name: 'create invitation', method: 'POST', path: '/api/rbac/invitations', invalidBody: { email: 'not-an-email', roleId: UNKNOWN_ID, scope: '*' } },
    { name: 'deactivate user', method: 'PATCH', path: `/api/rbac/users/${UNKNOWN_ID}/active`, invalidBody: { isActive: 'no' } },
    { name: 'update role', method: 'PUT', path: `/api/rbac/roles/${UNKNOWN_ID}`, invalidBody: { name: '', permissions: ['manage_users'] } },
  ]

  describe('request bodies', () => {
    it.each(writes)('$name refuses a body that is not JSON with 400 invalid-json and writes nothing', async ({ method, path }) => {
      const before = await countRows()

      const response = await sendRaw(method, path, '{')

      expect(response.status).toBe(400)
      expect(await response.json<{ type: string }>()).toMatchObject({ type: `${PROBLEM}invalid-json` })
      expect(await countRows()).toEqual(before)
    })

    it.each(writes)('$name refuses a body the schema rejects with 422 validation-failed and writes nothing', async ({ method, path, invalidBody }) => {
      const before = await countRows()

      const response = await sendRaw(method, path, JSON.stringify(invalidBody))

      expect(response.status).toBe(422)
      expect(await response.json<{ type: string }>()).toMatchObject({ type: `${PROBLEM}validation-failed` })
      expect(await countRows()).toEqual(before)
    })
  })

  describe('PATCH /api/rbac/users/:userId/active', () => {
    it('answers 404 for a malformed id before it looks at the body', async () => {
      const response = await sendRaw('PATCH', '/api/rbac/users/not-an-id/active', '{')

      expect(response.status).toBe(404)
      expect(await response.json<{ type: string }>()).toMatchObject({ type: `${PROBLEM}not-found` })
    })

    it('validates the body before it looks the account up', async () => {
      const response = await admin.patch(`/api/rbac/users/${UNKNOWN_ID}/active`, { isActive: 'no' })

      expect(response.status).toBe(422)
      expect(await response.json<{ type: string }>()).toMatchObject({ type: `${PROBLEM}validation-failed` })
    })

    it('answers 404 for a well-formed id with a valid body once the lookup finds nothing', async () => {
      const response = await admin.patch(`/api/rbac/users/${UNKNOWN_ID}/active`, { isActive: false })

      expect(response.status).toBe(404)
      expect(await response.json<{ type: string }>()).toMatchObject({ type: `${PROBLEM}not-found` })
    })
  })

  describe('PUT /api/rbac/roles/:roleId', () => {
    it('answers 404 for a malformed id before it looks at the body', async () => {
      const response = await sendRaw('PUT', '/api/rbac/roles/not-an-id', '{')

      expect(response.status).toBe(404)
      expect(await response.json<{ type: string }>()).toMatchObject({ type: `${PROBLEM}not-found` })
    })

    it('validates the body before it looks the role up', async () => {
      const response = await admin.put(`/api/rbac/roles/${UNKNOWN_ID}`, { name: 'Renamed', permissions: [] })

      expect(response.status).toBe(422)
      expect(await response.json<{ type: string }>()).toMatchObject({ type: `${PROBLEM}validation-failed` })
    })
  })
})
