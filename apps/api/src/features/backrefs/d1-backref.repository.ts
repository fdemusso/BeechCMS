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

  async entryExists(seedOrSlug: Seed | string, id: string): Promise<boolean> {
    const slug = typeof seedOrSlug === 'string' ? seedOrSlug : seedOrSlug.slug
    const softDelete = typeof seedOrSlug === 'string' ? false : !!seedOrSlug.softDelete
    const clause = softDelete ? ' AND deleted_at IS NULL' : ''
    const row = await this.db
      .prepare(`SELECT id FROM content_${slug} WHERE id = ?${clause} LIMIT 1`)
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
      const softDeleteClause = sourceSeed.softDelete ? ' AND deleted_at IS NULL' : ''
      const [rowsResult, countResult] = await Promise.all([
        this.db
          .prepare(
            `SELECT id, status, updated_at, ${displayCol} AS displayName
               FROM content_${source.sourceSlug}
              WHERE ${source.branchAlias} = ?${softDeleteClause}
              ORDER BY updated_at DESC
              LIMIT ? OFFSET ?`,
          )
          .bind(targetId, limit, offset)
          .all<BackrefItem>(),
        this.db
          .prepare(
            `SELECT COUNT(*) AS total FROM content_${source.sourceSlug} WHERE ${source.branchAlias} = ?${softDeleteClause}`,
          )
          .bind(targetId)
          .first<{ total: number }>(),
      ])
      return { items: rowsResult.results ?? [], total: countResult?.total ?? 0 }
    }

    const joinTable = `rel_${source.sourceSlug}_${source.branchAlias}`
    const softDeleteClause = sourceSeed.softDelete ? ' AND c.deleted_at IS NULL' : ''
    const countSql = sourceSeed.softDelete
      ? `SELECT COUNT(DISTINCT r.parent_id) AS total FROM ${joinTable} r JOIN content_${source.sourceSlug} c ON r.parent_id = c.id WHERE r.target_id = ? AND c.deleted_at IS NULL`
      : `SELECT COUNT(DISTINCT parent_id) AS total FROM ${joinTable} WHERE target_id = ?`

    const [rowsResult, countResult] = await Promise.all([
      this.db
        .prepare(
          `SELECT c.id, c.status, c.updated_at, c.${displayCol} AS displayName
             FROM content_${source.sourceSlug} c
             JOIN ${joinTable} r ON r.parent_id = c.id
            WHERE r.target_id = ?${softDeleteClause}
            ORDER BY c.updated_at DESC
            LIMIT ? OFFSET ?`,
        )
        .bind(targetId, limit, offset)
        .all<BackrefItem>(),
      this.db
        .prepare(countSql)
        .bind(targetId)
        .first<{ total: number }>(),
    ])
    return { items: rowsResult.results ?? [], total: countResult?.total ?? 0 }
  }
}
