// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type {
  IOAuthAuthorizationCodeRepository,
  NewAuthorizationCode,
  AuthorizationCodeRecord,
  IClock,
} from '@beechcms/core'
import { parseScopeString, formatScopes } from '@beechcms/core'

type AuthorizationCodeRow = {
  code_hash: string
  client_id: string
  user_id: string
  scope: string
  redirect_uri: string
  code_challenge: string
  code_challenge_method: string
  expires_at: number
  created_at: number
  consumed_at: number | null
}

function rowToRecord(row: AuthorizationCodeRow): AuthorizationCodeRecord {
  return {
    codeHash: row.code_hash,
    clientId: row.client_id,
    userId: row.user_id,
    scope: parseScopeString(row.scope) ?? [],
    redirectUri: row.redirect_uri,
    codeChallenge: row.code_challenge,
    codeChallengeMethod: 'S256',
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    consumedAt: row.consumed_at,
  }
}

export class D1OAuthAuthorizationCodeRepository implements IOAuthAuthorizationCodeRepository {
  constructor(
    private readonly db: D1Database,
    private readonly clock: IClock,
  ) {}

  async save(record: NewAuthorizationCode): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO oauth_authorization_codes
           (code_hash, client_id, user_id, scope, redirect_uri, code_challenge, code_challenge_method, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        record.codeHash,
        record.clientId,
        record.userId,
        formatScopes(record.scope),
        record.redirectUri,
        record.codeChallenge,
        record.codeChallengeMethod,
        record.expiresAt,
        this.clock.nowSeconds(),
      )
      .run()
  }

  async findByHash(codeHash: string, nowTimestamp: number): Promise<AuthorizationCodeRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT code_hash, client_id, user_id, scope, redirect_uri, code_challenge,
                code_challenge_method, expires_at, created_at, consumed_at
         FROM oauth_authorization_codes
         WHERE code_hash = ? AND expires_at > ?
         LIMIT 1`
      )
      .bind(codeHash, nowTimestamp)
      .first<AuthorizationCodeRow>()
    return row ? rowToRecord(row) : null
  }

  async consumeByHash(codeHash: string, nowTimestamp: number): Promise<boolean> {
    const result = await this.db
      .prepare(
        `UPDATE oauth_authorization_codes
         SET consumed_at = ?
         WHERE code_hash = ? AND consumed_at IS NULL AND expires_at > ?`
      )
      .bind(nowTimestamp, codeHash, nowTimestamp)
      .run()
    const changes = (result as unknown as { meta?: { changes?: number } })?.meta?.changes ?? 0
    return changes > 0
  }
}
