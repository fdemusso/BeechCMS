/**
 * Helper meta per risposta lista Public API.
 */
export function buildPublicListMeta(input: {
  total: number
  page: number
  limit: number
  returned: number
  seed: string
}) {
  return {
    total: input.total,
    page: input.page,
    limit: input.limit,
    returned: input.returned,
    seed: input.seed,
  }
}

/**
 * Helper meta per risposta singolo elemento Public API.
 */
export function buildPublicSingleMeta(seed: string) {
  return { seed }
}

