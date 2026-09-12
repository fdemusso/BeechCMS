// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { ContentRepository, Seed } from '@beechcms/core'
import { resolvePolicies } from '@beechcms/core'
import { toFlatPublicEntry } from './entry-projection'

const MAX_INCLUDES = 3
const MAX_TARGET_IDS = 200

export async function expandRelations(
  items: Record<string, unknown>[],
  includesParam: string | undefined,
  parentSeed: Seed,
  repository: ContentRepository,
  getSeed: (slug: string) => Seed | null,
  rawItems: Record<string, unknown>[] = items
): Promise<void> {
  if (!includesParam) return

  const rawIncludes = includesParam.split(',').map(s => s.trim()).filter(Boolean)
  const includes = Array.from(new Set(rawIncludes))
  if (includes.length === 0) return

  if (includes.length > MAX_INCLUDES) {
    throw new Error(`Invalid include: maximum of ${MAX_INCLUDES} includes allowed per request (got ${includes.length}).`)
  }

  for (const include of includes) {
    if (include.includes('.')) {
      throw new Error(`Invalid include: nested includes are not supported (got '${include}'). Max depth is 1.`)
    }

    const branch = parentSeed.branches.find(b => b.alias === include)
    if (!branch) {
      throw new Error(`Invalid include: branch '${include}' does not exist.`)
    }
    if (branch.type !== 'relation') {
      throw new Error(`Invalid include: branch '${include}' is not a relation.`)
    }
    if (!resolvePolicies(branch).public) {
      throw new Error(`Invalid include: branch '${include}' is not publicly readable.`)
    }

    if (!branch.targetSeed) {
      throw new Error(`Invalid include: branch '${include}' is missing a target seed.`)
    }
    const targetSeed = getSeed(branch.targetSeed)
    if (!targetSeed || !targetSeed.allowPublicRead) {
      throw new Error(`Invalid include: target seed '${branch.targetSeed}' is not publicly readable.`)
    }

    const targetIds = new Set<string>()
    for (let i = 0; i < items.length; i++) {
      const source = rawItems ? rawItems[i] : items[i]
      const val = source?.[branch.alias]
      if (Array.isArray(val)) {
        for (const v of val) if (typeof v === 'string') targetIds.add(v)
      } else if (typeof val === 'string') {
        targetIds.add(val)
      }
    }

    const clampedTargetIds = Array.from(targetIds).slice(0, MAX_TARGET_IDS)
    if (clampedTargetIds.length === 0) continue

    const { items: targetItems } = await repository.findMany(targetSeed, {
      filters: [{
        column: 'id',
        type: 'system',
        conditions: [{ op: 'in', value: clampedTargetIds }]
      }],
      status: 'published',
      pagination: { limit: clampedTargetIds.length, offset: 0 }
    })

    const targetMap = new Map<string, Record<string, unknown>>()
    for (const ti of targetItems) {
      targetMap.set(ti.id as string, toFlatPublicEntry(ti, targetSeed))
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const source = rawItems ? rawItems[i] : items[i]
      const val = source?.[branch.alias]
      if (!val) continue

      item._includes = item._includes || {}
      const includesRecord = item._includes as Record<string, unknown>

      if (Array.isArray(val)) {
        includesRecord[branch.alias] = val.map(v => targetMap.get(v as string)).filter(Boolean)
      } else if (typeof val === 'string') {
        includesRecord[branch.alias] = targetMap.get(val) || null
      }
    }
  }
}
