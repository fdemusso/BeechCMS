// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { z } from 'zod'

/**
 * Query of `GET /stats/media-library`. Both values stay raw strings: the handler clamps and falls
 * back to a default for anything that is not a positive integer, so a bad value is never an error.
 */
export const mediaLibraryQuerySchema = z.object({
  limit: z.string().optional(),
  offset: z.string().optional(),
})

/** Query of `GET /stats/recent-activity`: an optional seed slug to scope the feed. */
export const recentActivityQuerySchema = z.object({
  slug: z.string().optional(),
})
