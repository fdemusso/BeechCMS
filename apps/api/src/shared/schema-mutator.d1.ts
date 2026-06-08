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

  // --- destructive (sprint 06 — Danger Zone) -------------------------------
  // These emit IRREVERSIBLE SQL. Identifiers cannot be parameterized in DDL, so
  // every table/column name is validated against the same `^[A-Za-z0-9_]+$`
  // guard getColumns already applies before interpolation.

  private static assertIdentifier(name: string): void {
    if (!/^[A-Za-z0-9_]+$/.test(name)) throw new Error(`Unsafe identifier: ${name}`)
  }

  async dropTable(table: string): Promise<void> {
    D1SchemaMutator.assertIdentifier(table)
    await this.db.prepare(`DROP TABLE IF EXISTS ${table}`).run()
  }

  async dropColumn(table: string, column: string): Promise<void> {
    D1SchemaMutator.assertIdentifier(table)
    D1SchemaMutator.assertIdentifier(column)
    await this.db.prepare(`ALTER TABLE ${table} DROP COLUMN ${column}`).run()
  }

  async renameColumn(table: string, from: string, to: string): Promise<void> {
    D1SchemaMutator.assertIdentifier(table)
    D1SchemaMutator.assertIdentifier(from)
    D1SchemaMutator.assertIdentifier(to)
    await this.db.prepare(`ALTER TABLE ${table} RENAME COLUMN ${from} TO ${to}`).run()
  }

  async execDestructive(statements: string[]): Promise<void> {
    if (statements.length === 0) return
    // The statements come from the core destructive generators
    // (generateDropTable / generateRetypeColumn / planFtsRebuild), which only
    // interpolate slugs/aliases already validated by the seed registry
    // (`^[a-z0-9_]+$`). FTS trigger bodies legitimately contain internal
    // semicolons (BEGIN … ; END), so we do not split or reject on `;`.
    // D1 batch is atomic per call; if one statement fails, the rest roll back.
    await this.db.batch(statements.map(s => this.db.prepare(s)))
  }
}
