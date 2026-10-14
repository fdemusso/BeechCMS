// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type {
  IInvitationRepository,
  InvitationRecord,
  InvitationRedemption,
  PageRequest,
  NewInvitationInput,
  ValidatedInvitation,
  IIdGenerator,
} from '@beechcms/core'

type InvitationRow = {
  id: string
  email: string
  role_id: string
  scope: string
  invited_by: string
  expires_at: number
  created_at: number
  used_at: number | null
}

function rowToRecord(row: InvitationRow): InvitationRecord {
  return {
    id: row.id,
    email: row.email,
    roleId: row.role_id,
    scope: row.scope,
    invitedBy: row.invited_by,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    usedAt: row.used_at,
  }
}

/**
 * D1-backed invitation storage.
 *
 * A system table: no Branch, no `br_XX`, never routed through `apiToDb`/`dbToApi`,
 * and NOT a `BaseD1Repository` (that base is content-tier: `content_{slug}` +
 * `SlugConflictError`). Same split as `D1RoleRepository`.
 */
export class D1InvitationRepository implements IInvitationRepository {
  constructor(
    private readonly db: D1Database,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async supersedePending(email: string): Promise<void> {
    await this.db
      .prepare('DELETE FROM invitations WHERE email = ? AND used_at IS NULL')
      .bind(email)
      .run()
  }

  async create(input: NewInvitationInput): Promise<string> {
    const id = this.idGenerator.uuid()
    await this.db
      .prepare(
        `INSERT INTO invitations (id, email, token_hash, role_id, scope, invited_by, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(id, input.email, input.tokenHash, input.roleId, input.scope, input.invitedBy, input.expiresAt)
      .run()
    return id
  }

  async findValidByHash(tokenHash: string, nowTimestamp: number): Promise<ValidatedInvitation | null> {
    const row = await this.db
      .prepare(
        `SELECT id, email, role_id, scope, invited_by
         FROM invitations
         WHERE token_hash = ? AND expires_at > ? AND used_at IS NULL`
      )
      .bind(tokenHash, nowTimestamp)
      .first<Pick<InvitationRow, 'id' | 'email' | 'role_id' | 'scope' | 'invited_by'>>()

    if (!row) return null
    return {
      id: row.id,
      email: row.email,
      roleId: row.role_id,
      scope: row.scope,
      invitedBy: row.invited_by,
    }
  }

  /**
   * One `db.batch` (a transaction). Both inserts are guarded by "invitation still pending"
   * and the consume runs last, so a concurrent redeem that lost the race writes nothing and
   * sees `changes === 0`. The users.email UNIQUE index rejects a second account for the
   * same address and rolls the whole batch back, invitation untouched.
   */
  async redeem(input: InvitationRedemption): Promise<boolean> {
    const pending = 'EXISTS (SELECT 1 FROM invitations WHERE id = ? AND used_at IS NULL)'
    const { user } = input
    const results = await this.db.batch([
      this.db
        .prepare(`INSERT INTO users (id, email, password_hash, role, name, surname) SELECT ?, ?, ?, ?, ?, ? WHERE ${pending}`)
        .bind(user.id, user.email, user.passwordHash, user.role, user.name, user.surname, input.invitationId),
      this.db
        .prepare(`INSERT INTO user_role_assignments (id, user_id, role_id, scope) SELECT ?, ?, ?, ? WHERE ${pending}`)
        .bind(input.assignmentId, user.id, input.roleId, input.scope, input.invitationId),
      this.db
        .prepare('UPDATE invitations SET used_at = ? WHERE id = ? AND used_at IS NULL')
        .bind(input.usedAt, input.invitationId),
    ])
    return (results[2]?.meta?.changes ?? 0) > 0
  }

  async findById(invitationId: string): Promise<InvitationRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT id, email, role_id, scope, invited_by, expires_at, created_at, used_at
         FROM invitations WHERE id = ?`
      )
      .bind(invitationId)
      .first<InvitationRow>()
    return row ? rowToRecord(row) : null
  }

  async list(page: PageRequest): Promise<InvitationRecord[]> {
    const rows = await this.db
      .prepare(
        `SELECT id, email, role_id, scope, invited_by, expires_at, created_at, used_at
         FROM invitations ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`
      )
      .bind(page.limit, page.offset)
      .all<InvitationRow>()
    return (rows.results ?? []).map(rowToRecord)
  }

  async regenerate(invitationId: string, tokenHash: string, expiresAt: number): Promise<boolean> {
    const result = await this.db
      .prepare(
        'UPDATE invitations SET token_hash = ?, expires_at = ? WHERE id = ? AND used_at IS NULL'
      )
      .bind(tokenHash, expiresAt, invitationId)
      .run()
    return (result.meta?.changes ?? 0) > 0
  }

  async delete(invitationId: string): Promise<boolean> {
    const result = await this.db
      .prepare('DELETE FROM invitations WHERE id = ?')
      .bind(invitationId)
      .run()
    return (result.meta?.changes ?? 0) > 0
  }
}
