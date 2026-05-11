type EdgeCache = {
  cache: Cache
  executionCtx: { waitUntil: (p: Promise<unknown>) => void }
} | null

export function resolveEdgeCache(rawCtx: unknown): EdgeCache {
  try {
    const cache = caches.default
    const ctx = rawCtx as { waitUntil?: (p: Promise<unknown>) => void } | undefined
    if (!ctx?.waitUntil) return null
    return { cache, executionCtx: ctx as { waitUntil: (p: Promise<unknown>) => void } }
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
