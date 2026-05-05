import { validateAndSanitizeSeedPayload } from '@beechcms/core'
import type { Seed, ValidationDetail } from '@beechcms/core'

type PublicSanitizeSuccess = {
  ok: true
  data: Record<string, unknown>
}

type PublicSanitizeFailure = {
  ok: false
  status: 400 | 422
  code: 'validation_failed' | 'dangerous_content'
  message: string
  details?: ValidationDetail[]
}

export type PublicSanitizeResult = PublicSanitizeSuccess | PublicSanitizeFailure

/**
 * Public API Adapter: uses the core foundation and maps errors into the sprint format.
 */
export function sanitizePublicPayload(
  seed: Seed,
  payload: Record<string, unknown>,
  options: {
    allowNull?: boolean
    operation?: 'create' | 'update'
    requireAtLeastOneValidField?: boolean
    enforceRequiredFields?: boolean
  } = {}
): PublicSanitizeResult {
  const operation = options.operation ?? 'create'
  const result = validateAndSanitizeSeedPayload(seed, payload, {
    allowNull: options.allowNull ?? false,
    operation,
    requireAtLeastOneValidField: options.requireAtLeastOneValidField ?? true,
    enforceRequiredFields: options.enforceRequiredFields ?? true,
  })

  if (result.dangerousFields.length > 0) {
    const field = result.dangerousFields[0]
    return {
      ok: false,
      status: 422,
      code: 'dangerous_content',
      message: `Content rejected: dangerous markup detected in field '${field}'`,
    }
  }

  if (result.details.length > 0) {
    return {
      ok: false,
      status: 400,
      code: 'validation_failed',
      message: 'Validation failed',
      details: result.details,
    }
  }

  return {
    ok: true,
    data: result.data,
  }
}

