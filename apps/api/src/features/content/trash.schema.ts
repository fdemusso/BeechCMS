// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { z } from 'zod'

/** Most ids one bulk restore/purge accepts. */
export const MAX_BULK_SIZE = 500

/**
 * Query of `GET /:slug/trash`. It types the request for `hc` and refuses nothing: a missing or
 * non-numeric `page`/`limit` falls back to the default in the handler (`parsePositiveInt`).
 */
export const trashListQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
})

/**
 * Body of `POST /:slug/trash/bulk-restore` and `/bulk-purge`. Both refusals the contract knows
 * are 400s: a missing, empty or non-string `ids` (`bulk-invalid-ids`) and more than
 * `MAX_BULK_SIZE` of them (`bulk-size-exceeded`), told apart by the issue code in
 * `rejectInvalidBulkIds`.
 *
 * The size is a `refine` and not `.max()` on purpose: zod runs `.max()` without looking at the
 * elements, so an oversized list holding a non-string would answer `bulk-size-exceeded`, where the
 * contract has always checked the elements first. A refinement only runs on a well-typed list.
 */
export const bulkIdsSchema = z.object({
  ids: z.array(z.string()).min(1).refine((ids) => ids.length <= MAX_BULK_SIZE),
})
