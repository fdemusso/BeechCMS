// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { BackrefSource, Seed } from '@beechcms/core'

export interface BackrefItem {
  id: string
  displayName: string | null
  status: string
  updated_at: number | null
}

export interface QueryGroupResult {
  items: BackrefItem[]
  total: number
}

export class D1BackrefRepository {
  constructor(private readonly db: D1Database) {}

  async entryExists(slug: string, id: string): Promise<boolean> {
    const row = await this.db
      .prepare(`SELECT id FROM content_${slug} WHERE id = ? LIMIT 1`)
      .bind(id)
      .first<{ id: string }>()
    return row !== null
  }

  async queryGroup(
    source: BackrefSource,
    sourceSeed: Seed,
    targetId: string,
    limit: number,
    offset: number,
  ): Promise<QueryGroupResult> {
    const displayCol = sourceSeed.displayNameAlias

    if (source.relationship === 'single') {
      const [rowsResult, countResult] = await Promise.all([
        this.db
          .prepare(
            `SELECT id, status, updated_at, ${displayCol} AS displayName
               FROM content_${source.sourceSlug}
              WHERE ${source.branchAlias} = ?
              ORDER BY updated_at DESC
              LIMIT ? OFFSET ?`,
          )
          .bind(targetId, limit, offset)
          .all<BackrefItem>(),
        this.db
          .prepare(
            `SELECT COUNT(*) AS total FROM content_${source.sourceSlug} WHERE ${source.branchAlias} = ?`,
          )
          .bind(targetId)
          .first<{ total: number }>(),
      ])
      return { items: rowsResult.results ?? [], total: countResult?.total ?? 0 }
    }

    const joinTable = `rel_${source.sourceSlug}_${source.branchAlias}`
    const [rowsResult, countResult] = await Promise.all([
      this.db
        .prepare(
          `SELECT c.id, c.status, c.updated_at, c.${displayCol} AS displayName
             FROM content_${source.sourceSlug} c
             JOIN ${joinTable} r ON r.parent_id = c.id
            WHERE r.target_id = ?
            ORDER BY c.updated_at DESC
            LIMIT ? OFFSET ?`,
        )
        .bind(targetId, limit, offset)
        .all<BackrefItem>(),
      this.db
        .prepare(
          `SELECT COUNT(DISTINCT parent_id) AS total FROM ${joinTable} WHERE target_id = ?`,
        )
        .bind(targetId)
        .first<{ total: number }>(),
    ])
    return { items: rowsResult.results ?? [], total: countResult?.total ?? 0 }
  }
}
