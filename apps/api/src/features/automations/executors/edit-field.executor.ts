// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { AutomationAction, ContentRepository, Seed } from '@beechcms/core'
import type { ResolvedContext } from '../evaluator/context-resolver'
import { interpolate } from '../engine/automation-runner.utils'

type EditFieldAction = Extract<AutomationAction, { type: 'edit_field' }>

export async function executeEditField(
  action: EditFieldAction,
  entry: Record<string, unknown>,
  context: ResolvedContext,
  repository: ContentRepository,
  seed: Seed,
): Promise<void> {
  const id = entry.id
  if (typeof id !== 'string') {
    throw new Error('edit_field: entry.id missing')
  }
  const resolved = typeof action.value === 'string'
    ? interpolate(action.value, context)
    : action.value
  await repository.update(seed, id, { [action.field]: resolved })
}
