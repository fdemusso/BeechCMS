// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { seedViewConfigSchema, type ISeedLayoutRepository, type SeedLayoutRecord, type FormLayout, type SeedViewConfig } from '@beechcms/core'

export class D1SeedLayoutRepository implements ISeedLayoutRepository {
  constructor(private readonly db: D1Database) {}

  async get(slug: string): Promise<SeedLayoutRecord | null> {
    const row = await this.db
      .prepare('SELECT slug, layout, updated_at, updated_by FROM seed_layouts WHERE slug = ? LIMIT 1')
      .bind(slug)
      .first<{ slug: string; layout: string; updated_at: number; updated_by: string }>()
    if (!row) return null
    return {
      slug: row.slug,
      layout: JSON.parse(row.layout) as FormLayout,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
    }
  }

  async getAllAsMap(): Promise<Map<string, FormLayout>> {
    const rs = await this.db
      .prepare('SELECT slug, layout FROM seed_layouts')
      .all<{ slug: string; layout: string }>()
    const map = new Map<string, FormLayout>()
    for (const r of (rs.results ?? [])) {
      try {
        map.set(r.slug, JSON.parse(r.layout) as FormLayout)
      } catch {
        // skip corrupt row
      }
    }
    return map
  }

  async upsert(slug: string, layout: FormLayout, updatedBy: string): Promise<void> {
    const json = JSON.stringify(layout)
    const now = Math.floor(Date.now() / 1000)
    await this.db
      .prepare(`
        INSERT INTO seed_layouts (slug, layout, updated_at, updated_by)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(slug) DO UPDATE SET
          layout     = excluded.layout,
          updated_at = excluded.updated_at,
          updated_by = excluded.updated_by
      `)
      .bind(slug, json, now, updatedBy)
      .run()
  }

  async remove(slug: string): Promise<void> {
    await this.db
      .prepare('DELETE FROM seed_layouts WHERE slug = ?')
      .bind(slug)
      .run()
  }

  async getViewConfig(slug: string): Promise<SeedViewConfig | null> {
    const row = await this.db
      .prepare('SELECT view_config FROM seed_layouts WHERE slug = ?')
      .bind(slug)
      .first<{ view_config: string | null }>()
    if (!row?.view_config) return null
    return seedViewConfigSchema.parse(JSON.parse(row.view_config))
  }

  async setViewConfig(slug: string, config: SeedViewConfig, updatedBy: string): Promise<void> {
    const json = JSON.stringify(config)
    await this.db.prepare(`
      INSERT INTO seed_layouts (slug, layout, view_config, updated_at, updated_by)
      VALUES (?, '{}', ?, unixepoch(), ?)
      ON CONFLICT(slug) DO UPDATE SET
        view_config = excluded.view_config,
        updated_at  = excluded.updated_at,
        updated_by  = excluded.updated_by
    `).bind(slug, json, updatedBy).run()
  }
}
