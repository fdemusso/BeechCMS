// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Last-global-admin guard under concurrency — integration tier.
 * Two administrators each try to remove the other's authority at the same time; the guard
 * must leave exactly one of them standing. Sequential refusals are covered by
 * assignments.integration.test.ts and the unit suites.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { CANONICAL_USERS, createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { GLOBAL_SCOPE } from '@beechcms/core'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

describe('rbac last-admin guard — integration (real D1)', () => {
  let harness: TestHarness
  let first: TestClient
  let second: TestClient
  let firstRoleId: string
  let secondRoleId: string
  let firstAssignmentId: string
  let secondAssignmentId: string

  beforeEach(async () => {
    __resetSeedRegistryCache()
    // Custom roles (and their assignments, via FK cascade) outlive each test in the file's D1 storage frame.
    await env.DB.prepare('DELETE FROM roles WHERE is_system = 0').run()
    await env.DB.prepare('UPDATE users SET is_active = 1').run()
    harness = await createTestHarness({
      db: env.DB,
      users: [CANONICAL_USERS.admin, CANONICAL_USERS.editor, CANONICAL_USERS.viewer],
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    const admin = await harness.asUser('admin')

    const createRole = async (name: string): Promise<string> => {
      const response = await admin.post('/api/rbac/roles', { name, permissions: ['manage_users', 'manage_roles'] })
      expect(response.status).toBe(201)
      return (await response.json<{ id: string }>()).id
    }
    const assign = async (userId: string, roleId: string): Promise<string> => {
      const response = await admin.post('/api/rbac/assignments', { userId, roleId, scope: GLOBAL_SCOPE })
      expect(response.status).toBe(201)
      return (await response.json<{ id: string }>()).id
    }
    firstRoleId = await createRole('First Admin Role')
    secondRoleId = await createRole('Second Admin Role')
    firstAssignmentId = await assign(CANONICAL_USERS.editor.id, firstRoleId)
    secondAssignmentId = await assign(CANONICAL_USERS.viewer.id, secondRoleId)

    // The canonical admin is the Developer and always a global admin; drop it so the two
    // accounts above are the only global administrators left.
    await harness.db.prepare('DELETE FROM user_role_assignments WHERE user_id = ?').bind(CANONICAL_USERS.admin.id).run()
    first = await harness.asUser('editor')
    second = await harness.asUser('viewer')
  })

  const countGlobalAdmins = async (): Promise<number> => {
    const row = await harness.db.prepare(
      `SELECT COUNT(DISTINCT a.user_id) AS n
       FROM user_role_assignments a
       JOIN role_permissions rp ON rp.role_id = a.role_id
       JOIN users u ON u.id = a.user_id
       WHERE a.scope = ? AND rp.permission = 'manage_users' AND u.is_active = 1`,
    ).bind(GLOBAL_SCOPE).first<{ n: number }>()
    return row?.n ?? 0
  }

  const statuses = (responses: Response[]) => responses.map(response => response.status)

  it('the sole remaining administrator cannot delete their own assignment', async () => {
    const removed = await first.delete(`/api/rbac/assignments/${secondAssignmentId}`)
    expect(removed.status).toBe(204)

    const response = await first.delete(`/api/rbac/assignments/${firstAssignmentId}`)

    expect(response.status).toBe(409)
    expect(await response.json<{ type: string }>()).toMatchObject({ type: 'https://beechcms.dev/problems/last-global-admin' })
    expect(await countGlobalAdmins()).toBe(1)
  })

  it('two administrators deleting each other\'s assignment leave exactly one administrator', async () => {
    const responses = await Promise.all([
      first.delete(`/api/rbac/assignments/${secondAssignmentId}`),
      second.delete(`/api/rbac/assignments/${firstAssignmentId}`),
    ])

    expect(statuses(responses).filter(status => status === 204)).toHaveLength(1)
    expect(await countGlobalAdmins()).toBe(1)
  })

  it('two administrators deactivating each other leave exactly one active administrator', async () => {
    const responses = await Promise.all([
      first.patch(`/api/rbac/users/${CANONICAL_USERS.viewer.id}/active`, { isActive: false }),
      second.patch(`/api/rbac/users/${CANONICAL_USERS.editor.id}/active`, { isActive: false }),
    ])

    expect(statuses(responses).filter(status => status === 200)).toHaveLength(1)
    expect(await countGlobalAdmins()).toBe(1)
  })

  it('two administrators stripping manage_users from each other\'s role leave exactly one administrator', async () => {
    const responses = await Promise.all([
      first.put(`/api/rbac/roles/${secondRoleId}`, { name: 'Second Admin Role', permissions: ['manage_roles'] }),
      second.put(`/api/rbac/roles/${firstRoleId}`, { name: 'First Admin Role', permissions: ['manage_roles'] }),
    ])

    expect(statuses(responses).filter(status => status === 200)).toHaveLength(1)
    expect(await countGlobalAdmins()).toBe(1)
  })

  it('two administrators deleting each other\'s role leave exactly one administrator', async () => {
    const responses = await Promise.all([
      first.delete(`/api/rbac/roles/${secondRoleId}`),
      second.delete(`/api/rbac/roles/${firstRoleId}`),
    ])

    expect(statuses(responses).filter(status => status === 204)).toHaveLength(1)
    expect(await countGlobalAdmins()).toBe(1)
  })
})
