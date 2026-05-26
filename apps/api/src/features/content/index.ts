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

const content = new Hono<AppEnv>()

content.get('/:slug', listHandler)
content.get('/:slug/facets', facetsHandler)
content.get('/:schema_slug/by-slug/:entry_slug', getBySlugHandler)
content.get('/:slug/:id', getByIdHandler)
content.post('/:slug', createHandler)
content.put('/:slug/:id', updateHandler)
content.delete('/:slug/:id', deleteHandler)

export default content
