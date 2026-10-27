// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Hono } from 'hono'
import { zodJson } from '../../shared/utils/zod-json'
import { zodQuery } from '../../shared/utils/zod-query'
import type { AppEnv } from '../../types'
import { bulkPurgeHandler, bulkRestoreHandler, rejectInvalidBulkIds, restoreHandler, trashListHandler } from './handlers/trash'
import { requireSeed } from './seed.middleware'
import { bulkIdsSchema, trashListQuerySchema } from './trash.schema'

/**
 * The Trash of a seed, mounted at `/api/content` ahead of the CRUD router: `/:slug/trash` must win
 * over its `/:slug/:id`, and `/:slug/:id/restore` over its POST `/:slug`. One method chain so the
 * route types reach `AppType`.
 *
 * The bulk writes refuse an unknown seed before they read the body, so `requireSeed` sits ahead of
 * `zodJson`. `POST /:slug/trash/reconcile` (an operator route the dashboard never calls) stays in
 * the CRUD router; it does not collide with anything here.
 */
export const contentTrashApp = new Hono<AppEnv>()
  .get('/:slug/trash', requireSeed, zodQuery(trashListQuerySchema), trashListHandler)
  .post('/:slug/trash/bulk-restore', requireSeed, zodJson(bulkIdsSchema, rejectInvalidBulkIds), bulkRestoreHandler)
  .post('/:slug/trash/bulk-purge', requireSeed, zodJson(bulkIdsSchema, rejectInvalidBulkIds), bulkPurgeHandler)
  .post('/:slug/:id/restore', requireSeed, restoreHandler)
