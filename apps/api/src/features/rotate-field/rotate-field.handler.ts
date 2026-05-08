/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import { resolvePolicies, verifyHashField, sha256hex, validateAndSanitizeSeedPayload, EntryNotFoundError } from '@beechcms/core'
import { publicProblem } from '../../public/problem-details'
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

  const isCurrentValueValid = await verifyHashField(storedFieldValueHash, currentValue)
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

  if (fieldValidationResult.details.length > 0) {
    return publicProblem(context, { 
      type: 'rotate-field-invalid-next', 
      title: 'Bad Request', 
      status: 400, 
      detail: `Invalid value for field '${fieldAlias}': ${fieldValidationResult.details[0]?.message ?? 'validation failed'}` 
    })
  }

  const newFieldValueHash = await sha256hex(nextValue)

  await context.get('repository').update(seed, entryId, { [targetFieldBranch.alias]: newFieldValueHash })

  return context.json({ success: true })
})


export { rotateFieldApp }

