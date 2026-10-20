// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import {
  DEFAULT_EXPORT_PAGE_SIZE,
  encodeCsvRow,
  encodeNdjsonLine,
  exportColumns,
  toCsvCells,
  type ActorContext,
  type ContentRepository,
  type FilterGroup,
  type Seed,
  type TransferFormat,
} from '@beechcms/core'
import { applyVisibility } from '../../shared/policies/apply-policies'

/**
 * Everything the producer needs. It takes the repository PORT, never a D1Database and never a
 * Hono Context — which is what lets the unit tier drive it with a stub and what keeps the
 * Botanical Invariant intact (no SQL is ever built here).
 */
export interface ExportStreamOptions {
  repository: Pick<ContentRepository, 'findMany'>
  seed: Seed
  format: TransferFormat
  /** Field-visibility is resolved per row, exactly as the list endpoint resolves it. */
  actor: ActorContext
  /** Caller-supplied filter groups, already converted to engine shape by `toEngineFilters`. */
  filters: FilterGroup[]
  search?: string
  /** Rows per repository round-trip. Defaults to DEFAULT_EXPORT_PAGE_SIZE. */
  pageSize?: number
}

/**
 * Streams a content type as CSV or NDJSON, one page at a time.
 *
 * Paging is KEYSET on `id`, not LIMIT/OFFSET. The engine's default sort is
 * `ORDER BY created_at DESC` (packages/core/src/engine/query.ts:L138) and `created_at` is unix
 * SECONDS, so a bulk-inserted table has thousands of ties; under a non-unique sort key two
 * successive OFFSET pages may repeat one row and drop another, producing a file that is the
 * right length and the wrong contents. Ordering by `id` — unique, indexed as the primary key —
 * removes the ambiguity and also avoids the O(n²) scan that deep OFFSET costs at 50k rows.
 *
 * The stream never holds more than one page in memory. It is the caller's job to have already
 * refused an over-cap export (413) and an incompatible format (400): once the first byte is
 * written the status is committed, and a failure past that point can only truncate the file.
 */
export function createContentExportStream(options: ExportStreamOptions): ReadableStream<Uint8Array> {
  const { repository, seed, format, actor, filters, search } = options
  const pageSize = options.pageSize ?? DEFAULT_EXPORT_PAGE_SIZE
  const columns = exportColumns(seed)
  const encoder = new TextEncoder()

  let cursor: string | null = null
  let exhausted = false

  const pageFilters = (): FilterGroup[] =>
    cursor === null
      ? filters
      : // ANDed with the caller's groups: filterLogic defaults to 'AND'
        // (packages/core/src/engine/query.ts:L109), so the cursor can only narrow.
        [...filters, { column: 'id', type: 'system', conditions: [{ op: 'gt', value: cursor }] }]

  const encodeRow = (record: Record<string, unknown>): string =>
    format === 'csv'
      ? encodeCsvRow(toCsvCells(record, columns))
      : encodeNdjsonLine(record)

  return new ReadableStream<Uint8Array>({
    start(controller) {
      // A CSV file without a header row is not importable by the other half of this feature.
      // NDJSON is self-describing and gets no preamble.
      if (format === 'csv') controller.enqueue(encoder.encode(encodeCsvRow([...columns])))
    },

    async pull(controller) {
      if (exhausted) {
        controller.close()
        return
      }

      const { items } = await repository.findMany(seed, {
        filters: pageFilters(),
        orderBy: { column: 'id', dir: 'ASC' },
        pagination: { limit: pageSize, offset: 0 },
        ...(search ? { search } : {}),
      })

      if (items.length === 0) {
        controller.close()
        return
      }

      let chunk = ''
      for (const item of items) {
        chunk += encodeRow(applyVisibility(item, seed, actor))
      }
      controller.enqueue(encoder.encode(chunk))

      cursor = String(items[items.length - 1]?.id ?? '')
      // A short page is the last page; closing here saves one empty round-trip per export.
      if (items.length < pageSize) exhausted = true
    },
  })
}
