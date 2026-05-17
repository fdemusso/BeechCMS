import type { Context } from 'hono'
import { cleanStr } from '../shared/query-utils'
import { checkPublicOperation } from './access-policy'
import { publicProblem, internalErrorDetail } from './problem-details'
import { resolveEdgeCache, withCachedResponse } from './cache-utils'
import { readSingleEntry } from './read-single'
import { readListEntries } from './read-list'
import { AppEnv } from '../types'

export async function publicReadHandler(context: Context<AppEnv>) {
  const seedSlug = context.req.param('seed') ?? ''
  const seed = context.get('getSeed')(seedSlug)
  if (!seed) {
    const available = context.get('seedRegistry').all().map(s => s.slug).join(', ')
    return publicProblem(context, {
      type: 'seed-not-found',
      title: 'Seed Not Found',
      status: 404,
      detail: `The content type '${seedSlug}' does not exist. Available types: ${available}.`,
    })
  }

  const access = checkPublicOperation(seed, 'read')
  if (!access.ok) {
    return publicProblem(context, { type: 'operation-not-allowed', title: access.error.error, status: 403, detail: access.error.message })
  }

  const edgeCache = resolveEdgeCache(context)
  const cacheKey = context.req.raw
  if (edgeCache) {
    const hit = await edgeCache.cache.match(cacheKey)
    if (hit) return hit
  }

  const query = context.req.query()
  const id = cleanStr(query.id)
  const slug = cleanStr(query.slug)
  const publishedOnly = context.env.PUBLIC_PUBLISHED_ONLY !== 'false'
  const repository = context.get('repository')

  try {
    if (id || slug) {
      const result = await readSingleEntry({ seed, seedSlug, repository, id, slug, publishedOnly, fieldsParam: query.fields })
      if (!result.ok) {
        return publicProblem(context, { type: 'entry-not-found', title: 'Not Found', status: 404, detail: result.detail })
      }
      return withCachedResponse(edgeCache, cacheKey, context.json({ data: result.data, meta: result.meta }, 200))
    }

    const result = await readListEntries({ seed, seedSlug, repository, query, publishedOnly })
    return withCachedResponse(edgeCache, cacheKey, context.json(result, 200))
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Invalid filter:')) {
      return publicProblem(context, { type: 'invalid-filter', title: 'Bad Request', status: 400, detail: error.message })
    }
    console.error('Public read error:', error)
    return publicProblem(context, { type: 'internal-server-error', title: 'Internal Server Error', status: 500, detail: internalErrorDetail(context.env, error) })
  }
}
