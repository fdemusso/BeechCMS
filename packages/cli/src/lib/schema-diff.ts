// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import pc from 'picocolors'
import type { Seed, SchemaQueryExecutor, LiveTable } from '@beechcms/core'
import { getExpectedColumns, introspectTable } from '@beechcms/core'

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

/**
 * Compares one seed's CODE-derived expectation (`getExpectedColumns`) against the table's PHYSICAL
 * state, read through the shared introspection primitive in `@beechcms/core`.
 *
 * The PRAGMA statements this function used to issue itself now live in `engine/introspection.ts`,
 * so the CLI and the Worker read D1 through one definition of "what the live schema is"
 * (feature brief, business rule 1).
 */
export async function diffSeed(seed: Seed, executor: SchemaQueryExecutor): Promise<SeedDiff> {
  const live: LiveTable = await introspectTable(executor, `content_${seed.slug}`)
  const expected = getExpectedColumns(seed)

  if (!live.exists) {
    return {
      slug: seed.slug,
      tableExists: false,
      columns: expected.map(c => ({ name: c.name, status: 'missing' as const, expectedType: c.sqlType })),
    }
  }

  const actualMap = new Map(live.columns.map(c => [c.name, c]))
  const expectedSet = new Set(expected.map(c => c.name))
  const columns: ColumnDiff[] = []

  // ── Column presence + type checks ────────────────────────────────────────
  for (const col of expected) {
    const actual = actualMap.get(col.name)
    if (!actual) {
      columns.push({ name: col.name, status: 'missing', expectedType: col.sqlType })
    } else if (actual.sqlType !== col.sqlType) {
      // `sqlType` arrives already upper-cased from the primitive.
      columns.push({ name: col.name, status: 'type_mismatch', expectedType: col.sqlType, actualType: actual.sqlType })
    } else {
      columns.push({ name: col.name, status: 'ok' })
    }
  }

  for (const actual of live.columns) {
    if (!expectedSet.has(actual.name)) {
      columns.push({ name: actual.name, status: 'extra', actualType: actual.sqlType })
    }
  }

  // ── FK + index checks for relation branches ──────────────────────────────
  const relationBranches = seed.branches.filter(b => b.type === 'relation' && b.targetSeed)
  if (relationBranches.length > 0) {
    const fkByColumn = new Map(live.foreignKeys.map(fk => [fk.column, fk]))
    const indexNames = new Set(live.indexes.map(i => i.name))

    for (const branch of relationBranches) {
      const expectedFkTable = `content_${branch.targetSeed}`
      const expectedOnDelete = (branch.onDelete ?? 'SET NULL').toUpperCase()
      const expectedIndexName = `idx_${seed.slug}_${branch.alias}`

      const colDiff = columns.find(c => c.name === branch.alias)
      if (!colDiff || colDiff.status === 'missing') continue // already flagged

      const fk = fkByColumn.get(branch.alias)
      if (!fk) {
        colDiff.status = 'fk_missing'
        colDiff.expectedTarget = branch.targetSeed
      } else if (fk.targetTable !== expectedFkTable || fk.onDelete !== expectedOnDelete) {
        colDiff.status = 'fk_mismatch'
        colDiff.expected = `→ ${expectedFkTable}(id) ON DELETE ${expectedOnDelete}`
        colDiff.actual = `→ ${fk.targetTable}(id) ON DELETE ${fk.onDelete}`
        colDiff.expectedTarget = branch.targetSeed
      }

      if (!indexNames.has(expectedIndexName)) {
        // FK status takes precedence; when it already carries one, the missing index is reported
        // as its own row so neither finding is lost.
        if (colDiff.status === 'ok') colDiff.status = 'index_missing'
        else columns.push({ name: branch.alias, status: 'index_missing' })
      }
    }
  }

  return { slug: seed.slug, tableExists: true, columns }
}
