// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { isValidContentStatus, resolvePolicies, SlugConflictError } from '@beechcms/core'
import type { Context } from 'hono'
import { cleanStr } from '../shared/utils/query-utils'
import { checkPublicOperation } from './access-policy'
import { publicProblem, internalErrorDetail } from './problem-details'
import { generateEntrySlug, slugify } from './slug-utils'
import { sanitizePublicPayload } from './sanitize'
import { parseIdempotencyKey, buildRequestFingerprint } from './idempotency'
import { applyPrivacy, PrivacyPolicyError } from '../shared/policies/apply-policies'
import { AppEnv } from '../types'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function pickSlug(body: Record<string, unknown>, sanitizedData: Record<string, unknown>): string {
  const explicit = cleanStr(body.slug)
  if (explicit) return slugify(explicit)
  return generateEntrySlug({ title: sanitizedData.title, name: sanitizedData.name })
}

export async function publicAddHandler(context: Context<AppEnv>) {
  const seedSlug = context.req.param('seed') ?? ''
  const seed = context.get('getSeed')(seedSlug)
  if (!seed) {
    return publicProblem(context, { type: 'seed-not-found', title: 'Seed Not Found', status: 404, detail: `The content type '${seedSlug}' does not exist.` })
  }

  const access = checkPublicOperation(seed, 'add')
  if (!access.ok) {
    return publicProblem(context, { type: 'operation-not-allowed', title: access.error.error, status: 403, detail: access.error.message })
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

  const sensitiveAliases = Object.keys(rawData).filter((alias) => {
    const branch = seed.branches.find((b) => b.alias === alias)
    return branch != null && resolvePolicies(branch).public === false
  })
  if (sensitiveAliases.length > 0) {
    return publicProblem(context, { type: 'sensitive-field-edit', title: 'Unprocessable Entity', status: 422, detail: `Cannot write internal fields: ${sensitiveAliases.join(', ')}` })
  }

  const sanitized = sanitizePublicPayload(seed, rawData, { operation: 'create', allowNull: false, requireAtLeastOneValidField: true, enforceRequiredFields: true })
  if (!sanitized.ok) {
    if (sanitized.status === 422) {
      return publicProblem(context, { type: sanitized.code, title: 'Unprocessable Entity', status: 422, detail: sanitized.message })
    }
    return publicProblem(context, { type: sanitized.code, title: 'Bad Request', status: 400, detail: sanitized.message, errors: sanitized.details })
  }

  let privacyData: Record<string, unknown>
  try {
    privacyData = await applyPrivacy(sanitized.data, seed)
  } catch (error) {
    if (error instanceof PrivacyPolicyError) {
      return publicProblem(context, { type: 'policy-not-implemented', title: 'Not Implemented', status: 501, detail: error.message })
    }
    throw error
  }

  const idempotencyKey = parseIdempotencyKey(context.req.header('Idempotency-Key'))
  const finalSlug = pickSlug(body, privacyData) || context.get('idGenerator').uuid().slice(0, 8)
  const repository = context.get('repository')
  const idempotencyRepository = context.get('idempotencyRepository')

  try {
    const now = Math.floor(Date.now() / 1000)
    const fingerprint = await buildRequestFingerprint({ seedSlug, statusValue, slug: cleanStr(body.slug) ?? null, data: sanitized.data })
    const idempotencyTtl = Math.max(60, Number.parseInt(context.env.PUBLIC_IDEMPOTENCY_TTL_SECONDS ?? '86400', 10) || 86400)

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
      await repository.create(seed, id, finalSlug, statusValue as any, privacyData)
    } catch (error) {
      if (error instanceof SlugConflictError) {
        return publicProblem(context, { type: 'slug-conflict', title: 'Conflict', status: 409, detail: `An entry with slug '${finalSlug}' already exists for content type '${seedSlug}'.` })
      }
      throw error
    }

    const responseBody = { success: true, id, slug: finalSlug }
    if (idempotencyKey) {
      await idempotencyRepository.store({ key: idempotencyKey, fingerprint, responseStatus: 201, responseBody: JSON.stringify(responseBody), expiresAt: now + idempotencyTtl })
    }

    context.get('notificationService').notify({
      title: `${seed.label}: New entry`,
      message: `A new entry ("${privacyData.title || privacyData.name || finalSlug}") has been added via the public API.`,
      type: 'success',
    })

    return context.json(responseBody, 201)
  } catch (error) {
    console.error('Public add error:', error)
    return publicProblem(context, { type: 'internal-server-error', title: 'Internal Server Error', status: 500, detail: internalErrorDetail(context.env, error) })
  }
}
