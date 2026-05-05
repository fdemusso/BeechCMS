import { resolvePolicies, EntryNotFoundError } from '@beechcms/core'
import type { Seed } from '@beechcms/core'
import type { Context } from 'hono'
import { cleanStr } from '../shared/query-utils'
import { checkPublicOperation } from './access-policy'
import { publicProblem } from './problem-details'
import { buildPublicListMeta, buildPublicSingleMeta } from './response-builder'
import {
  parseLatestCount,
  parsePublicFilter,
  parsePublicPagination,
  toEngineFilters,
} from './query-builder'
import { AppEnv } from '../types'

function buildSeedNotFoundMessage(seed: string, seedRegistry: Record<string, Seed>): string {
  const available = Object.keys(seedRegistry).join(', ')
  return `The content type '${seed}' does not exist. Available types: ${available}.`
}

/** Applies public/visibility policies for the Public API. */
function applyPublicPolicies(data: Record<string, unknown>, seed: Seed): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  
  // System fields are mapped to top-level for public API
  const system = ['id', 'slug', 'status', 'created_at', 'updated_at']
  for (const key of system) {
    if (key in data) result[key] = data[key]
  }

  for (const branch of seed.branches) {
    const value = data[branch.alias]
    const { public: isPublic, visibility } = resolvePolicies(branch)
    if (!isPublic) continue
    if (visibility === 'hidden') continue
    if (visibility === 'masked') {
      result[branch.alias] = typeof value === 'string' && value.length > 0 ? '••••••••' : null
    } else {
      result[branch.alias] = value
    }
  }
  return result
}

function toFlatPublicEntry(data: Record<string, unknown>, seed: Seed, fieldsParam?: string): Record<string, unknown> {
  const aliasData = applyPublicPolicies(data, seed)
  const requestedFields = (fieldsParam ?? '').split(',').map((f) => f.trim()).filter(Boolean)
  
  if (requestedFields.length === 0) return aliasData
  
  const filteredData: Record<string, unknown> = {}
  for (const field of requestedFields) {
    if (field in aliasData) filteredData[field] = aliasData[field]
  }
  
  // Always include basic identity fields if they exist in filtered data or if requested
  const identity = ['id', 'slug']
  for (const key of identity) {
    if (key in aliasData && !filteredData[key]) filteredData[key] = aliasData[key]
  }
  
  return filteredData
}

function withCache(
  cache: Cache | undefined,
  executionCtx: { waitUntil: (p: Promise<unknown>) => void } | undefined,
  cacheKey: Request,
  response: Response
): Response {
  if (cache && executionCtx) {
    const cloned = response.clone()
    const headers = new Headers(cloned.headers)
    headers.set('Cache-Control', 'public, max-age=60')
    executionCtx.waitUntil(cache.put(cacheKey, new Response(cloned.body, { status: cloned.status, headers })))
  }
  return response
}

function buildInternalErrorMessage(context: Context<AppEnv>, error: unknown): string {
  if (context.env.ENV !== 'production' && error instanceof Error) return error.message
  return 'An unexpected error occurred.'
}

export async function publicReadHandler(context: Context<AppEnv>) {
  const seedSlug = context.req.param('seed') ?? ''
  const seed = context.get('getSeed')(seedSlug)
  if (!seed) {
    return publicProblem(context, {
      type: 'seed-not-found', 
      title: 'Seed Not Found', 
      status: 404,
      detail: buildSeedNotFoundMessage(seedSlug, context.get('seedRegistry')),
    })
  }
  
  const access = checkPublicOperation(seed, 'read')
  if (!access.ok) {
    return publicProblem(context, { 
      type: 'operation-not-allowed', 
      title: access.error.error, 
      status: 403, 
      detail: access.error.message 
    })
  }

  let cache: Cache | undefined
  let executionCtx: { waitUntil: (p: Promise<unknown>) => void } | undefined
  try {
    cache = caches.default
    executionCtx = context.executionCtx as typeof executionCtx
  } catch {}

  const cacheKey = context.req.raw
  if (cache) {
    const hit = await cache.match(cacheKey)
    if (hit) return hit
  }

  const query = context.req.query()
  const id = cleanStr(query.id)
  const slug = cleanStr(query.slug)
  const publishedOnly = context.env.PUBLIC_PUBLISHED_ONLY !== 'false'
  const repository = context.get('repository')

  try {
    if (id || slug) {
      try {
        const entry = id 
          ? await repository.findById(seed, id)
          : await repository.findBySlug(seed, slug!)
        
        if (publishedOnly && entry.status !== 'published') {
          return publicProblem(context, { 
            type: 'entry-not-found', 
            title: 'Not Found', 
            status: 404, 
            detail: `Entry '${id || slug}' not found or not published.` 
          })
        }

        return withCache(cache, executionCtx, cacheKey,
          context.json({ 
            data: toFlatPublicEntry(entry, seed, query.fields), 
            meta: buildPublicSingleMeta(seedSlug) 
          }, 200)
        )
      } catch (error) {
        if (error instanceof EntryNotFoundError) {
          return publicProblem(context, { 
            type: 'entry-not-found', 
            title: 'Not Found', 
            status: 404, 
            detail: `Entry '${id || slug}' not found for content type '${seedSlug}'.` 
          })
        }
        throw error
      }
    }

    const parsedFilter = parsePublicFilter(query.filter)
    const allMode = cleanStr(query.all)?.toLowerCase() === 'true'
    const latestMode = cleanStr(query.latest) !== null
    const latestCount = latestMode ? parseLatestCount(query.latest ?? '') : null
    const pagination = allMode ? { page: 1, limit: 100 } : parsePublicPagination(query)
    const offset = (pagination.page - 1) * pagination.limit
    const search = cleanStr(query.search) ?? ''

    const engineFilters = toEngineFilters(seed, parsedFilter)
    const sortBy = cleanStr(query.orderBy) ?? 'created_at'
    const sortDir = (cleanStr(query.orderDir) ?? 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC'

    const { items, total } = await repository.findMany(seed, {
      filters: engineFilters,
      search: search || undefined,
      status: publishedOnly ? 'published' : null,
      pagination: { 
        limit: latestMode ? (latestCount ?? 10) : pagination.limit, 
        offset: latestMode ? 0 : offset 
      },
      orderBy: latestMode ? { column: 'created_at', dir: 'DESC' } : { column: sortBy, dir: sortDir }
    })

    const data = items.map((item) => toFlatPublicEntry(item, seed, query.fields))

    if (latestMode) {
      return withCache(cache, executionCtx, cacheKey,
        context.json({ data, meta: { total, returned: data.length, seed: seedSlug } }, 200)
      )
    }

    return withCache(cache, executionCtx, cacheKey,
      context.json({
        data,
        meta: buildPublicListMeta({ 
          total, 
          page: pagination.page, 
          limit: latestMode ? (latestCount ?? 10) : pagination.limit, 
          returned: data.length, 
          seed: seedSlug 
        }),
      }, 200)
    )
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Invalid filter:')) {
      return publicProblem(context, { type: 'invalid-filter', title: 'Bad Request', status: 400, detail: error.message })
    }
    console.error('Public read error:', error)
    return publicProblem(context, { 
      type: 'internal-server-error', 
      title: 'Internal Server Error', 
      status: 500, 
      detail: buildInternalErrorMessage(context, error) 
    })
  }
}
