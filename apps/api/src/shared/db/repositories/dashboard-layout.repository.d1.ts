// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type {
  IDashboardLayoutRepository,
  DashboardLayoutRecord,
  DashboardLayoutWriteResult,
  DashboardLayout,
  IClock,
} from '@beechcms/core'

export class D1DashboardLayoutRepository implements IDashboardLayoutRepository {
  constructor(
    private readonly db: D1Database,
    private readonly clock: IClock,
  ) {}

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

  async save(
    scope: string,
    layout: DashboardLayout,
    updatedBy: string,
    expectedUpdatedAt: number | null,
  ): Promise<DashboardLayoutWriteResult> {
    const json = JSON.stringify(layout)
    const now = this.clock.nowSeconds()
    // MAX(now, updated_at + 1) keeps the version strictly increasing under a frozen or coarse clock.
    const written =
      expectedUpdatedAt === null
        ? await this.db
            .prepare(`
              INSERT INTO dashboard_layouts (scope, layout, updated_at, updated_by)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(scope) DO NOTHING
              RETURNING updated_at
            `)
            .bind(scope, json, now, updatedBy)
            .first<{ updated_at: number }>()
        : await this.db
            .prepare(`
              UPDATE dashboard_layouts
              SET layout = ?, updated_at = MAX(?, updated_at + 1), updated_by = ?
              WHERE scope = ? AND updated_at = ?
              RETURNING updated_at
            `)
            .bind(json, now, updatedBy, scope, expectedUpdatedAt)
            .first<{ updated_at: number }>()

    return written ? { ok: true, updatedAt: written.updated_at } : { ok: false }
  }

  async remove(scope: string, expectedUpdatedAt: number | null): Promise<DashboardLayoutWriteResult> {
    if (expectedUpdatedAt === null) {
      const present = await this.db
        .prepare('SELECT 1 AS present FROM dashboard_layouts WHERE scope = ? LIMIT 1')
        .bind(scope)
        .first<{ present: number }>()
      return present ? { ok: false } : { ok: true, updatedAt: null }
    }

    const removal = await this.db
      .prepare('DELETE FROM dashboard_layouts WHERE scope = ? AND updated_at = ?')
      .bind(scope, expectedUpdatedAt)
      .run()
    return removal.meta.changes === 1 ? { ok: true, updatedAt: null } : { ok: false }
  }
}
