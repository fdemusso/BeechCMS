// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { isValidContentStatus, resolvePolicies, EntryNotFoundError } from '@beechcms/core'
import type { Seed } from '@beechcms/core'
import type { Context } from 'hono'
import { cleanStr } from '../shared/query-utils'
import { checkPublicOperation } from './access-policy'
import { publicProblem } from './problem-details'
import { slugify } from './slug-utils'
import { sanitizePublicPayload } from './sanitize'
import { AppEnv } from '../types'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
type PublicCtx = Context<AppEnv>
type ResolveResult<T> = { ok: true; value: T } | { ok: false; response: Response }

function errorMessage(context: PublicCtx, error: unknown): string {
  if (context.env.ENV !== 'production' && error instanceof Error) return error.message
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
    if (value !== null) next[key] = value
  }
  return next
}

function parseBody(context: PublicCtx): Promise<ResolveResult<Record<string, unknown>>> {
  return context.req.json<unknown>()
    .then((parsed) => ({ ok: true, value: asRecord(parsed) ?? {} }) as const)
    .catch(() => ({
      ok: false,
      response: publicProblem(context, { type: 'invalid-json-body', title: 'Bad Request', status: 400, detail: 'Invalid JSON body' }),
    }))
}

function resolveSlug(context: PublicCtx, body: Record<string, unknown>, currentSlug: string): ResolveResult<{ slugRequested: boolean; nextSlug: string }> {
  const slugRequested = Object.hasOwn(body, 'slug')
  if (!slugRequested) return { ok: true, value: { slugRequested, nextSlug: currentSlug } }
  const requestedSlug = cleanStr(body.slug)
  if (!requestedSlug) {
    return { ok: false, response: publicProblem(context, { type: 'invalid-slug', title: 'Bad Request', status: 400, detail: "Field 'slug' must be a non-empty string" }) }
  }
  return { ok: true, value: { slugRequested, nextSlug: slugify(requestedSlug) } }
}

function resolveStatus(context: PublicCtx, body: Record<string, unknown>, currentStatus: string): ResolveResult<string> {
  if (!Object.hasOwn(body, 'status')) return { ok: true, value: currentStatus }
  const statusValue = body.status
  if (!isValidContentStatus(statusValue)) {
    return { ok: false, response: publicProblem(context, { type: 'invalid-status', title: 'Bad Request', status: 400, detail: 'Invalid status. Allowed values are: draft, review, published' }) }
  }
  return { ok: true, value: statusValue as string }
}

function resolveData(
  context: PublicCtx,
  seed: Seed,
  body: Record<string, unknown>
): ResolveResult<Record<string, unknown>> {
  if (!Object.hasOwn(body, 'data')) {
    // No data update — return empty patch
    return { ok: true, value: {} }
  }

  const rawData = asRecord(body.data)
  if (!rawData) {
    return { ok: false, response: publicProblem(context, { type: 'invalid-data-object', title: 'Bad Request', status: 400, detail: "Field 'data' must be an object when provided" }) }
  }

  const sensitiveAliases = Object.keys(rawData).filter((alias) => {
    const branch = seed.branches.find((b) => b.alias === alias)
    if (!branch) return false
    const policies = resolvePolicies(branch)
    return policies.privacy !== 'plain' || policies.public === false
  })
  if (sensitiveAliases.length > 0) {
    return { ok: false, response: publicProblem(context, { type: 'sensitive-field-edit', title: 'Unprocessable Entity', status: 422, detail: `Cannot edit sensitive fields: ${sensitiveAliases.join(', ')}` }) }
  }

  const sanitized = sanitizePublicPayload(seed, rawData, { allowNull: true, operation: 'update', requireAtLeastOneValidField: true, enforceRequiredFields: true })
  if (!sanitized.ok) {
    if (sanitized.status === 422) {
      return { ok: false, response: publicProblem(context, { type: sanitized.code, title: 'Unprocessable Entity', status: 422, detail: sanitized.message }) }
    }
    return { ok: false, response: publicProblem(context, { type: sanitized.code, title: 'Bad Request', status: 400, detail: sanitized.message, errors: sanitized.details }) }
  }

  return { ok: true, value: removeNullishFields(sanitized.data) }
}

export async function publicEditHandler(context: PublicCtx) {
  const seedSlug = context.req.param('seed') ?? ''
  const id = context.req.param('id') ?? ''
  const seed = context.get('getSeed')(seedSlug)
  if (!seed) {
    return publicProblem(context, { type: 'seed-not-found', title: 'Seed Not Found', status: 404, detail: `The content type '${seedSlug}' does not exist.` })
  }
  const access = checkPublicOperation(seed, 'edit')
  if (!access.ok) {
    return publicProblem(context, { type: 'operation-not-allowed', title: access.error.error, status: 403, detail: access.error.message })
  }

  if (!UUID_REGEX.test(id)) {
    return publicProblem(context, { type: 'invalid-entry-id', title: 'Bad Request', status: 400, detail: 'Invalid entry ID format' })
  }

  const repository = context.get('repository')

  try {
    const entry = await repository.findById(seed, id)

    const bodyResult = await parseBody(context)
    if (!bodyResult.ok) return bodyResult.response

    const slugResult = resolveSlug(context, bodyResult.value, (entry.slug as string) ?? '')
    if (!slugResult.ok) return slugResult.response

    const statusResult = resolveStatus(context, bodyResult.value, (entry.status as string) ?? 'draft')
    if (!statusResult.ok) return statusResult.response

    const dataResult = resolveData(context, seed, bodyResult.value)
    if (!dataResult.ok) return dataResult.response

    if (slugResult.value.slugRequested && slugResult.value.nextSlug !== entry.slug) {
      const exists = await repository.existsSlug(seed, slugResult.value.nextSlug, id)
      if (exists) {
        return publicProblem(context, { type: 'slug-conflict', title: 'Conflict', status: 409, detail: `An entry with slug '${slugResult.value.nextSlug}' already exists for content type '${seedSlug}'.` })
      }
    }

    const updateData = { ...dataResult.value }
    if (slugResult.value.slugRequested) {
      (updateData as any).slug = slugResult.value.nextSlug
    }

    await repository.update(seed, id, updateData, statusResult.value)

    context.get('notificationService').notify({
      title: `${seed.label}: Update`,
      message: `The entry "${slugResult.value.nextSlug}" has been modified via the public API.`,
      type: 'info',
    })

    return context.json({ success: true, id, slug: slugResult.value.nextSlug }, 200)
  } catch (error) {
    if (error instanceof EntryNotFoundError) {
      return publicProblem(context, { type: 'entry-not-found', title: 'Not Found', status: 404, detail: `Entry '${id}' not found for content type '${seedSlug}'.` })
    }
    console.error('Public edit error:', error)
    return publicProblem(context, { type: 'internal-server-error', title: 'Internal Server Error', status: 500, detail: errorMessage(context, error) })
  }
}
