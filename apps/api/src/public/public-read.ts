import { resolvePolicies } from '@beech/core'
import type { Seed } from '@beech/core'
import type { Context } from 'hono'
import { cleanStr } from '../shared/query-utils'
import { rowToApiData } from '../shared/content-utils'
import { checkPublicOperation } from './access-policy'
import { publicProblem } from './problem-details'
import { buildPublicListMeta, buildPublicSingleMeta } from './response-builder'
import {
  buildPublicFilterWhereClause,
  parseLatestCount,
  parsePublicFilter,
  parsePublicPagination,
} from './query-builder'

type Bindings = {
  DB: D1Database
  PUBLIC_READ_API_KEY?: string
  PUBLIC_WRITE_API_KEY?: string
  PUBLIC_PUBLISHED_ONLY?: string
  ENV?: string
}

type Variables = {
  jwtPayload: { sub: string; email?: string }
  getSeed: (slug: string) => Seed | null
  seedRegistry: Record<string, Seed>
}

function buildSeedNotFoundMessage(seed: string, seedRegistry: Record<string, Seed>): string {
  const available = Object.keys(seedRegistry).join(', ')
  return `The content type '${seed}' does not exist. Available types: ${available}.`
}

/** Applica policy public/visibility per la Public API. */
function applyPublicPolicies(aliasData: Record<string, unknown>, seed: Seed): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const branch of seed.branches) {
    const value = aliasData[branch.alias]
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

function toFlatPublicEntry(row: Record<string, unknown>, seed: Seed, fieldsParam?: string): Record<string, unknown> {
  const aliasData = applyPublicPolicies(rowToApiData(seed, row), seed)
  const base: Record<string, unknown> = {
    id: row.id,
    slug: row.slug,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
  const requestedFields = (fieldsParam ?? '').split(',').map((f) => f.trim()).filter(Boolean)
  if (requestedFields.length === 0) return { ...base, ...aliasData }
  const filteredData: Record<string, unknown> = {}
  for (const field of requestedFields) {
    if (field in aliasData) filteredData[field] = aliasData[field]
  }
  return { ...base, ...filteredData }
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

function buildInternalErrorMessage(c: Context<{ Bindings: Bindings; Variables: Variables }>, err: unknown): string {
  if (c.env.ENV !== 'production' && err instanceof Error) return err.message
  return 'An unexpected error occurred.'
}

function buildOrderSql(seed: Seed, query: Record<string, string | undefined>, hasLatest: boolean): string {
  if (hasLatest) return 'ORDER BY created_at DESC'
  const orderBy = cleanStr(query.orderBy) ?? ''
  const orderDir = (cleanStr(query.orderDir) ?? 'desc').toLowerCase()
  if (orderBy === 'created_at' || orderBy === 'updated_at') {
    return `ORDER BY ${orderBy} ${orderDir === 'asc' ? 'ASC' : 'DESC'}`
  }
  // Branch column — always a real column in v0.4.0
  const branch = seed.branches.find((b) => b.alias === orderBy)
  if (branch) {
    const dir = orderDir === 'asc' ? 'ASC' : 'DESC'
    return `ORDER BY ${branch.alias} ${dir} NULLS LAST`
  }
  return 'ORDER BY created_at DESC'
}

export async function publicReadHandler(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
  const seedSlug = c.req.param('seed') ?? ''
  const seed = c.get('getSeed')(seedSlug)
  if (!seed) {
    return publicProblem(c, {
      type: 'seed-not-found', title: 'Seed Not Found', status: 404,
      detail: buildSeedNotFoundMessage(seedSlug, c.get('seedRegistry')),
    })
  }
  const access = checkPublicOperation(seed, 'read')
  if (!access.ok) {
    return publicProblem(c, { type: 'operation-not-allowed', title: access.error.error, status: 403, detail: access.error.message })
  }

  let cache: Cache | undefined
  let executionCtx: { waitUntil: (p: Promise<unknown>) => void } | undefined
  try {
    cache = caches.default
    executionCtx = c.executionCtx as typeof executionCtx
  } catch {}

  const cacheKey = c.req.raw
  if (cache) {
    const hit = await cache.match(cacheKey)
    if (hit) return hit
  }

  const query = c.req.query()
  const id = cleanStr(query.id)
  const table = `content_${seedSlug}`
  const publishedOnly = c.env.PUBLIC_PUBLISHED_ONLY !== 'false'

  try {
    const { DB } = c.env

    if (id) {
      const row = await DB.prepare(
        `SELECT * FROM ${table} WHERE id = ? ${publishedOnly ? "AND status = 'published'" : ''} LIMIT 1`
      ).bind(id).first<Record<string, unknown>>()

      if (!row) {
        return publicProblem(c, { type: 'entry-not-found', title: 'Not Found', status: 404, detail: `Entry '${id}' not found for content type '${seedSlug}'.` })
      }

      return withCache(cache, executionCtx, cacheKey,
        c.json({ data: toFlatPublicEntry(row, seed, query.fields), meta: buildPublicSingleMeta(seedSlug) }, 200)
      )
    }

    const parsedFilter = parsePublicFilter(query.filter)
    const allMode = cleanStr(query.all)?.toLowerCase() === 'true'
    const latestMode = cleanStr(query.latest) !== null
    const latestCount = latestMode ? parseLatestCount(query.latest ?? '') : null
    const pagination = allMode ? { page: 1, limit: 100 } : parsePublicPagination(query)
    const offset = (pagination.page - 1) * pagination.limit
    const search = cleanStr(query.search) ?? ''

    const whereParts: string[] = []
    const whereBindings: Array<string | number> = []
    if (publishedOnly) whereParts.push("status = 'published'")

    if (search) {
      // Search against slug and text/richtext columns
      const searchableBranches = seed.branches.filter((b) => ['text', 'richtext'].includes(b.type))
      const term = `%${search}%`
      const searchExprs = ['slug LIKE ?', ...searchableBranches.map((b) => `${b.alias} LIKE ?`)]
      whereParts.push(`(${searchExprs.join(' OR ')})`)
      whereBindings.push(term, ...searchableBranches.map(() => term))
    }

    const filterClause = buildPublicFilterWhereClause(seed, parsedFilter)
    if (filterClause.clause) {
      whereParts.push(`(${filterClause.clause})`)
      whereBindings.push(...filterClause.bindings)
    }

    const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : ''
    const countRow = await DB.prepare(`SELECT COUNT(*) as total FROM ${table} ${whereSql}`)
      .bind(...whereBindings)
      .first<{ total: number }>()
    const total = countRow?.total ?? 0

    const orderSql = buildOrderSql(seed, query, latestMode)
    const effectiveLimit = latestMode ? (latestCount ?? 10) : pagination.limit
    const effectiveOffset = latestMode ? 0 : offset

    const rowsResult = await DB.prepare(`SELECT * FROM ${table} ${whereSql} ${orderSql} LIMIT ? OFFSET ?`)
      .bind(...whereBindings, effectiveLimit, effectiveOffset)
      .all<Record<string, unknown>>()

    const rows = rowsResult.results ?? []
    const data = rows.map((row) => toFlatPublicEntry(row, seed, query.fields))

    if (latestMode) {
      return withCache(cache, executionCtx, cacheKey,
        c.json({ data, meta: { total, returned: data.length, seed: seedSlug } }, 200)
      )
    }

    return withCache(cache, executionCtx, cacheKey,
      c.json({
        data,
        meta: buildPublicListMeta({ total, page: pagination.page, limit: effectiveLimit, returned: data.length, seed: seedSlug }),
      }, 200)
    )
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Invalid filter:')) {
      return publicProblem(c, { type: 'invalid-filter', title: 'Bad Request', status: 400, detail: err.message })
    }
    return publicProblem(c, { type: 'internal-server-error', title: 'Internal Server Error', status: 500, detail: buildInternalErrorMessage(c, err) })
  }
}
