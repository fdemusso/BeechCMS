// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { Branch, BranchType, Seed } from '../engine/types.js'
import type { FormatCompatibility, TransferFormat } from './transfer.types.js'

/**
 * Branch types whose value is a collection or a nested document, never a scalar cell.
 * A CSV cell cannot carry them without inventing a flattening convention that the
 * importer would then have to guess at — which the brief rules out (§5).
 */
const NON_FLAT_BRANCH_TYPES: ReadonlySet<BranchType> = new Set<BranchType>([
  'relation',
  'repeater',
  'tags',
  'json',
])

/** True for a branch that cannot be represented as a single scalar CSV cell. */
function isNonFlat(branch: Branch): boolean {
  // A `file` branch is a single URL string — flat — unless it is an asset list.
  if (branch.type === 'file') return branch.multiple === true
  return NON_FLAT_BRANCH_TYPES.has(branch.type)
}

/** Every branch of `seed` that makes it non-flat, in declaration order. Empty when flat. */
export function nonFlatBranches(seed: Seed): Branch[] {
  return seed.branches.filter(isNonFlat)
}

/** A seed is flat when every branch maps to exactly one scalar column. */
export function isFlatSeed(seed: Seed): boolean {
  return nonFlatBranches(seed).length === 0
}

/**
 * The single authority on "may this seed be transferred in this format?", shared by the
 * export endpoint and the import endpoint so the two can never disagree.
 * NDJSON is universal; CSV requires a flat seed.
 */
export function checkFormatCompatibility(
  seed: Seed,
  format: TransferFormat,
): FormatCompatibility {
  if (format === 'ndjson') return { compatible: true }

  const offenders = nonFlatBranches(seed)
  if (offenders.length === 0) return { compatible: true }

  return {
    compatible: false,
    code: 'csv_requires_flat_seed',
    offendingBranches: offenders.map((branch) => ({ alias: branch.alias, type: branch.type })),
  }
}
