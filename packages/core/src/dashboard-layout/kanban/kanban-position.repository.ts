// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export interface KanbanPositionRecord {
  entryId: string
  position: string
}

/**
 * Persistence contract for card ordering. The ONLY gateway to `kanban_positions`.
 * Handlers and the dashboard never touch the table directly (Botanical invariant).
 */
export interface IKanbanPositionRepository {
  /** entryId → position for one column axis (entries without a row are omitted). */
  getColumn(seedSlug: string, axisBranchId: string): Promise<Map<string, string>>
  /** Single-row upsert — exactly one write per drag (KB-S04b). */
  setPosition(seedSlug: string, entryId: string, axisBranchId: string, position: string): Promise<void>
  /** Remove an entry's position row (e.g. entry deleted). */
  remove(seedSlug: string, entryId: string, axisBranchId: string): Promise<void>
  /** Async rebalance (KB-S04f): rewrite a whole column's positions in one batch. */
  rebalance(seedSlug: string, axisBranchId: string, ordered: KanbanPositionRecord[]): Promise<void>
}
