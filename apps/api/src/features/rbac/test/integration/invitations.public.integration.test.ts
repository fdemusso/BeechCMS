// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { CANONICAL_USERS, createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { GLOBAL_SCOPE, SUPER_ADMIN_ROLE_NAME } from '@beechcms/core'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

const INVITEE_EMAIL = CANONICAL_USERS.viewer.email
const INVITEE_PASSWORD = CANONICAL_USERS.viewer.password

describe('rbac invitation acceptance — integration (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient
  let roleId: string

  beforeEach(async () => {
    __resetSeedRegistryCache()
    // Account and invitation writes outlive each test in the file's D1 storage frame.
    await env.DB.prepare('DELETE FROM users').run()
    await env.DB.prepare('DROP TRIGGER IF EXISTS fail_assignment_insert').run()
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

  afterEach(async () => {
    await env.DB.prepare('DROP TRIGGER IF EXISTS fail_assignment_insert').run()
  })

  const issueInvitation = async (): Promise<{ id: string; token: string }> => {
    const issued = await admin.post('/api/rbac/invitations', { email: INVITEE_EMAIL, roleId, scope: GLOBAL_SCOPE })
    expect(issued.status).toBe(201)
    const { id, inviteUrl } = await issued.json<{ id: string; inviteUrl: string }>()
    return { id, token: new URL(inviteUrl).searchParams.get('token') ?? '' }
  }

  const readInvitationUsedAt = async (id: string) =>
    harness.db.prepare('SELECT used_at FROM invitations WHERE id = ?').bind(id).first<{ used_at: number | null }>()

  const countUsers = async (): Promise<number> =>
    (await harness.db.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>())?.n ?? 0

  describe('POST /auth/invitations/accept', () => {
    it('creates the account with its assignment and consumes the invitation', async () => {
      const { id, token } = await issueInvitation()

      const response = await harness.anonymous().post('/auth/invitations/accept', { token, password: INVITEE_PASSWORD })

      expect(response.status).toBe(201)
      const { id: userId } = await response.json<{ id: string }>()
      const assignment = await harness.db
        .prepare('SELECT role_id, scope FROM user_role_assignments WHERE user_id = ?')
        .bind(userId).first<{ role_id: string; scope: string }>()
      expect(assignment).toEqual({ role_id: roleId, scope: GLOBAL_SCOPE })
      expect((await readInvitationUsedAt(id))?.used_at).not.toBeNull()
    })

    it('leaves the invitation unconsumed when the email was registered after it was issued', async () => {
      const { id, token } = await issueInvitation()
      const registered = await admin.post('/api/rbac/users', { email: INVITEE_EMAIL, password: INVITEE_PASSWORD })
      expect(registered.status).toBe(201)

      const response = await harness.anonymous().post('/auth/invitations/accept', { token, password: INVITEE_PASSWORD })

      expect(response.status).toBe(409)
      expect(await response.json<{ type: string }>()).toMatchObject({ type: 'https://beechcms.dev/problems/email-taken' })
      // A burned invitation cannot be regenerated, so the admin would have to reissue it.
      expect(await readInvitationUsedAt(id)).toEqual({ used_at: null })
    })

    it('writes neither the account nor the consumption when the assignment insert fails', async () => {
      const { id, token } = await issueInvitation()
      // Failure injection: no HTTP input can make the assignment insert fail on its own.
      await harness.db.prepare(
        `CREATE TRIGGER fail_assignment_insert BEFORE INSERT ON user_role_assignments
         BEGIN SELECT RAISE(ABORT, 'forced assignment failure'); END`,
      ).run()

      const response = await harness.anonymous().post('/auth/invitations/accept', { token, password: INVITEE_PASSWORD })

      expect(response.status).toBe(500)
      expect(await countUsers()).toBe(1)
      expect(await readInvitationUsedAt(id)).toEqual({ used_at: null })
    })

    it('lets exactly one of two concurrent redemptions of the same token create the account', async () => {
      const { token } = await issueInvitation()
      const anonymous = harness.anonymous()

      const responses = await Promise.all([
        anonymous.post('/auth/invitations/accept', { token, password: INVITEE_PASSWORD }),
        anonymous.post('/auth/invitations/accept', { token, password: INVITEE_PASSWORD }),
      ])

      expect(responses.filter(response => response.status === 201)).toHaveLength(1)
      const accounts = await harness.db.prepare('SELECT id FROM users WHERE email = ?').bind(INVITEE_EMAIL).all<{ id: string }>()
      expect(accounts.results).toHaveLength(1)
      const assignments = await harness.db
        .prepare('SELECT COUNT(*) AS n FROM user_role_assignments WHERE user_id = ?')
        .bind(accounts.results[0]!.id).first<{ n: number }>()
      expect(assignments).toEqual({ n: 1 })
    })
  })
})
