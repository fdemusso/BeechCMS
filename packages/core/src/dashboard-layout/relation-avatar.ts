// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { Branch } from '../engine/types.js'
import type { SeedLookup } from '../engine/query/search-support.js'
import { isImageMediaBranch } from './seed-layout.js'

/**
 * The target-seed branch that supplies a relation's avatar image, or `null` when the relation has no
 * avatar configured or the configuration no longer resolves (target gone, field renamed, retyped,
 * hidden). Callers treat `null` as "no avatar" — a stale `avatarSource` degrades, it never throws.
 *
 * @param branch The relation branch carrying `avatarSource`.
 * @param lookup Resolves the relation target.
 */
export function resolveRelationAvatar(branch: Branch, lookup: SeedLookup): Branch | null {
  if (branch.type !== 'relation' || !branch.avatarSource || !branch.targetSeed) return null
  const target = lookup(branch.targetSeed)
  const source = target?.branches.find((b) => b.alias === branch.avatarSource)
  return source && isImageMediaBranch(source) ? source : null
}
