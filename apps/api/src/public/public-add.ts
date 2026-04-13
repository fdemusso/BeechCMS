import { apiToDb, getSeed, isValidContentStatus } from '@beech/core'
import type { Context } from 'hono'
import { cleanStr } from '../shared/query-utils'
import { checkPublicOperation } from './access-policy'
import { publicProblem } from './problem-details'
import { generateEntrySlug, slugify } from './slug-utils'
import { sanitizePublicPayload } from './sanitize'

type Bindings = {
  DB: D1Database
  PUBLIC_READ_API_KEY?: string
  PUBLIC_WRITE_API_KEY?: string
  PUBLIC_IDEMPOTENCY_TTL_SECONDS?: string
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

function parseIdempotencyKey(rawValue: string | undefined): string | null {
  if (!rawValue) return null
  const key = rawValue.trim()
  if (!key || key.length > 128) return null
  return key
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((v) => v.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return toHex(digest)
}

type StoredIdempotencyRecord = {
  idempotency_key: string
  request_fingerprint: string
  response_status: number
  response_body: string
  expires_at: number
}

async function lookupIdempotency(
  db: D1Database,
  key: string
): Promise<StoredIdempotencyRecord | null> {
  return db
    .prepare(
      `SELECT idempotency_key, request_fingerprint, response_status, response_body, expires_at
       FROM public_idempotency_keys
       WHERE idempotency_key = ?
       LIMIT 1`
    )
    .bind(key)
    .first<StoredIdempotencyRecord>()
}

async function storeIdempotency(
  db: D1Database,
  input: {
    key: string
    fingerprint: string
    responseStatus: number
    responseBody: string
    expiresAt: number
    createdAt: number
  }
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO public_idempotency_keys (
        idempotency_key,
        request_fingerprint,
        response_status,
        response_body,
        created_at,
        expires_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(idempotency_key) DO UPDATE SET
        request_fingerprint = excluded.request_fingerprint,
        response_status = excluded.response_status,
        response_body = excluded.response_body,
        created_at = excluded.created_at,
        expires_at = excluded.expires_at`
    )
    .bind(
      input.key,
      input.fingerprint,
      input.responseStatus,
      input.responseBody,
      input.createdAt,
      input.expiresAt
    )
    .run()
}

export async function publicAddHandler(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
  const seedSlug = c.req.param('seed')
  const seed = getSeed(seedSlug)
  if (!seed) {
    return publicProblem(c, {
      type: 'seed-not-found',
      title: 'Seed Not Found',
      status: 404,
      detail: `The content type '${seedSlug}' does not exist.`,
    })
  }
  const access = checkPublicOperation(seed, 'add')
  if (!access.ok) {
    return publicProblem(c, {
      type: 'operation-not-allowed',
      title: access.error.error,
      status: 403,
      detail: access.error.message,
    })
  }

  let body: Record<string, unknown>
  try {
    const parsed = await c.req.json<unknown>()
    body = asRecord(parsed) ?? {}
  } catch {
    return publicProblem(c, {
      type: 'invalid-json-body',
      title: 'Bad Request',
      status: 400,
      detail: 'Invalid JSON body',
    })
  }

  const rawData = asRecord(body.data)
  if (!rawData || Object.keys(rawData).length === 0) {
    return publicProblem(c, {
      type: 'invalid-data-object',
      title: 'Bad Request',
      status: 400,
      detail: "Field 'data' is required and must be a non-empty object",
    })
  }

  const statusValue = body.status ?? 'draft'
  if (!isValidContentStatus(statusValue)) {
    return publicProblem(c, {
      type: 'invalid-status',
      title: 'Bad Request',
      status: 400,
      detail: 'Invalid status. Allowed values are: draft, review, published',
    })
  }

  const sanitized = sanitizePublicPayload(seed, rawData, {
    operation: 'create',
    allowNull: false,
    requireAtLeastOneValidField: true,
    enforceRequiredFields: true,
  })
  if (!sanitized.ok) {
    if (sanitized.status === 422) {
      return publicProblem(c, {
        type: sanitized.code,
        title: 'Unprocessable Entity',
        status: 422,
        detail: sanitized.message,
      })
    }
    return publicProblem(c, {
      type: sanitized.code,
      title: 'Bad Request',
      status: 400,
      detail: sanitized.message,
      errors: sanitized.details,
    })
  }
  const idempotencyKey = parseIdempotencyKey(c.req.header('Idempotency-Key'))

  const entrySlug = pickSlugFromBody(body, sanitized.data)
  const finalSlug = entrySlug || crypto.randomUUID().slice(0, 8)

  try {
    const { DB } = c.env
    const now = Math.floor(Date.now() / 1000)
    const fingerprintPayload = JSON.stringify({
      seedSlug,
      statusValue,
      slug: cleanStr(body.slug) ?? null,
      data: sanitized.data,
    })
    const fingerprint = await sha256Hex(fingerprintPayload)
    const idempotencyTtlSeconds = Math.max(
      60,
      Number.parseInt(c.env.PUBLIC_IDEMPOTENCY_TTL_SECONDS ?? '86400', 10) || 86400
    )

    if (idempotencyKey) {
      const existing = await lookupIdempotency(DB, idempotencyKey)
      if (existing && existing.expires_at >= now) {
        if (existing.request_fingerprint !== fingerprint) {
          return publicProblem(c, {
            type: 'idempotency-key-conflict',
            title: 'Conflict',
            status: 409,
            detail: 'Idempotency-Key was already used with a different request payload.',
          })
        }

        let parsedBody: unknown = null
        try {
          parsedBody = JSON.parse(existing.response_body)
        } catch {
          parsedBody = { success: true }
        }
        return c.json(parsedBody, existing.response_status as 201)
      }
    }

    const slugExisting = await DB.prepare(
      'SELECT id FROM content_entries WHERE schema_slug = ? AND slug = ? LIMIT 1'
    )
      .bind(seedSlug, finalSlug)
      .first<{ id: string }>()

    if (slugExisting) {
      return publicProblem(c, {
        type: 'slug-conflict',
        title: 'Conflict',
        status: 409,
        detail: `An entry with slug '${finalSlug}' already exists for content type '${seedSlug}'.`,
      })
    }

    const id = crypto.randomUUID()
    const dbPayload = apiToDb(seed, sanitized.data)

    await DB.prepare(
      `INSERT INTO content_entries (id, schema_slug, slug, status, data, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(id, seedSlug, finalSlug, statusValue, JSON.stringify(dbPayload), now, now)
      .run()

    const responseBody = { success: true, id, slug: finalSlug }
    if (idempotencyKey) {
      await storeIdempotency(DB, {
        key: idempotencyKey,
        fingerprint,
        responseStatus: 201,
        responseBody: JSON.stringify(responseBody),
        createdAt: now,
        expiresAt: now + idempotencyTtlSeconds,
      })
    }

    return c.json(responseBody, 201)
  } catch (err) {
    return publicProblem(c, {
      type: 'internal-server-error',
      title: 'Internal Server Error',
      status: 500,
      detail: errorMessage(c, err),
    })
  }
}

