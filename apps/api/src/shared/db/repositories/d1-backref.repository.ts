// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { activeClause, type BackrefItem, type BackrefSource, type IBackrefRepository, type QueryGroupResult, type Seed } from '@beechcms/core'

export class D1BackrefRepository implements IBackrefRepository {
  constructor(private readonly db: D1Database) {}

  async entryExists(seedOrSlug: Seed | string, id: string): Promise<boolean> {
    const seed = typeof seedOrSlug === 'string' ? ({ slug: seedOrSlug } as Seed) : seedOrSlug
    const row = await this.db
      .prepare(`SELECT id FROM content_${seed.slug} WHERE id = ?${activeClause(seed)} LIMIT 1`)
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
      const softDeleteClause = activeClause(sourceSeed)
      const [rowsResult, countResult] = await Promise.all([
        this.db
          .prepare(
            `SELECT id, status, updated_at, ${displayCol} AS displayName
               FROM content_${source.sourceSlug}
              WHERE ${source.branchAlias} = ?${softDeleteClause}
              ORDER BY updated_at DESC, id
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
    const softDeleteClause = activeClause(sourceSeed, 'active', 'c')
    const countSql =
      `SELECT COUNT(DISTINCT r.parent_id) AS total FROM ${joinTable} r JOIN content_${source.sourceSlug} c ON r.parent_id = c.id WHERE r.target_id = ?${softDeleteClause}`

    const [rowsResult, countResult] = await Promise.all([
      this.db
        .prepare(
          `SELECT c.id, c.status, c.updated_at, c.${displayCol} AS displayName
             FROM content_${source.sourceSlug} c
             JOIN ${joinTable} r ON r.parent_id = c.id
            WHERE r.target_id = ?${softDeleteClause}
            ORDER BY c.updated_at DESC, c.id
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
