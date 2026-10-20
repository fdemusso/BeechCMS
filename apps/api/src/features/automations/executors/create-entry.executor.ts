// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import {
  validateAndSanitizeSeedPayload,
  type AutomationAction,
  type ContentRepository,
  type IIdGenerator,
  type Seed,
} from '@beechcms/core'

type CreateEntryAction = Extract<AutomationAction, { type: 'create_entry' }>
type SeedResolver = (slug: string) => Seed | null

export async function executeCreateEntry(
  action: CreateEntryAction,
  entry: Record<string, unknown>,
  repository: ContentRepository,
  getSeed: SeedResolver,
  idGenerator: IIdGenerator,
): Promise<void> {
  const targetSeed = getSeed(action.seed_slug)
  if (!targetSeed) throw new Error(`create_entry: unknown seed ${action.seed_slug}`)

  const payload: Record<string, unknown> = {}
  for (const [targetField, sourceField] of Object.entries(action.field_map)) {
    payload[targetField] = Object.hasOwn(entry, sourceField) ? entry[sourceField] : sourceField
  }

  const validation = validateAndSanitizeSeedPayload(targetSeed, payload, {
    operation: 'create',
    allowNull: true,
    requireAtLeastOneValidField: true,
    enforceRequiredFields: false,
    idGenerator,
  })
  if (validation.dangerousFields.length > 0) {
    throw new Error(`create_entry: seed '${action.seed_slug}' received dangerous content and was rejected`)
  }
  if (validation.details.length > 0) {
    throw new Error(`create_entry: validation failed for seed '${action.seed_slug}': ${validation.details[0].message}`)
  }

  const newId = idGenerator.uuid()
  await repository.create(targetSeed, newId, newId, 'draft', validation.data)
}
