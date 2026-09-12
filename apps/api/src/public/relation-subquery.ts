// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { ContentRepository, Seed } from '@beechcms/core'
import { resolvePublicRelationTarget } from './relation-access'
import { toEngineFilters, type ParsedPublicFilter, type PublicFilterCondition } from './query-builder'

/** A subquery resolving to more targets than this is refused, never truncated: truncation silently drops parent rows. */
const MAX_SUBQUERY_TARGET_IDS = 200
/** Multi-relation resolution fans out to parents; the same refusal rule applies one level up. */
const MAX_SUBQUERY_PARENT_IDS = 500

export type ResolvedSubqueryFilter = {
  /** Filter to hand to `toEngineFilters`, with every subquery rewritten to a concrete id condition. */
  filter: ParsedPublicFilter | null
  /** True when the request provably matches nothing; the caller MUST answer an empty page without querying. */
  empty: boolean
}

/**
 * Rewrites every relation condition into a concrete `in` condition the engine can compile:
 *   - single relation → `{ field: <alias>, op: 'in', value: [targetId, …] }` (the alias IS a column)
 *   - multi relation  → `{ field: 'id',    op: 'in', value: [parentId, …] }` (resolved via the junction)
 *
 * An unresolved subquery must never reach `buildSelectQuery`: an `in` with an empty array is DROPPED
 * there (query.ts:209), which would answer the whole collection instead of nothing.
 */
export async function resolveRelationSubqueries(
  parsed: ParsedPublicFilter | null,
  parentSeed: Seed,
  repository: ContentRepository,
  getSeed: (slug: string) => Seed | null,
  publishedOnly: boolean,
): Promise<ResolvedSubqueryFilter> {
  if (!parsed || parsed.where.length === 0) return { filter: parsed, empty: false }

  const isOr = parsed.logic === 'OR'
  const rewritten: PublicFilterCondition[] = []
  let droppedAny = false

  for (const cond of parsed.where) {
    const branch = parentSeed.branches.find(b => b.alias === cond.field)
    const isRelation = branch?.type === 'relation'

    if (!cond.subquery && !isRelation) {
      rewritten.push(cond)
      continue
    }
    if (!cond.subquery && isRelation && branch?.multiple !== true) {
      // A single relation is a plain TEXT column; today's direct id filter already works.
      rewritten.push(cond)
      continue
    }
    if (cond.op !== 'in') {
      throw new TypeError(
        `Invalid subquery: field '${cond.field}' is a relation and only supports the 'in' operator (got '${cond.op}').`,
      )
    }

    const { branch: relBranch, targetSeed } = resolvePublicRelationTarget(cond.field, parentSeed, getSeed, 'subquery')

    const targetIds = cond.subquery
      ? await resolveTargetIds(cond.field, cond.subquery, targetSeed, repository, publishedOnly)
      : normalizeIdArray(cond.field, cond.value)

    if (targetIds.length === 0) {
      droppedAny = true
      if (!isOr) return { filter: null, empty: true }
      continue
    }

    if (relBranch.multiple !== true) {
      rewritten.push({ field: cond.field, op: 'in', value: targetIds })
      continue
    }

    const parentIds = await repository.findParentIdsByRelation(
      parentSeed, cond.field, targetIds, MAX_SUBQUERY_PARENT_IDS + 1,
    )
    if (parentIds.length > MAX_SUBQUERY_PARENT_IDS) {
      throw new TypeError(
        `Invalid subquery: field '${cond.field}' matches more than ${MAX_SUBQUERY_PARENT_IDS} entries; narrow the subquery.`,
      )
    }
    if (parentIds.length === 0) {
      droppedAny = true
      if (!isOr) return { filter: null, empty: true }
      continue
    }
    rewritten.push({ field: 'id', op: 'in', value: parentIds })
  }

  // Under OR, a subquery matching nothing is a false disjunct and is dropped — but if EVERY condition
  // was dropped the request matches nothing, and an empty `where` would answer the whole collection.
  if (rewritten.length === 0) {
    return { filter: null, empty: droppedAny }
  }

  return { filter: { where: rewritten, logic: parsed.logic }, empty: false }
}

async function resolveTargetIds(
  field: string,
  subquery: NonNullable<PublicFilterCondition['subquery']>,
  targetSeed: Seed,
  repository: ContentRepository,
  publishedOnly: boolean,
): Promise<string[]> {
  // Reuses the public filter policy gate: inner fields must be public AND filterable on the TARGET seed.
  const innerFilters = toEngineFilters(targetSeed, { where: subquery.where, logic: subquery.logic })

  const { items, total } = await repository.findMany(targetSeed, {
    filters: innerFilters,
    filterLogic: subquery.logic,
    status: publishedOnly ? 'published' : null,
    pagination: { limit: MAX_SUBQUERY_TARGET_IDS, offset: 0 },
  })

  if (total > MAX_SUBQUERY_TARGET_IDS) {
    throw new TypeError(
      `Invalid subquery: field '${field}' matches ${total} entries, above the limit of ${MAX_SUBQUERY_TARGET_IDS}; narrow the subquery.`,
    )
  }
  return items.map(item => item.id as string).filter(id => typeof id === 'string')
}

function normalizeIdArray(field: string, value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`Invalid subquery: field '${field}' expects an array of ids or a subquery object.`)
  }
  const ids = value.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
  if (ids.length > MAX_SUBQUERY_TARGET_IDS) {
    throw new TypeError(
      `Invalid subquery: field '${field}' carries more than ${MAX_SUBQUERY_TARGET_IDS} ids.`,
    )
  }
  return ids
}
