// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { AdminGuardedResult, PageRequest, IUserRepository, UserRecord, NewUserInput, AccountSummary, InitialRoleGrant } from '@beechcms/core'
import { holdsGlobalManageUsers, otherAdminWithoutUser } from './global-admin-sql'

type AccountRow = {
  id: string
  email: string
  name: string | null
  surname: string | null
  is_active: number
  created_at: number
}

function accountFromRow(row: AccountRow): AccountSummary {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    surname: row.surname,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
  }
}

type UserRow = {
  id: string
  email: string
  name: string | null
  surname: string | null
  password_hash: string
  avatar_url: string | null
  notification_prefs: string
  is_active: number
}

function rowToRecord(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    surname: row.surname,
    passwordHash: row.password_hash,
    avatarUrl: row.avatar_url,
    notificationPreferences: row.notification_prefs,
    isActive: row.is_active === 1,
  }
}

export class D1UserRepository implements IUserRepository {
  constructor(private readonly db: D1Database) {}

  async countAll(): Promise<number> {
    const result = await this.db
      .prepare('SELECT COUNT(*) as count FROM users')
      .first<{ count: number }>()
    return result?.count ?? 0
  }

  async findById(userId: string): Promise<UserRecord | null> {
    const row = await this.db
      .prepare('SELECT id, email, name, surname, password_hash, avatar_url, notification_prefs, is_active FROM users WHERE id = ? LIMIT 1')
      .bind(userId)
      .first<UserRow>()
    return row ? rowToRecord(row) : null
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const row = await this.db
      .prepare('SELECT id, email, name, surname, password_hash, avatar_url, notification_prefs, is_active FROM users WHERE email = ? LIMIT 1')
      .bind(email)
      .first<UserRow>()
    return row ? rowToRecord(row) : null
  }

  async create(user: NewUserInput): Promise<void> {
    await this.db
      .prepare('INSERT INTO users (id, email, password_hash, name, surname) VALUES (?, ?, ?, ?, ?)')
      .bind(user.id, user.email, user.passwordHash, user.name, user.surname)
      .run()
  }

  async createInitialAdmin(user: NewUserInput, roleGrant: InitialRoleGrant): Promise<boolean> {
    try {
      await this.db.batch([
        this.db.prepare('INSERT INTO setup_completed (id) VALUES (1)'),
        this.db
          .prepare('INSERT INTO users (id, email, password_hash, name, surname) VALUES (?, ?, ?, ?, ?)')
          .bind(user.id, user.email, user.passwordHash, user.name, user.surname),
        this.db
          .prepare('INSERT INTO user_role_assignments (id, user_id, role_id, scope) VALUES (?, ?, ?, ?)')
          .bind(roleGrant.id, user.id, roleGrant.roleId, roleGrant.scope),
      ])
      return true
    } catch (err) {
      if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) return false
      throw err
    }
  }

  async updateProfile(userId: string, fields: { name?: string; surname?: string; email?: string }): Promise<void> {
    const columnAssignments: string[] = []
    const boundValues: unknown[] = []

    if (fields.name !== undefined) {
      columnAssignments.push('name = ?')
      boundValues.push(fields.name)
    }
    if (fields.surname !== undefined) {
      columnAssignments.push('surname = ?')
      boundValues.push(fields.surname)
    }
    if (fields.email !== undefined) {
      columnAssignments.push('email = ?')
      boundValues.push(fields.email)
    }

    if (columnAssignments.length === 0) return

    boundValues.push(userId)
    await this.db
      .prepare(`UPDATE users SET ${columnAssignments.join(', ')} WHERE id = ?`)
      .bind(...boundValues)
      .run()
  }

  async updatePasswordHash(userId: string, newPasswordHash: string): Promise<void> {
    await this.db
      .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .bind(newPasswordHash, userId)
      .run()
  }

  async changePasswordAndRevokeSessions(userId: string, newPasswordHash: string, nowTimestamp: number): Promise<void> {
    await this.db.batch([
      this.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(newPasswordHash, userId),
      this.db
        .prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
        .bind(nowTimestamp, userId),
    ])
  }

  async updateAvatarUrl(userId: string, avatarUrl: string | null): Promise<void> {
    await this.db
      .prepare('UPDATE users SET avatar_url = ? WHERE id = ?')
      .bind(avatarUrl, userId)
      .run()
  }

  async updateNotificationPreferences(userId: string, preferencesJson: string): Promise<void> {
    await this.db
      .prepare('UPDATE users SET notification_prefs = ? WHERE id = ?')
      .bind(preferencesJson, userId)
      .run()
  }

  async emailBelongsToAnotherUser(email: string, currentUserId: string): Promise<boolean> {
    const row = await this.db
      .prepare('SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1')
      .bind(email, currentUserId)
      .first()
    return row !== null
  }

  async listAccounts(page: PageRequest): Promise<AccountSummary[]> {
    const rows = await this.db
      .prepare(
        `SELECT id, email, name, surname, is_active, created_at
         FROM users ORDER BY created_at ASC, id ASC LIMIT ? OFFSET ?`
      )
      .bind(page.limit, page.offset)
      .all<AccountRow>()

    return (rows.results ?? []).map(accountFromRow)
  }

  async findAccountById(userId: string): Promise<AccountSummary | null> {
    const row = await this.db
      .prepare(
        `SELECT id, email, name, surname, is_active, created_at
         FROM users WHERE id = ?`
      )
      .bind(userId)
      .first<AccountRow>()

    return row ? accountFromRow(row) : null
  }

  /**
   * Deactivation is one statement that skips the row when the account holds the global
   * `manage_users` authority and no OTHER active account does. Reactivation is unguarded.
   */
  async setActive(userId: string, isActive: boolean): Promise<AdminGuardedResult> {
    const result = await this.db
      .prepare(
        isActive
          ? 'UPDATE users SET is_active = 1 WHERE id = ?'
          : `UPDATE users SET is_active = 0
             WHERE id = ?
               AND NOT (
                 ${holdsGlobalManageUsers('users.id')}
                 AND NOT ${otherAdminWithoutUser('users.id')}
               )`
      )
      .bind(userId)
      .run()
    if ((result.meta.changes ?? 0) > 0) return 'applied'

    const row = await this.db.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first()
    return row ? 'last-global-admin' : 'not-found'
  }
}
