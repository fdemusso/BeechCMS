// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { GLOBAL_SCOPE } from '@beechcms/core'
import { D1TestDatabase } from '../../../test/helpers/d1-test-database'
import { seedTestUsers } from '../../../test/helpers/seed-fixtures'
import { SequentialIdGenerator } from '../services/id-generator/sequential-id-generator'
import { D1RoleRepository } from '../db/repositories/d1-role.repository'
import { D1RoleAssignmentRepository } from '../db/repositories/d1-role-assignment.repository'
import { resolveEffectivePermissions } from './effective-permissions'
import type { Env, Variables } from '../../types'

const USER_ID = 'user_eff_01'

let db: D1TestDatabase
let ids: SequentialIdGenerator
let roles: D1RoleRepository
let assignments: D1RoleAssignmentRepository
let queryCount: number

beforeEach(async () => {
  db = new D1TestDatabase()
  ids = new SequentialIdGenerator()
  roles = new D1RoleRepository(db, ids)
  assignments = new D1RoleAssignmentRepository(db, ids)
  await seedTestUsers(db, [{ id: USER_ID, email: 'eff@beechcms.io', password_hash: 'x', grantSuperAdmin: false }])
})

function buildApp() {
  queryCount = 0
  const app = new Hono<{ Bindings: Env; Variables: Variables }>()
  app.use('*', async (c, next) => {
    c.set('jwtPayload', { sub: USER_ID })
    c.set('roleRepository', {
      ...roles,
      findByIds: (roleIds: readonly string[]) => { queryCount++; return roles.findByIds(roleIds) },
    } as any)
    c.set('roleAssignmentRepository', {
      ...assignments,
      listActiveForUser: (userId: string) => { queryCount++; return assignments.listActiveForUser(userId) },
    } as any)
    await next()
  })
  app.get('/resolve', async (c) => {
    const first = await resolveEffectivePermissions(c)
    const second = await resolveEffectivePermissions(c)
    return c.json({ first: toJson(first as any), second: toJson(second as any), queryCount })
  })
  return app
}

function toJson(effective: { global: Set<string>; byScope: Map<string, Set<string>> }) {
  return {
    global: [...effective.global],
    byScope: Object.fromEntries([...effective.byScope].map(([k, v]) => [k, [...v]])),
  }
}

describe('resolveEffectivePermissions', () => {
  it('an account with no assignments resolves to empty', async () => {
    const app = buildApp()
    const res = await app.request('/resolve')
    const body = await res.json<{ first: any }>()
    expect(body.first).toEqual({ global: [], byScope: {} })
  })

  it('a SuperAdmin \'*\' assignment resolves to all 7 global permissions', async () => {
    await seedTestUsers(db, [{ id: USER_ID, email: 'eff@beechcms.io', password_hash: 'x', grantSuperAdmin: true }])
    const app = buildApp()
    const res = await app.request('/resolve')
    const body = await res.json<{ first: any }>()
    expect(body.first.global.sort()).toEqual(
      ['content:read', 'content:create', 'content:update', 'content:delete', 'manage_users', 'manage_roles', 'view_analytics'].sort()
    )
  })

  it('a seed-scoped assignment lands in byScope', async () => {
    const roleId = await roles.create({ name: 'PostsEditor', description: null, permissions: ['content:read'] })
    await db.prepare(`INSERT INTO seeds (slug, definition, status) VALUES ('posts', '{}', 'active')`).run()
    await assignments.create({ userId: USER_ID, roleId, scope: 'posts' })

    const app = buildApp()
    const res = await app.request('/resolve')
    const body = await res.json<{ first: any }>()
    expect(body.first.byScope.posts).toEqual(['content:read'])
    expect(body.first.global).toEqual([])
  })

  it('a second call on the same context issues no further queries', async () => {
    const roleId = await roles.create({ name: 'GlobalReader', description: null, permissions: ['content:read'] })
    await assignments.create({ userId: USER_ID, roleId, scope: GLOBAL_SCOPE })

    const app = buildApp()
    const res = await app.request('/resolve')
    const body = await res.json<{ first: any; second: any; queryCount: number }>()
    expect(body.first).toEqual(body.second)
    expect(body.queryCount).toBe(2)
  })
})
