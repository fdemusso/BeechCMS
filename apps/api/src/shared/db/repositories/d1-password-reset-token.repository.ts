// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { IPasswordResetTokenRepository, NewPasswordResetToken, RedeemPasswordResetInput, ValidatedResetToken, IIdGenerator } from '@beechcms/core'

type ValidatedResetTokenRow = {
  id: string
  user_id: string
  email: string
}

export class D1PasswordResetTokenRepository implements IPasswordResetTokenRepository {
  constructor(
    private readonly db: D1Database,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async invalidatePending(userId: string, nowTimestamp: number): Promise<void> {
    await this.db
      .prepare('UPDATE password_reset_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL')
      .bind(nowTimestamp, userId)
      .run()
  }

  async create(record: NewPasswordResetToken): Promise<void> {
    const generatedId = this.idGenerator.uuid()
    await this.db
      .prepare('INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)')
      .bind(generatedId, record.userId, record.tokenHash, record.expiresAt)
      .run()
  }

  async findValidByHashWithEmail(tokenHash: string, nowTimestamp: number): Promise<ValidatedResetToken | null> {
    const row = await this.db
      .prepare(
        `SELECT prt.id, prt.user_id, u.email
         FROM password_reset_tokens prt
         JOIN users u ON u.id = prt.user_id
         WHERE prt.token_hash = ? AND prt.expires_at > ? AND prt.used_at IS NULL`
      )
      .bind(tokenHash, nowTimestamp)
      .first<ValidatedResetTokenRow>()

    if (!row) return null
    return { id: row.id, userId: row.user_id, email: row.email }
  }

  async redeem(input: RedeemPasswordResetInput): Promise<boolean> {
    const { tokenId, userId, newPasswordHash, nowTimestamp } = input
    const tokenStillUnused = 'EXISTS (SELECT 1 FROM password_reset_tokens WHERE id = ? AND used_at IS NULL)'
    // db.batch runs as one implicit transaction. The token is burned last so the two guarded
    // writes still see it unused; a concurrent redeem then finds it used and writes nothing.
    const [, , burnToken] = await this.db.batch([
      this.db
        .prepare(`UPDATE users SET password_hash = ? WHERE id = ? AND ${tokenStillUnused}`)
        .bind(newPasswordHash, userId, tokenId),
      this.db
        .prepare(`UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND ${tokenStillUnused}`)
        .bind(nowTimestamp, userId, tokenId),
      this.db
        .prepare('UPDATE password_reset_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL')
        .bind(nowTimestamp, tokenId),
    ])
    return burnToken.meta.changes === 1
  }
}
