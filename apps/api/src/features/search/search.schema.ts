// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { z } from 'zod'

/**
 * Query of `GET /api/search`. It types the request for `hc` and refuses nothing: the handler reads
 * the same parameters from the URL, clamps `limit` and answers a missing or short `q` with 400.
 */
export const fullTextSearchQuerySchema = z.object({
  q: z.string().optional(),
  schema_slug: z.string().optional(),
  status: z.string().optional(),
  limit: z.string().optional(),
  cursor: z.string().optional(),
})
