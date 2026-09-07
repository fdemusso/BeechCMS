// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type {
  IOAuthTokenRepository,
  NewOAuthToken,
  OAuthTokenRecord,
  OAuthTokenType,
  AuthorizedClientSummary,
  IClock,
} from '@beechcms/core'
import { parseScopeString, formatScopes } from '@beechcms/core'

type OAuthTokenRow = {
  id: string
  token_hash: string
  token_type: OAuthTokenType
  client_id: string
  user_id: string
  scope: string
  authorization_code_hash: string
  expires_at: number
  created_at: number
  revoked_at: number | null
}

type AuthorizedClientRow = {
  client_id: string
  client_name: string
  scope: string
  last_issued_at: number
}

function rowToRecord(row: OAuthTokenRow): OAuthTokenRecord {
  return {
    id: row.id,
    tokenHash: row.token_hash,
    tokenType: row.token_type,
    clientId: row.client_id,
    userId: row.user_id,
    scope: parseScopeString(row.scope) ?? [],
    authorizationCodeHash: row.authorization_code_hash,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
  }
}

export class D1OAuthTokenRepository implements IOAuthTokenRepository {
  constructor(
    private readonly db: D1Database,
    private readonly clock: IClock,
  ) {}

  async save(record: NewOAuthToken): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO oauth_tokens
           (id, token_hash, token_type, client_id, user_id, scope, authorization_code_hash, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        record.id,
        record.tokenHash,
        record.tokenType,
        record.clientId,
        record.userId,
        formatScopes(record.scope),
        record.authorizationCodeHash,
        record.expiresAt,
        this.clock.nowSeconds(),
      )
      .run()
  }

  async findActiveByHash(
    tokenHash: string,
    tokenType: OAuthTokenType,
    nowTimestamp: number,
  ): Promise<OAuthTokenRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT id, token_hash, token_type, client_id, user_id, scope,
                authorization_code_hash, expires_at, created_at, revoked_at
         FROM oauth_tokens
         WHERE token_hash = ? AND token_type = ? AND expires_at > ? AND revoked_at IS NULL
         LIMIT 1`
      )
      .bind(tokenHash, tokenType, nowTimestamp)
      .first<OAuthTokenRow>()
    return row ? rowToRecord(row) : null
  }

  async revokeByHash(tokenHash: string, nowTimestamp: number): Promise<boolean> {
    const result = await this.db
      .prepare('UPDATE oauth_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL')
      .bind(nowTimestamp, tokenHash)
      .run()
    const changes = (result as unknown as { meta?: { changes?: number } })?.meta?.changes ?? 0
    return changes > 0
  }

  async revokeByAuthorizationCode(authorizationCodeHash: string, nowTimestamp: number): Promise<number> {
    const result = await this.db
      .prepare(
        'UPDATE oauth_tokens SET revoked_at = ? WHERE authorization_code_hash = ? AND revoked_at IS NULL'
      )
      .bind(nowTimestamp, authorizationCodeHash)
      .run()
    return (result as unknown as { meta?: { changes?: number } })?.meta?.changes ?? 0
  }

  async revokeAllForClientAndUser(clientId: string, userId: string, nowTimestamp: number): Promise<number> {
    const result = await this.db
      .prepare(
        'UPDATE oauth_tokens SET revoked_at = ? WHERE client_id = ? AND user_id = ? AND revoked_at IS NULL'
      )
      .bind(nowTimestamp, clientId, userId)
      .run()
    return (result as unknown as { meta?: { changes?: number } })?.meta?.changes ?? 0
  }

  async listAuthorizedClientsForUser(userId: string, nowTimestamp: number): Promise<AuthorizedClientSummary[]> {
    const { results } = await this.db
      .prepare(
        `SELECT t.client_id AS client_id,
                c.name      AS client_name,
                t.scope     AS scope,
                MAX(t.created_at) AS last_issued_at
         FROM oauth_tokens t
         JOIN oauth_clients c ON c.client_id = t.client_id
         WHERE t.user_id = ? AND t.revoked_at IS NULL AND t.expires_at > ?
         GROUP BY t.client_id
         ORDER BY last_issued_at DESC`
      )
      .bind(userId, nowTimestamp)
      .all<AuthorizedClientRow>()
    return (results ?? []).map(row => ({
      clientId: row.client_id,
      clientName: row.client_name,
      scope: parseScopeString(row.scope) ?? [],
      lastIssuedAt: row.last_issued_at,
    }))
  }
}
