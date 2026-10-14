// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { CANONICAL_USERS, createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { GLOBAL_SCOPE, SUPER_ADMIN_ROLE_NAME } from '@beechcms/core'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

describe('rbac invitations — integration (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient
  let roleId: string

  beforeEach(async () => {
    __resetSeedRegistryCache()
    // Invitation rows and redeemed accounts outlive each test in the file's D1 storage frame.
    await env.DB.prepare('DELETE FROM invitations').run()
    await env.DB.prepare('DELETE FROM users').run()
    harness = await createTestHarness({
      db: env.DB,
      users: [CANONICAL_USERS.admin],
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
    const role = await harness.db.prepare('SELECT id FROM roles WHERE name = ?')
      .bind(SUPER_ADMIN_ROLE_NAME).first<{ id: string }>()
    expect(role).not.toBeNull()
    roleId = role!.id
  })

  const issue = async (): Promise<string> => {
    const response = await admin.post('/api/rbac/invitations', { email: CANONICAL_USERS.viewer.email, roleId, scope: GLOBAL_SCOPE })
    expect(response.status).toBe(201)
    return (await response.json<{ id: string }>()).id
  }

  describe('GET /api/rbac/invitations', () => {
    it('lists only the latest invitation for an address as pending once it was reissued', async () => {
      const superseded = await issue()
      const latest = await issue()

      const response = await admin.get('/api/rbac/invitations')

      expect(response.status).toBe(200)
      const { invitations } = await response.json<{ invitations: { id: string; status: string }[] }>()
      expect(invitations.map(({ id, status }) => ({ id, status }))).toEqual([{ id: latest, status: 'pending' }])

      const stored = await harness.db.prepare('SELECT id FROM invitations WHERE id = ?').bind(superseded).first()
      expect(stored).toBeNull()
    })

    it('still reports a redeemed invitation as accepted', async () => {
      const issued = await admin.post('/api/rbac/invitations', { email: CANONICAL_USERS.viewer.email, roleId, scope: GLOBAL_SCOPE })
      const { id, inviteUrl } = await issued.json<{ id: string; inviteUrl: string }>()
      const token = new URL(inviteUrl).searchParams.get('token')
      const accepted = await harness.anonymous().post('/auth/invitations/accept', { token, password: CANONICAL_USERS.viewer.password })
      expect(accepted.status).toBe(201)

      const response = await admin.get('/api/rbac/invitations')

      expect(response.status).toBe(200)
      const { invitations } = await response.json<{ invitations: { id: string; status: string }[] }>()
      expect(invitations.map(({ id, status }) => ({ id, status }))).toEqual([{ id, status: 'accepted' }])
    })
  })
})
