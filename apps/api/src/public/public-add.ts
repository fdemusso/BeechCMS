import { isValidContentStatus, SlugConflictError, sha256hex } from '@beechcms/core'
import type { Context } from 'hono'
import { cleanStr } from '../shared/query-utils'
import { checkPublicOperation } from './access-policy'
import { publicProblem } from './problem-details'
import { generateEntrySlug, slugify } from './slug-utils'
import { sanitizePublicPayload } from './sanitize'
import { AppEnv } from '../types'

function errorMessage(context: Context<AppEnv>, error: unknown): string {
  if (context.env.ENV !== 'production' && error instanceof Error) return error.message
  return 'An unexpected error occurred.'
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function pickSlugFromBody(body: Record<string, unknown>, sanitizedData: Record<string, unknown>): string {
  const explicitSlug = cleanStr(body.slug)
  if (explicitSlug) return slugify(explicitSlug)
  return generateEntrySlug({ title: sanitizedData.title, name: sanitizedData.name })
}

function parseIdempotencyKey(rawValue: string | undefined): string | null {
  if (!rawValue) return null
  const key = rawValue.trim()
  if (!key || key.length > 128) return null
  return key
}


export async function publicAddHandler(context: Context<AppEnv>) {
  const seedSlug = context.req.param('seed') ?? ''
  const seed = context.get('getSeed')(seedSlug)
  if (!seed) {
    return publicProblem(context, { 
      type: 'seed-not-found', 
      title: 'Seed Not Found', 
      status: 404, 
      detail: `The content type '${seedSlug}' does not exist.` 
    })
  }
  
  const access = checkPublicOperation(seed, 'add')
  if (!access.ok) {
    return publicProblem(context, { 
      type: 'operation-not-allowed', 
      title: access.error.error, 
      status: 403, 
      detail: access.error.message 
    })
  }

  let body: Record<string, unknown>
  try {
    const parsed = await context.req.json<unknown>()
    body = asRecord(parsed) ?? {}
  } catch {
    return publicProblem(context, { type: 'invalid-json-body', title: 'Bad Request', status: 400, detail: 'Invalid JSON body' })
  }

  const rawData = asRecord(body.data)
  if (!rawData || Object.keys(rawData).length === 0) {
    return publicProblem(context, { type: 'invalid-data-object', title: 'Bad Request', status: 400, detail: "Field 'data' is required and must be a non-empty object" })
  }

  const statusValue = body.status ?? 'draft'
  if (!isValidContentStatus(statusValue)) {
    return publicProblem(context, { type: 'invalid-status', title: 'Bad Request', status: 400, detail: 'Invalid status. Allowed values are: draft, review, published' })
  }

  const sanitized = sanitizePublicPayload(seed, rawData, {
    operation: 'create', 
    allowNull: false, 
    requireAtLeastOneValidField: true, 
    enforceRequiredFields: true,
  })
  
  if (!sanitized.ok) {
    if (sanitized.status === 422) {
      return publicProblem(context, { type: sanitized.code, title: 'Unprocessable Entity', status: 422, detail: sanitized.message })
    }
    return publicProblem(context, { type: sanitized.code, title: 'Bad Request', status: 400, detail: sanitized.message, errors: sanitized.details })
  }

  const idempotencyKey = parseIdempotencyKey(context.req.header('Idempotency-Key'))
  const entrySlug = pickSlugFromBody(body, sanitized.data)
  const finalSlug = entrySlug || context.get('idGenerator').uuid().slice(0, 8)
  const repository = context.get('repository')
  const idempotencyRepository = context.get('idempotencyRepository')

  try {
    const now = Math.floor(Date.now() / 1000)
    const fingerprintPayload = JSON.stringify({ seedSlug, statusValue, slug: cleanStr(body.slug) ?? null, data: sanitized.data })
    const fingerprint = await sha256hex(fingerprintPayload)
    const idempotencyTtlSeconds = Math.max(60, Number.parseInt(context.env.PUBLIC_IDEMPOTENCY_TTL_SECONDS ?? '86400', 10) || 86400)

    if (idempotencyKey) {
      const existing = await idempotencyRepository.lookup(idempotencyKey)
      if (existing && existing.expiresAt >= now) {
        if (existing.fingerprint !== fingerprint) {
          return publicProblem(context, { type: 'idempotency-key-conflict', title: 'Conflict', status: 409, detail: 'Idempotency-Key was already used with a different request payload.' })
        }
        let parsedBody: unknown = null
        try { parsedBody = JSON.parse(existing.responseBody) } catch { parsedBody = { success: true } }
        return context.json(parsedBody, existing.responseStatus as 201)
      }
    }

    const id = context.get('idGenerator').uuid()
    
    try {
      await repository.create(seed, id, finalSlug, statusValue as any, sanitized.data)
    } catch (error) {
      if (error instanceof SlugConflictError) {
        return publicProblem(context, { 
          type: 'slug-conflict', 
          title: 'Conflict', 
          status: 409, 
          detail: `An entry with slug '${finalSlug}' already exists for content type '${seedSlug}'.` 
        })
      }
      throw error
    }

    const responseBody = { success: true, id, slug: finalSlug }
    if (idempotencyKey) {
      await idempotencyRepository.store({ 
        key: idempotencyKey, 
        fingerprint, 
        responseStatus: 201, 
        responseBody: JSON.stringify(responseBody), 
        expiresAt: now + idempotencyTtlSeconds 
      })
    }

    context.get('notificationService').notify({
      title: `${seed.label}: New entry`,
      message: `A new entry ("${sanitized.data.title || sanitized.data.name || finalSlug}") has been added via the public API.`,
      type: 'success',
    })

    return context.json(responseBody, 201)
  } catch (error) {
    console.error('Public add error:', error)
    return publicProblem(context, { 
      type: 'internal-server-error', 
      title: 'Internal Server Error', 
      status: 500, 
      detail: errorMessage(context, error) 
    })
  }
}
