// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { AutomationAction, ContentRepository, Seed, IIdGenerator } from '@beechcms/core'

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
    payload[targetField] = (sourceField as string) in entry ? entry[sourceField as string] : sourceField
  }

  const newId = idGenerator.uuid()
  await repository.create(targetSeed, newId, newId, 'draft', payload)
}
