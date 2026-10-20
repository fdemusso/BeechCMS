// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type {
  AdminGuardedResult,
  IRoleAssignmentRepository,
  PermissionAssignment,
  NewAssignmentInput,
  IIdGenerator,
} from '@beechcms/core'
import { GLOBAL_SCOPE } from '@beechcms/core'
import { otherAdminWithoutAssignment, roleCarriesManageUsers } from './global-admin-sql'

type AssignmentRow = {
  id: string
  user_id: string
  role_id: string
  scope: string
}

function rowToRecord(row: AssignmentRow): PermissionAssignment {
  return { id: row.id, userId: row.user_id, roleId: row.role_id, scope: row.scope }
}

/**
 * D1-backed storage for the (user, role, scope) triple.
 *
 * A system table: no Branch, no `br_XX`, never routed through `apiToDb`/`dbToApi`.
 */
export class D1RoleAssignmentRepository implements IRoleAssignmentRepository {
  constructor(
    private readonly db: D1Database,
    private readonly idGenerator: IIdGenerator,
  ) {}

  /**
   * Scope decay lives in this predicate, not in a trigger: a scope naming a seed that
   * is missing or `status != 'active'` grants nothing, and starts granting again if
   * the seed is restored. Global assignments bypass the join entirely.
   */
  async listActiveForUser(userId: string): Promise<PermissionAssignment[]> {
    const rows = await this.db
      .prepare(
        `SELECT a.id, a.user_id, a.role_id, a.scope
         FROM user_role_assignments a
         LEFT JOIN seeds s ON s.slug = a.scope
         WHERE a.user_id = ?
           AND (a.scope = ? OR (s.slug IS NOT NULL AND s.status = 'active'))`
      )
      .bind(userId, GLOBAL_SCOPE)
      .all<AssignmentRow>()

    return (rows.results ?? []).map(rowToRecord)
  }

  async listByRole(roleId: string): Promise<PermissionAssignment[]> {
    const rows = await this.db
      .prepare(`SELECT id, user_id, role_id, scope FROM user_role_assignments WHERE role_id = ?`)
      .bind(roleId)
      .all<AssignmentRow>()

    return (rows.results ?? []).map(rowToRecord)
  }

  async create(input: NewAssignmentInput): Promise<string> {
    const assignmentId = this.idGenerator.uuid()
    await this.db
      .prepare(
        `INSERT OR IGNORE INTO user_role_assignments (id, user_id, role_id, scope)
         VALUES (?, ?, ?, ?)`
      )
      .bind(assignmentId, input.userId, input.roleId, input.scope)
      .run()

    const existing = await this.db
      .prepare(
        `SELECT id FROM user_role_assignments WHERE user_id = ? AND role_id = ? AND scope = ?`
      )
      .bind(input.userId, input.roleId, input.scope)
      .first<{ id: string }>()

    return existing?.id ?? assignmentId
  }

  /**
   * One statement: the row is deleted unless it is the global `manage_users` assignment of
   * the last active global administrator. An account that keeps administrative authority
   * through ANOTHER assignment still counts as remaining.
   */
  async delete(assignmentId: string): Promise<AdminGuardedResult> {
    const result = await this.db
      .prepare(
        `DELETE FROM user_role_assignments
         WHERE id = ?
           AND NOT (
             scope = '${GLOBAL_SCOPE}'
             AND ${roleCarriesManageUsers('user_role_assignments.role_id')}
             AND NOT ${otherAdminWithoutAssignment('user_role_assignments.id')}
           )`
      )
      .bind(assignmentId)
      .run()
    if ((result.meta.changes ?? 0) > 0) return 'applied'

    return (await this.findById(assignmentId)) ? 'last-global-admin' : 'not-found'
  }

  async isLastGlobalAdminAssignment(assignmentId: string): Promise<boolean> {
    const row = await this.db
      .prepare(
        `SELECT 1 AS refused FROM user_role_assignments
         WHERE id = ?
           AND scope = '${GLOBAL_SCOPE}'
           AND ${roleCarriesManageUsers('user_role_assignments.role_id')}
           AND NOT ${otherAdminWithoutAssignment('user_role_assignments.id')}`
      )
      .bind(assignmentId)
      .first()
    return row !== null
  }

  async findById(assignmentId: string): Promise<PermissionAssignment | null> {
    const row = await this.db
      .prepare(`SELECT id, user_id, role_id, scope FROM user_role_assignments WHERE id = ? LIMIT 1`)
      .bind(assignmentId)
      .first<AssignmentRow>()
    return row ? rowToRecord(row) : null
  }

  async listForUsers(userIds: readonly string[]): Promise<PermissionAssignment[]> {
    if (userIds.length === 0) return []
    const placeholders = userIds.map(() => '?').join(', ')
    const rows = await this.db
      .prepare(`SELECT id, user_id, role_id, scope FROM user_role_assignments WHERE user_id IN (${placeholders})`)
      .bind(...userIds)
      .all<AssignmentRow>()
    return (rows.results ?? []).map(rowToRecord)
  }

  async listAllForUser(userId: string): Promise<PermissionAssignment[]> {
    const rows = await this.db
      .prepare(`SELECT id, user_id, role_id, scope FROM user_role_assignments WHERE user_id = ?`)
      .bind(userId)
      .all<AssignmentRow>()
    return (rows.results ?? []).map(rowToRecord)
  }
}
