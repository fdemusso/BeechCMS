// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { z } from 'zod'

/**
 * Query of `GET /:targetSlug/:targetId/backrefs`. It types the request for `hc` and refuses
 * nothing: the handler reads `group` (`<sourceSlug>:<branchAlias>`, 400 when it has no colon),
 * and falls back to defaults for an unusable `page` or `limit`.
 */
export const backrefsQuerySchema = z.object({
  group: z.string().optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
})
