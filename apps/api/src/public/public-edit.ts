import { apiToDb, dbToApi, isValidContentStatus, resolvePolicies } from '@beech/core'
import type { Seed } from '@beech/core'
import type { Context } from 'hono'
import { cleanStr, rowToEntry } from '../shared/query-utils'
import type { ContentEntryRow } from '../shared/query-utils'
import { checkPublicOperation } from './access-policy'
import { publicProblem } from './problem-details'
import { slugify } from './slug-utils'
import { sanitizePublicPayload } from './sanitize'
import { createNotification } from '../shared/notification-service'

type Bindings = {
  DB: D1Database
  PUBLIC_READ_API_KEY?: string
  PUBLIC_WRITE_API_KEY?: string
  ENV?: string
}

type Variables = {
  jwtPayload: { sub: string; email?: string }
  getSeed: (slug: string) => Seed | null
  seedRegistry: Record<string, Seed>
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
      response: publicProblem(c, {
        type: 'invalid-json-body',
        title: 'Bad Request',
        status: 400,
        detail: 'Invalid JSON body',
      }),
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
      response: publicProblem(c, {
        type: 'invalid-slug',
        title: 'Bad Request',
        status: 400,
        detail: "Field 'slug' must be a non-empty string",
      }),
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
      response: publicProblem(c, {
        type: 'invalid-status',
        title: 'Bad Request',
        status: 400,
        detail: 'Invalid status. Allowed values are: draft, review, published',
      }),
    }
  }

  return { ok: true, value: statusValue }
}

function resolveData(
  c: PublicCtx,
  seed: Seed,
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
      response: publicProblem(c, {
        type: 'invalid-data-object',
        title: 'Bad Request',
        status: 400,
        detail: "Field 'data' must be an object when provided",
      }),
    }
  }

  const sensitiveAliases = Object.keys(rawData).filter((alias) => {
    const branch = seed.branches.find((b) => b.alias === alias)
    return branch != null && resolvePolicies(branch).privacy !== 'plain'
  })
  if (sensitiveAliases.length > 0) {
    return {
      ok: false,
      response: publicProblem(c, {
        type: 'sensitive-field-edit',
        title: 'Unprocessable Entity',
        status: 422,
        detail: `Cannot edit sensitive fields: ${sensitiveAliases.join(', ')}`,
      }),
    }
  }

  const sanitized = sanitizePublicPayload(seed, rawData, {
    allowNull: true,
    operation: 'update',
    requireAtLeastOneValidField: true,
    enforceRequiredFields: true,
  })
  if (!sanitized.ok) {
    if (sanitized.status === 422) {
      return {
        ok: false,
        response: publicProblem(c, {
          type: sanitized.code,
          title: 'Unprocessable Entity',
          status: 422,
          detail: sanitized.message,
        }),
      }
    }

    return {
      ok: false,
      response: publicProblem(c, {
        type: sanitized.code,
        title: 'Bad Request',
        status: 400,
        detail: sanitized.message,
        errors: sanitized.details,
      }),
    }
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
  const seedSlug = c.req.param('seed') ?? ''
  const id = c.req.param('id') ?? ''
  const seed = c.get('getSeed')(seedSlug)
  if (!seed) {
    return publicProblem(c, {
      type: 'seed-not-found',
      title: 'Seed Not Found',
      status: 404,
      detail: `The content type '${seedSlug}' does not exist.`,
    })
  }
  const access = checkPublicOperation(seed, 'edit')
  if (!access.ok) {
    return publicProblem(c, {
      type: 'operation-not-allowed',
      title: access.error.error,
      status: 403,
      detail: access.error.message,
    })
  }

  if (!UUID_REGEX.test(id)) {
    return publicProblem(c, {
      type: 'invalid-entry-id',
      title: 'Bad Request',
      status: 400,
      detail: 'Invalid entry ID format',
    })
  }

  try {
    const { DB } = c.env
    const currentRow = await DB.prepare(
      'SELECT id, schema_slug, slug, status, data, created_at, updated_at FROM content_entries WHERE schema_slug = ? AND id = ? LIMIT 1'
    )
      .bind(seedSlug, id)
      .first<ContentEntryRow>()

    if (!currentRow) {
      return publicProblem(c, {
        type: 'entry-not-found',
        title: 'Not Found',
        status: 404,
        detail: `Entry '${id}' not found for content type '${seedSlug}'.`,
      })
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
        return publicProblem(c, {
          type: 'slug-conflict',
          title: 'Conflict',
          status: 409,
          detail: `An entry with slug '${slugResult.value.nextSlug}' already exists for content type '${seedSlug}'.`,
        })
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

    await createNotification(c, {
      title: `${seed.label}: Modifica`,
      message: `L'entry "${slugResult.value.nextSlug}" è stata modificata via API pubblica.`,
      type: 'info'
    })

    return c.json({ success: true, id, slug: slugResult.value.nextSlug }, 200)
  } catch (err) {
    return publicProblem(c, {
      type: 'internal-server-error',
      title: 'Internal Server Error',
      status: 500,
      detail: errorMessage(c, err),
    })
  }
}
