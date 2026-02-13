/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'

/** Messaggi di errore API content - usati da handler e test */
export const CONTENT_ERRORS = {
  INVALID_SLUG: 'Invalid slug',
  INVALID_SLUG_OR_ID: 'Invalid slug or id',
  INVALID_JSON_BODY: 'Invalid JSON body',
  NOT_FOUND: 'Not found',
  DATABASE_ERROR: 'Database error',
} as const

/** Riga grezza dal DB (data è stringa JSON) */
interface ContentEntryRow {
  id: string
  schema_slug: string
  data: string
  created_at: number | null
  updated_at: number | null
}

/** Entry parsata per il frontend (data è oggetto) */
export interface ContentEntry {
  id: string
  schema_slug: string
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

  let body: Record<string, unknown>
  try {
    const raw = await c.req.json<unknown>()
    body = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  } catch {
    return c.json({ error: CONTENT_ERRORS.INVALID_JSON_BODY }, 400)
  }

  // TODO: Validate body against schema definition here
  const id = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)
  const dataStr = JSON.stringify(body)

  try {
    const { DB } = c.env
    /**
     * INSERT content_entries.
     * bind(?, ?, ?, ?, ?) → id (UUID), schema_slug, data (JSON string), created_at, updated_at
     */
    await DB.prepare(
      `INSERT INTO content_entries (id, schema_slug, data, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(id, slug, dataStr, now, now)
      .run()
    return c.json({ id }, 201)
  } catch (err) {
    console.error('Content create error:', err)
    return c.json({ error: CONTENT_ERRORS.DATABASE_ERROR }, 500)
  }
})

// GET /:slug - Lista per tipo
contentApp.get('/:slug', async (c) => {
  const slug = c.req.param('slug')
  if (!slug) {
    return c.json({ error: CONTENT_ERRORS.INVALID_SLUG }, 400)
  }

  try {
    const { DB } = c.env
    /**
     * SELECT content_entries per schema_slug.
     * bind(?) → schema_slug
     */
    const result = await DB.prepare(
      'SELECT id, schema_slug, data, created_at, updated_at FROM content_entries WHERE schema_slug = ?'
    )
      .bind(slug)
      .all<ContentEntryRow>()

    const entries: ContentEntry[] = (result.results ?? []).map(rowToEntry)
    return c.json(entries)
  } catch (err) {
    console.error('Content list error:', err)
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

  try {
    const { DB } = c.env
    /**
     * SELECT content_entries per schema_slug e id.
     * bind(?, ?) → schema_slug, id
     */
    const row = await DB.prepare(
      'SELECT id, schema_slug, data, created_at, updated_at FROM content_entries WHERE schema_slug = ? AND id = ?'
    )
      .bind(slug, id)
      .first<ContentEntryRow>()

    if (!row) {
      return c.json({ error: CONTENT_ERRORS.NOT_FOUND }, 404)
    }

    const entry = rowToEntry(row)
    return c.json(entry)
  } catch (err) {
    console.error('Content detail error:', err)
    return c.json({ error: CONTENT_ERRORS.DATABASE_ERROR }, 500)
  }
})

export const contentRoutes = contentApp
