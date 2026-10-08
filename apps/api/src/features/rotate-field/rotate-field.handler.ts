// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import { resolvePolicies, timingSafeEqual, validateAndSanitizeSeedPayload, EntryNotFoundError, EntryConflictError } from '@beechcms/core'
import { publicProblem } from '../../public/errors/problem-details'
import { rotateFieldRequestSchema } from './rotate-field.schema'
import type { Env, Variables } from '../../types'

const rotateFieldApp = new Hono<{ Bindings: Env; Variables: Variables }>()

rotateFieldApp.post('/:slug/:id/rotate-field', async (context) => {
  const seedSlug = context.req.param('slug')
  const entryId = context.req.param('id')

  const seed = context.get('getSeed')(seedSlug)
  if (!seed) {
    return publicProblem(context, { 
      type: 'content-seed-not-found', 
      title: 'Not Found', 
      status: 404, 
      detail: `Seed '${seedSlug}' not found` 
    })
  }

  let requestBody: unknown
  try {
    requestBody = await context.req.json()
  } catch {
    return publicProblem(context, { 
      type: 'rotate-field-invalid-json', 
      title: 'Bad Request', 
      status: 400, 
      detail: 'Invalid JSON body' 
    })
  }

  const parsedRequestBody = rotateFieldRequestSchema.safeParse(requestBody)
  if (!parsedRequestBody.success) {
    return publicProblem(context, { 
      type: 'rotate-field-invalid-body', 
      title: 'Bad Request', 
      status: 400, 
      detail: parsedRequestBody.error.issues[0]?.message ?? 'Invalid body' 
    })
  }

  const { fieldAlias, currentValue, nextValue } = parsedRequestBody.data

  const targetFieldBranch = seed.branches.find((branch) => branch.alias === fieldAlias)
  if (!targetFieldBranch) {
    return publicProblem(context, { 
      type: 'rotate-field-unknown-field', 
      title: 'Bad Request', 
      status: 400, 
      detail: `Field '${fieldAlias}' does not exist in seed '${seedSlug}'` 
    })
  }

  const { privacy } = resolvePolicies(targetFieldBranch)
  if (privacy !== 'hash') {
    return publicProblem(context, {
      type: 'rotate-field-not-hashable',
      title: 'Unprocessable Entity',
      status: 422,
      detail: `Field '${fieldAlias}' does not use hash privacy and cannot be rotated with this endpoint`
    })
  }

  // Every attempt consumes a token, success or failure, so the current-value check below
  // (a distinguishable 403-vs-200 oracle) cannot be brute-forced by a caller who already
  // holds content:update on the seed.
  const actorId = context.get('jwtPayload')?.sub ?? ''
  const attemptKey = `${actorId}:${seedSlug}:${entryId}:${fieldAlias}`
  const attemptLimit = await context.get('rateLimiters').getLimiter('rotateFieldAttempt').checkLimit(attemptKey)
  if (!attemptLimit.isAllowed) {
    const headers: Record<string, string> = {}
    if (attemptLimit.retryAfterSeconds !== undefined) {
      headers['Retry-After'] = String(attemptLimit.retryAfterSeconds)
    }
    return publicProblem(context, {
      type: 'rotate-field-rate-limited',
      title: 'Too Many Requests',
      status: 429,
      detail: 'Too many rotation attempts for this field. Try again later.',
      headers,
    })
  }

  let contentRecord: Record<string, unknown>
  try {
    contentRecord = await context.get('repository').findById(seed, entryId)
  } catch (error) {
    if (error instanceof EntryNotFoundError) {
      return publicProblem(context, {
        type: 'content-not-found',
        title: 'Not Found',
        status: 404,
        detail: `Entry '${entryId}' not found`
      })
    }
    throw error
  }

  const storedFieldValueHash = contentRecord[targetFieldBranch.alias]

  if (typeof storedFieldValueHash !== 'string' || storedFieldValueHash.length === 0) {
    return publicProblem(context, { 
      type: 'rotate-field-not-set', 
      title: 'Unprocessable Entity', 
      status: 422, 
      detail: `Field '${fieldAlias}' has no stored value to rotate` 
    })
  }

  // Stored `hash` fields are keyed HMAC-SHA256 (repository write path), never a bare SHA-256.
  const privacyService = context.get('privacyService')
  const isCurrentValueValid = timingSafeEqual(storedFieldValueHash, await privacyService.hash(currentValue))
  if (!isCurrentValueValid) {
    return publicProblem(context, { 
      type: 'rotate-field-current-mismatch', 
      title: 'Forbidden', 
      status: 403, 
      detail: 'Current value does not match stored value' 
    })
  }

  const fieldValidationResult = validateAndSanitizeSeedPayload(
    seed, 
    { [fieldAlias]: nextValue },
    { operation: 'update', allowNull: false, requireAtLeastOneValidField: true, enforceRequiredFields: false }
  )

  if (fieldValidationResult.dangerousFields.length > 0) {
    return publicProblem(context, {
      type: 'rotate-field-dangerous-content',
      title: 'Unprocessable Entity',
      status: 422,
      detail: `Content rejected: dangerous markup detected in field '${fieldAlias}'`
    })
  }

  if (fieldValidationResult.details.length > 0) {
    return publicProblem(context, {
      type: 'rotate-field-invalid-next',
      title: 'Bad Request',
      status: 400,
      detail: `Invalid value for field '${fieldAlias}': ${fieldValidationResult.details[0]?.message ?? 'validation failed'}`
    })
  }

  // Hash the sanitized output, not the raw request value: every other write path stores the
  // value validateAndSanitizeSeedPayload produces, so hashing `nextValue` directly would let a
  // rotated field's digest diverge from what create/update would have stored for the same input.
  const newFieldValueHash = await privacyService.hash(fieldValidationResult.data[fieldAlias] as string)

  try {
    await context.get('repository').update(
      seed,
      entryId,
      { [targetFieldBranch.alias]: newFieldValueHash },
      undefined,
      { ifMatch: contentRecord.updated_at as number },
    )
  } catch (error) {
    if (error instanceof EntryConflictError) {
      return publicProblem(context, {
        type: 'rotate-field-conflict',
        title: 'Conflict',
        status: 409,
        detail: `Entry '${entryId}' was modified concurrently. Re-read it and retry.`
      })
    }
    throw error
  }

  return context.json({ success: true })
})


export { rotateFieldApp }

