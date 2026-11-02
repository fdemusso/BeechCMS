// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { Branch, Seed } from '../types.js'
import { indexableSearchBranches } from '../ddl/ddl.js'
import { resolveClassification } from '../privacy/policies.js'
import { isLocalizedBranch } from '../localization/localization.js'

/** Resolves a seed slug to its definition; `undefined` when unknown. */
export type SeedLookup = (slug: string) => Seed | null | undefined

/**
 * How a list search is answered for a seed:
 * - `fts`: the seed has indexable text/richtext branches, matched through its FTS table.
 * - `relation`: the seed shows a single relation as its display name, matched against the
 *   target's display name (plain text only).
 * - `none`: nothing searchable; the search term is ignored.
 */
export type SearchSupport =
  | { mode: 'fts' }
  | { mode: 'relation'; branch: Branch; target: Seed; targetBranch: Branch }
  | { mode: 'none' }

/**
 * Decides how `seed` can be searched. FTS wins when available; otherwise a single relation
 * display name is searched through the target's display name, provided that column is plain,
 * unlocalized, unencrypted text.
 *
 * @param seed The seed being listed.
 * @param lookup Resolves relation targets; without it the relation mode is never chosen.
 */
export function resolveSearchSupport(seed: Seed, lookup?: SeedLookup): SearchSupport {
  if (indexableSearchBranches(seed).length > 0) return { mode: 'fts' }

  const branch = seed.branches.find((b) => b.alias === seed.displayNameAlias)
  if (!lookup || branch?.type !== 'relation' || branch.multiple === true || !branch.targetSeed) {
    return { mode: 'none' }
  }

  const target = lookup(branch.targetSeed)
  const targetBranch = target?.branches.find((b) => b.alias === target.displayNameAlias)
  if (
    !target
    || targetBranch?.type !== 'text'
    || isLocalizedBranch(targetBranch)
    || resolveClassification(targetBranch).storage === 'encrypt'
  ) {
    return { mode: 'none' }
  }

  return { mode: 'relation', branch, target, targetBranch }
}

/** True when a list search on `seed` can return filtered results. */
export function isSearchSupported(seed: Seed, lookup?: SeedLookup): boolean {
  return resolveSearchSupport(seed, lookup).mode !== 'none'
}
