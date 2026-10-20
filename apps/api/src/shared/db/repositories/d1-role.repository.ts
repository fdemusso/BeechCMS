// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { AdminGuardedResult, IRoleRepository, RoleRecord, NewRoleInput, IIdGenerator, Permission } from '@beechcms/core'
import { isPermission, SUPER_ADMIN_ROLE_NAME } from '@beechcms/core'
import { otherAdminWithoutRole, roleCarriesManageUsers, roleHasGlobalAssignment } from './global-admin-sql'

type RoleRow = {
  id: string
  name: string
  description: string | null
  icon: string | null
  is_system: number
  created_at: number
  updated_at: number
}

type RolePermissionRow = { role_id: string; permission: string }

/**
 * D1-backed role storage.
 *
 * `roles` is a system table: it carries no Branch and no `br_XX` id, so it never
 * passes through the Botanical Engine — the same treatment as `users` and
 * `oauth_clients`. Unknown permission strings surviving in storage are dropped here
 * rather than widening the `Permission` union.
 */
export class D1RoleRepository implements IRoleRepository {
  constructor(
    private readonly db: D1Database,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async findById(roleId: string): Promise<RoleRecord | null> {
    const roles = await this.findByIds([roleId])
    return roles[0] ?? null
  }

  async findByIds(roleIds: readonly string[]): Promise<RoleRecord[]> {
    if (roleIds.length === 0) return []
    const placeholders = roleIds.map(() => '?').join(', ')

    const roleRows = await this.db
      .prepare(
        `SELECT id, name, description, icon, is_system, created_at, updated_at
         FROM roles WHERE id IN (${placeholders}) ORDER BY name`
      )
      .bind(...roleIds)
      .all<RoleRow>()

    const permissionRows = await this.db
      .prepare(`SELECT role_id, permission FROM role_permissions WHERE role_id IN (${placeholders})`)
      .bind(...roleIds)
      .all<RolePermissionRow>()

    return this.assemble(roleRows.results ?? [], permissionRows.results ?? [])
  }

  async listAll(): Promise<RoleRecord[]> {
    const roleRows = await this.db
      .prepare(
        `SELECT id, name, description, icon, is_system, created_at, updated_at
         FROM roles ORDER BY name`
      )
      .all<RoleRow>()

    const permissionRows = await this.db
      .prepare(`SELECT role_id, permission FROM role_permissions`)
      .all<RolePermissionRow>()

    return this.assemble(roleRows.results ?? [], permissionRows.results ?? [])
  }

  async create(input: NewRoleInput): Promise<string> {
    const roleId = this.idGenerator.uuid()
    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(`INSERT INTO roles (id, name, description, icon, is_system) VALUES (?, ?, ?, ?, 0)`)
        .bind(roleId, input.name, input.description, input.icon ?? null),
      ...this.permissionInserts(roleId, input.permissions),
    ]
    await this.db.batch(statements)
    return roleId
  }

  async update(roleId: string, input: NewRoleInput): Promise<AdminGuardedResult> {
    // The is_system guard must cover the permission statements too, not just the row
    // update: replacing SuperAdmin's permission set while leaving its name intact would
    // be a silent authority change. `is_system` is written only by the migration, so
    // reading it first cannot race with any runtime write.
    const row = await this.db
      .prepare(
        `SELECT is_system, ${roleCarriesManageUsers('roles.id')} AS has_manage_users
         FROM roles WHERE id = ? LIMIT 1`
      )
      .bind(roleId)
      .first<{ is_system: number; has_manage_users: number }>()

    if (!row || row.is_system === 1) return 'not-found'

    // Only an edit that strips `manage_users` can remove an administrator. The guard excludes
    // THIS role's own rows, so it reads the same in every statement of the batch even after
    // the permission rows are rewritten. `has_manage_users` is a pre-read snapshot: a
    // concurrent edit of this very role cannot shrink the set of administrators on its own.
    const guarded = row.has_manage_users === 1 && !input.permissions.includes('manage_users')
    const keepsAdmin = `NOT (${roleHasGlobalAssignment('?')} AND NOT ${otherAdminWithoutRole('?')})`

    const permissions = [...new Set(input.permissions)]
    const statements = [
      this.db
        .prepare(
          `UPDATE roles SET name = ?, description = ?, icon = ?, updated_at = unixepoch()
           WHERE id = ? AND is_system = 0${guarded ? ` AND ${keepsAdmin}` : ''}`
        )
        .bind(input.name, input.description, input.icon ?? null, roleId, ...(guarded ? [roleId, roleId] : [])),
      this.db
        .prepare(`DELETE FROM role_permissions WHERE role_id = ?${guarded ? ` AND ${keepsAdmin}` : ''}`)
        .bind(roleId, ...(guarded ? [roleId, roleId] : [])),
      ...permissions.map(permission =>
        this.db
          .prepare(
            guarded
              ? `INSERT OR IGNORE INTO role_permissions (role_id, permission) SELECT ?, ? WHERE ${keepsAdmin}`
              : `INSERT OR IGNORE INTO role_permissions (role_id, permission) VALUES (?, ?)`
          )
          .bind(roleId, permission, ...(guarded ? [roleId, roleId] : []))
      ),
    ]
    const results = await this.db.batch(statements)
    if ((results[0]?.meta?.changes ?? 0) > 0) return 'applied'

    return (await this.exists(roleId)) ? 'last-global-admin' : 'not-found'
  }

  /** One statement: refused when the role carries the last active global administrator. */
  async delete(roleId: string): Promise<AdminGuardedResult> {
    const result = await this.db
      .prepare(
        `DELETE FROM roles
         WHERE id = ? AND is_system = 0
           AND NOT (
             ${roleCarriesManageUsers('roles.id')}
             AND ${roleHasGlobalAssignment('roles.id')}
             AND NOT ${otherAdminWithoutRole('roles.id')}
           )`
      )
      .bind(roleId)
      .run()
    if ((result.meta.changes ?? 0) > 0) return 'applied'

    // A system role never reaches the guard: report it as absent, like `update` does.
    const row = await this.db.prepare(`SELECT is_system FROM roles WHERE id = ?`).bind(roleId).first<{ is_system: number }>()
    return row && row.is_system === 0 ? 'last-global-admin' : 'not-found'
  }

  private async exists(roleId: string): Promise<boolean> {
    return (await this.db.prepare(`SELECT 1 AS present FROM roles WHERE id = ?`).bind(roleId).first()) !== null
  }

  private permissionInserts(roleId: string, permissions: readonly Permission[]): D1PreparedStatement[] {
    return [...new Set(permissions)].map(permission =>
      this.db
        .prepare(`INSERT OR IGNORE INTO role_permissions (role_id, permission) VALUES (?, ?)`)
        .bind(roleId, permission)
    )
  }

  private assemble(roleRows: RoleRow[], permissionRows: RolePermissionRow[]): RoleRecord[] {
    const byRole = new Map<string, Permission[]>()
    for (const row of permissionRows) {
      if (!isPermission(row.permission)) continue
      const bucket = byRole.get(row.role_id)
      if (bucket) bucket.push(row.permission)
      else byRole.set(row.role_id, [row.permission])
    }

    return roleRows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      icon: row.icon ?? (row.name === SUPER_ADMIN_ROLE_NAME ? 'Shield' : null),
      isSystem: row.is_system === 1,
      permissions: byRole.get(row.id) ?? [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  }
}
