// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * @module search/search
 * Authenticated full-text search Hono sub-app.
 *
 * Mounted at `/api/search` in `factory.ts`.
 * Requires a valid JWT — auth is enforced via `authMiddleware`.
 *
 * Routes:
 * - `GET /` → {@link fullTextSearchHandler}
 */

import { Hono }              from 'hono'
import type { AppEnv }       from '../../types'
import { authMiddleware }    from '../../middleware/auth.middleware'
import { zodQuery }           from '../../shared/utils/zod-query'
import { fullTextSearchHandler } from './handlers/full-text-search'
import { fullTextSearchQuerySchema } from './search.schema'

/**
 * Hono sub-app for the authenticated full-text search endpoint, registered as one method chain so
 * the route types reach `AppType` (see `../../routes.ts`).
 */
export const searchRouter = new Hono<AppEnv>()
  .use('*', authMiddleware())
  // GET /api/search?q=…&schema_slug=…&status=…&limit=20&cursor=…
  .get('/', zodQuery(fullTextSearchQuerySchema), fullTextSearchHandler)
