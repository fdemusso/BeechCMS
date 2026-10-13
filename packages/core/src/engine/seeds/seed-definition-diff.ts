// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { Branch, Seed } from '../types.js'
import { canonicalStringify } from '../../common/canonical-json.js'
import { isSingleChoiceTags } from './tag-options.js'

/** A branch as either side of a comparison carries it: stored (`Branch`, with id) or manifest-authored (id optional). */
export type BranchDefinitionLike = Omit<Branch, 'id' | 'fields'> & { id?: string; fields?: BranchDefinitionLike[] }

/** A seed as either side of a comparison carries it: stored (`Seed`) or manifest-authored (no layout). */
export type SeedDefinitionLike = Omit<Seed, 'branches' | 'layout'> & { branches: BranchDefinitionLike[]; layout?: unknown }

/** Seed-level flags the engine treats as `false` when omitted. */
export const SEED_DEFINITION_FLAGS = ['allowDrafts', 'allowPublicRead', 'allowPublicPost', 'allowPublicEdit', 'softDelete'] as const

/** Branch-level flags the engine treats as `false` when omitted. `multiple` is resolved separately (see normalizeBranchDefinition). */
export const BRANCH_DEFINITION_FLAGS = ['requiredOnCreate', 'requiredOnUpdate'] as const

/**
 * Comparable form of one branch definition. Two branches are the same definition iff their canonicalStringify bytes match.
 *
 * - `id` is dropped, recursively through `fields`.
 * - `requiredOnCreate` / `requiredOnUpdate` omitted ≡ `false`.
 * - `multiple` omitted ≡ `true` on `tags` (single source of truth: `isSingleChoiceTags`), ≡ `false` on every other type.
 * - Every other key, unknown ones included, is copied unchanged: `options` is compared as declared (values, colors, order).
 */
export function normalizeBranchDefinition(branch: BranchDefinitionLike): Record<string, unknown> {
  const { id: _id, fields, ...rest } = branch
  const normalized: Record<string, unknown> = { ...rest }
  for (const flag of BRANCH_DEFINITION_FLAGS) normalized[flag] = branch[flag] === true
  normalized.multiple = branch.type === 'tags' ? !isSingleChoiceTags(branch) : branch.multiple === true
  if (fields !== undefined) normalized.fields = fields.map(normalizeBranchDefinition)
  return normalized
}

/** Comparable form of one seed definition (branches normalized, order kept). `layout` is server-populated and dropped. */
export function normalizeSeedDefinition(seed: SeedDefinitionLike): Record<string, unknown> {
  const { layout: _layout, branches, ...rest } = seed
  const normalized: Record<string, unknown> = { ...rest }
  for (const flag of SEED_DEFINITION_FLAGS) normalized[flag] = seed[flag] === true
  normalized.branches = (branches ?? []).map(normalizeBranchDefinition)
  return normalized
}

export interface SeedDefinitionDiff {
  /** True when the candidate's comparable definition differs from the stored one. Always true when nothing is stored. */
  changed: boolean
  /**
   * Aliases, in candidate order, of candidate branches that are new (no stored branch with the same id) or whose
   * comparable definition differs from the stored branch with the same id. `[]` when nothing is stored.
   */
  changedBranches: string[]
}

/** Compares a stored seed definition with a candidate whose ids were already resolved (`normalizeCandidate`). Pure. */
export function diffSeedDefinition(stored: Seed | null, candidate: Seed): SeedDefinitionDiff {
  if (stored === null) return { changed: true, changedBranches: [] }

  const storedById = new Map(stored.branches.map(branch => [branch.id, branch]))
  const changedBranches = candidate.branches
    .filter(branch => {
      const previous = storedById.get(branch.id)
      return previous === undefined
        || canonicalStringify(normalizeBranchDefinition(branch)) !== canonicalStringify(normalizeBranchDefinition(previous))
    })
    .map(branch => branch.alias)

  const changed = changedBranches.length > 0
    || canonicalStringify(normalizeSeedDefinition(candidate)) !== canonicalStringify(normalizeSeedDefinition(stored))
  return { changed, changedBranches }
}
