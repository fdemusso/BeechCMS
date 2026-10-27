// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { z } from 'zod'

/**
 * Query of `GET /:slug/export`. It types the request for `hc` and refuses nothing: an unknown or
 * empty `format` answers 400 `content-invalid-export-format` from the handler, AFTER the seed
 * lookup, and `search`/`filters` are parsed leniently by `parseQueryFilters`.
 */
export const exportQuerySchema = z.object({
  format: z.string().optional(),
  search: z.string().optional(),
  filters: z.string().optional(),
})

/** What the import endpoint reads from its body. */
export interface ImportRequestBody {
  objectKey: string
  format: string
}

/**
 * Body of `POST /:slug/import`, typed for `hc` and strict about nothing: every refusal depends on
 * something that is checked in the order the contract fixes (object key, ownership 403, format,
 * seed compatibility), and a body that is not an object has always been read as `{}` (so it
 * answers 400 `content-import-object-key-required`). The handler narrows with `normalizeBody`.
 */
export const importRequestSchema = z.custom<ImportRequestBody>()
