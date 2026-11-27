// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { IMfaEnrolmentRepository, MfaEnrolmentRecord, MfaEnrolmentStatus } from '@beechcms/core'

type MfaEnrolmentRow = {
  user_id: string
  status: MfaEnrolmentStatus
  secret_ciphertext: string
  last_used_step: number | null
  created_at: number
  activated_at: number | null
}

function rowToRecord(row: MfaEnrolmentRow): MfaEnrolmentRecord {
  return {
    userId: row.user_id,
    status: row.status,
    secretCiphertext: row.secret_ciphertext,
    lastUsedStep: row.last_used_step,
    createdAt: row.created_at,
    activatedAt: row.activated_at,
  }
}

function changesOf(result: D1Result): number {
  return (result as unknown as { meta?: { changes?: number } })?.meta?.changes ?? 0
}

/** Only place that holds `user_mfa` SQL. Sees ciphertext, never plaintext secrets. */
export class D1MfaEnrolmentRepository implements IMfaEnrolmentRepository {
  constructor(private readonly db: D1Database) {}

  async findByUserId(userId: string): Promise<MfaEnrolmentRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT user_id, status, secret_ciphertext, last_used_step, created_at, activated_at
         FROM user_mfa WHERE user_id = ?`
      )
      .bind(userId)
      .first<MfaEnrolmentRow>()
    return row ? rowToRecord(row) : null
  }

  async savePending(userId: string, secretCiphertext: string, nowSeconds: number): Promise<boolean> {
    const result = await this.db
      .prepare(
        `INSERT INTO user_mfa (user_id, status, secret_ciphertext, last_used_step, created_at, activated_at)
         VALUES (?, 'pending', ?, NULL, ?, NULL)
         ON CONFLICT(user_id) DO UPDATE SET
           secret_ciphertext = excluded.secret_ciphertext,
           created_at = excluded.created_at
         WHERE user_mfa.status = 'pending'`
      )
      .bind(userId, secretCiphertext, nowSeconds)
      .run()
    return changesOf(result) === 1
  }

  async activate(
    userId: string,
    expectedCiphertext: string,
    step: number,
    nowSeconds: number,
    keepSessionTokenHash: string | null,
  ): Promise<boolean> {
    // The revocation runs first: once the activation applies, the pending guard no longer matches.
    const [, activation] = await this.db.batch([
      this.db
        .prepare(
          `UPDATE refresh_tokens SET revoked_at = ?
           WHERE user_id = ? AND revoked_at IS NULL AND (? IS NULL OR token_hash <> ?)
             AND EXISTS (
               SELECT 1 FROM user_mfa
               WHERE user_id = ? AND status = 'pending' AND secret_ciphertext = ?
             )`
        )
        .bind(nowSeconds, userId, keepSessionTokenHash, keepSessionTokenHash, userId, expectedCiphertext),
      this.db
        .prepare(
          `UPDATE user_mfa SET status = 'active', last_used_step = ?, activated_at = ?
           WHERE user_id = ? AND status = 'pending' AND secret_ciphertext = ?`
        )
        .bind(step, nowSeconds, userId, expectedCiphertext),
    ])
    return changesOf(activation) === 1
  }

  async consumeStep(userId: string, step: number): Promise<boolean> {
    const result = await this.db
      .prepare(
        `UPDATE user_mfa SET last_used_step = ?
         WHERE user_id = ? AND status = 'active' AND (last_used_step IS NULL OR last_used_step < ?)`
      )
      .bind(step, userId, step)
      .run()
    return changesOf(result) === 1
  }

  async remove(userId: string, nowSeconds: number, keepSessionTokenHash: string | null): Promise<boolean> {
    // The revocation runs first: once the row is deleted, its EXISTS guard no longer matches.
    const [, deletion] = await this.db.batch([
      this.db
        .prepare(
          `UPDATE refresh_tokens SET revoked_at = ?
           WHERE user_id = ? AND revoked_at IS NULL AND (? IS NULL OR token_hash <> ?)
             AND EXISTS (SELECT 1 FROM user_mfa WHERE user_id = ?)`
        )
        .bind(nowSeconds, userId, keepSessionTokenHash, keepSessionTokenHash, userId),
      this.db.prepare('DELETE FROM user_mfa WHERE user_id = ?').bind(userId),
    ])
    return changesOf(deletion) === 1
  }
}
