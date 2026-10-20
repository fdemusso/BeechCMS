// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { Seed } from '../engine/types.js'
import { indexableSearchBranches } from '../engine/ddl/ddl.js'
import { isLocaleDictionary, isLocalizedBranch } from '../engine/localization/localization.js'
import { extractRichtextText } from '../engine/validation/richtext-sanitizer.js'

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
    if (isLocalizedBranch(branch) && isLocaleDictionary(val)) {
      // Every language is indexed, so a query matches regardless of the language it is typed in.
      for (const localeValue of Object.values(val)) {
        if (typeof localeValue === 'string' && localeValue) {
          texts.push(localeValue)
        } else if (branch.type === 'richtext') {
          const text = extractRichtextText(localeValue)
          if (text) texts.push(text)
        }
      }
    } else if (typeof val === 'string' && val) {
      texts.push(val)
    } else if (branch.type === 'richtext') {
      // Deserialized richtext is always a TipTap doc object (or v1 envelope), never a string.
      const text = extractRichtextText(val)
      if (text) texts.push(text)
    }
  }

  const combined = texts.join(' ').trim()
  return combined.length > 0 ? combined : null
}
