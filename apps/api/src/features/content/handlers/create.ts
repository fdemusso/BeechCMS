// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Context } from 'hono'
import { 
  slugify, 
  isValidContentStatus, 
  validateAndSanitizeSeedPayload
} from '@beechcms/core'
import { applyPrivacy, PrivacyPolicyError } from '../../../shared/apply-policies'
import { publicProblem } from '../../../public/problem-details'
import {
  normalizeBody,
  contentValidationProblem,
  logContentActivity,
  dispatchContentAutomation,
  handleContentDatabaseError
} from './helpers'
import { CONTENT_ERRORS } from '../constants'
import { cleanStr } from '../../../shared/query-utils'
import { AppEnv } from '../../../types'



export async function createHandler(context: Context<AppEnv>) {
  const slug = context.req.param('slug')
  if (!slug) {
    return publicProblem(context, { 
      type: 'content-invalid-slug', 
      title: 'Bad Request', 
      status: 400, 
      detail: CONTENT_ERRORS.INVALID_SLUG 
    })
  }

  const seed = context.get('getSeed')(slug)
  if (!seed) {
    return publicProblem(context, { 
      type: 'content-seed-not-found', 
      title: 'Not Found', 
      status: 404, 
      detail: CONTENT_ERRORS.SEED_NOT_FOUND 
    })
  }

  let body: Record<string, unknown>
  try {
    body = normalizeBody(await context.req.json<unknown>())
  } catch {
    return publicProblem(context, { 
      type: 'content-invalid-json', 
      title: 'Bad Request', 
      status: 400, 
      detail: CONTENT_ERRORS.INVALID_JSON_BODY 
    })
  }

  const entrySlug = body.slug ? slugify(String(body.slug)) : null
  const status = cleanStr(body.status) ?? 'draft'
  if (!isValidContentStatus(status)) {
    return publicProblem(context, { 
      type: 'content-invalid-status', 
      title: 'Bad Request', 
      status: 400, 
      detail: 'Invalid status. Allowed values are: draft, review, published' 
    })
  }

  const bodyForData = { ...body }
  delete bodyForData.slug
  delete bodyForData.status

  const validation = validateAndSanitizeSeedPayload(seed, bodyForData, {
    operation: 'create',
    allowNull: false,
    requireAtLeastOneValidField: true,
    enforceRequiredFields: true,
    idGenerator: context.get('idGenerator'),
  })

  if (validation.dangerousFields.length > 0) {
    return publicProblem(context, { 
      type: 'content-dangerous-content', 
      title: 'Unprocessable Entity', 
      status: 422, 
      detail: `Content rejected: dangerous markup detected in field '${validation.dangerousFields[0]}'` 
    })
  }
  
  if (validation.details.length > 0) return contentValidationProblem(context, validation.details)

  let privacyData: Record<string, unknown>
  try {
    privacyData = await applyPrivacy(validation.data, seed)
  } catch (error) {
    if (error instanceof PrivacyPolicyError) {
      return publicProblem(context, { 
        type: 'content-policy-not-implemented', 
        title: 'Not Implemented', 
        status: 501, 
        detail: error.message 
      })
    }
    throw error
  }

  const id = context.get('idGenerator').uuid()
  let finalSlug = entrySlug
  if (!finalSlug) {
    const fallbackSource = privacyData[seed.displayNameAlias ?? 'title'] || privacyData.title || privacyData.name || id
    finalSlug = slugify(String(fallbackSource))
  }

  try {
    const repository = context.get('repository')
    await repository.create(seed, id, finalSlug, status, privacyData)

    const jwtPayload = context.get('jwtPayload')
    const title = privacyData.title || privacyData.name || finalSlug

    logContentActivity(context, 'create', id, slug, String(title))
    dispatchContentAutomation(context, slug, 'create', { id, slug: finalSlug, status, ...privacyData })

    return context.json({ id }, 201)
  } catch (error) {
    return handleContentDatabaseError(context, error)
  }
}
