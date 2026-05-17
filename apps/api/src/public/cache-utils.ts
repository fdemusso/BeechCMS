import type { Context } from 'hono'

type EdgeCache = {
  cache: Cache
  executionCtx: { waitUntil: (p: Promise<unknown>) => void }
} | null

export function resolveEdgeCache(c: Context): EdgeCache {
  try {
    const cache = caches.default
    let executionCtx: any
    try {
      executionCtx = c.executionCtx
    } catch {
      return null
    }

    if (!executionCtx?.waitUntil) return null
    return { cache, executionCtx: executionCtx as { waitUntil: (p: Promise<unknown>) => void } }
  } catch {
    return null
  }
}

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
