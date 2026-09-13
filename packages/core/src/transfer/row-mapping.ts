// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { Seed } from '../engine/types.js'
import { nonFlatBranches } from './flat-seed.js'
import type { ImportPayload, LineParseResult, TransferRecord } from './transfer.types.js'

/**
 * System columns exported for every seed, in this order, ahead of the branch columns.
 * `deleted_at` is deliberately absent: a trashed row is not exportable content, and the
 * repository's default `trashed: 'active'` mode never hands one to the producer anyway.
 */
export const EXPORT_SYSTEM_COLUMNS = ['id', 'slug', 'status', 'created_at', 'updated_at'] as const

/**
 * Columns the importer must never accept from a file: the engine owns them.
 * `id` is minted by `idGenerator.uuid()`, the timestamps by SQLite defaults. Accepting an
 * `id` from a file would also turn insert-only import (brief §2) into a covert upsert.
 */
const IMPORT_REJECTED_COLUMNS: ReadonlySet<string> = new Set([
  'id',
  'created_at',
  'updated_at',
  'deleted_at',
])

/**
 * The ordered column projection for exporting `seed`: system columns, then one column per
 * scalar branch in declaration order. Non-flat branches are omitted — this projection is
 * only ever used for CSV, and `checkFormatCompatibility` has already refused a seed that
 * has any. NDJSON export emits the record whole and does not call this.
 */
export function exportColumns(seed: Seed): string[] {
  const excluded = new Set(nonFlatBranches(seed).map((branch) => branch.alias))
  return [
    ...EXPORT_SYSTEM_COLUMNS,
    ...seed.branches.map((branch) => branch.alias).filter((alias) => !excluded.has(alias)),
  ]
}

/**
 * Projects an API-shaped record onto `columns` as CSV cells.
 * `null`/`undefined` become an empty field; booleans become `true`/`false`; everything else
 * is stringified. The record is expected to have already passed through `dbToApi`, so a
 * `date` branch arrives as a number and is written as its unix-seconds integer.
 */
export function toCsvCells(record: TransferRecord, columns: string[]): Array<string | null> {
  return columns.map((column) => {
    const value = record[column]
    if (value === null || value === undefined) return null
    if (typeof value === 'boolean') return value ? 'true' : 'false'
    return String(value)
  })
}

/**
 * Rebuilds a record from a CSV row. An empty cell is treated as ABSENT, not as null:
 * CSV cannot distinguish the two, and omitting the key lets the engine's own
 * required-field validation produce the error instead of this module guessing.
 */
export function fromCsvCells(columns: string[], cells: string[]): LineParseResult {
  if (cells.length !== columns.length) {
    return {
      ok: false,
      code: 'column_count_mismatch',
      message: `Expected ${columns.length} columns, received ${cells.length}`,
    }
  }

  const record: TransferRecord = {}
  for (const [index, column] of columns.entries()) {
    const cell = cells[index] ?? ''
    if (cell === '') continue
    record[column] = cell
  }
  return { ok: true, record }
}

/**
 * Splits a decoded record into the shape `ContentRepository.create` consumes, dropping the
 * engine-owned columns. Returns `data` WITHOUT `slug`/`status`, mirroring
 * `apps/api/src/features/content/handlers/create.ts:68-70`, so the import consumer can feed
 * `data` straight to `validateAndSanitizeSeedPayload` without re-filtering.
 */
export function toImportPayload(record: TransferRecord): ImportPayload {
  const data: TransferRecord = {}
  for (const [key, value] of Object.entries(record)) {
    if (IMPORT_REJECTED_COLUMNS.has(key)) continue
    if (key === 'slug' || key === 'status') continue
    data[key] = value
  }

  const slug = typeof record['slug'] === 'string' && record['slug'] !== '' ? record['slug'] : undefined
  const status = typeof record['status'] === 'string' && record['status'] !== '' ? record['status'] : undefined

  return { ...(slug ? { slug } : {}), ...(status ? { status } : {}), data }
}
