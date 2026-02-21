/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import { getSeed, apiToDb, dbToApi } from '@beech/core'

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

type Bindings = {
  DB: D1Database
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
    /**
     * SELECT content_entries per schema_slug.
     * bind(?) → schema_slug
     */
    const result = await DB.prepare(
      'SELECT id, schema_slug, slug, status, data, created_at, updated_at FROM content_entries WHERE schema_slug = ?'
    )
      .bind(slug)
      .all<ContentEntryRow>()

    const entries: ContentEntry[] = (result.results ?? []).map((row) => {
      const entry = rowToEntry(row)
      return { ...entry, data: dbToApi(seed, entry.data) }
    })
    return c.json(entries)
  } catch (err) {
    console.error('Content list error:', err)
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

// DELETE /:slug/:id - Eliminazione
contentApp.delete('/:slug/:id', async (c) => {
  const slug = c.req.param('slug')
  const id = c.req.param('id')
  if (!slug || !id) {
    return c.json({ error: CONTENT_ERRORS.INVALID_SLUG_OR_ID }, 400)
  }

  // Verifica che il seed esista (per consistenza con altri endpoint)
  const seed = getSeed(slug)
  if (!seed) {
    return c.json({ error: CONTENT_ERRORS.SEED_NOT_FOUND }, 404)
  }

  try {
    const { DB } = c.env
    /**
     * DELETE content_entries.
     * bind(?, ?) → schema_slug, id
     */
    const result = await DB.prepare(
      `DELETE FROM content_entries WHERE schema_slug = ? AND id = ?`
    )
      .bind(slug, id)
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
