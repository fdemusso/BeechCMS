// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Hono } from 'hono'
import { createContentViewInputSchema, reorderContentViewsInputSchema, updateContentViewInputSchema } from '@beechcms/core'
import { zodJson } from '../../shared/utils/zod-json'
import type { AppEnv } from '../../types'
import { requireSeed } from './seed.middleware'
import {
  createViewHandler,
  deleteViewHandler,
  listViewsHandler,
  rejectInvalidViewBody,
  reorderViewsHandler,
  requireAuthorizedView,
  updateViewHandler,
} from './handlers/views'

/**
 * Saved views of a seed, mounted at `/api/content` ahead of the CRUD router: `/:slug/views` must
 * win over its `/:slug/:id`. One method chain so the route types reach `AppType`.
 *
 * Every write refuses an unknown seed (and, for PATCH, an unknown view) before the body is read,
 * so the middleware sit ahead of `zodJson`.
 */
export const contentViewsApp = new Hono<AppEnv>()
  .get('/:slug/views', requireSeed, listViewsHandler)
  .post('/:slug/views', requireSeed, zodJson(createContentViewInputSchema, rejectInvalidViewBody), createViewHandler)
  // A literal segment, before `/:slug/views/:viewId`.
  .put('/:slug/views/order', requireSeed, zodJson(reorderContentViewsInputSchema, rejectInvalidViewBody), reorderViewsHandler)
  .patch('/:slug/views/:viewId', requireSeed, requireAuthorizedView, zodJson(updateContentViewInputSchema, rejectInvalidViewBody), updateViewHandler)
  .delete('/:slug/views/:viewId', requireSeed, deleteViewHandler)
