// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Branch, Seed } from '@beechcms/core'
import { resolvePolicies } from '@beechcms/core'

/** Error vocabulary of the caller: the same five checks answer under two contract names. */
export type RelationAccessKind = 'include' | 'subquery'

export type PublicRelationTarget = {
  branch: Branch
  targetSeed: Seed
}

/**
 * The single definition of "a relation a public caller may traverse", shared by `?include=`
 * (relation-include.ts) and relation subquery filters (relation-subquery.ts).
 *
 * @throws Error whose message starts with `Invalid include:` or `Invalid subquery:` per `kind`,
 *   which public-read.ts maps to 400 `invalid-include` / `invalid-subquery`.
 */
export function resolvePublicRelationTarget(
  alias: string,
  parentSeed: Seed,
  getSeed: (slug: string) => Seed | null,
  kind: RelationAccessKind,
): PublicRelationTarget {
  const prefix = kind === 'include' ? 'Invalid include' : 'Invalid subquery'

  const branch = parentSeed.branches.find(b => b.alias === alias)
  if (!branch) {
    throw new Error(`${prefix}: branch '${alias}' does not exist.`)
  }
  if (branch.type !== 'relation') {
    throw new Error(`${prefix}: branch '${alias}' is not a relation.`)
  }
  if (!resolvePolicies(branch).public) {
    throw new Error(`${prefix}: branch '${alias}' is not publicly readable.`)
  }
  if (!branch.targetSeed) {
    throw new Error(`${prefix}: branch '${alias}' is missing a target seed.`)
  }
  const targetSeed = getSeed(branch.targetSeed)
  if (!targetSeed || !targetSeed.allowPublicRead) {
    throw new Error(`${prefix}: target seed '${branch.targetSeed}' is not publicly readable.`)
  }

  return { branch, targetSeed }
}
