// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { hc, type PickResponseByStatusCode } from 'hono/client'
import type { AppType } from '@beechcms/api/routes'
import { apiFetch } from './api'

/**
 * Typed client for the Beech API, rooted at '/' so `rpc.auth.*` (outside /api) and `rpc.api.*`
 * share one instance. Inferred from the server's route types: no hand-written DTO.
 *
 * `apiFetch` throws an `ApiError` for every non-2xx, so only success statuses are exposed;
 * a response you get back is always a success and `await res.json()` is typed accordingly.
 */
export const rpc = hc<PickResponseByStatusCode<AppType, 200 | 201 | 204>>('/', { fetch: apiFetch })
