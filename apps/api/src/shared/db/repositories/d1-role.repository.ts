// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { IRoleRepository, RoleRecord, NewRoleInput, IIdGenerator, Permission } from '@beechcms/core'
import { isPermission } from '@beechcms/core'

type RoleRow = {
  id: string
  name: string
  description: string | null
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
        `SELECT id, name, description, is_system, created_at, updated_at
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
        `SELECT id, name, description, is_system, created_at, updated_at
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
        .prepare(`INSERT INTO roles (id, name, description, is_system) VALUES (?, ?, ?, 0)`)
        .bind(roleId, input.name, input.description),
      ...this.permissionInserts(roleId, input.permissions),
    ]
    await this.db.batch(statements)
    return roleId
  }

  async update(roleId: string, input: NewRoleInput): Promise<void> {
    await this.db.batch([
      this.db
        .prepare(
          `UPDATE roles SET name = ?, description = ?, updated_at = unixepoch()
           WHERE id = ? AND is_system = 0`
        )
        .bind(input.name, input.description, roleId),
      this.db.prepare(`DELETE FROM role_permissions WHERE role_id = ?`).bind(roleId),
      ...this.permissionInserts(roleId, input.permissions),
    ])
  }

  async delete(roleId: string): Promise<boolean> {
    const result = await this.db
      .prepare(`DELETE FROM roles WHERE id = ? AND is_system = 0`)
      .bind(roleId)
      .run()
    return (result.meta.changes ?? 0) > 0
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
      isSystem: row.is_system === 1,
      permissions: byRole.get(row.id) ?? [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  }
}
