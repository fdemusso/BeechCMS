// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { filterEntryForActor } from '@beechcms/core'
import type { Seed } from '@beechcms/core'
import { localizePublicEntry, type PublicLanguage } from './public-language'

const IDENTITY_FIELDS = ['id', 'slug']

function applyPublicPolicies(data: Record<string, unknown>, seed: Seed): Record<string, unknown> {
  return filterEntryForActor(data, seed, { type: 'public' })
}

export function toFlatPublicEntry(
  data: Record<string, unknown>,
  seed: Seed,
  fieldsParam?: string,
  language?: PublicLanguage,
): Record<string, unknown> {
  // Resolve first: masking and `?fields` then see the value the reader gets, not the stored dictionary.
  const projected = applyPublicPolicies(localizePublicEntry(seed, data, language), seed)
  const requestedFields = (fieldsParam ?? '').split(',').map(f => f.trim()).filter(Boolean)

  if (requestedFields.length === 0) return projected

  const filtered: Record<string, unknown> = {}
  for (const field of requestedFields) {
    if (field in projected) filtered[field] = projected[field]
  }

  for (const key of IDENTITY_FIELDS) {
    if (key in projected && !filtered[key]) filtered[key] = projected[key]
  }

  return filtered
}
