// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type {
  IInvitationRepository,
  InvitationRecord,
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

  async invalidatePending(email: string, nowTimestamp: number): Promise<void> {
    await this.db
      .prepare('UPDATE invitations SET used_at = ? WHERE email = ? AND used_at IS NULL')
      .bind(nowTimestamp, email)
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

  /** `WHERE used_at IS NULL` makes the consume atomic: exactly one concurrent redeem
   *  sees `changes === 1`; the loser is refused. */
  async markUsed(invitationId: string, nowTimestamp: number): Promise<boolean> {
    const result = await this.db
      .prepare('UPDATE invitations SET used_at = ? WHERE id = ? AND used_at IS NULL')
      .bind(nowTimestamp, invitationId)
      .run()
    return (result.meta?.changes ?? 0) > 0
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

  async listAll(): Promise<InvitationRecord[]> {
    const rows = await this.db
      .prepare(
        `SELECT id, email, role_id, scope, invited_by, expires_at, created_at, used_at
         FROM invitations ORDER BY created_at DESC`
      )
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
