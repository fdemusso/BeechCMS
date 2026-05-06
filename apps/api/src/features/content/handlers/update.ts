import { Context } from 'hono'
import { 
  slugify, 
  isValidContentStatus, 
  validateAndSanitizeSeedPayload,
  resolvePolicies,
  EntryNotFoundError,
  SlugConflictError
} from '@beechcms/core'
import { applyPrivacy, PrivacyPolicyError } from '../../../shared/apply-policies'
import { publicProblem } from '../../../public/problem-details'
import { CONTENT_ERRORS } from '../constants'
import { logActivity } from '../../../shared/activity-logger'
import { cleanStr } from '../../../shared/query-utils'
import { AppEnv } from '../../../types'

function normalizeBody(raw: unknown): Record<string, unknown> {
  return typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
}

function contentValidationProblem(
  context: Context,
  details: Array<{ field: string; expected: string; received: string; message: string }>
) {
  return publicProblem(context, { 
    type: 'content-validation-failed', 
    title: 'Bad Request', 
    status: 400, 
    detail: 'Validation failed', 
    errors: details 
  })
}

export async function updateHandler(context: Context<AppEnv>) {
  const slug = context.req.param('slug')
  const id = context.req.param('id')
  if (!slug || !id) {
    return publicProblem(context, { 
      type: 'content-invalid-slug-or-id', 
      title: 'Bad Request', 
      status: 400, 
      detail: CONTENT_ERRORS.INVALID_SLUG_OR_ID 
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

  const bodyForData = { ...body }
  delete bodyForData.slug
  delete bodyForData.status

  try {
    const repository = context.get('repository')
    // We need current data to handle slug and status if not provided, 
    // and to verify existence.
    const current = await repository.findById(seed, id)

    const newSlug = body.slug !== undefined ? slugify(String(body.slug)) : (current.slug as string)
    const newStatus = body.status !== undefined ? (cleanStr(body.status) ?? current.status as string) : current.status as string

    if (!isValidContentStatus(newStatus)) {
      return publicProblem(context, { 
        type: 'content-invalid-status', 
        title: 'Bad Request', 
        status: 400, 
        detail: 'Invalid status. Allowed values are: draft, review, published' 
      })
    }
    
    if (!newSlug) {
      return publicProblem(context, { 
        type: 'content-missing-slug', 
        title: 'Bad Request', 
        status: 400, 
        detail: 'Missing required field: slug' 
      })
    }

    let mergedData: Record<string, unknown> = {}

    if (Object.keys(bodyForData).length > 0) {
      const sensitiveAliases = Object.keys(bodyForData).filter((alias) => {
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

      const validation = validateAndSanitizeSeedPayload(seed, bodyForData, {
        operation: 'update', 
        allowNull: true, 
        requireAtLeastOneValidField: true, 
        enforceRequiredFields: true,
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

      let privacyPatch: Record<string, unknown>
      try {
        privacyPatch = await applyPrivacy(validation.data, seed)
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

      // Remove null values from patch (patch semantics: null = leave unchanged)
      for (const [k, v] of Object.entries(privacyPatch)) {
        if (v !== null) mergedData[k] = v
      }
    }

    if (newSlug !== current.slug) {
      if (await repository.existsSlug(seed, newSlug, id)) {
        return publicProblem(context, { 
          type: 'content-slug-conflict', 
          title: 'Conflict', 
          status: 409, 
          detail: CONTENT_ERRORS.SLUG_CONFLICT 
        })
      }
      // Add slug to mergedData if changed
      mergedData.slug = newSlug
    }

    await repository.update(seed, id, mergedData, newStatus)

    const userId = context.get('jwtPayload')?.sub
    const title = mergedData.title || mergedData.name || newSlug
    
    logActivity(context, { 
      action: 'update', 
      entityType: 'content', 
      entityId: id, 
      entitySlug: slug, 
      details: { title } 
    })

    return context.json({ success: true })
  } catch (error) {
    if (error instanceof EntryNotFoundError) {
      return publicProblem(context, { 
        type: 'content-not-found', 
        title: 'Not Found', 
        status: 404, 
        detail: CONTENT_ERRORS.NOT_FOUND 
      })
    }
    if (error instanceof SlugConflictError) {
       return publicProblem(context, { 
        type: 'content-slug-conflict', 
        title: 'Conflict', 
        status: 409, 
        detail: CONTENT_ERRORS.SLUG_CONFLICT 
      })
    }
    console.error('Content update error:', error)
    return publicProblem(context, { 
      type: 'content-database-error', 
      title: 'Internal Server Error', 
      status: 500, 
      detail: CONTENT_ERRORS.DATABASE_ERROR 
    })
  }
}
