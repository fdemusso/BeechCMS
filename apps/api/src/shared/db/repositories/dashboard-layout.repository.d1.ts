// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { IDashboardLayoutRepository, DashboardLayoutRecord, DashboardLayout } from '@beechcms/core'

export class D1DashboardLayoutRepository implements IDashboardLayoutRepository {
  constructor(private readonly db: D1Database) {}

  async get(scope: string): Promise<DashboardLayoutRecord | null> {
    const row = await this.db
      .prepare('SELECT scope, layout, updated_at, updated_by FROM dashboard_layouts WHERE scope = ? LIMIT 1')
      .bind(scope)
      .first<{ scope: string; layout: string; updated_at: number; updated_by: string }>()
    if (!row) return null
    try {
      return {
        scope: row.scope,
        layout: JSON.parse(row.layout) as DashboardLayout,
        updatedAt: row.updated_at,
        updatedBy: row.updated_by,
      }
    } catch {
      return null
    }
  }

  async listScopes(): Promise<string[]> {
    const rs = await this.db
      .prepare('SELECT scope FROM dashboard_layouts')
      .all<{ scope: string }>()
    return (rs.results ?? []).map((r) => r.scope)
  }

  async upsert(scope: string, layout: DashboardLayout, updatedBy: string): Promise<void> {
    const json = JSON.stringify(layout)
    const now = Math.floor(Date.now() / 1000)
    await this.db
      .prepare(`
        INSERT INTO dashboard_layouts (scope, layout, updated_at, updated_by)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(scope) DO UPDATE SET
          layout     = excluded.layout,
          updated_at = excluded.updated_at,
          updated_by = excluded.updated_by
      `)
      .bind(scope, json, now, updatedBy)
      .run()
  }

  async remove(scope: string): Promise<void> {
    await this.db
      .prepare('DELETE FROM dashboard_layouts WHERE scope = ?')
      .bind(scope)
      .run()
  }
}
