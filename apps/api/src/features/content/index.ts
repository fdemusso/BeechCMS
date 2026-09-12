// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Hono } from 'hono'
import { AppEnv } from '../../types'
import { listHandler } from './handlers/list'
import { getByIdHandler, getBySlugHandler } from './handlers/get'
import { createHandler } from './handlers/create'
import { updateHandler } from './handlers/update'
import { deleteHandler } from './handlers/delete'
import { facetsHandler } from './handlers/facets'
import { bulkHandler } from './handlers/bulk.handler'
import { kanbanPositionHandler } from './handlers/kanban-position'
import { kanbanMoveHandler } from './handlers/kanban-move'
import { getViewConfigHandler, putViewConfigHandler } from './handlers/view-config'
import { trashListHandler, restoreHandler, bulkRestoreHandler, bulkPurgeHandler, reconcilePurgesHandler } from './handlers/trash'

const content = new Hono<AppEnv>()

content.patch('/:slug/:id/kanban-move', kanbanMoveHandler)
content.patch('/:slug/:id/kanban-position', kanbanPositionHandler)
content.get('/:slug/view-config', getViewConfigHandler)
content.put('/:slug/view-config', putViewConfigHandler)
content.get('/:slug/trash', trashListHandler)                       // NEW — before /:slug/:id
content.post('/:slug/trash/bulk-restore', bulkRestoreHandler)       // NEW
content.post('/:slug/trash/bulk-purge', bulkPurgeHandler)           // NEW
content.post('/:slug/trash/reconcile', reconcilePurgesHandler)      // NEW
content.get('/:slug', listHandler)
content.get('/:slug/facets', facetsHandler)
content.get('/:schema_slug/by-slug/:entry_slug', getBySlugHandler)
content.post('/:slug/:id/restore', restoreHandler)                  // NEW — before POST /:slug
content.get('/:slug/:id', getByIdHandler)
content.post('/:slug', createHandler)
content.patch('/:slug/bulk', bulkHandler)
content.put('/:slug/:id', updateHandler)
content.delete('/:slug/:id', deleteHandler)

export default content
