// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import {
  DEFAULT_IMPORT_CHUNK_ROWS,
  MAX_JOB_ERROR_SAMPLES,
  type ContentRepository,
  type Seed,
  type TransferFormat,
} from '@beechcms/core'
import { DEFAULT_IMPORT_MAX_BYTES } from './constants'

/** Slug of the system seed bootstrapped by migrations/0031_import_jobs_seed.sql. */
export const IMPORT_JOBS_SLUG = 'import_jobs'

/** Queue job name. Must match the key registered in `contentImportJobs`. */
export const CONTENT_IMPORT_CHUNK_JOB = 'content_import_chunk'

/**
 * Branch aliases of the import_jobs seed, in one place so a rename is a single edit.
 * These ARE the payload keys and the SQL column names (engine/types.ts:L82).
 */
export const IMPORT_JOB_FIELDS = {
  targetSeed: 'target_seed',
  format: 'format',
  objectKey: 'object_key',
  state: 'job_state',
  rowOffset: 'row_offset',
  insertedRows: 'inserted_rows',
  failedRows: 'failed_rows',
  errorReport: 'error_report',
  createdBy: 'created_by',
  finishedAt: 'finished_at',
} as const

/**
 * Lifecycle of a job (brief §2). `completed` and `failed` are terminal: the R2 object is
 * deleted on entry to either, and a late duplicate queue delivery is a no-op.
 */
export type ImportJobState = 'pending' | 'processing' | 'completed' | 'failed'

const TERMINAL_STATES: ReadonlySet<ImportJobState> = new Set<ImportJobState>(['completed', 'failed'])

export function isTerminalState(state: string): boolean {
  return TERMINAL_STATES.has(state as ImportJobState)
}

/** One rejected row. `row` is the 1-based index of the DATA record, header excluded. */
export interface ImportRowError {
  row: number
  code: string
  message: string
  field?: string
}

/** Queue payload. Carries only the id: every cursor lives in the durable job record. */
export interface ImportChunkPayload {
  jobId: string
}

/** A job row as `dbToApi` hands it back. */
export interface ImportJobRecord {
  id: string
  targetSeed: string
  format: TransferFormat
  objectKey: string
  state: ImportJobState
  rowOffset: number
  insertedRows: number
  failedRows: number
  errors: ImportRowError[]
  createdBy: string
  createdAt: number
  updatedAt: number
  finishedAt: number | null
}

/**
 * Mirrors resolveMaxUploadBytes (features/upload/index.ts:L18) and resolveExportMaxRows
 * (handlers/export.ts:L35): an unset or unparseable binding means "use the default",
 * never "no limit".
 */
export function resolveImportMaxBytes(env: { IMPORT_MAX_BYTES?: string }): number {
  const raw = env.IMPORT_MAX_BYTES
  if (!raw) return DEFAULT_IMPORT_MAX_BYTES
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_IMPORT_MAX_BYTES
  return parsed
}

export function resolveImportChunkRows(env: { IMPORT_CHUNK_ROWS?: string }): number {
  const raw = env.IMPORT_CHUNK_ROWS
  if (!raw) return DEFAULT_IMPORT_CHUNK_ROWS
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_IMPORT_CHUNK_ROWS
  return parsed
}

/**
 * Reads a job entry through the engine and normalises it. `error_report` arrives from dbToApi
 * as a parsed value for a `json` branch, but a row written before a schema change — or by hand —
 * may still be a string, so both are tolerated and anything else degrades to an empty list
 * rather than throwing inside a status endpoint.
 */
export async function readImportJobRecord(
  repository: ContentRepository,
  jobSeed: Seed,
  jobId: string,
): Promise<ImportJobRecord> {
  const row = await repository.findById(jobSeed, jobId)
  const f = IMPORT_JOB_FIELDS
  return {
    id: String(row['id']),
    targetSeed: String(row[f.targetSeed]),
    format: String(row[f.format]) as TransferFormat,
    objectKey: String(row[f.objectKey]),
    state: String(row[f.state]) as ImportJobState,
    rowOffset: Number(row[f.rowOffset] ?? 0),
    insertedRows: Number(row[f.insertedRows] ?? 0),
    failedRows: Number(row[f.failedRows] ?? 0),
    errors: parseErrorReport(row[f.errorReport]),
    createdBy: String(row[f.createdBy]),
    createdAt: Number(row['created_at'] ?? 0),
    updatedAt: Number(row['updated_at'] ?? 0),
    finishedAt: row[f.finishedAt] === null || row[f.finishedAt] === undefined ? null : Number(row[f.finishedAt]),
  }
}

function parseErrorReport(raw: unknown): ImportRowError[] {
  if (Array.isArray(raw)) return raw as ImportRowError[]
  if (typeof raw !== 'string' || raw === '') return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as ImportRowError[]) : []
  } catch {
    return []
  }
}

/**
 * Appends new samples up to MAX_JOB_ERROR_SAMPLES and stops. The aggregate `failed_rows`
 * counter keeps growing past the cap (brief §4), so one pathological file cannot unbound the row.
 */
export function appendErrorSamples(
  existing: readonly ImportRowError[],
  incoming: readonly ImportRowError[],
): ImportRowError[] {
  if (existing.length >= MAX_JOB_ERROR_SAMPLES) return [...existing]
  return [...existing, ...incoming].slice(0, MAX_JOB_ERROR_SAMPLES)
}

/** The wire shape of GET /api/content/import-jobs/:id. */
export function toImportJobResponse(record: ImportJobRecord): {
  id: string
  targetSeed: string
  format: TransferFormat
  state: ImportJobState
  rowsRead: number
  insertedRows: number
  failedRows: number
  errors: ImportRowError[]
  createdAt: number
  updatedAt: number
  finishedAt: number | null
} {
  // `object_key` and `created_by` are deliberately NOT exposed: the first is an R2 path and the
  // second a user id, and neither is needed to act on a job report.
  return {
    id: record.id,
    targetSeed: record.targetSeed,
    format: record.format,
    state: record.state,
    rowsRead: record.rowOffset,
    insertedRows: record.insertedRows,
    failedRows: record.failedRows,
    errors: record.errors,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    finishedAt: record.finishedAt,
  }
}
