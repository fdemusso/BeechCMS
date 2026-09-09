// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import pc from 'picocolors'
import type { Seed } from '@beechcms/core'
import { getExpectedColumns } from '@beechcms/core'
import type { WranglerOptions, D1Row } from './wrangler.js'
import { queryD1 } from './wrangler.js'

interface PragmaRow extends D1Row {
  name: string
  type: string
  notnull: number
  pk: number
}

interface FkRow extends D1Row {
  id: number
  seq: number
  table: string
  from: string
  to: string
  on_update: string
  on_delete: string
  match: string
}

interface IndexRow extends D1Row {
  seq: number
  name: string
  unique: number
}

export interface ColumnDiff {
  name: string
  status: 'ok' | 'missing' | 'extra' | 'type_mismatch' | 'fk_missing' | 'fk_mismatch' | 'index_missing'
  expectedType?: string
  actualType?: string
  /** For fk_missing/fk_mismatch: expected FK target table */
  expectedTarget?: string
  /** For fk_mismatch: what the DB actually has */
  expected?: string
  actual?: string
}

export interface SeedDiff {
  slug: string
  tableExists: boolean
  columns: ColumnDiff[]
}

/** Returns true if the seed's table fully matches its Seed (no drift). */
export function isSeedClean(diff: SeedDiff): boolean {
  return diff.tableExists && diff.columns.every(c => c.status === 'ok')
}

/** Human-readable drift report for one seed. Pure formatting — no I/O decisions. */
export function renderSeedDiff(diff: SeedDiff): void {
  const table = `content_${diff.slug}`
  if (!diff.tableExists) { console.log(pc.red(`  ✗ ${table} — table missing`)); return }
  const problems = diff.columns.filter(c => c.status !== 'ok')
  if (problems.length === 0) { console.log(pc.green(`  ✓ ${table}`)); return }
  console.log(pc.yellow(`  ⚠ ${table}`))
  for (const col of problems) {
    switch (col.status) {
      case 'missing':       console.log(pc.red(`    + missing column: ${col.name} ${col.expectedType}`)); break
      case 'extra':         console.log(pc.dim(`    ~ orphaned column: "${col.name}" (${col.actualType}) — in DB, not in schema definition`)); break
      case 'type_mismatch': console.log(pc.red(`    ≠ type mismatch:  ${col.name} (expected ${col.expectedType}, got ${col.actualType})`)); break
      case 'fk_missing':    console.log(pc.red(`    ⤬ missing FK: ${col.name} → content_${col.expectedTarget}(id)`)); break
      case 'fk_mismatch':   console.log(pc.yellow(`    ⤬ FK mismatch: ${col.name} expected ${col.expected}, got ${col.actual}`)); break
      case 'index_missing': console.log(pc.yellow(`    ⊘ missing index on ${col.name}`)); break
    }
  }
}

export async function diffSeed(seed: Seed, options: WranglerOptions): Promise<SeedDiff> {
  const tableName = `content_${seed.slug}`
  const expected = getExpectedColumns(seed)

  let actual: PragmaRow[]
  try {
    actual = queryD1<PragmaRow>(`PRAGMA table_info(${tableName})`, options)
  } catch {
    return { slug: seed.slug, tableExists: false, columns: expected.map(c => ({ name: c.name, status: 'missing', expectedType: c.sqlType })) }
  }

  if (actual.length === 0) {
    return { slug: seed.slug, tableExists: false, columns: expected.map(c => ({ name: c.name, status: 'missing', expectedType: c.sqlType })) }
  }

  const actualMap = new Map<string, PragmaRow>(actual.map(r => [r.name, r]))
  const expectedSet = new Set<string>(expected.map(c => c.name))

  const columns: ColumnDiff[] = []

  // ── Column presence + type checks ────────────────────────────────────────
  for (const col of expected) {
    const actualRow = actualMap.get(col.name)
    if (!actualRow) {
      columns.push({ name: col.name, status: 'missing', expectedType: col.sqlType })
    } else if (actualRow.type.toUpperCase() !== col.sqlType) {
      columns.push({ name: col.name, status: 'type_mismatch', expectedType: col.sqlType, actualType: actualRow.type })
    } else {
      columns.push({ name: col.name, status: 'ok' })
    }
  }

  for (const row of actual) {
    if (!expectedSet.has(row.name)) {
      columns.push({ name: row.name, status: 'extra', actualType: row.type })
    }
  }

  // ── FK + index checks for relation branches ──────────────────────────────
  const relationBranches = seed.branches.filter(b => b.type === 'relation' && b.targetSeed)

  if (relationBranches.length > 0) {
    let fkList: FkRow[] = []
    let indexList: IndexRow[] = []
    try {
      fkList = queryD1<FkRow>(`PRAGMA foreign_key_list(${tableName})`, options)
      indexList = queryD1<IndexRow>(`PRAGMA index_list(${tableName})`, options)
    } catch {
      // If PRAGMA fails (table may not exist yet), skip FK checks
    }

    // Build maps for fast lookup
    // fkList has one row per FK column; `from` = local col, `table` = referenced table
    const fkByCol = new Map<string, FkRow>()
    for (const fk of fkList) {
      fkByCol.set(fk.from, fk)
    }
    const indexNames = new Set(indexList.map(i => i.name))

    for (const branch of relationBranches) {
      const expectedFkTable = `content_${branch.targetSeed}`
      const expectedOnDelete = (branch.onDelete ?? 'SET NULL').toUpperCase()
      const expectedIndexName = `idx_${seed.slug}_${branch.alias}`

      // Find column diff entry for this branch (already evaluated above)
      const colDiff = columns.find(c => c.name === branch.alias)
      if (!colDiff || colDiff.status === 'missing') continue // already flagged

      const fk = fkByCol.get(branch.alias)

      if (!fk) {
        // Column exists but no FK
        colDiff.status = 'fk_missing'
        colDiff.expectedTarget = branch.targetSeed
      } else {
        const actualTable = fk.table
        const actualOnDelete = fk.on_delete.toUpperCase()
        if (actualTable !== expectedFkTable || actualOnDelete !== expectedOnDelete) {
          colDiff.status = 'fk_mismatch'
          colDiff.expected = `→ ${expectedFkTable}(id) ON DELETE ${expectedOnDelete}`
          colDiff.actual = `→ ${actualTable}(id) ON DELETE ${actualOnDelete}`
          colDiff.expectedTarget = branch.targetSeed
        }
      }

      // Check index separately (can coexist with fk status)
      if (!indexNames.has(expectedIndexName)) {
        // Only add index_missing if the column is otherwise OK (FK issue takes precedence)
        if (colDiff.status === 'ok') {
          colDiff.status = 'index_missing'
        } else {
          // Append index info to the existing diff row as a separate entry
          columns.push({ name: branch.alias, status: 'index_missing' })
        }
      }
    }
  }

  return { slug: seed.slug, tableExists: true, columns }
}
