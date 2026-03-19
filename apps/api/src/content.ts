/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import { getSeed, apiToDb, dbToApi } from '@beech/core'
import { deleteR2Objects } from './upload'
import { extractMediaKeysFromData } from './media-utils'

/**
 * Content API: CRUD schema-driven per content_entries.
 * Usa @beech/core per traduzione alias ↔ ID interni (Botanical Engine).
 */

/** Messaggi di errore API content - usati da handler e test */
export const CONTENT_ERRORS = {
  INVALID_SLUG: 'Invalid slug',
  INVALID_SLUG_OR_ID: 'Invalid slug or id',
  INVALID_JSON_BODY: 'Invalid JSON body',
  NOT_FOUND: 'Not found',
  SEED_NOT_FOUND: 'Seed not found',
  DATABASE_ERROR: 'Database error',
  SLUG_CONFLICT: 'Slug already exists for this schema',
} as const

/** Riga grezza dal DB (data è stringa JSON) */
interface ContentEntryRow {
  id: string
  schema_slug: string
  slug: string | null
  status: string
  data: string
  created_at: number | null
  updated_at: number | null
}

interface ContentFacetsResponse {
  statuses: string[]
  tagsByColumnId: Record<string, string[]>
}

type QueryFilterType = 'text' | 'number' | 'date' | 'boolean' | 'tags' | 'select' | 'system'
type QueryFilterOperator =
  | 'eq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'is_empty'
  | 'is_not_empty'

interface QueryFilterCondition {
  id?: string
  op: QueryFilterOperator
  value: string | number | boolean | null
}

interface QueryFilterGroup {
  columnId: string
  label?: string
  type: QueryFilterType
  conditions: QueryFilterCondition[]
}

interface ContentListWithMetaResponse {
  items: ContentEntry[]
  total: number
  page: number
  limit: number
}

/** Entry parsata per il frontend (data è oggetto) */
export interface ContentEntry {
  id: string
  schema_slug: string
  slug: string | null
  status: string
  data: Record<string, unknown>
  created_at: number | null
  updated_at: number | null
}

function parseTagNames(value: unknown): string[] {
  let parsed: unknown = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as unknown
    } catch {
      parsed = value
    }
  }

  if (Array.isArray(parsed)) {
    return parsed
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean)
  }

  if (parsed && typeof parsed === 'object') {
    return Object.keys(parsed as Record<string, unknown>)
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return []
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed) || parsed < 1) return fallback
  return parsed
}

function escapeJsonPathKey(key: string): string {
  return key.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function getColumnSqlExpression(
  seed: ReturnType<typeof getSeed>,
  columnId: string
): { expr: string; branchType: string | null } | null {
  if (columnId === 'slug') {
    return { expr: 'slug', branchType: 'system' }
  }
  if (columnId === 'status') {
    return { expr: 'status', branchType: 'select' }
  }
  const branch = seed?.branches.find((b) => b.alias === columnId)
  if (!branch) return null
  const path = `$."${escapeJsonPathKey(branch.id)}"`
  return {
    expr: `json_extract(data, '${path}')`,
    branchType: branch.type,
  }
}

function parseQueryFilters(raw: string | undefined): QueryFilterGroup[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return []

    const groups = Object.values(parsed as Record<string, unknown>)
    const result: QueryFilterGroup[] = []
    for (const maybeGroup of groups) {
      if (!maybeGroup || typeof maybeGroup !== 'object') continue
      const group = maybeGroup as Partial<QueryFilterGroup>
      if (
        typeof group.columnId !== 'string' ||
        typeof group.type !== 'string' ||
        !Array.isArray(group.conditions)
      ) {
        continue
      }

      const conditions: QueryFilterCondition[] = []
      for (const maybeCond of group.conditions) {
        if (!maybeCond || typeof maybeCond !== 'object') continue
        const cond = maybeCond as Partial<QueryFilterCondition>
        if (typeof cond.op !== 'string') continue
        conditions.push({
          id: typeof cond.id === 'string' ? cond.id : undefined,
          op: cond.op as QueryFilterOperator,
          value:
            typeof cond.value === 'string' ||
            typeof cond.value === 'number' ||
            typeof cond.value === 'boolean' ||
            cond.value === null
              ? cond.value
              : null,
        })
      }

      if (conditions.length === 0) continue
      result.push({
        columnId: group.columnId,
        label: typeof group.label === 'string' ? group.label : undefined,
        type: group.type as QueryFilterType,
        conditions,
      })
    }
    return result
  } catch {
    return []
  }
}

type Bindings = {
  DB: D1Database
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
  R2_ENDPOINT?: string
  R2_BUCKET_NAME?: string
  ENV?: string
}

type Variables = {
  jwtPayload: { sub: string; email?: string }
}

const contentApp = new Hono<{ Bindings: Bindings; Variables: Variables }>()

/**
 * Converte row DB in ContentEntry con data parsata.
 * Se data contiene JSON corrotto, restituisce data: {} e logga un warning (nessun crash).
 */
function rowToEntry(row: ContentEntryRow): ContentEntry {
  let data: Record<string, unknown> = {}
  const raw = row.data
  if (raw && typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      data = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}
    } catch (err) {
      console.warn('Content parse error: corrupted JSON in row', row.id, err)
      data = {}
    }
  }
  return {
    id: row.id,
    schema_slug: row.schema_slug,
    slug: row.slug ?? null,
    status: row.status ?? 'draft',
    data,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

// POST /:slug - Creazione
contentApp.post('/:slug', async (c) => {
  const slug = c.req.param('slug')
  if (!slug) {
    return c.json({ error: CONTENT_ERRORS.INVALID_SLUG }, 400)
  }

  const seed = getSeed(slug)
  if (!seed) {
    return c.json({ error: CONTENT_ERRORS.SEED_NOT_FOUND }, 404)
  }

  let body: Record<string, unknown>
  try {
    const raw = await c.req.json<unknown>()
    body = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  } catch {
    return c.json({ error: CONTENT_ERRORS.INVALID_JSON_BODY }, 400)
  }

  const entrySlug = typeof body.slug === 'string' && body.slug.trim() !== '' ? body.slug.trim() : null
  const status = typeof body.status === 'string' && body.status.trim() !== '' ? body.status.trim() : 'draft'
  const bodyForData = { ...body }
  delete bodyForData.slug
  delete bodyForData.status
  const dbPayload = apiToDb(seed, bodyForData)
  const id = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)
  const dataStr = JSON.stringify(dbPayload)

  try {
    const { DB } = c.env
    if (entrySlug !== null) {
      const existing = await DB.prepare(
        'SELECT id FROM content_entries WHERE schema_slug = ? AND slug = ?'
      )
        .bind(slug, entrySlug)
        .first()
      if (existing) {
        return c.json({ error: CONTENT_ERRORS.SLUG_CONFLICT }, 409)
      }
    }
    await DB.prepare(
      `INSERT INTO content_entries (id, schema_slug, slug, status, data, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(id, slug, entrySlug, status, dataStr, now, now)
      .run()
    return c.json({ id }, 201)
  } catch (err) {
    console.error('Content create error:', err)
    return c.json({ error: CONTENT_ERRORS.DATABASE_ERROR }, 500)
  }
})

// GET /:slug - Lista per tipo
// TODO: Server-side pagination per dataset grandi (>500 righe). Aggiungere ?page=&limit=,
// usare LIMIT/OFFSET nella query, restituire { items, total }. Spostare filtri/ricerca lato server.
contentApp.get('/:slug', async (c) => {
  const slug = c.req.param('slug')
  if (!slug) {
    return c.json({ error: CONTENT_ERRORS.INVALID_SLUG }, 400)
  }

  const seed = getSeed(slug)
  if (!seed) {
    return c.json({ error: CONTENT_ERRORS.SEED_NOT_FOUND }, 404)
  }

  try {
    const { DB } = c.env

    const query = c.req.query()
    const search = (query.search ?? '').trim()
    const sortBy = (query.sortBy ?? '').trim()
    const sortDirRaw = (query.sortDir ?? '').trim().toLowerCase()
    const sortDir = sortDirRaw === 'asc' ? 'ASC' : 'DESC'
    const filters = parseQueryFilters(query.filters)

    const hasQueryParams =
      Boolean(search) ||
      Boolean(sortBy) ||
      Boolean(query.filters) ||
      query.page !== undefined ||
      query.limit !== undefined

    const page = parsePositiveInt(query.page, 1)
    const limit = Math.min(parsePositiveInt(query.limit, 25), 100)
    const offset = (page - 1) * limit

    const whereParts: string[] = ['schema_slug = ?']
    const whereBindings: Array<string | number> = [slug]

    if (search) {
      const term = `%${search}%`
      whereParts.push('(slug LIKE ? OR status LIKE ? OR data LIKE ?)')
      whereBindings.push(term, term, term)
    }

    for (const group of filters) {
      const column = getColumnSqlExpression(seed, group.columnId)
      if (!column) continue
      const { expr } = column

      const condParts: string[] = []
      const condBindings: Array<string | number> = []

      for (const cond of group.conditions) {
        const op = cond.op
        const value = cond.value

        if (op === 'is_empty') {
          condParts.push(`(${expr} IS NULL OR TRIM(CAST(${expr} AS TEXT)) = '')`)
          continue
        }

        if (op === 'is_not_empty') {
          condParts.push(`(${expr} IS NOT NULL AND TRIM(CAST(${expr} AS TEXT)) <> '')`)
          continue
        }

        if (group.type === 'tags') {
          if (
            (op === 'contains' || op === 'eq') &&
            typeof value === 'string' &&
            value.trim().length > 0
          ) {
            const tag = value.trim()
            const tagKey = escapeJsonPathKey(tag)
            condParts.push(
              `(
                json_type(${expr}) = 'array' AND EXISTS (
                  SELECT 1 FROM json_each(${expr}) je WHERE CAST(je.value AS TEXT) = ?
                )
              ) OR (
                json_type(${expr}) = 'object' AND json_type(json_extract(${expr}, '$."${tagKey}"')) IS NOT NULL
              ) OR (
                LOWER(CAST(${expr} AS TEXT)) LIKE LOWER(?)
              )`
            )
            condBindings.push(tag, `%${tag}%`)
          }
          continue
        }

        if (op === 'contains' && typeof value === 'string' && value.trim().length > 0) {
          condParts.push(`LOWER(CAST(${expr} AS TEXT)) LIKE LOWER(?)`)
          condBindings.push(`%${value.trim()}%`)
          continue
        }

        if (op === 'eq') {
          if (group.type === 'boolean' && typeof value === 'boolean') {
            condParts.push(`CAST(${expr} AS INTEGER) = ?`)
            condBindings.push(value ? 1 : 0)
          } else if (group.type === 'number' && typeof value === 'number' && !Number.isNaN(value)) {
            condParts.push(`CAST(${expr} AS REAL) = ?`)
            condBindings.push(value)
          } else if (
            typeof value === 'string' &&
            value.trim().length > 0
          ) {
            condParts.push(`LOWER(TRIM(CAST(${expr} AS TEXT))) = LOWER(TRIM(?))`)
            condBindings.push(value)
          }
          continue
        }

        if (['gt', 'gte', 'lt', 'lte'].includes(op)) {
          if (group.type === 'number' && typeof value === 'number' && !Number.isNaN(value)) {
            const operator = op === 'gt' ? '>' : op === 'gte' ? '>=' : op === 'lt' ? '<' : '<='
            condParts.push(`CAST(${expr} AS REAL) ${operator} ?`)
            condBindings.push(value)
          } else if (group.type === 'date' && typeof value === 'string' && value.trim().length > 0) {
            const operator = op === 'gt' ? '>' : op === 'gte' ? '>=' : op === 'lt' ? '<' : '<='
            condParts.push(`CAST(${expr} AS TEXT) ${operator} ?`)
            condBindings.push(value.trim())
          }
          continue
        }
      }

      if (condParts.length > 0) {
        whereParts.push(`(${condParts.join(' AND ')})`)
        whereBindings.push(...condBindings)
      }
    }

    const whereSql = `WHERE ${whereParts.join(' AND ')}`

    let orderSql = 'ORDER BY created_at DESC'
    if (sortBy) {
      const sortable = getColumnSqlExpression(seed, sortBy)
      if (sortable) {
        const expr = sortable.expr
        if (sortable.branchType === 'number' || sortable.branchType === 'boolean') {
          orderSql = `ORDER BY CAST(${expr} AS REAL) ${sortDir} NULLS LAST`
        } else {
          orderSql = `ORDER BY CAST(${expr} AS TEXT) ${sortDir} NULLS LAST`
        }
      }
    }

    let total = 0
    if (hasQueryParams) {
      const countSql = `SELECT COUNT(*) as total FROM content_entries ${whereSql}`
      const countRow = await DB.prepare(countSql)
        .bind(...whereBindings)
        .first<{ total: number }>()
      total = countRow?.total ?? 0
    }

    const listSql = hasQueryParams
      ? `SELECT id, schema_slug, slug, status, data, created_at, updated_at FROM content_entries ${whereSql} ${orderSql} LIMIT ? OFFSET ?`
      : `SELECT id, schema_slug, slug, status, data, created_at, updated_at FROM content_entries ${whereSql} ${orderSql}`
    const listBindings = hasQueryParams
      ? [...whereBindings, limit, offset]
      : whereBindings

    const result = await DB.prepare(listSql)
      .bind(...listBindings)
      .all<ContentEntryRow>()

    const entries: ContentEntry[] = (result.results ?? []).map((row) => {
      const entry = rowToEntry(row)
      return { ...entry, data: dbToApi(seed, entry.data) }
    })

    if (!hasQueryParams) {
      return c.json(entries)
    }

    const payload: ContentListWithMetaResponse = {
      items: entries,
      total,
      page,
      limit,
    }
    return c.json(payload)
  } catch (err) {
    console.error('Content list error:', err)
    return c.json({ error: CONTENT_ERRORS.DATABASE_ERROR }, 500)
  }
})

// GET /:slug/facets - Distinct values utili per filtri dinamici lato dashboard
contentApp.get('/:slug/facets', async (c) => {
  const slug = c.req.param('slug')
  if (!slug) {
    return c.json({ error: CONTENT_ERRORS.INVALID_SLUG }, 400)
  }

  const seed = getSeed(slug)
  if (!seed) {
    return c.json({ error: CONTENT_ERRORS.SEED_NOT_FOUND }, 404)
  }

  const tagAliases = seed.branches
    .filter((branch) => branch.type === 'json' && branch.alias.toLowerCase().includes('tag'))
    .map((branch) => branch.alias)

  const statusSet = new Set<string>()
  const tagsSetByAlias = new Map<string, Set<string>>()
  for (const alias of tagAliases) {
    tagsSetByAlias.set(alias, new Set<string>())
  }

  try {
    const { DB } = c.env
    const result = await DB.prepare(
      'SELECT status, data FROM content_entries WHERE schema_slug = ?'
    )
      .bind(slug)
      .all<{ status: string | null; data: string }>()

    for (const row of result.results ?? []) {
      const status = typeof row.status === 'string' ? row.status.trim() : ''
      if (status) {
        statusSet.add(status)
      }

      const entry = rowToEntry({
        id: '',
        schema_slug: slug,
        slug: null,
        status: status || 'draft',
        data: row.data,
        created_at: null,
        updated_at: null,
      })
      const data = dbToApi(seed, entry.data)

      for (const alias of tagAliases) {
        const tags = parseTagNames(data[alias])
        if (!tags.length) continue
        const set = tagsSetByAlias.get(alias)
        if (!set) continue
        for (const tag of tags) set.add(tag)
      }
    }

    const tagsByColumnId: Record<string, string[]> = {}
    for (const [alias, set] of tagsSetByAlias.entries()) {
      tagsByColumnId[alias] = Array.from(set).sort((a, b) => a.localeCompare(b, 'it'))
    }

    const payload: ContentFacetsResponse = {
      statuses: Array.from(statusSet).sort((a, b) => a.localeCompare(b, 'it')),
      tagsByColumnId,
    }
    return c.json(payload)
  } catch (err) {
    console.error('Content facets error:', err)
    return c.json({ error: CONTENT_ERRORS.DATABASE_ERROR }, 500)
  }
})

// GET /:schema_slug/by-slug/:entry_slug - Dettaglio pubblico per slug (prima di /:slug/:id)
contentApp.get('/:schema_slug/by-slug/:entry_slug', async (c) => {
  const schemaSlug = c.req.param('schema_slug')
  const entrySlug = c.req.param('entry_slug')
  if (!schemaSlug || !entrySlug) {
    return c.json({ error: CONTENT_ERRORS.INVALID_SLUG_OR_ID }, 400)
  }

  const seed = getSeed(schemaSlug)
  if (!seed) {
    return c.json({ error: CONTENT_ERRORS.SEED_NOT_FOUND }, 404)
  }

  try {
    const { DB } = c.env
    const row = await DB.prepare(
      'SELECT id, schema_slug, slug, status, data, created_at, updated_at FROM content_entries WHERE schema_slug = ? AND slug = ?'
    )
      .bind(schemaSlug, entrySlug)
      .first<ContentEntryRow>()

    if (!row) {
      return c.json({ error: CONTENT_ERRORS.NOT_FOUND }, 404)
    }

    const entry = rowToEntry(row)
    return c.json({ ...entry, data: dbToApi(seed, entry.data) })
  } catch (err) {
    console.error('Content by-slug error:', err)
    return c.json({ error: CONTENT_ERRORS.DATABASE_ERROR }, 500)
  }
})

// GET /:slug/:id - Dettaglio
contentApp.get('/:slug/:id', async (c) => {
  const slug = c.req.param('slug')
  const id = c.req.param('id')
  if (!slug || !id) {
    return c.json({ error: CONTENT_ERRORS.INVALID_SLUG_OR_ID }, 400)
  }

  const seed = getSeed(slug)
  if (!seed) {
    return c.json({ error: CONTENT_ERRORS.SEED_NOT_FOUND }, 404)
  }

  try {
    const { DB } = c.env
    const row = await DB.prepare(
      'SELECT id, schema_slug, slug, status, data, created_at, updated_at FROM content_entries WHERE schema_slug = ? AND id = ?'
    )
      .bind(slug, id)
      .first<ContentEntryRow>()

    if (!row) {
      return c.json({ error: CONTENT_ERRORS.NOT_FOUND }, 404)
    }

    const entry = rowToEntry(row)
    return c.json({ ...entry, data: dbToApi(seed, entry.data) })
  } catch (err) {
    console.error('Content detail error:', err)
    return c.json({ error: CONTENT_ERRORS.DATABASE_ERROR }, 500)
  }
})

// PUT /:slug/:id - Aggiornamento
contentApp.put('/:slug/:id', async (c) => {
  const slug = c.req.param('slug')
  const id = c.req.param('id')
  if (!slug || !id) {
    return c.json({ error: CONTENT_ERRORS.INVALID_SLUG_OR_ID }, 400)
  }

  const seed = getSeed(slug)
  if (!seed) {
    return c.json({ error: CONTENT_ERRORS.SEED_NOT_FOUND }, 404)
  }

  let body: Record<string, unknown>
  try {
    const raw = await c.req.json<unknown>()
    body = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  } catch {
    return c.json({ error: CONTENT_ERRORS.INVALID_JSON_BODY }, 400)
  }

  const bodyForData = { ...body }
  delete bodyForData.slug
  delete bodyForData.status
  const dbPayload = apiToDb(seed, bodyForData)
  const now = Math.floor(Date.now() / 1000)
  const dataStr = JSON.stringify(dbPayload)

  try {
    const { DB } = c.env
    const current = await DB.prepare(
      'SELECT slug, status FROM content_entries WHERE schema_slug = ? AND id = ?'
    )
      .bind(slug, id)
      .first<{ slug: string | null; status: string }>()
    if (!current) {
      return c.json({ error: CONTENT_ERRORS.NOT_FOUND }, 404)
    }
    const entrySlugReq = body.slug !== undefined
      ? (typeof body.slug === 'string' && body.slug.trim() !== '' ? body.slug.trim() : null)
      : undefined
    const statusReq = body.status !== undefined && typeof body.status === 'string' && body.status.trim() !== ''
      ? body.status.trim()
      : undefined
    const newSlug = entrySlugReq !== undefined ? entrySlugReq : current.slug
    const newStatus = statusReq !== undefined ? statusReq : current.status
    if (newSlug !== null) {
      const existing = await DB.prepare(
        'SELECT id FROM content_entries WHERE schema_slug = ? AND slug = ? AND id != ?'
      )
        .bind(slug, newSlug, id)
        .first()
      if (existing) {
        return c.json({ error: CONTENT_ERRORS.SLUG_CONFLICT }, 409)
      }
    }
    const result = await DB.prepare(
      `UPDATE content_entries SET data = ?, slug = ?, status = ?, updated_at = ? WHERE schema_slug = ? AND id = ?`
    )
      .bind(dataStr, newSlug, newStatus, now, slug, id)
      .run()

    if (!result.success || (result.meta?.changes ?? 0) === 0) {
      return c.json({ error: CONTENT_ERRORS.NOT_FOUND }, 404)
    }

    return c.json({ success: true })
  } catch (err) {
    console.error('Content update error:', err)
    return c.json({ error: CONTENT_ERRORS.DATABASE_ERROR }, 500)
  }
})

// DELETE /:slug/:id - Eliminazione entry e file R2 associati
contentApp.delete('/:slug/:id', async (c) => {
  const schemaSlug = c.req.param('slug')
  const entryId = c.req.param('id')
  if (!schemaSlug || !entryId) {
    return c.json({ error: CONTENT_ERRORS.INVALID_SLUG_OR_ID }, 400)
  }

  const seed = getSeed(schemaSlug)
  if (!seed) {
    return c.json({ error: CONTENT_ERRORS.SEED_NOT_FOUND }, 404)
  }

  try {
    const { DB } = c.env

    // 1. Fetch entry per estrarre chiavi R2 prima della delete
    const entryRow = await DB.prepare(
      'SELECT id, data FROM content_entries WHERE schema_slug = ? AND id = ?'
    )
      .bind(schemaSlug, entryId)
      .first<{ id: string; data: string }>()

    if (!entryRow) {
      return c.json({ error: CONTENT_ERRORS.NOT_FOUND }, 404)
    }

    // 2. Estrai chiavi R2 da data e elimina i file (non bloccare se R2 fallisce)
    let entryData: Record<string, unknown> = {}
    if (entryRow.data && typeof entryRow.data === 'string') {
      try {
        const parsed = JSON.parse(entryRow.data)
        entryData = typeof parsed === 'object' && parsed !== null ? parsed : {}
      } catch {
        // JSON corrotto: procedi senza cleanup R2
      }
    }
    const r2ObjectKeys = extractMediaKeysFromData(seed, entryData)
    if (r2ObjectKeys.length > 0) {
      try {
        await deleteR2Objects(c.env, r2ObjectKeys)
      } catch (err) {
        if (c.env.ENV !== 'production') {
          console.warn('R2 cleanup on delete failed:', err)
        }
      }
    }

    // 3. Elimina entry dal DB
    const result = await DB.prepare(
      `DELETE FROM content_entries WHERE schema_slug = ? AND id = ?`
    )
      .bind(schemaSlug, entryId)
      .run()

    if (!result.success || (result.meta?.changes ?? 0) === 0) {
      return c.json({ error: CONTENT_ERRORS.NOT_FOUND }, 404)
    }

    return c.json({ success: true })
  } catch (err) {
    console.error('Content delete error:', err)
    return c.json({ error: CONTENT_ERRORS.DATABASE_ERROR }, 500)
  }
})

export const contentRoutes = contentApp
