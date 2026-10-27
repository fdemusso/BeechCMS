// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Hono } from 'hono'
import { AppEnv } from '../../types'
import { getBySlugHandler } from './handlers/get'
import { reconcilePurgesHandler } from './handlers/trash'

const content = new Hono<AppEnv>()

content.post('/:slug/trash/reconcile', reconcilePurgesHandler)
content.get('/:schema_slug/by-slug/:entry_slug', getBySlugHandler)

export default content
