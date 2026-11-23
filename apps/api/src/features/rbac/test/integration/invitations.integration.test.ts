// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { CANONICAL_USERS, createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { GLOBAL_SCOPE, SUPER_ADMIN_ROLE_NAME, sha256hex } from '@beechcms/core'
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

    it('returns invitations in pages of at most `limit`, each page pointing at the next offset', async () => {
      const ids: string[] = []
      for (const name of ['one', 'two', 'three']) {
        const response = await admin.post('/api/rbac/invitations', { email: `${name}@beech.test`, roleId, scope: GLOBAL_SCOPE })
        expect(response.status).toBe(201)
        ids.push((await response.json<{ id: string }>()).id)
      }

      const firstResponse = await admin.get('/api/rbac/invitations?limit=2')
      const secondResponse = await admin.get('/api/rbac/invitations?limit=2&offset=2')

      expect(firstResponse.status).toBe(200)
      expect(secondResponse.status).toBe(200)
      const first = await firstResponse.json<{ invitations: { id: string }[]; nextOffset: number | null }>()
      const second = await secondResponse.json<{ invitations: { id: string }[]; nextOffset: number | null }>()
      expect(first.invitations).toHaveLength(2)
      expect(first.nextOffset).toBe(2)
      expect(second.invitations).toHaveLength(1)
      expect(second.nextOffset).toBeNull()
      expect([...first.invitations, ...second.invitations].map(invitation => invitation.id).sort()).toEqual([...ids].sort())
    })

    it.each(['limit=0', 'limit=101', 'offset=-1'])('rejects %s with 422 validation-failed', async (query) => {
      const response = await admin.get(`/api/rbac/invitations?${query}`)

      expect(response.status).toBe(422)
      expect(await response.json<{ type: string }>()).toMatchObject({ type: 'https://beechcms.dev/problems/validation-failed' })
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

  describe('dashboard session', () => {
    it('still returns the invite link on regenerate so it can be copied by hand', async () => {
      const id = await issue()

      const response = await admin.post(`/api/rbac/invitations/${id}/regenerate`)

      expect(response.status).toBe(200)
      expect(await response.json<{ inviteUrl: string }>()).toMatchObject({ inviteUrl: expect.stringContaining('/admin/accept-invite?token=') })
    })
  })

  describe('OAuth caller (agent / script)', () => {
    const OAUTH_TOKEN = 'a'.repeat(64)
    let agent: TestClient

    beforeEach(async () => {
      await env.DB.prepare('DELETE FROM oauth_tokens').run()
      await env.DB.prepare('DELETE FROM oauth_clients').run()
      await env.DB.prepare(
        `INSERT INTO oauth_clients (client_id, name, redirect_uris, allowed_scopes) VALUES ('agent-client', 'Agent', '[]', 'users:write')`,
      ).run()
      await env.DB.prepare(
        `INSERT INTO oauth_tokens (id, token_hash, token_type, client_id, user_id, scope, authorization_code_hash, expires_at)
         VALUES ('tok-1', ?, 'access', 'agent-client', ?, 'users:write', 'code-hash', ?)`,
      ).bind(await sha256hex(OAUTH_TOKEN), CANONICAL_USERS.admin.id, harness.clock.nowSeconds() + 3600).run()
      agent = harness.anonymous().withHeaders({ Authorization: `Bearer ${OAUTH_TOKEN}` })
    })

    it('does not return the plaintext invite link when issuing an invitation', async () => {
      const response = await agent.post('/api/rbac/invitations', { email: CANONICAL_USERS.viewer.email, roleId, scope: GLOBAL_SCOPE })

      expect(response.status).toBe(201)
      expect(await response.json()).not.toHaveProperty('inviteUrl')
    })

    it('does not return the plaintext invite link when regenerating an invitation', async () => {
      const id = await issue()

      const response = await agent.post(`/api/rbac/invitations/${id}/regenerate`)

      expect(response.status).toBe(200)
      expect(await response.json()).not.toHaveProperty('inviteUrl')
    })
  })
})
