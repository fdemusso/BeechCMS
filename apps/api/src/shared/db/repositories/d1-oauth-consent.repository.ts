// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { IOAuthConsentRepository, ConsentRecord, OAuthScope, IIdGenerator } from '@beechcms/core'
import { parseScopeString, formatScopes } from '@beechcms/core'

type OAuthConsentRow = {
  id: string
  client_id: string
  user_id: string
  scopes: string
  created_at: number
  updated_at: number
  revoked_at: number | null
}

function rowToRecord(row: OAuthConsentRow): ConsentRecord {
  return {
    id: row.id,
    clientId: row.client_id,
    userId: row.user_id,
    scopes: parseScopeString(row.scopes) ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revokedAt: row.revoked_at,
  }
}

export class D1OAuthConsentRepository implements IOAuthConsentRepository {
  constructor(
    private readonly db: D1Database,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async findActive(clientId: string, userId: string): Promise<ConsentRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT id, client_id, user_id, scopes, created_at, updated_at, revoked_at
         FROM oauth_consents
         WHERE client_id = ? AND user_id = ? AND revoked_at IS NULL
         LIMIT 1`
      )
      .bind(clientId, userId)
      .first<OAuthConsentRow>()
    return row ? rowToRecord(row) : null
  }

  async grant(
    id: string,
    clientId: string,
    userId: string,
    scopes: readonly OAuthScope[],
    nowTimestamp: number,
  ): Promise<void> {
    // Atomic upsert: SET expression unions old scopes (pre-update value,
    // referenced directly per SQLite ON CONFLICT semantics) with the new
    // ones, token-by-token, so no read-then-write race can drop a scope.
    const uniqueScopes = [...new Set(scopes)]
    const binds: unknown[] = []
    let scopesExpr = 'oauth_consents.scopes'
    for (const scope of uniqueScopes) {
      scopesExpr = `CASE WHEN (' ' || ${scopesExpr} || ' ') LIKE ('% ' || ? || ' %') THEN ${scopesExpr} ELSE TRIM(${scopesExpr} || ' ' || ?) END`
      binds.push(scope, scope)
    }
    await this.db
      .prepare(
        `INSERT INTO oauth_consents (id, client_id, user_id, scopes, created_at, updated_at, revoked_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT(client_id, user_id) DO UPDATE SET
           scopes = ${scopesExpr},
           updated_at = excluded.updated_at,
           revoked_at = NULL`
      )
      .bind(id, clientId, userId, formatScopes(scopes), nowTimestamp, nowTimestamp, ...binds)
      .run()
  }

  async revoke(clientId: string, userId: string, nowTimestamp: number): Promise<boolean> {
    const result = await this.db
      .prepare(
        'UPDATE oauth_consents SET revoked_at = ?, updated_at = ? WHERE client_id = ? AND user_id = ? AND revoked_at IS NULL'
      )
      .bind(nowTimestamp, nowTimestamp, clientId, userId)
      .run()
    const changes = (result as unknown as { meta?: { changes?: number } })?.meta?.changes ?? 0
    return changes > 0
  }

  async listForUser(userId: string): Promise<ConsentRecord[]> {
    const { results } = await this.db
      .prepare(
        `SELECT id, client_id, user_id, scopes, created_at, updated_at, revoked_at
         FROM oauth_consents
         WHERE user_id = ? AND revoked_at IS NULL
         ORDER BY updated_at DESC`
      )
      .bind(userId)
      .all<OAuthConsentRow>()
    return (results ?? []).map(rowToRecord)
  }
}
