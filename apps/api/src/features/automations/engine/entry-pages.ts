// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { ContentRepository, Seed, SelectOptions } from '@beechcms/core'

const PAGE_SIZE = 1000

/** Keeps one run inside the isolate's memory budget; a seed larger than this is processed partially. */
export const MAX_AUTOMATION_ROWS = 10_000

/** Reads every row `options` selects, page by page, up to MAX_AUTOMATION_ROWS. */
export async function findAllEntries(
  repository: ContentRepository,
  seed: Seed,
  options: Omit<SelectOptions, 'pagination'>,
): Promise<Array<Record<string, unknown>>> {
  const rows: Array<Record<string, unknown>> = []
  let total = 0

  while (rows.length < MAX_AUTOMATION_ROWS) {
    const page = await repository.findMany(seed, {
      ...options,
      pagination: { limit: Math.min(PAGE_SIZE, MAX_AUTOMATION_ROWS - rows.length), offset: rows.length },
    })
    rows.push(...page.items)
    total = page.total
    if (page.items.length < PAGE_SIZE) return rows
  }

  if (total > rows.length) {
    console.warn(`[automations] seed "${seed.slug}" has ${total} matching rows; only the first ${rows.length} are processed`)
  }
  return rows
}
