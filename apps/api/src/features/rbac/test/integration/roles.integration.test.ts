// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { CANONICAL_USERS, createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

describe('rbac roles — integration (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    // Custom roles outlive each test in the file's D1 storage frame; names are UNIQUE.
    await env.DB.prepare('DELETE FROM roles WHERE is_system = 0').run()
    harness = await createTestHarness({
      db: env.DB,
      users: [CANONICAL_USERS.admin],
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
  })

  const createRole = async (name: string): Promise<string> => {
    const response = await admin.post('/api/rbac/roles', { name, permissions: ['manage_users'] })
    expect(response.status).toBe(201)
    return (await response.json<{ id: string }>()).id
  }

  describe('PUT /api/rbac/roles/:roleId', () => {
    it('refuses a rename onto another role\'s name with 409 role-name-taken', async () => {
      const renamedId = await createRole('Alpha')
      await createRole('Beta')

      const response = await admin.put(`/api/rbac/roles/${renamedId}`, { name: 'Beta', permissions: ['manage_users'] })

      expect(response.status).toBe(409)
      expect(await response.json<{ type: string }>()).toMatchObject({ type: 'https://beechcms.dev/problems/role-name-taken' })

      const persisted = await harness.db.prepare('SELECT name FROM roles WHERE id = ?').bind(renamedId).first<{ name: string }>()
      expect(persisted).toEqual({ name: 'Alpha' })
    })
  })
})
