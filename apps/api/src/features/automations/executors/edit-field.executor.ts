// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import {
  isLocalizedBranch,
  validateAndSanitizeSeedPayload,
  type AutomationAction,
  type ContentRepository,
  type IIdGenerator,
  type Seed,
} from '@beechcms/core'
import type { ResolvedContext } from '../evaluator/context-resolver'
import { interpolate } from '../engine/automation-runner.utils'

type EditFieldAction = Extract<AutomationAction, { type: 'edit_field' }>

export async function executeEditField(
  action: EditFieldAction,
  entry: Record<string, unknown>,
  context: ResolvedContext,
  repository: ContentRepository,
  seed: Seed,
  idGenerator: IIdGenerator,
): Promise<void> {
  const id = entry.id
  if (typeof id !== 'string') {
    throw new Error('edit_field: entry.id missing')
  }
  const branch = seed.branches.find((b) => b.alias === action.field)
  // The executor refuses localized fields: setting one raw would replace every stored
  // translation. Refused until automations can merge per locale.
  if (branch && isLocalizedBranch(branch)) {
    throw new Error(`edit_field: field '${action.field}' is localized and cannot be set by an automation`)
  }
  const resolved = typeof action.value === 'string'
    ? interpolate(action.value, context, { escape: 'none' })
    : action.value

  const validation = validateAndSanitizeSeedPayload(seed, { [action.field]: resolved }, {
    operation: 'update',
    allowNull: true,
    requireAtLeastOneValidField: true,
    enforceRequiredFields: false,
    idGenerator,
  })
  if (validation.dangerousFields.length > 0) {
    throw new Error(`edit_field: field '${action.field}' contains dangerous content and was rejected`)
  }
  if (validation.details.length > 0) {
    throw new Error(`edit_field: validation failed for field '${action.field}': ${validation.details[0].message}`)
  }

  await repository.update(seed, id, validation.data)
}
