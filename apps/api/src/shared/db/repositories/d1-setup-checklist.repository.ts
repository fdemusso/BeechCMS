// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />

export interface ISetupChecklistRepository {
  getExistingTableNames(): Promise<Set<string>>
  countAdmins(): Promise<number>
  countEntriesInSeed(slug: string): Promise<number>
}

export class D1SetupChecklistRepository implements ISetupChecklistRepository {
  constructor(private readonly db: D1Database) {}

  async getExistingTableNames(): Promise<Set<string>> {
    const result = await this.db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
      .all<{ name: string }>()
    return new Set((result.results ?? []).map(row => row.name))
  }

  async countAdmins(): Promise<number> {
    const result = await this.db
      .prepare(`SELECT COUNT(*) as count FROM users WHERE role = 'admin'`)
      .first<{ count: number }>()
    return result?.count ?? 0
  }

  async countEntriesInSeed(slug: string): Promise<number> {
    const result = await this.db
      .prepare(`SELECT COUNT(*) as count FROM content_${slug}`)
      .first<{ count: number }>()
    return result?.count ?? 0
  }
}
