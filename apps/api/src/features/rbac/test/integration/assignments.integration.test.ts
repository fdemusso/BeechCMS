// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { CANONICAL_USERS, createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { GLOBAL_SCOPE } from '@beechcms/core'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

const ONLY_ADMIN_ASSIGNMENT_ID = '5b0c7a2e-3f4d-4c1a-9e8b-6d2f1a7c4b90'

describe('rbac assignments — integration (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    // Custom roles (and their assignments, via FK cascade) outlive each test in the file's D1 storage frame.
    await env.DB.prepare('DELETE FROM roles WHERE is_system = 0').run()
    harness = await createTestHarness({
      db: env.DB,
      users: [CANONICAL_USERS.admin, CANONICAL_USERS.editor],
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
  })

  const countAdminAssignments = async (): Promise<number> => {
    const row = await harness.db
      .prepare('SELECT COUNT(*) AS n FROM user_role_assignments WHERE user_id = ?')
      .bind(CANONICAL_USERS.admin.id)
      .first<{ n: number }>()
    return row?.n ?? 0
  }

  describe('POST /api/rbac/assignments', () => {
    it('refuses a manage_users@* + manage_roles@* holder assigning a manage_layout role at * with escalation-refused', async () => {
      const grantorRoleId = '7d1e2f3a-4b5c-4d6e-8f70-819a2b3c4d5e'
      const layoutRoleId = '8e2f3a4b-5c6d-4e7f-9081-92ab3c4d5e6f'
      await harness.db.batch([
        harness.db.prepare('INSERT INTO roles (id, name) VALUES (?, ?)').bind(grantorRoleId, 'Grantor'),
        harness.db.prepare('INSERT INTO role_permissions (role_id, permission) VALUES (?, ?)').bind(grantorRoleId, 'manage_users'),
        harness.db.prepare('INSERT INTO role_permissions (role_id, permission) VALUES (?, ?)').bind(grantorRoleId, 'manage_roles'),
        harness.db.prepare('INSERT INTO user_role_assignments (id, user_id, role_id, scope) VALUES (?, ?, ?, ?)').bind('grantor-assignment', CANONICAL_USERS.editor.id, grantorRoleId, GLOBAL_SCOPE),
        harness.db.prepare('INSERT INTO roles (id, name) VALUES (?, ?)').bind(layoutRoleId, 'Layout role'),
        harness.db.prepare('INSERT INTO role_permissions (role_id, permission) VALUES (?, ?)').bind(layoutRoleId, 'manage_layout'),
      ])
      const grantor = await harness.asUser('editor')

      const response = await grantor.post('/api/rbac/assignments', { userId: CANONICAL_USERS.admin.id, roleId: layoutRoleId, scope: GLOBAL_SCOPE })

      expect(response.status).toBe(403)
      expect(await response.json<{ type: string }>()).toMatchObject({ type: 'https://beechcms.dev/problems/escalation-refused' })
      const assignedCount = await harness.db
        .prepare('SELECT COUNT(*) AS n FROM user_role_assignments WHERE role_id = ?')
        .bind(layoutRoleId)
        .first<{ n: number }>()
      expect(assignedCount?.n).toBe(0)
    })

    it('refuses a manage_users@* + manage_roles@* holder assigning a manage_seeds role at * with escalation-refused', async () => {
      const grantorRoleId = '9f3a4b5c-6d7e-4f80-a192-a3bc4d5e6f70'
      const seedsRoleId = 'a04b5c6d-7e8f-4091-b2a3-b4cd5e6f7081'
      await harness.db.batch([
        harness.db.prepare('INSERT INTO roles (id, name) VALUES (?, ?)').bind(grantorRoleId, 'Grantor'),
        harness.db.prepare('INSERT INTO role_permissions (role_id, permission) VALUES (?, ?)').bind(grantorRoleId, 'manage_users'),
        harness.db.prepare('INSERT INTO role_permissions (role_id, permission) VALUES (?, ?)').bind(grantorRoleId, 'manage_roles'),
        harness.db.prepare('INSERT INTO user_role_assignments (id, user_id, role_id, scope) VALUES (?, ?, ?, ?)').bind('grantor-assignment', CANONICAL_USERS.editor.id, grantorRoleId, GLOBAL_SCOPE),
        harness.db.prepare('INSERT INTO roles (id, name) VALUES (?, ?)').bind(seedsRoleId, 'Seeds role'),
        harness.db.prepare('INSERT INTO role_permissions (role_id, permission) VALUES (?, ?)').bind(seedsRoleId, 'manage_seeds'),
      ])
      const grantor = await harness.asUser('editor')

      const response = await grantor.post('/api/rbac/assignments', { userId: CANONICAL_USERS.admin.id, roleId: seedsRoleId, scope: GLOBAL_SCOPE })

      expect(response.status).toBe(403)
      expect(await response.json<{ type: string }>()).toMatchObject({ type: 'https://beechcms.dev/problems/escalation-refused' })
      const assignedCount = await harness.db
        .prepare('SELECT COUNT(*) AS n FROM user_role_assignments WHERE role_id = ?')
        .bind(seedsRoleId)
        .first<{ n: number }>()
      expect(assignedCount?.n).toBe(0)
    })
  })

  describe('DELETE /api/rbac/assignments/:assignmentId', () => {
    it('removes one of two global admin assignments held by the only admin, who stays an admin through the other', async () => {
      const role = await admin.post('/api/rbac/roles', { name: 'Second Admin Role', permissions: ['manage_users'] })
      expect(role.status).toBe(201)
      const { id: roleId } = await role.json<{ id: string }>()
      const assigned = await admin.post('/api/rbac/assignments', { userId: CANONICAL_USERS.admin.id, roleId, scope: GLOBAL_SCOPE })
      expect(assigned.status).toBe(201)
      const { id: assignmentId } = await assigned.json<{ id: string }>()

      const response = await admin.delete(`/api/rbac/assignments/${assignmentId}`)

      expect(response.status).toBe(204)
      expect(await countAdminAssignments()).toBe(1)
    })

    it("refuses removing the only global administrator's assignment with last-global-admin", async () => {
      // The harness seeds the admin's assignment with a non-UUID id, which the route rejects as malformed.
      await harness.db
        .prepare('UPDATE user_role_assignments SET id = ? WHERE user_id = ?')
        .bind(ONLY_ADMIN_ASSIGNMENT_ID, CANONICAL_USERS.admin.id)
        .run()

      const response = await admin.delete(`/api/rbac/assignments/${ONLY_ADMIN_ASSIGNMENT_ID}`)

      expect(response.status).toBe(409)
      expect(await response.json<{ type: string }>()).toMatchObject({ type: 'https://beechcms.dev/problems/last-global-admin' })
      expect(await countAdminAssignments()).toBe(1)
    })

    it("removes the canonical admin's SuperAdmin assignment with 204 while another global administrator exists", async () => {
      await harness.db
        .prepare('UPDATE user_role_assignments SET id = ? WHERE user_id = ?')
        .bind(ONLY_ADMIN_ASSIGNMENT_ID, CANONICAL_USERS.admin.id)
        .run()
      const role = await admin.post('/api/rbac/roles', { name: 'Second Admin Role', permissions: ['manage_users'] })
      expect(role.status).toBe(201)
      const { id: roleId } = await role.json<{ id: string }>()
      const assigned = await admin.post('/api/rbac/assignments', { userId: CANONICAL_USERS.editor.id, roleId, scope: GLOBAL_SCOPE })
      expect(assigned.status).toBe(201)

      const response = await admin.delete(`/api/rbac/assignments/${ONLY_ADMIN_ASSIGNMENT_ID}`)

      expect(response.status).toBe(204)
      expect(await countAdminAssignments()).toBe(0)
    })
  })
})
