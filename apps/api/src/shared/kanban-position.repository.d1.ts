// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { IKanbanPositionRepository, KanbanPositionRecord } from '@beechcms/core'

export class D1KanbanPositionRepository implements IKanbanPositionRepository {
  constructor(private readonly db: D1Database) {}

  async getColumn(seedSlug: string, axisBranchId: string): Promise<Map<string, string>> {
    const rs = await this.db
      .prepare('SELECT entry_id, position FROM kanban_positions WHERE seed_slug = ? AND axis_branch_id = ?')
      .bind(seedSlug, axisBranchId)
      .all<{ entry_id: string; position: string }>()
    const map = new Map<string, string>()
    for (const row of rs.results ?? []) {
      map.set(row.entry_id, row.position)
    }
    return map
  }

  async setPosition(seedSlug: string, entryId: string, axisBranchId: string, position: string): Promise<void> {
    await this.db.prepare(`
      INSERT INTO kanban_positions (seed_slug, entry_id, axis_branch_id, position, updated_at)
      VALUES (?, ?, ?, ?, unixepoch())
      ON CONFLICT(seed_slug, entry_id, axis_branch_id)
        DO UPDATE SET position = excluded.position, updated_at = excluded.updated_at
    `).bind(seedSlug, entryId, axisBranchId, position).run()
  }

  async remove(seedSlug: string, entryId: string, axisBranchId: string): Promise<void> {
    await this.db
      .prepare('DELETE FROM kanban_positions WHERE seed_slug = ? AND entry_id = ? AND axis_branch_id = ?')
      .bind(seedSlug, entryId, axisBranchId)
      .run()
  }

  async rebalance(seedSlug: string, axisBranchId: string, ordered: KanbanPositionRecord[]): Promise<void> {
    if (ordered.length === 0) return
    const stmts = ordered.map(r =>
      this.db.prepare(`
        INSERT INTO kanban_positions (seed_slug, entry_id, axis_branch_id, position, updated_at)
        VALUES (?, ?, ?, ?, unixepoch())
        ON CONFLICT(seed_slug, entry_id, axis_branch_id)
          DO UPDATE SET position = excluded.position, updated_at = excluded.updated_at
      `).bind(seedSlug, r.entryId, axisBranchId, r.position)
    )
    await this.db.batch(stmts)
  }
}
