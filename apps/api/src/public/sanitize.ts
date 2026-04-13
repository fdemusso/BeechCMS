import { validateAndSanitizeSeedPayload } from '@beech/core'
import type { Seed, ValidationDetail } from '@beech/core'

type PublicSanitizeSuccess = {
  ok: true
  data: Record<string, unknown>
  unknownAliases: string[]
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
 * Adapter Public API: usa la foundation del core e mappa errori nel formato sprint.
 */
export function sanitizePublicPayload(
  seed: Seed,
  payload: Record<string, unknown>,
  options: {
    allowNull?: boolean
    strictUnknownAliases?: boolean
    operation?: 'create' | 'update'
    requireAtLeastOneValidField?: boolean
    enforceRequiredFields?: boolean
  } = {}
): PublicSanitizeResult {
  const operation = options.operation ?? 'create'
  const result = validateAndSanitizeSeedPayload(seed, payload, {
    allowNull: options.allowNull ?? false,
    rejectDangerousRichtext: true,
    operation,
    unknownAliases: options.strictUnknownAliases ? 'reject' : 'collect',
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
    unknownAliases: result.unknownAliases,
  }
}

