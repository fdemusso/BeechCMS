// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { resolveEdgeCache, type EdgeCache } from '../shared/utils/edge-cache'

export { resolveEdgeCache }

export function withCachedResponse(edgeCache: EdgeCache, cacheKey: Request, response: Response): Response {
  if (!edgeCache) return response
  const cloned = response.clone()
  const headers = new Headers(cloned.headers)
  headers.set('Cache-Control', 'public, max-age=60')
  edgeCache.executionCtx.waitUntil(
    edgeCache.cache.put(cacheKey, new Response(cloned.body, { status: cloned.status, headers }))
  )
  return response
}
