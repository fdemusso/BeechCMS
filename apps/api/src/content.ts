/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import {
  buildSelectQuery,
  isValidContentStatus,
  validateAndSanitizeSeedPayload,
  slugify,
  resolvePolicies,
} from '@beech/core'
import type { Seed } from '@beech/core'
import { deleteR2Objects } from './upload'
import { extractMediaKeysFromData } from './media-utils'
import { publicProblem } from './public/problem-details'
import { logActivity } from './shared/activity-logger'
import { cleanStr, parsePositiveInt, parseQueryFilters, safeParseJson, toEngineFilters } from './shared/query-utils'
import type { ContentEntry } from './shared/query-utils'
import { applyPrivacy, applyVisibility, PrivacyPolicyError } from './shared/apply-policies'
import { rowToApiData, rowToEntry, buildInsertBindings, buildUpdateBindings, hasDraft, logContentEvent } from './shared/content-utils'

export type { ContentEntry } from './shared/query-utils'

export const CONTENT_ERRORS = {
  INVALID_SLUG: 'Invalid slug',
  INVALID_SLUG_OR_ID: 'Invalid slug or id',
  INVALID_JSON_BODY: 'Invalid JSON body',
  NOT_FOUND: 'Not found',
  SEED_NOT_FOUND: 'Seed not found',
  DATABASE_ERROR: 'Database error',
  SLUG_CONFLICT: 'Slug already exists for this schema',
  SENSITIVE_FIELD_EDIT: 'Cannot edit sensitive fields',
} as const

interface ContentFacetsResponse {
  statuses: string[]
  tagsByColumnId: Record<string, string[]>
}

function parseTagNames(value: unknown): string[] {
  let parsed: unknown = value
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value) } catch { parsed = value }
  }
  if (Array.isArray(parsed)) return parsed.map(cleanStr).filter(Boolean) as string[]
  if (parsed && typeof parsed === 'object') return Object.keys(parsed).map(cleanStr).filter(Boolean) as string[]
  const single = cleanStr(parsed)
  return single ? [single] : []
}

function normalizeBody(raw: unknown): Record<string, unknown> {
  return typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
}

function contentValidationProblem(
  c: Parameters<typeof publicProblem>[0],
  details: Array<{ field: string; expected: string; received: string; message: string }>
) {
  return publicProblem(c, { type: 'content-validation-failed', title: 'Bad Request', status: 400, detail: 'Validation failed', errors: details })
}

type Bindings = {
  DB: D1Database
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
  R2_ENDPOINT?: string
  R2_BUCKET_NAME?: string
  MEDIA_BASE_URL?: string
  ENV?: string
}

type Variables = {
  jwtPayload: { sub: string; email?: string }
  getSeed: (slug: string) => Seed | null
  seedRegistry: Record<string, Seed>
}

const contentApp = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// POST /:slug — Creazione
contentApp.post('/:slug', async (c) => {
  const slug = c.req.param('slug')
  if (!slug) return publicProblem(c, { type: 'content-invalid-slug', title: 'Bad Request', status: 400, detail: CONTENT_ERRORS.INVALID_SLUG })

  const seed = c.get('getSeed')(slug)
  if (!seed) return publicProblem(c, { type: 'content-seed-not-found', title: 'Not Found', status: 404, detail: CONTENT_ERRORS.SEED_NOT_FOUND })

  let body: Record<string, unknown>
  try {
    body = normalizeBody(await c.req.json<unknown>())
  } catch {
    return publicProblem(c, { type: 'content-invalid-json', title: 'Bad Request', status: 400, detail: CONTENT_ERRORS.INVALID_JSON_BODY })
  }

  const entrySlug = body.slug ? slugify(String(body.slug)) : null
  const status = cleanStr(body.status) ?? 'draft'
  if (!isValidContentStatus(status)) {
    return publicProblem(c, { type: 'content-invalid-status', title: 'Bad Request', status: 400, detail: 'Invalid status. Allowed values are: draft, review, published' })
  }

  const bodyForData = { ...body }
  delete bodyForData.slug
  delete bodyForData.status

  const validation = validateAndSanitizeSeedPayload(seed, bodyForData, {
    operation: 'create', allowNull: false, requireAtLeastOneValidField: true, enforceRequiredFields: true,
  })
  if (validation.dangerousFields.length > 0) {
    return publicProblem(c, { type: 'content-dangerous-content', title: 'Unprocessable Entity', status: 422, detail: `Content rejected: dangerous markup detected in field '${validation.dangerousFields[0]}'` })
  }
  if (validation.details.length > 0) return contentValidationProblem(c, validation.details)

  let privacyData: Record<string, unknown>
  try {
    privacyData = await applyPrivacy(validation.data, seed)
  } catch (err) {
    if (err instanceof PrivacyPolicyError) {
      return publicProblem(c, { type: 'content-policy-not-implemented', title: 'Not Implemented', status: 501, detail: err.message })
    }
    throw err
  }

  const { cols, placeholders, bindings } = buildInsertBindings(seed, privacyData)
  const id = crypto.randomUUID()
  
  let finalSlug = entrySlug
  if (!finalSlug) {
    const fallbackSource = privacyData[seed.displayNameAlias ?? 'title'] || privacyData.title || privacyData.name || id
    finalSlug = slugify(String(fallbackSource))
  }

  const now = Math.floor(Date.now() / 1000)
  const table = `content_${slug}`

  const systemCols = ['id', 'slug', 'status', 'created_at', 'updated_at']
  const systemVals = [id, finalSlug, status, now, now]
  const allCols = [...systemCols, ...cols].join(', ')
  const allPlaceholders = [...systemVals.map(() => '?'), ...placeholders].join(', ')

  try {
    const { DB } = c.env

    const existing = await DB.prepare(`SELECT id FROM ${table} WHERE slug = ?`).bind(finalSlug).first()
    if (existing) {
      return publicProblem(c, { type: 'content-slug-conflict', title: 'Conflict', status: 409, detail: CONTENT_ERRORS.SLUG_CONFLICT })
    }

    await DB.prepare(`INSERT INTO ${table} (${allCols}) VALUES (${allPlaceholders})`)
      .bind(...systemVals, ...bindings)
      .run()

    const userId = c.get('jwtPayload')?.sub
    logContentEvent(DB, { action: 'create', schemaSlug: slug, entryId: id, userId, details: { title: privacyData.title || privacyData.name || entrySlug } }).catch(() => {})
    logActivity(c, { action: 'create', entityType: 'content', entityId: id, entitySlug: slug, details: { title: privacyData.title || privacyData.name || entrySlug } })

    return c.json({ id }, 201)
  } catch (err) {
    console.error('Content create error:', err)
    return publicProblem(c, { type: 'content-database-error', title: 'Internal Server Error', status: 500, detail: CONTENT_ERRORS.DATABASE_ERROR })
  }
})

// GET /:slug/facets — Valori distinti per filtri dashboard
contentApp.get('/:slug/facets', async (c) => {
  const slug = c.req.param('slug')
  if (!slug) return publicProblem(c, { type: 'content-invalid-slug', title: 'Bad Request', status: 400, detail: CONTENT_ERRORS.INVALID_SLUG })

  const seed = c.get('getSeed')(slug)
  if (!seed) return publicProblem(c, { type: 'content-seed-not-found', title: 'Not Found', status: 404, detail: CONTENT_ERRORS.SEED_NOT_FOUND })

  const tagBranches = seed.branches.filter((b) => b.type === 'json' && b.alias.toLowerCase().includes('tag'))
  const tagAliases = tagBranches.map((b) => b.alias)
  const statusSet = new Set<string>()
  const tagsSetByAlias = new Map<string, Set<string>>(tagAliases.map((a) => [a, new Set()]))

  try {
    const { DB } = c.env
    const selectCols = ['status', ...tagAliases].join(', ')
    const result = await DB.prepare(`SELECT ${selectCols} FROM content_${slug}`)
      .all<Record<string, unknown>>()

    for (const row of result.results ?? []) {
      const s = cleanStr(row.status) ?? ''
      if (s) statusSet.add(s)
      for (const alias of tagAliases) {
        for (const tag of parseTagNames(row[alias])) {
          tagsSetByAlias.get(alias)?.add(tag)
        }
      }
    }

    const tagsByColumnId: Record<string, string[]> = {}
    for (const [alias, set] of tagsSetByAlias.entries()) {
      tagsByColumnId[alias] = Array.from(set).sort((a, b) => a.localeCompare(b, 'it'))
    }
    return c.json({
      statuses: Array.from(statusSet).sort((a, b) => a.localeCompare(b, 'it')),
      tagsByColumnId,
    } satisfies ContentFacetsResponse)
  } catch (err) {
    console.error('Content facets error:', err)
    return publicProblem(c, { type: 'content-database-error', title: 'Internal Server Error', status: 500, detail: CONTENT_ERRORS.DATABASE_ERROR })
  }
})

// GET /:schema_slug/by-slug/:entry_slug — Dettaglio per slug URL
contentApp.get('/:schema_slug/by-slug/:entry_slug', async (c) => {
  const schemaSlug = c.req.param('schema_slug')
  const entrySlug = c.req.param('entry_slug')
  if (!schemaSlug || !entrySlug) {
    return publicProblem(c, { type: 'content-invalid-slug-or-id', title: 'Bad Request', status: 400, detail: CONTENT_ERRORS.INVALID_SLUG_OR_ID })
  }

  const seed = c.get('getSeed')(schemaSlug)
  if (!seed) return publicProblem(c, { type: 'content-seed-not-found', title: 'Not Found', status: 404, detail: CONTENT_ERRORS.SEED_NOT_FOUND })

  try {
    const { DB } = c.env
    const row = await DB.prepare(`SELECT * FROM content_${schemaSlug} WHERE slug = ?`)
      .bind(entrySlug)
      .first<Record<string, unknown>>()

    if (!row) return publicProblem(c, { type: 'content-not-found', title: 'Not Found', status: 404, detail: CONTENT_ERRORS.NOT_FOUND })

    const pending = await hasDraft(DB, seed, row.id as string)
    const entry = rowToEntry(seed, row, pending)
    return c.json({ ...entry, data: applyVisibility(entry.data, seed) })
  } catch (err) {
    console.error('Content by-slug error:', err)
    return publicProblem(c, { type: 'content-database-error', title: 'Internal Server Error', status: 500, detail: CONTENT_ERRORS.DATABASE_ERROR })
  }
})

// PUT /:slug/:id — Aggiornamento
contentApp.put('/:slug/:id', async (c) => {
  const slug = c.req.param('slug')
  const id = c.req.param('id')
  if (!slug || !id) {
    return publicProblem(c, { type: 'content-invalid-slug-or-id', title: 'Bad Request', status: 400, detail: CONTENT_ERRORS.INVALID_SLUG_OR_ID })
  }

  const seed = c.get('getSeed')(slug)
  if (!seed) return publicProblem(c, { type: 'content-seed-not-found', title: 'Not Found', status: 404, detail: CONTENT_ERRORS.SEED_NOT_FOUND })

  let body: Record<string, unknown>
  try {
    body = normalizeBody(await c.req.json<unknown>())
  } catch {
    return publicProblem(c, { type: 'content-invalid-json', title: 'Bad Request', status: 400, detail: CONTENT_ERRORS.INVALID_JSON_BODY })
  }

  const bodyForData = { ...body }
  delete bodyForData.slug
  delete bodyForData.status
  const now = Math.floor(Date.now() / 1000)
  const table = `content_${slug}`

  try {
    const { DB } = c.env
    const current = await DB.prepare(`SELECT slug, status FROM ${table} WHERE id = ?`)
      .bind(id)
      .first<{ slug: string | null; status: string }>()

    if (!current) return publicProblem(c, { type: 'content-not-found', title: 'Not Found', status: 404, detail: CONTENT_ERRORS.NOT_FOUND })

    const newSlug = body.slug !== undefined ? slugify(String(body.slug)) : (current.slug ?? '')
    const newStatus = body.status !== undefined ? (cleanStr(body.status) ?? current.status) : current.status

    if (!isValidContentStatus(newStatus)) {
      return publicProblem(c, { type: 'content-invalid-status', title: 'Bad Request', status: 400, detail: 'Invalid status. Allowed values are: draft, review, published' })
    }
    if (!newSlug) {
      return publicProblem(c, { type: 'content-missing-slug', title: 'Bad Request', status: 400, detail: 'Missing required field: slug' })
    }

    let mergedData: Record<string, unknown> = {}

    if (Object.keys(bodyForData).length > 0) {
      const sensitiveAliases = Object.keys(bodyForData).filter((alias) => {
        const branch = seed.branches.find((b) => b.alias === alias)
        return branch != null && resolvePolicies(branch).privacy !== 'plain'
      })
      if (sensitiveAliases.length > 0) {
        return publicProblem(c, { type: 'content-sensitive-field-edit', title: 'Unprocessable Entity', status: 422, detail: `${CONTENT_ERRORS.SENSITIVE_FIELD_EDIT}: ${sensitiveAliases.join(', ')}` })
      }

      const validation = validateAndSanitizeSeedPayload(seed, bodyForData, {
        operation: 'update', allowNull: true, requireAtLeastOneValidField: true, enforceRequiredFields: true,
      })
      if (validation.dangerousFields.length > 0) {
        return publicProblem(c, { type: 'content-dangerous-content', title: 'Unprocessable Entity', status: 422, detail: `Content rejected: dangerous markup detected in field '${validation.dangerousFields[0]}'` })
      }
      if (validation.details.length > 0) return contentValidationProblem(c, validation.details)

      let privacyPatch: Record<string, unknown>
      try {
        privacyPatch = await applyPrivacy(validation.data, seed)
      } catch (err) {
        if (err instanceof PrivacyPolicyError) {
          return publicProblem(c, { type: 'content-policy-not-implemented', title: 'Not Implemented', status: 501, detail: (err as PrivacyPolicyError).message })
        }
        throw err
      }
      // Remove null values from patch (patch semantics: null = leave unchanged)
      for (const [k, v] of Object.entries(privacyPatch)) {
        if (v !== null) mergedData[k] = v
      }
    }

    if (newSlug !== current.slug) {
      const existing = await DB.prepare(`SELECT id FROM ${table} WHERE slug = ? AND id != ?`).bind(newSlug, id).first()
      if (existing) {
        return publicProblem(c, { type: 'content-slug-conflict', title: 'Conflict', status: 409, detail: CONTENT_ERRORS.SLUG_CONFLICT })
      }
    }

    const { setClause, bindings } = buildUpdateBindings(seed, mergedData)
    const systemSet = `slug = ?, status = ?, updated_at = ?`
    const fullSet = setClause ? `${systemSet}, ${setClause}` : systemSet

    await DB.prepare(`UPDATE ${table} SET ${fullSet} WHERE id = ?`)
      .bind(newSlug, newStatus, now, ...bindings, id)
      .run()

    const userId = c.get('jwtPayload')?.sub
    logContentEvent(DB, { action: 'update', schemaSlug: slug, entryId: id, userId, details: { title: mergedData.title || mergedData.name || newSlug } }).catch(() => {})
    logActivity(c, { action: 'update', entityType: 'content', entityId: id, entitySlug: slug, details: { title: mergedData.title || mergedData.name || newSlug } })

    return c.json({ success: true })
  } catch (err) {
    console.error('Content update error:', err)
    return publicProblem(c, { type: 'content-database-error', title: 'Internal Server Error', status: 500, detail: CONTENT_ERRORS.DATABASE_ERROR })
  }
})

// DELETE /:slug/:id — Eliminazione + cleanup R2
contentApp.delete('/:slug/:id', async (c) => {
  const schemaSlug = c.req.param('slug')
  const entryId = c.req.param('id')
  if (!schemaSlug || !entryId) {
    return publicProblem(c, { type: 'content-invalid-slug-or-id', title: 'Bad Request', status: 400, detail: CONTENT_ERRORS.INVALID_SLUG_OR_ID })
  }

  const seed = c.get('getSeed')(schemaSlug)
  if (!seed) return publicProblem(c, { type: 'content-seed-not-found', title: 'Not Found', status: 404, detail: CONTENT_ERRORS.SEED_NOT_FOUND })

  const table = `content_${schemaSlug}`

  try {
    const { DB } = c.env

    const row = await DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(entryId).first<Record<string, unknown>>()
    if (!row) {
      return publicProblem(c, { type: 'content-not-found', title: 'Not Found', status: 404, detail: CONTENT_ERRORS.NOT_FOUND })
    }

    const result = await DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(entryId).run()

    if (!result.success) throw new Error('Database deletion failed unexpectedly')
    if (!result.meta?.changes) {
      return publicProblem(c, { type: 'content-not-found', title: 'Not Found', status: 404, detail: CONTENT_ERRORS.NOT_FOUND })
    }

    const aliasData = rowToApiData(seed, row)
    const userId = c.get('jwtPayload')?.sub
    logContentEvent(DB, { action: 'delete', schemaSlug, entryId, userId, details: { title: aliasData.title || aliasData.name || entryId } }).catch(() => {})
    logActivity(c, { action: 'delete', entityType: 'content', entityId: entryId, entitySlug: schemaSlug, details: { title: aliasData.title || aliasData.name || entryId } })

    // Cleanup R2 — usa alias data (colonne reali già deserializzate)
    const r2ObjectKeys = extractMediaKeysFromData(seed, aliasData)
    if (r2ObjectKeys.length > 0) {
      await deleteR2Objects(c.env, r2ObjectKeys).catch((err) => {
        if (c.env.ENV !== 'production') console.warn('R2 cleanup on delete failed (orphaned files):', err)
      })
    }

    return c.json({ success: true })
  } catch (err) {
    console.error('Content delete error:', err)
    return publicProblem(c, { type: 'content-database-error', title: 'Internal Server Error', status: 500, detail: CONTENT_ERRORS.DATABASE_ERROR })
  }
})

// GET /:slug — Lista con filtri, sort, pagination
contentApp.get('/:slug', async (c) => {
  const slug = c.req.param('slug')
  if (!slug) return publicProblem(c, { type: 'content-invalid-slug', title: 'Bad Request', status: 400, detail: CONTENT_ERRORS.INVALID_SLUG })

  const seed = c.get('getSeed')(slug)
  if (!seed) return publicProblem(c, { type: 'content-seed-not-found', title: 'Not Found', status: 404, detail: CONTENT_ERRORS.SEED_NOT_FOUND })

  try {
    const { DB } = c.env
    const query = c.req.query()

    const search = cleanStr(query.search) ?? ''
    const sortBy = cleanStr(query.sortBy) ?? ''
    const sortDirRaw = cleanStr(query.sortDir)?.toLowerCase() ?? 'asc'
    const rawFilters = parseQueryFilters(query.filters)
    const engineFilters = toEngineFilters(rawFilters)
    const hasPendingDraftFilter = query.has_pending_draft === '1' || query.has_pending_draft === 'true'

    const page = parsePositiveInt(query.page, 1)
    const limit = Math.min(parsePositiveInt(query.limit, 25), 100)
    const offset = (page - 1) * limit
    const hasQueryParams = Boolean(search) || Boolean(sortBy) || Boolean(query.filters) || query.page !== undefined || query.limit !== undefined || hasPendingDraftFilter

    const orderBy = sortBy
      ? { column: sortBy, dir: (sortDirRaw === 'desc' ? 'DESC' : 'ASC') as 'ASC' | 'DESC' }
      : undefined

    // has_pending_draft: EXISTS subquery per seeds con allowDrafts
    const draftSubquery = seed.allowDrafts
      ? `, CASE WHEN EXISTS (SELECT 1 FROM content_${slug}_drafts d WHERE d.entry_id = content_${slug}.id) THEN 1 ELSE 0 END as has_pending_draft`
      : ', 0 as has_pending_draft'

    const { sql: baseSql, bindings: baseBindings } = buildSelectQuery(seed, {
      filters: engineFilters,
      orderBy,
      search: search || undefined,
      pagination: hasQueryParams ? { limit, offset } : undefined,
    })

    // Inject has_pending_draft subquery into SELECT
    const listSql = baseSql.replace(
      `SELECT content_${slug}.* FROM content_${slug}`,
      `SELECT content_${slug}.*${draftSubquery} FROM content_${slug}`
    )

    // has_pending_draft filter (JOIN on drafts table)
    let finalSql = listSql
    const finalBindings = [...baseBindings]
    if (hasPendingDraftFilter && seed.allowDrafts) {
      // NOTE: use lastIndexOf to skip the draftSubquery's `FROM content_${slug}_drafts`
      // (which starts with the same prefix) and land on the real main-table FROM.
      const fromIdx = listSql.lastIndexOf(` FROM content_${slug}`)
      const afterFrom = fromIdx >= 0 ? listSql.slice(fromIdx) : listSql
      const hasTopLevelWhere = / WHERE /i.test(afterFrom.replace(/\(SELECT[^)]+\)/gi, ''))
      const whereOrAnd = hasTopLevelWhere ? ' AND' : ' WHERE'
      const orderByIdx = listSql.lastIndexOf(' ORDER BY ')
      if (orderByIdx >= 0) {
        finalSql =
          listSql.slice(0, orderByIdx) +
          `${whereOrAnd} EXISTS (SELECT 1 FROM content_${slug}_drafts d WHERE d.entry_id = content_${slug}.id)` +
          listSql.slice(orderByIdx)
      } else {
        finalSql += `${whereOrAnd} EXISTS (SELECT 1 FROM content_${slug}_drafts d WHERE d.entry_id = content_${slug}.id)`
      }
    }

    let total = 0
    if (hasQueryParams) {
      const { sql: countSql, bindings: countBindings } = buildSelectQuery(seed, {
        filters: engineFilters,
        search: search || undefined,
      })
      const countWrapped = `SELECT COUNT(*) as total FROM (${countSql})`
      const countRow = await DB.prepare(countWrapped).bind(...countBindings).first<{ total: number }>()
      total = countRow?.total ?? 0
    }

    const result = await DB.prepare(finalSql).bind(...finalBindings).all<Record<string, unknown>>()

    const entries: ContentEntry[] = (result.results ?? []).map((row) => {
      const pending = (row.has_pending_draft as number) === 1
      const entry = rowToEntry(seed, row, pending)
      return { ...entry, data: applyVisibility(entry.data, seed) }
    })

    if (!hasQueryParams) return c.json(entries)
    return c.json({ items: entries, total, page, limit })
  } catch (err) {
    console.error('Content list error:', err)
    return publicProblem(c, { type: 'content-database-error', title: 'Internal Server Error', status: 500, detail: CONTENT_ERRORS.DATABASE_ERROR })
  }
})

// GET /:slug/:id — Dettaglio singola entry
contentApp.get('/:slug/:id', async (c) => {
  const slug = c.req.param('slug')
  const id = c.req.param('id')
  if (!slug || !id) {
    return publicProblem(c, { type: 'content-invalid-slug-or-id', title: 'Bad Request', status: 400, detail: CONTENT_ERRORS.INVALID_SLUG_OR_ID })
  }

  const seed = c.get('getSeed')(slug)
  if (!seed) return publicProblem(c, { type: 'content-seed-not-found', title: 'Not Found', status: 404, detail: CONTENT_ERRORS.SEED_NOT_FOUND })

  try {
    const { DB } = c.env
    const row = await DB.prepare(`SELECT * FROM content_${slug} WHERE id = ?`).bind(id).first<Record<string, unknown>>()

    if (!row) return publicProblem(c, { type: 'content-not-found', title: 'Not Found', status: 404, detail: CONTENT_ERRORS.NOT_FOUND })

    const pending = await hasDraft(DB, seed, id)
    const entry = rowToEntry(seed, row, pending)
    return c.json({ ...entry, data: applyVisibility(entry.data, seed) })
  } catch (err) {
    console.error('Content detail error:', err)
    return publicProblem(c, { type: 'content-database-error', title: 'Internal Server Error', status: 500, detail: CONTENT_ERRORS.DATABASE_ERROR })
  }
})

export const contentRoutes = contentApp
