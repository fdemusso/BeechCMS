// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module engine/seeds/candidate-ids
 * Resolves branch ids on a candidate seed definition against the stored one.
 */

import { nextBranchId } from './seed-registry.js'
import type { Branch, Seed } from '../types.js'

/**
 * Fills the id of every branch (and repeater sub-field) that lacks one.
 *
 * The stored id wins by alias match; only an alias the stored definition does not know gets a fresh
 * `nextBranchId`. An id already present on the candidate is kept as-is: callers that author without
 * ids (hand-written manifests) must send none rather than invented ones.
 */
export function resolveCandidateIds<T extends { branches?: unknown }>(candidate: T, stored: Seed | null): T {
  const storedBranches = stored?.branches ?? []
  return {
    ...candidate,
    branches: assignIds(Array.isArray(candidate.branches) ? (candidate.branches as Partial<Branch>[]) : [], storedBranches),
  }
}

function assignIds(branches: Partial<Branch>[], stored: Branch[]): Branch[] {
  const storedByAlias = new Map(stored.map(b => [b.alias, b]))
  const accumulated: Branch[] = []
  for (const source of branches) {
    const match = source.alias === undefined ? undefined : storedByAlias.get(source.alias)
    const branch = { ...source } as Branch
    if (!branch.id) branch.id = match?.id || nextBranchId({ branches: accumulated })
    if (Array.isArray(source.fields)) branch.fields = assignIds(source.fields, match?.fields ?? [])
    accumulated.push(branch)
  }
  return accumulated
}
