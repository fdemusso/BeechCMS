import { parsePositiveInt } from '../shared/query-utils'

export type PublicQueryInput = {
  page?: string
  limit?: string
  latest?: string
}

/**
 * Parse e clamp dei parametri di paginazione query.
 */
export function parsePublicPagination(input: PublicQueryInput): { page: number; limit: number } {
  const page = parsePositiveInt(input.page, 1)
  const limit = Math.min(parsePositiveInt(input.limit, 25), 100)
  return { page, limit }
}

/**
 * Parse e clamp del parametro latest.
 */
export function parseLatestCount(latest: string | undefined): number {
  if (!latest) return 10
  const raw = Number.parseInt(latest, 10)
  const parsed = Number.isNaN(raw) ? 10 : raw
  if (parsed < 1) return 1
  if (parsed > 100) return 100
  return parsed
}

