import { Context } from 'hono'
import { 
  slugify, 
  isValidContentStatus, 
  validateAndSanitizeSeedPayload,
  SlugConflictError
} from '@beechcms/core'
import { applyPrivacy, PrivacyPolicyError } from '../../../shared/apply-policies'
import { publicProblem } from '../../../public/problem-details'
import { CONTENT_ERRORS } from '../constants'
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

  const id = crypto.randomUUID()
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

    context.get('activityLogger').log({
      action: 'create',
      entityType: 'content',
      entityId: id,
      entitySlug: slug,
      details: { title },
      actor: {
        id: jwtPayload.sub,
        email: jwtPayload.email ?? 'unknown',
        name: jwtPayload.name ?? null,
      },
    })

    return context.json({ id }, 201)
  } catch (error) {
    if (error instanceof SlugConflictError) {
      return publicProblem(context, { 
        type: 'content-slug-conflict', 
        title: 'Conflict', 
        status: 409, 
        detail: CONTENT_ERRORS.SLUG_CONFLICT 
      })
    }
    console.error('Content create error:', error)
    return publicProblem(context, { 
      type: 'content-database-error', 
      title: 'Internal Server Error', 
      status: 500, 
      detail: CONTENT_ERRORS.DATABASE_ERROR 
    })
  }
}
