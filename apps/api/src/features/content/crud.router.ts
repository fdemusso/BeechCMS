// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Hono } from 'hono'
import { zodJson } from '../../shared/utils/zod-json'
import { zodQuery } from '../../shared/utils/zod-query'
import type { AppEnv } from '../../types'
import { bulkHandler, rejectInvalidBulkBody } from './handlers/bulk.handler'
import { createHandler } from './handlers/create'
import { deleteHandler } from './handlers/delete'
import { facetsHandler } from './handlers/facets'
import { getByIdHandler } from './handlers/get'
import { kanbanMoveHandler, rejectInvalidKanbanMove } from './handlers/kanban-move'
import { listHandler } from './handlers/list'
import { rejectInvalidContentBody, updateHandler } from './handlers/update'
import { contentBulkBodySchema, contentDeleteQuerySchema, contentEntryBodySchema, contentListQuerySchema, kanbanMoveBodySchema } from './crud.schema'
import { requireSeed } from './seed.middleware'

/**
 * Entry CRUD of a seed, mounted at `/api/content` after every router that owns a literal second
 * segment (views, trash, drafts, ...), so the `/:slug/:id` wildcards only see what is left. One
 * method chain so the route types reach `AppType`.
 *
 * Inside the chain the same rule holds: `/:slug/facets` precedes `/:slug/:id`. `PATCH /:slug/bulk`
 * has no rival (there is no `PATCH /:slug/:id`), and kanban-move has three segments. Every route
 * refuses an unknown seed before it reads anything else, so `requireSeed` sits ahead of `zodJson`
 * and `zodQuery`: the order of the refusals is part of the contract.
 *
 * `GET /:schema_slug/by-slug/:entry_slug` and `POST /:slug/trash/reconcile` (neither is called by
 * the dashboard) stay in `index.ts`; neither collides with a route here.
 */
export const contentCrudApp = new Hono<AppEnv>()
  .patch('/:slug/:id/kanban-move', requireSeed, zodJson(kanbanMoveBodySchema, rejectInvalidKanbanMove), kanbanMoveHandler)
  .get('/:slug', requireSeed, zodQuery(contentListQuerySchema), listHandler)
  .get('/:slug/facets', requireSeed, facetsHandler)
  .get('/:slug/:id', requireSeed, getByIdHandler)
  .post('/:slug', requireSeed, zodJson(contentEntryBodySchema, rejectInvalidContentBody), createHandler)
  .patch('/:slug/bulk', requireSeed, zodJson(contentBulkBodySchema, rejectInvalidBulkBody), bulkHandler)
  .put('/:slug/:id', requireSeed, zodJson(contentEntryBodySchema, rejectInvalidContentBody), updateHandler)
  .delete('/:slug/:id', requireSeed, zodQuery(contentDeleteQuerySchema), deleteHandler)
