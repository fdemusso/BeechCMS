// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

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

