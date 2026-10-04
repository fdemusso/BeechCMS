// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import {
  contentViewConfigSchema,
  emptyViewConfig,
  type ContentViewConfig,
  type ContentViewPatch,
  type ContentViewRecord,
  type DashboardView,
  type IClock,
  type IContentViewRepository,
  type IIdGenerator,
  type NewContentView,
  type RemoveContentViewResult,
} from '@beechcms/core'

interface SeedViewRow {
  id: string
  seed_slug: string
  view_type: string
  title: string | null
  position: number
  config: string
  created_at: number
  updated_at: number
  updated_by: string
}

const COLUMNS = 'id, seed_slug, view_type, title, position, config, created_at, updated_at, updated_by'

/** A corrupt or pre-schema blob reads as an empty config instead of failing the whole list. */
function parseConfig(raw: string): ContentViewConfig {
  try {
    const parsed = contentViewConfigSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : emptyViewConfig()
  } catch {
    return emptyViewConfig()
  }
}

function toRecord(row: SeedViewRow): ContentViewRecord {
  return {
    id: row.id,
    seedSlug: row.seed_slug,
    type: row.view_type,
    title: row.title,
    position: row.position,
    config: parseConfig(row.config),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  }
}

export class D1ContentViewRepository implements IContentViewRepository {
  constructor(
    private readonly db: D1Database,
    private readonly ids: IIdGenerator,
    private readonly clock: IClock,
  ) {}

  private nowSeconds(): number {
    return Math.floor(this.clock.now() / 1000)
  }

  async listBySeed(seedSlug: string): Promise<ContentViewRecord[]> {
    const rs = await this.db
      .prepare(`SELECT ${COLUMNS} FROM seed_views WHERE seed_slug = ? ORDER BY position ASC, created_at ASC, id ASC`)
      .bind(seedSlug)
      .all<SeedViewRow>()
    return (rs.results ?? []).map(toRecord)
  }

  async get(seedSlug: string, id: string): Promise<ContentViewRecord | null> {
    const row = await this.db
      .prepare(`SELECT ${COLUMNS} FROM seed_views WHERE seed_slug = ? AND id = ? LIMIT 1`)
      .bind(seedSlug, id)
      .first<SeedViewRow>()
    return row ? toRecord(row) : null
  }

  async ensureDefaults(seedSlug: string, types: readonly DashboardView[], updatedBy: string): Promise<void> {
    if (types.length === 0) return
    const now = this.nowSeconds()
    const sql = `
      INSERT INTO seed_views (id, seed_slug, view_type, title, position, config, created_at, updated_at, updated_by)
      SELECT ?, ?, ?, NULL, ?, '{}', ?, ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM seed_views WHERE seed_slug = ? AND view_type = ?)`
    await this.db.batch(
      types.map((type, position) =>
        this.db.prepare(sql).bind(this.ids.uuid(), seedSlug, type, position, now, now, updatedBy, seedSlug, type),
      ),
    )
  }

  async create(input: NewContentView, updatedBy: string): Promise<ContentViewRecord> {
    const now = this.nowSeconds()
    const row = await this.db
      .prepare(`
        INSERT INTO seed_views (id, seed_slug, view_type, title, position, config, created_at, updated_at, updated_by)
        VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM seed_views WHERE seed_slug = ?), ?, ?, ?, ?)
        RETURNING ${COLUMNS}`)
      .bind(this.ids.uuid(), input.seedSlug, input.type, input.title, input.seedSlug,
        JSON.stringify(input.config), now, now, updatedBy)
      .first<SeedViewRow>()
    if (!row) throw new Error('seed_views insert returned no row')
    return toRecord(row)
  }

  async update(
    seedSlug: string,
    id: string,
    patch: ContentViewPatch,
    updatedBy: string,
  ): Promise<ContentViewRecord | null> {
    // Field-level CASE/COALESCE instead of read-modify-write: a rename and a config save racing
    // on the same row must both land.
    const row = await this.db
      .prepare(`
        UPDATE seed_views
        SET title      = CASE WHEN ? = 1 THEN ? ELSE title END,
            config     = COALESCE(?, config),
            updated_at = ?,
            updated_by = ?
        WHERE seed_slug = ? AND id = ?
        RETURNING ${COLUMNS}`)
      .bind(
        patch.title !== undefined ? 1 : 0,
        patch.title ?? null,
        patch.config ? JSON.stringify(patch.config) : null,
        this.nowSeconds(),
        updatedBy,
        seedSlug,
        id,
      )
      .first<SeedViewRow>()
    return row ? toRecord(row) : null
  }

  async remove(seedSlug: string, id: string): Promise<RemoveContentViewResult> {
    // The COUNT guard sits in the DELETE itself: two concurrent deletes of the last two Table
    // instances must not both pass a check made before the write.
    const result = await this.db
      .prepare(`
        DELETE FROM seed_views
        WHERE seed_slug = ? AND id = ?
          AND (view_type <> 'table'
               OR (SELECT COUNT(*) FROM seed_views WHERE seed_slug = ? AND view_type = 'table') > 1)`)
      .bind(seedSlug, id, seedSlug)
      .run()
    if (result.meta.changes > 0) return 'deleted'
    return (await this.get(seedSlug, id)) ? 'last-table' : 'not-found'
  }

  async reorder(seedSlug: string, orderedIds: readonly string[], updatedBy: string): Promise<void> {
    if (orderedIds.length === 0) return
    const now = this.nowSeconds()
    const sql = 'UPDATE seed_views SET position = ?, updated_at = ?, updated_by = ? WHERE seed_slug = ? AND id = ?'
    await this.db.batch(
      orderedIds.map((id, position) => this.db.prepare(sql).bind(position, now, updatedBy, seedSlug, id)),
    )
  }
}
