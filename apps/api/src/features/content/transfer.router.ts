// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Hono } from 'hono'
import { zodJson } from '../../shared/utils/zod-json'
import { zodQuery } from '../../shared/utils/zod-query'
import type { AppEnv } from '../../types'
import { exportHandler } from './handlers/export'
import { importHandler, rejectInvalidImportBody } from './handlers/import'
import { importJobStatusHandler } from './handlers/import-job-status'
import { requireSeed } from './seed.middleware'
import { exportQuerySchema, importRequestSchema } from './transfer.schema'

/**
 * Bulk export, import and import-job status, mounted at `/api/content` ahead of the CRUD router.
 * One method chain so the route types reach `AppType`.
 *
 * `/import-jobs/:id` is a literal first segment and must precede every `/:slug/...` pattern, or
 * `/:slug/:id` would capture 'import-jobs' as a seed slug. The import refuses an unknown seed
 * before it reads the body, so `requireSeed` sits ahead of `zodJson`.
 */
export const contentTransferApp = new Hono<AppEnv>()
  .get('/import-jobs/:id', importJobStatusHandler)
  .get('/:slug/export', zodQuery(exportQuerySchema), exportHandler)
  .post('/:slug/import', requireSeed, zodJson(importRequestSchema, rejectInvalidImportBody), importHandler)
