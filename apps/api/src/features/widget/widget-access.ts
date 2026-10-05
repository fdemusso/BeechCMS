// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { resolvePolicies } from '@beechcms/core'
import type { ActorContext, AggregateFormula, Branch, Seed } from '@beechcms/core'
import { applyVisibility } from '../../shared/policies/apply-policies'

const SYSTEM_COLUMNS: ReadonlySet<string> = new Set(['id', 'slug', 'status', 'created_at', 'updated_at'])

const UNSAFE_COLUMN_ERROR = 'UNSAFE_COLUMN'
const PROBE = {}

/** Reuses the detail-read pipeline: only a column that survives it untouched is safe to aggregate or group on. */
function isExposed(seed: Seed, alias: string, actor: ActorContext): boolean {
  return applyVisibility({ [alias]: PROBE }, seed, actor)[alias] === PROBE
}

function findBranch(seed: Seed, alias: string): Branch {
  const branch = seed.branches.find(candidate => candidate.alias === alias)
  if (!branch) throw new Error(UNSAFE_COLUMN_ERROR)
  return branch
}

/** Throws UNSAFE_COLUMN unless the actor may read the column's raw value. */
export function assertColumnExposed(seed: Seed, alias: string, actor: ActorContext): void {
  if (SYSTEM_COLUMNS.has(alias)) return
  findBranch(seed, alias)
  if (!isExposed(seed, alias, actor)) throw new Error(UNSAFE_COLUMN_ERROR)
}

export function assertFilterable(seed: Seed, alias: string, actor: ActorContext): void {
  assertColumnExposed(seed, alias, actor)
  if (!SYSTEM_COLUMNS.has(alias) && !resolvePolicies(findBranch(seed, alias)).filter) {
    throw new Error(UNSAFE_COLUMN_ERROR)
  }
}

export function assertSortable(seed: Seed, alias: string, actor: ActorContext): void {
  assertColumnExposed(seed, alias, actor)
  if (!SYSTEM_COLUMNS.has(alias) && !resolvePolicies(findBranch(seed, alias)).sort) {
    throw new Error(UNSAFE_COLUMN_ERROR)
  }
}

/** Search runs against the display column; a stale alias falls back to `id` in the repository. */
export function assertSearchable(seed: Seed, actor: ActorContext): void {
  const displayBranch = seed.branches.find(candidate => candidate.alias === seed.displayNameAlias)
  if (!displayBranch) return
  assertColumnExposed(seed, displayBranch.alias, actor)
  if (!resolvePolicies(displayBranch).search) throw new Error(UNSAFE_COLUMN_ERROR)
}

export function assertFormulaColumns(seed: Seed, formula: AggregateFormula, actor: ActorContext): void {
  switch (formula.op) {
    case 'count':
      return
    case 'percentageOf':
      assertColumnExposed(seed, formula.numeratorColumn, actor)
      assertColumnExposed(seed, formula.denominatorColumn, actor)
      return
    default:
      assertColumnExposed(seed, formula.column, actor)
  }
}
