/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import { 
  validateAndSanitizeSeedPayload, 
  resolvePolicies, 
  EntryNotFoundError 
} from '@beechcms/core'
import { publicProblem } from '../../public/problem-details'
import { logActivity } from '../../shared/activity-logger'
import { cleanStr } from '../../shared/query-utils'
import { applyVisibility } from '../../shared/apply-policies'
import { AppEnv } from '../../types'
import { CONTENT_ERRORS } from '../content/constants'

const draftApp = new Hono<AppEnv>()

function normalizeBody(raw: unknown): Record<string, unknown> {
  return typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
}

function draftNotAllowed(context: any) {
  return publicProblem(context, {
    type: 'draft-not-allowed', 
    title: 'Method Not Allowed', 
    status: 405,
    detail: 'This content type does not support pending drafts. Set allowDrafts: true on the Seed to enable.',
  })
}

// PUT /:slug/:id/draft — crea o sovrascrive la bozza in content_{slug}_drafts
draftApp.put('/:slug/:id/draft', async (context) => {
  const slug = context.req.param('slug')
  const id = context.req.param('id')

  const seed = context.get('getSeed')(slug)
  if (!seed) {
    return publicProblem(context, { 
      type: 'content-seed-not-found', 
      title: 'Not Found', 
      status: 404, 
      detail: CONTENT_ERRORS.SEED_NOT_FOUND 
    })
  }
  
  if (!seed.allowDrafts) return draftNotAllowed(context)

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

  const repository = context.get('repository')
  try {
    // Verify entry existence
    await repository.findById(seed, id)
  } catch (error) {
    if (error instanceof EntryNotFoundError) {
      return publicProblem(context, { 
        type: 'content-not-found', 
        title: 'Not Found', 
        status: 404, 
        detail: CONTENT_ERRORS.NOT_FOUND 
      })
    }
    throw error
  }

  const sensitiveAliases = Object.keys(body).filter((alias) => {
    const branch = seed.branches.find((b) => b.alias === alias)
    return branch != null && resolvePolicies(branch).privacy !== 'plain'
  })
  
  if (sensitiveAliases.length > 0) {
    return publicProblem(context, { 
      type: 'content-sensitive-field-edit', 
      title: 'Unprocessable Entity', 
      status: 422, 
      detail: `${CONTENT_ERRORS.SENSITIVE_FIELD_EDIT}: ${sensitiveAliases.join(', ')}` 
    })
  }

  const validation = validateAndSanitizeSeedPayload(seed, body, {
    operation: 'update', 
    allowNull: true, 
    requireAtLeastOneValidField: true, 
    enforceRequiredFields: false,
  })
  
  if (validation.dangerousFields.length > 0) {
    return publicProblem(context, { 
      type: 'content-dangerous-content', 
      title: 'Unprocessable Entity', 
      status: 422, 
      detail: `Dangerous markup in field '${validation.dangerousFields[0]}'` 
    })
  }
  
  if (validation.details.length > 0) {
    return publicProblem(context, { 
      type: 'content-validation-failed', 
      title: 'Bad Request', 
      status: 400, 
      detail: 'Validation failed', 
      errors: validation.details 
    })
  }

  await repository.saveDraft(seed, id, validation.data)

  logActivity(context, {
    action: 'update', 
    entityType: 'content', 
    entityId: id, 
    entitySlug: slug,
    details: { 
      title: cleanStr(validation.data[seed.displayNameAlias]) ?? id, 
      note: 'draft saved' 
    },
  })

  return context.json({ success: true })
})

// GET /:slug/:id/draft — legge la bozza pendente
draftApp.get('/:slug/:id/draft', async (context) => {
  const slug = context.req.param('slug')
  const id = context.req.param('id')

  const seed = context.get('getSeed')(slug)
  if (!seed) {
    return publicProblem(context, { 
      type: 'content-seed-not-found', 
      title: 'Not Found', 
      status: 404, 
      detail: CONTENT_ERRORS.SEED_NOT_FOUND 
    })
  }
  
  if (!seed.allowDrafts) return draftNotAllowed(context)

  const repository = context.get('repository')
  const draft = await repository.getDraft(seed, id)

  if (!draft) {
    try {
      await repository.findById(seed, id)
      return publicProblem(context, { 
        type: 'draft-not-found', 
        title: 'Not Found', 
        status: 404, 
        detail: 'No pending draft for this entry' 
      })
    } catch (error) {
      if (error instanceof EntryNotFoundError) {
        return publicProblem(context, { 
          type: 'content-not-found', 
          title: 'Not Found', 
          status: 404, 
          detail: CONTENT_ERRORS.NOT_FOUND 
        })
      }
      throw error
    }
  }

  return context.json({ data: applyVisibility(draft, seed) })
})

// POST /:slug/:id/draft/publish — promuove bozza → live atomicamente
draftApp.post('/:slug/:id/draft/publish', async (context) => {
  const slug = context.req.param('slug')
  const id = context.req.param('id')

  const seed = context.get('getSeed')(slug)
  if (!seed) {
    return publicProblem(context, { 
      type: 'content-seed-not-found', 
      title: 'Not Found', 
      status: 404, 
      detail: CONTENT_ERRORS.SEED_NOT_FOUND 
    })
  }
  
  if (!seed.allowDrafts) return draftNotAllowed(context)

  const repository = context.get('repository')
  const draft = await repository.getDraft(seed, id)

  if (!draft) {
    try {
      await repository.findById(seed, id)
      return publicProblem(context, { 
        type: 'draft-not-found', 
        title: 'Not Found', 
        status: 404, 
        detail: 'No pending draft to publish' 
      })
    } catch (error) {
      if (error instanceof EntryNotFoundError) {
        return publicProblem(context, { 
          type: 'content-not-found', 
          title: 'Not Found', 
          status: 404, 
          detail: CONTENT_ERRORS.NOT_FOUND 
        })
      }
      throw error
    }
  }

  await repository.publishDraft(seed, id)

  const displayValue = draft[seed.displayNameAlias]
  const displayStr = typeof displayValue === 'string' ? displayValue : id

  logActivity(context, {
    action: 'update', 
    entityType: 'content', 
    entityId: id, 
    entitySlug: slug,
    details: { title: displayStr, note: 'draft published' },
  })

  return context.json({ success: true })
})

// DELETE /:slug/:id/draft — scarta la bozza pendente
draftApp.delete('/:slug/:id/draft', async (context) => {
  const slug = context.req.param('slug')
  const id = context.req.param('id')

  const seed = context.get('getSeed')(slug)
  if (!seed) {
    return publicProblem(context, { 
      type: 'content-seed-not-found', 
      title: 'Not Found', 
      status: 404, 
      detail: CONTENT_ERRORS.SEED_NOT_FOUND 
    })
  }
  
  if (!seed.allowDrafts) return draftNotAllowed(context)

  const repository = context.get('repository')
  try {
    await repository.findById(seed, id)
  } catch (error) {
    if (error instanceof EntryNotFoundError) {
      return publicProblem(context, { 
        type: 'content-not-found', 
        title: 'Not Found', 
        status: 404, 
        detail: CONTENT_ERRORS.NOT_FOUND 
      })
    }
    throw error
  }

  await repository.deleteDraft(seed, id)

  return context.json({ success: true })
})

export { draftApp }

