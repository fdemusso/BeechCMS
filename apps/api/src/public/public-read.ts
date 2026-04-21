import { SEED_REGISTRY, dbToApi, getSeed, resolvePolicies } from '@beech/core'
import type { Context } from 'hono'
import { buildOrderClause, cleanStr, rowToEntry } from '../shared/query-utils'
import type { ContentEntryRow } from '../shared/query-utils'
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
}

function buildSeedNotFoundMessage(seed: string): string {
  const available = Object.keys(SEED_REGISTRY).join(', ')
  return `The content type '${seed}' does not exist. Available types: ${available}.`
}

/** Applica le policy public e visibility ai campi dell'alias data. */
function applyPublicPolicies(
  aliasData: Record<string, unknown>,
  seed: NonNullable<ReturnType<typeof getSeed>>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [alias, value] of Object.entries(aliasData)) {
    const branch = seed.branches.find((b) => b.alias === alias)
    if (!branch) {
      result[alias] = value
      continue
    }
    const { public: isPublic, visibility } = resolvePolicies(branch)
    if (!isPublic) continue
    if (visibility === 'hidden') continue
    if (visibility === 'masked') {
      result[alias] = typeof value === 'string' && value.length > 0 ? '••••••••' : null
    } else {
      result[alias] = value
    }
  }
  return result
}

function toFlatPublicEntry(
  row: ContentEntryRow,
  seed: NonNullable<ReturnType<typeof getSeed>>,
  fieldsParam?: string
): Record<string, unknown> {
  const entry = rowToEntry(row)
  const aliasData = applyPublicPolicies(dbToApi(seed, entry.data), seed)
  const base: Record<string, unknown> = {
    id: entry.id,
    slug: entry.slug,
    status: entry.status,
    created_at: entry.created_at,
    updated_at: entry.updated_at,
  }

  const requestedFields = (fieldsParam ?? '')
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean)
  if (requestedFields.length === 0) {
    return { ...base, ...aliasData }
  }

  const filteredData: Record<string, unknown> = {}
  for (const field of requestedFields) {
    if (field in aliasData) {
      filteredData[field] = aliasData[field]
    }
  }
  return { ...base, ...filteredData }
}

function buildInternalErrorMessage(c: Context<{ Bindings: Bindings; Variables: Variables }>, err: unknown): string {
  if (c.env.ENV !== 'production' && err instanceof Error) {
    return err.message
  }
  return 'An unexpected error occurred.'
}

function buildOrderSql(
  seed: NonNullable<ReturnType<typeof getSeed>>,
  query: Record<string, string | undefined>,
  hasLatest: boolean
): string {
  if (hasLatest) {
    return 'ORDER BY created_at DESC'
  }
  const orderBy = cleanStr(query.orderBy) ?? ''
  const orderDir = (cleanStr(query.orderDir) ?? 'desc').toLowerCase()

  if (orderBy === 'created_at' || orderBy === 'updated_at') {
    const direction = orderDir === 'asc' ? 'ASC' : 'DESC'
    return `ORDER BY ${orderBy} ${direction}`
  }

  return buildOrderClause(orderBy, orderDir, seed)
}

export async function publicReadHandler(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
  const seedSlug = c.req.param('seed') ?? ''
  const seed = getSeed(seedSlug)
  if (!seed) {
    return publicProblem(c, {
      type: 'seed-not-found',
      title: 'Seed Not Found',
      status: 404,
      detail: buildSeedNotFoundMessage(seedSlug),
    })
  }
  const access = checkPublicOperation(seed, 'read')
  if (!access.ok) {
    return publicProblem(c, {
      type: 'operation-not-allowed',
      title: access.error.error,
      status: 403,
      detail: access.error.message,
    })
  }

  const query = c.req.query()
  const id = cleanStr(query.id)
  const publishedOnly = c.env.PUBLIC_PUBLISHED_ONLY !== 'false'

  try {
    const { DB } = c.env

    if (id) {
      const row = await DB.prepare(
        `SELECT id, schema_slug, slug, status, data, created_at, updated_at
         FROM content_entries
         WHERE schema_slug = ? AND id = ? ${publishedOnly ? "AND status = 'published'" : ''}
         LIMIT 1`
      )
        .bind(seedSlug, id)
        .first<ContentEntryRow>()

      if (!row) {
        return publicProblem(c, {
          type: 'entry-not-found',
          title: 'Not Found',
          status: 404,
          detail: `Entry '${id}' not found for content type '${seedSlug}'.`,
        })
      }

      return c.json(
        {
          data: toFlatPublicEntry(row, seed, query.fields),
          meta: buildPublicSingleMeta(seedSlug),
        },
        200
      )
    }

    const parsedFilter = parsePublicFilter(query.filter)
    const allMode = cleanStr(query.all)?.toLowerCase() === 'true'
    const latestMode = cleanStr(query.latest) !== null
    const latestCount = latestMode ? parseLatestCount(query.latest ?? '') : null
    const pagination = allMode ? { page: 1, limit: 100 } : parsePublicPagination(query)
    const offset = (pagination.page - 1) * pagination.limit
    const search = cleanStr(query.search) ?? ''

    const whereParts: string[] = ['schema_slug = ?']
    const whereBindings: Array<string | number> = [seedSlug]
    if (publishedOnly) {
      whereParts.push("status = 'published'")
    }

    if (search) {
      const term = `%${search}%`
      whereParts.push('(slug LIKE ? OR status LIKE ? OR data LIKE ?)')
      whereBindings.push(term, term, term)
    }

    const filterClause = buildPublicFilterWhereClause(seed, parsedFilter)
    if (filterClause.clause) {
      whereParts.push(`(${filterClause.clause})`)
      whereBindings.push(...filterClause.bindings)
    }

    const whereSql = `WHERE ${whereParts.join(' AND ')}`
    const countRow = await DB.prepare(`SELECT COUNT(*) as total FROM content_entries ${whereSql}`)
      .bind(...whereBindings)
      .first<{ total: number }>()
    const total = countRow?.total ?? 0

    const orderSql = buildOrderSql(seed, query, latestMode)
    const effectiveLimit = latestMode ? (latestCount ?? 10) : pagination.limit
    const effectiveOffset = latestMode ? 0 : offset

    const rowsResult = await DB.prepare(
      `SELECT id, schema_slug, slug, status, data, created_at, updated_at FROM content_entries ${whereSql} ${orderSql} LIMIT ? OFFSET ?`
    )
      .bind(...whereBindings, effectiveLimit, effectiveOffset)
      .all<ContentEntryRow>()

    const rows = rowsResult.results ?? []
    const data = rows.map((row) => toFlatPublicEntry(row, seed, query.fields))

    if (latestMode) {
      return c.json(
        {
          data,
          meta: {
            total,
            returned: data.length,
            seed: seedSlug,
          },
        },
        200
      )
    }

    return c.json(
      {
        data,
        meta: buildPublicListMeta({
          total,
          page: pagination.page,
          limit: effectiveLimit,
          returned: data.length,
          seed: seedSlug,
        }),
      },
      200
    )
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Invalid filter:')) {
      return publicProblem(c, {
        type: 'invalid-filter',
        title: 'Bad Request',
        status: 400,
        detail: err.message,
      })
    }

    return publicProblem(c, {
      type: 'internal-server-error',
      title: 'Internal Server Error',
      status: 500,
      detail: buildInternalErrorMessage(c, err),
    })
  }
}

