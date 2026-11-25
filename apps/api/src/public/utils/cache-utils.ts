// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { resolveEdgeCache, type EdgeCache } from '../../shared/utils/edge-cache'

export { resolveEdgeCache }

/** Edge cache lifetime of a public read. Publishing does not purge it, so 60s is the max staleness per location. */
export const PUBLIC_READ_CACHE_CONTROL = 'public, max-age=60'

/** Stores the read for hits and serves the miss with the same Cache-Control, so a hit and a miss cache alike downstream. */
export function withCachedResponse(edgeCache: EdgeCache, cacheKey: Request, response: Response): Response {
  if (!edgeCache) return response
  const headers = new Headers(response.headers)
  headers.set('Cache-Control', PUBLIC_READ_CACHE_CONTROL)
  const served = new Response(response.body, { status: response.status, statusText: response.statusText, headers })
  edgeCache.executionCtx.waitUntil(edgeCache.cache.put(cacheKey, served.clone()))
  return served
}
