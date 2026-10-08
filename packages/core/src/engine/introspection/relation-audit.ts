// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module engine/relation-audit
 * Finds relation branches whose physical storage no longer matches the deployed definition.
 *
 * Releases before the additive relation gate could persist a changed `multiple`, `targetSeed` or
 * `onDelete` without migrating the FK column, the `rel_<slug>_<alias>` junction table or the FK
 * policy. The gate prevents new mismatches; this audit identifies databases that already have one.
 *
 * Read-only by contract: only `PRAGMA` and `SELECT COUNT(*)` statements are issued, through the
 * injected executor. Nothing is repaired and no row is ever touched.
 */

import type { Branch, Seed } from '../types.js'
import { junctionTableName } from '../ddl/ddl.js'
import {
  assertSafeIdentifier,
  introspectTable,
  type LiveForeignKey,
  type SchemaQueryExecutor,
} from './introspection.js'

/** What is wrong with the storage of one relation branch. */
export type RelationStorageIssue =
  /** Definition says single (or multiple) but the data lives in the other shape. */
  | 'wrong_storage'
  /** Neither the FK column nor the junction table exists. */
  | 'missing_storage'
  /** The FK points at a different table than `targetSeed`. */
  | 'fk_target_mismatch'
  /** The FK `ON DELETE` rule differs from the effective `onDelete`. */
  | 'fk_on_delete_mismatch'

export interface RelationStorageFinding {
  seed: string
  alias: string
  issue: RelationStorageIssue
  /** What the deployed definition requires, e.g. `junction rel_posts_tags`. */
  expected: string
  /** What the database holds. */
  actual: string
  /**
   * Rows or values sitting in storage the definition no longer points at. Always 0 for
   * `missing_storage` and the FK findings: those carry no stranded values by themselves.
   */
  strandedRows: number
}

interface CountRow extends Record<string, unknown> {
  n: number
}

/** Default `ON DELETE` rule, per storage shape (mirrors `engine/ddl`). */
function effectiveOnDelete(branch: Branch): string {
  return (branch.onDelete ?? (branch.multiple === true ? 'CASCADE' : 'SET NULL')).toUpperCase()
}

async function countRows(executor: SchemaQueryExecutor, sql: string): Promise<number> {
  const rows = await executor.all<CountRow>(sql)
  return Number(rows[0]?.n ?? 0)
}

/** Checks the FK that carries the reference: the `alias` column, or the junction's `target_id`. */
function fkFindings(
  seed: Seed,
  branch: Branch,
  fk: LiveForeignKey | undefined,
  location: string,
): RelationStorageFinding[] {
  const expectedTarget = `content_${branch.targetSeed}`
  const expectedRule = effectiveOnDelete(branch)
  const base = { seed: seed.slug, alias: branch.alias, strandedRows: 0 }
  const expected = `${location} -> ${expectedTarget}(id) ON DELETE ${expectedRule}`

  if (!fk) {
    return [{ ...base, issue: 'fk_target_mismatch', expected, actual: `${location} has no foreign key` }]
  }
  const actual = `${location} -> ${fk.targetTable}(${fk.targetColumn}) ON DELETE ${fk.onDelete}`
  const findings: RelationStorageFinding[] = []
  if (fk.targetTable !== expectedTarget) findings.push({ ...base, issue: 'fk_target_mismatch', expected, actual })
  if (fk.onDelete !== expectedRule) findings.push({ ...base, issue: 'fk_on_delete_mismatch', expected, actual })
  return findings
}

async function auditBranch(
  executor: SchemaQueryExecutor,
  seed: Seed,
  branch: Branch,
  contentColumns: ReadonlySet<string>,
  contentForeignKeys: ReadonlyMap<string, LiveForeignKey>,
): Promise<RelationStorageFinding[]> {
  const isMultiple = branch.multiple === true
  const junction = junctionTableName(seed.slug, branch.alias)
  const draftJunction = `${junction}_drafts`
  const alias = assertSafeIdentifier(branch.alias)
  const base = { seed: seed.slug, alias: branch.alias }

  const liveJunction = await introspectTable(executor, junction)
  const liveDraftJunction = await introspectTable(executor, draftJunction)
  const hasColumn = contentColumns.has(alias)

  if (isMultiple) {
    if (hasColumn) {
      const strandedRows = await countRows(
        executor,
        `SELECT COUNT(*) AS n FROM content_${seed.slug} WHERE "${alias}" IS NOT NULL`,
      )
      return [{
        ...base,
        issue: 'wrong_storage',
        expected: `junction ${junction}`,
        actual: `${liveJunction.exists ? `junction ${junction} and ` : ''}column content_${seed.slug}.${alias}`,
        strandedRows,
      }]
    }
    if (!liveJunction.exists) {
      return [{ ...base, issue: 'missing_storage', expected: `junction ${junction}`, actual: 'no junction table', strandedRows: 0 }]
    }
    const findings = fkFindings(seed, branch, liveJunction.foreignKeys.find(fk => fk.column === 'target_id'), `${junction}.target_id`)
    if (seed.allowDrafts && !liveDraftJunction.exists) {
      findings.push({ ...base, issue: 'missing_storage', expected: `drafts junction ${draftJunction}`, actual: 'no drafts junction table', strandedRows: 0 })
    }
    return findings
  }

  // Single relation: the value lives in a column; any junction left behind holds stranded links.
  if (liveJunction.exists || liveDraftJunction.exists) {
    let strandedRows = 0
    if (liveJunction.exists) strandedRows += await countRows(executor, `SELECT COUNT(*) AS n FROM ${junction}`)
    if (liveDraftJunction.exists) strandedRows += await countRows(executor, `SELECT COUNT(*) AS n FROM ${draftJunction}`)
    return [{
      ...base,
      issue: 'wrong_storage',
      expected: `column content_${seed.slug}.${alias}`,
      actual: `${hasColumn ? `column content_${seed.slug}.${alias} and ` : ''}junction ${junction}`,
      strandedRows,
    }]
  }
  if (!hasColumn) {
    return [{ ...base, issue: 'missing_storage', expected: `column content_${seed.slug}.${alias}`, actual: 'no column', strandedRows: 0 }]
  }
  return fkFindings(seed, branch, contentForeignKeys.get(alias), `content_${seed.slug}.${alias}`)
}

/**
 * Compares every relation branch of the given (active) seeds against the physical tables.
 *
 * Seeds whose `content_<slug>` table is missing are skipped: that is plain schema drift and is
 * reported by the schema diff, not a relation-storage mismatch. Findings are ordered by seed, then
 * branch order, so the report is deterministic.
 */
export async function auditRelationStorage(
  executor: SchemaQueryExecutor,
  seeds: Seed[],
): Promise<RelationStorageFinding[]> {
  const findings: RelationStorageFinding[] = []
  const ordered = [...seeds].sort((a, b) => a.slug.localeCompare(b.slug))

  // Sequential on purpose: see `introspectSchema`.
  for (const seed of ordered) {
    const content = await introspectTable(executor, `content_${assertSafeIdentifier(seed.slug)}`)
    if (!content.exists) continue

    const columns = new Set(content.columns.map(column => column.name))
    const foreignKeys = new Map(content.foreignKeys.map(fk => [fk.column, fk]))
    for (const branch of seed.branches) {
      if (branch.type !== 'relation' || !branch.targetSeed) continue
      findings.push(...await auditBranch(executor, seed, branch, columns, foreignKeys))
    }
  }
  return findings
}
