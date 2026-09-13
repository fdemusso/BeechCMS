// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { Branch } from '../engine/types.js'

/** Wire formats supported for bulk transfer. NDJSON is universal; CSV is flat-only. */
export type TransferFormat = 'csv' | 'ndjson'

export const TRANSFER_FORMATS = ['csv', 'ndjson'] as const satisfies readonly TransferFormat[]

export function isTransferFormat(value: unknown): value is TransferFormat {
  return typeof value === 'string' && (TRANSFER_FORMATS as readonly string[]).includes(value)
}

/**
 * Outcome of checking a requested format against a seed's shape.
 * `offendingBranches` is non-empty only on the incompatible branch, and exists so the
 * caller can name the exact fields in its 400 response instead of a generic message.
 */
export type FormatCompatibility =
  | { compatible: true }
  | {
      compatible: false
      code: 'csv_requires_flat_seed'
      offendingBranches: Array<{ alias: string; type: Branch['type'] }>
    }

/** A decoded wire row, keyed by branch alias / system column name. */
export type TransferRecord = Record<string, unknown>

/**
 * Per-line decode outcome. Import is best-effort (brief §2), so a bad line is a VALUE,
 * never a thrown error — the consumer must record it in the job report and keep going.
 */
export type LineParseResult =
  | { ok: true; record: TransferRecord }
  | { ok: false; code: LineParseErrorCode; message: string }

export type LineParseErrorCode =
  | 'invalid_json'
  | 'not_an_object'
  | 'column_count_mismatch'
  | 'unterminated_quote'

/**
 * A decoded row split into the three arguments `ContentRepository.create` takes.
 * `slug` and `status` are optional: the caller supplies its own defaults
 * (`create.ts` slugifies the display-name branch and defaults status to 'draft').
 */
export interface ImportPayload {
  slug?: string
  status?: string
  data: TransferRecord
}
