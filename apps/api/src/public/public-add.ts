import { apiToDb, getSeed, isValidContentStatus } from '@beech/core'
import type { Context } from 'hono'
import { cleanStr } from '../shared/query-utils'
import { generateEntrySlug, slugify } from './slug-utils'
import { sanitizePublicPayload } from './sanitize'

type Bindings = {
  DB: D1Database
  PUBLIC_API_KEY?: string
  ENV?: string
}

type Variables = {
  jwtPayload: { sub: string; email?: string }
}

function errorMessage(c: Context<{ Bindings: Bindings; Variables: Variables }>, err: unknown): string {
  if (c.env.ENV !== 'production' && err instanceof Error) {
    return err.message
  }
  return 'An unexpected error occurred.'
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function pickSlugFromBody(body: Record<string, unknown>, sanitizedData: Record<string, unknown>): string {
  const explicitSlug = cleanStr(body.slug)
  if (explicitSlug) {
    return slugify(explicitSlug)
  }
  return generateEntrySlug({
    title: sanitizedData.title,
    name: sanitizedData.name,
  })
}

export async function publicAddHandler(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
  const seedSlug = c.req.param('seed')
  const seed = getSeed(seedSlug)
  if (!seed) {
    return c.json(
      {
        error: 'Seed Not Found',
        message: `The content type '${seedSlug}' does not exist.`,
      },
      404
    )
  }

  let body: Record<string, unknown>
  try {
    const parsed = await c.req.json<unknown>()
    body = asRecord(parsed) ?? {}
  } catch {
    return c.json({ error: 'Bad Request', message: 'Invalid JSON body' }, 400)
  }

  const rawData = asRecord(body.data)
  if (!rawData || Object.keys(rawData).length === 0) {
    return c.json(
      {
        error: 'Bad Request',
        message: "Field 'data' is required and must be a non-empty object",
      },
      400
    )
  }

  const statusValue = body.status ?? 'draft'
  if (!isValidContentStatus(statusValue)) {
    return c.json(
      {
        error: 'Bad Request',
        message: "Invalid status. Allowed values are: draft, review, published",
      },
      400
    )
  }

  const sanitized = sanitizePublicPayload(seed, rawData)
  if (!sanitized.ok) {
    if (sanitized.status === 422) {
      return c.json({ error: 'Unprocessable Entity', message: sanitized.message }, 422)
    }
    return c.json(
      {
        error: 'Bad Request',
        message: sanitized.message,
        details: sanitized.details,
      },
      400
    )
  }

  const entrySlug = pickSlugFromBody(body, sanitized.data)
  const finalSlug = entrySlug || crypto.randomUUID().slice(0, 8)

  try {
    const { DB } = c.env

    const slugExisting = await DB.prepare(
      'SELECT id FROM content_entries WHERE schema_slug = ? AND slug = ? LIMIT 1'
    )
      .bind(seedSlug, finalSlug)
      .first<{ id: string }>()

    if (slugExisting) {
      return c.json(
        {
          error: 'Conflict',
          message: `An entry with slug '${finalSlug}' already exists for content type '${seedSlug}'.`,
        },
        409
      )
    }

    const id = crypto.randomUUID()
    const now = Math.floor(Date.now() / 1000)
    const dbPayload = apiToDb(seed, sanitized.data)

    await DB.prepare(
      `INSERT INTO content_entries (id, schema_slug, slug, status, data, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(id, seedSlug, finalSlug, statusValue, JSON.stringify(dbPayload), now, now)
      .run()

    return c.json({ success: true, id, slug: finalSlug }, 201)
  } catch (err) {
    return c.json(
      {
        error: 'Internal Server Error',
        message: errorMessage(c, err),
      },
      500
    )
  }
}

