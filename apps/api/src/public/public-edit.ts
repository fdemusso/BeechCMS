import { apiToDb, dbToApi, getSeed, isValidContentStatus } from '@beech/core'
import type { Context } from 'hono'
import { cleanStr, rowToEntry } from '../shared/query-utils'
import type { ContentEntryRow } from '../shared/query-utils'
import { checkPublicOperation } from './access-policy'
import { slugify } from './slug-utils'
import { sanitizePublicPayload } from './sanitize'

type Bindings = {
  DB: D1Database
  PUBLIC_READ_API_KEY?: string
  PUBLIC_WRITE_API_KEY?: string
  PUBLIC_STRICT_UNKNOWN_ALIASES?: string
  ENV?: string
}

type Variables = {
  jwtPayload: { sub: string; email?: string }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
type PublicCtx = Context<{ Bindings: Bindings; Variables: Variables }>
type ResolveResult<T> = { ok: true; value: T } | { ok: false; response: Response }

function errorMessage(c: PublicCtx, err: unknown): string {
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

function removeNullishFields(data: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (value !== null) {
      next[key] = value
    }
  }
  return next
}

function parseBody(c: PublicCtx): Promise<ResolveResult<Record<string, unknown>>> {
  return c.req
    .json<unknown>()
    .then((parsed) => ({ ok: true, value: asRecord(parsed) ?? {} }) as const)
    .catch(() => ({
      ok: false,
      response: c.json({ error: 'Bad Request', message: 'Invalid JSON body' }, 400),
    }))
}

function resolveSlug(c: PublicCtx, body: Record<string, unknown>, currentSlug: string): ResolveResult<{
  slugRequested: boolean
  nextSlug: string
}> {
  const slugRequested = Object.hasOwn(body, 'slug')
  if (!slugRequested) {
    return { ok: true, value: { slugRequested, nextSlug: currentSlug } }
  }

  const requestedSlug = cleanStr(body.slug)
  if (!requestedSlug) {
    return {
      ok: false,
      response: c.json(
        {
          error: 'Bad Request',
          message: "Field 'slug' must be a non-empty string",
        },
        400
      ),
    }
  }

  return { ok: true, value: { slugRequested, nextSlug: slugify(requestedSlug) } }
}

function resolveStatus(c: PublicCtx, body: Record<string, unknown>, currentStatus: string): ResolveResult<string> {
  if (!Object.hasOwn(body, 'status')) {
    return { ok: true, value: currentStatus }
  }

  const statusValue = body.status
  if (!isValidContentStatus(statusValue)) {
    return {
      ok: false,
      response: c.json(
        {
          error: 'Bad Request',
          message: "Invalid status. Allowed values are: draft, review, published",
        },
        400
      ),
    }
  }

  return { ok: true, value: statusValue }
}

function resolveData(
  c: PublicCtx,
  seed: NonNullable<ReturnType<typeof getSeed>>,
  body: Record<string, unknown>,
  currentRow: ContentEntryRow
): ResolveResult<string> {
  if (!Object.hasOwn(body, 'data')) {
    return { ok: true, value: currentRow.data }
  }

  const rawData = asRecord(body.data)
  if (!rawData) {
    return {
      ok: false,
      response: c.json(
        {
          error: 'Bad Request',
          message: "Field 'data' must be an object when provided",
        },
        400
      ),
    }
  }

  const strictUnknownAliases = c.env.PUBLIC_STRICT_UNKNOWN_ALIASES === 'true'
  const sanitized = sanitizePublicPayload(seed, rawData, {
    allowNull: true,
    strictUnknownAliases,
  })
  if (!sanitized.ok) {
    if (sanitized.status === 422) {
      return {
        ok: false,
        response: c.json({ error: 'Unprocessable Entity', message: sanitized.message }, 422),
      }
    }

    return {
      ok: false,
      response: c.json(
        {
          error: 'Bad Request',
          message: sanitized.message,
          details: sanitized.details,
        },
        400
      ),
    }
  }
  if (sanitized.unknownAliases.length > 0) {
    console.warn('[public-edit] Unknown aliases ignored', {
      seed: seed.slug,
      unknownAliases: sanitized.unknownAliases,
    })
  }

  const currentEntry = rowToEntry(currentRow)
  const currentAliasData = dbToApi(seed, currentEntry.data)
  const mergedAliasData = removeNullishFields({
    ...currentAliasData,
    ...sanitized.data,
  })
  const dbPayload = apiToDb(seed, mergedAliasData)
  return { ok: true, value: JSON.stringify(dbPayload) }
}

export async function publicEditHandler(c: PublicCtx) {
  const seedSlug = c.req.param('seed')
  const id = c.req.param('id')
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
  const access = checkPublicOperation(seed, 'edit')
  if (!access.ok) {
    return c.json(access.error, 403)
  }

  if (!UUID_REGEX.test(id)) {
    return c.json(
      {
        error: 'Bad Request',
        message: 'Invalid entry ID format',
      },
      400
    )
  }

  try {
    const { DB } = c.env
    const currentRow = await DB.prepare(
      'SELECT id, schema_slug, slug, status, data, created_at, updated_at FROM content_entries WHERE schema_slug = ? AND id = ? LIMIT 1'
    )
      .bind(seedSlug, id)
      .first<ContentEntryRow>()

    if (!currentRow) {
      return c.json(
        {
          error: 'Not Found',
          message: `Entry '${id}' not found for content type '${seedSlug}'.`,
        },
        404
      )
    }

    const bodyResult = await parseBody(c)
    if (!bodyResult.ok) return bodyResult.response

    const slugResult = resolveSlug(c, bodyResult.value, currentRow.slug ?? '')
    if (!slugResult.ok) return slugResult.response

    const statusResult = resolveStatus(c, bodyResult.value, currentRow.status)
    if (!statusResult.ok) return statusResult.response

    const dataResult = resolveData(c, seed, bodyResult.value, currentRow)
    if (!dataResult.ok) return dataResult.response

    if (slugResult.value.slugRequested) {
      const slugExisting = await DB.prepare(
        'SELECT id FROM content_entries WHERE schema_slug = ? AND slug = ? AND id != ? LIMIT 1'
      )
        .bind(seedSlug, slugResult.value.nextSlug, id)
        .first<{ id: string }>()

      if (slugExisting) {
        return c.json(
          {
            error: 'Conflict',
            message: `An entry with slug '${slugResult.value.nextSlug}' already exists for content type '${seedSlug}'.`,
          },
          409
        )
      }
    }

    const now = Math.floor(Date.now() / 1000)
    await DB.prepare(
      `UPDATE content_entries
       SET slug = ?, status = ?, data = ?, updated_at = ?
       WHERE schema_slug = ? AND id = ?`
    )
      .bind(slugResult.value.nextSlug, statusResult.value, dataResult.value, now, seedSlug, id)
      .run()

    return c.json({ success: true, id, slug: slugResult.value.nextSlug }, 200)
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
