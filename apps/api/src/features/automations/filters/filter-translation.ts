// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Shared helper: converts a TriggerCondition into a FilterGroup accepted by
 * ContentRepository.findMany. Used by cron-runner and context-resolver.
 *
 * TODO Sprint 8 (Task 12): when-pushdown.ts will call extractPushdownFilters
 * to convert safe WhenNode predicates to FilterGroup[] for SQL pre-filtering.
 */
import type { BranchType, FilterGroup, FilterOperator, FilterType, Seed, TriggerCondition } from '@beechcms/core'

const SYSTEM_COLUMNS = new Set(['id', 'slug', 'status', 'created_at', 'updated_at'])

function mapBranchTypeToFilterType(type: BranchType): FilterType {
  switch (type) {
    case 'number': return 'number'
    case 'boolean': return 'boolean'
    case 'date': return 'date'
    case 'tags': return 'tags'
    case 'json': return 'json'
    default: return 'text'
  }
}

function mapOp(op: TriggerCondition['op']): FilterOperator {
  switch (op) {
    case 'isempty': return 'is_empty'
    case 'isnotempty': return 'is_not_empty'
    default: return op
  }
}

export function conditionToFilterGroup(c: TriggerCondition, seed: Seed): FilterGroup {
  const branch = seed.branches.find((b) => b.alias === c.field)
  const type: FilterType = branch
    ? mapBranchTypeToFilterType(branch.type)
    : SYSTEM_COLUMNS.has(c.field) ? 'system' : 'text'

  return {
    column: c.field,
    type,
    conditions: [{ op: mapOp(c.op), value: c.value as string | number | boolean | null }],
  }
}
