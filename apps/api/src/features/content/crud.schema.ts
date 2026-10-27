// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { z } from 'zod'
import { MAX_BULK_SIZE } from './trash.schema'

/**
 * Query of `GET /:slug`. It types the request for `hc` and refuses nothing: every value is read
 * (and, when unusable, defaulted) by the handler, and `filters` is a JSON string the handler
 * parses on its own. `offset` and `has_pending_draft` are sent by the dashboard; the list reads
 * neither today.
 */
export const contentListQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  offset: z.string().optional(),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortDir: z.string().optional(),
  filters: z.string().optional(),
  kanbanAxis: z.string().optional(),
  has_pending_draft: z.string().optional(),
})

/** Query of `DELETE /:slug/:id`: `purge=true` erases an entry for good, anything else trashes it. */
export const contentDeleteQuerySchema = z.object({
  purge: z.string().optional(),
})

/**
 * Body of `POST /:slug` and `PUT /:slug/:id`: the fields to write, plus the envelope keys the
 * handler strips (`slug`, `status`, and `updated_at` on update). It types the request for `hc` and
 * refuses nothing: a body that is not an object has always been read as `{}`, and every field-level
 * refusal depends on the seed. The handler narrows with `normalizeBody`.
 */
export const contentEntryBodySchema = z.custom<Record<string, unknown>>()

/**
 * Body of `PATCH /:slug/bulk`. The refusals the contract knows are 400s, told apart by the first
 * issue (`rejectInvalidBulkBody`): `ids` missing, empty or not strings (`bulk-invalid-ids`), too
 * many of them (`bulk-size-exceeded`, the only `custom` issue), and `fields` not an object with at
 * least one key (`bulk-invalid-fields`). The key order is the order the checks have always run in.
 *
 * The size is a `refine` and not `.max()` for the same reason as `bulkIdsSchema`: zod runs `.max()`
 * without looking at the elements. What a field's value may be depends on the seed, so `fields`
 * carries no more than the shape.
 */
export const contentBulkBodySchema = z.object({
  ids: z.array(z.string()).min(1).refine((ids) => ids.length <= MAX_BULK_SIZE),
  fields: z.record(z.string(), z.unknown()).refine((fields) => Object.keys(fields).length > 0),
})

/**
 * Body of `PATCH /:slug/:id/kanban-move` (`KanbanMoveBody`). Both refusals are `content-invalid-body`
 * with their own detail, told apart by the first issue (`rejectInvalidKanbanMove`): `position` and
 * `axisBranchId` must be non-empty strings, and `axis`, when present, must carry a string or `null`
 * `value`. `axis: null` is refused, as it always was.
 */
export const kanbanMoveBodySchema = z.object({
  position: z.string().min(1),
  axisBranchId: z.string().min(1),
  axis: z.object({ value: z.string().nullable() }).optional(),
})
