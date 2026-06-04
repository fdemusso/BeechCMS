// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { ISchemaMutator } from '@beechcms/core'

export class D1SchemaMutator implements ISchemaMutator {
  constructor(private readonly db: D1Database) {}

  async getColumns(table: string): Promise<Set<string> | null> {
    // PRAGMA table_info returns rows {cid,name,type,notnull,dflt_value,pk}.
    // Table name cannot be parameterized in PRAGMA — validate it is a safe identifier.
    if (!/^[A-Za-z0-9_]+$/.test(table)) throw new Error(`Unsafe table name: ${table}`)
    const rs = await this.db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>()
    const rows = rs.results ?? []
    if (rows.length === 0) return null // table absent
    return new Set(rows.map(r => r.name))
  }

  async execDdl(statements: string[]): Promise<void> {
    if (statements.length === 0) return
    // D1 batch is atomic per call; if one statement fails, the rest roll back.
    await this.db.batch(statements.map(s => this.db.prepare(s)))
  }
}
