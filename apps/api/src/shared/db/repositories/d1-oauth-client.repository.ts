// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { IOAuthClientRepository, OAuthClientRecord } from '@beechcms/core'
import { parseScopeString } from '@beechcms/core'

type OAuthClientRow = {
  client_id: string
  name: string
  redirect_uris: string
  allowed_scopes: string
  is_public: number
  created_at: number
  disabled_at: number | null
}

function rowToRecord(row: OAuthClientRow): OAuthClientRecord {
  let redirectUris: string[]
  try {
    redirectUris = JSON.parse(row.redirect_uris)
  } catch {
    redirectUris = []
  }
  return {
    clientId: row.client_id,
    name: row.name,
    redirectUris,
    allowedScopes: parseScopeString(row.allowed_scopes) ?? [],
    isPublic: row.is_public === 1,
    createdAt: row.created_at,
    disabledAt: row.disabled_at,
  }
}

export class D1OAuthClientRepository implements IOAuthClientRepository {
  constructor(private readonly db: D1Database) {}

  async findActiveById(clientId: string): Promise<OAuthClientRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT client_id, name, redirect_uris, allowed_scopes, is_public, created_at, disabled_at
         FROM oauth_clients
         WHERE client_id = ? AND disabled_at IS NULL
         LIMIT 1`
      )
      .bind(clientId)
      .first<OAuthClientRow>()
    return row ? rowToRecord(row) : null
  }
}
