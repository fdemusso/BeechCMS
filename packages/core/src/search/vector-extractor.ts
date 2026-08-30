// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { Seed } from '../engine/types.js'
import { indexableSearchBranches } from '../engine/ddl.js'

/**
 * Extracts and concatenates text from all public indexable text/richtext branches of a seed.
 * Enforces privacy policies by utilizing indexableSearchBranches.
 *
 * @param seed The seed definition.
 * @param entry The content entry record.
 * @returns The combined text, or null if no indexable text exists.
 */
export function extractIndexableText(seed: Seed, entry: Record<string, any>): string | null {
  const branches = indexableSearchBranches(seed)
  if (branches.length === 0) return null

  const texts: string[] = []
  for (const branch of branches) {
    const val = entry[branch.alias]
    if (val && typeof val === 'string') {
      texts.push(val)
    }
  }

  const combined = texts.join(' ').trim()
  return combined.length > 0 ? combined : null
}
