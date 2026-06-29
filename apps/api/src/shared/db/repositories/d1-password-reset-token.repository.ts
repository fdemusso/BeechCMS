// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { IPasswordResetTokenRepository, NewPasswordResetToken, ValidatedResetToken, IIdGenerator } from '@beechcms/core'

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

  async markUsed(tokenId: string, nowTimestamp: number): Promise<void> {
    await this.db
      .prepare('UPDATE password_reset_tokens SET used_at = ? WHERE id = ?')
      .bind(nowTimestamp, tokenId)
      .run()
  }
}
