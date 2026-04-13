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
  options: { allowNull?: boolean; strictUnknownAliases?: boolean } = {}
): PublicSanitizeResult {
  const result = validateAndSanitizeSeedPayload(seed, payload, {
    allowNull: options.allowNull ?? false,
    rejectDangerousRichtext: true,
  })

  if (result.dangerousFields.length > 0) {
    const field = result.dangerousFields[0]
    return {
      ok: false,
      status: 422,
      message: `Content rejected: dangerous markup detected in field '${field}'`,
    }
  }

  if (result.details.length > 0) {
    return {
      ok: false,
      status: 400,
      message: 'Validation failed',
      details: result.details,
    }
  }

  if (options.strictUnknownAliases && result.unknownAliases.length > 0) {
    return {
      ok: false,
      status: 400,
      message: `Unknown aliases: ${result.unknownAliases.join(', ')}`,
      details: result.unknownAliases.map((alias) => ({
        field: alias,
        expected: 'known-seed-alias',
        received: 'unknown-alias',
        message: `Field '${alias}' is not defined in seed '${seed.slug}'`,
      })),
    }
  }

  return {
    ok: true,
    data: result.data,
    unknownAliases: result.unknownAliases,
  }
}

