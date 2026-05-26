// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Branch } from '@beechcms/core'
import type { WhenOp } from '../../schema/automation.schema'

const TEXT_OPS: WhenOp[] = ['eq', 'neq', 'contains', 'startswith', 'endswith', 'isempty', 'isnotempty', 'matches']
const TEXT_OPTIONS_OPS: WhenOp[] = ['eq', 'neq', 'in', 'notin', 'isempty', 'isnotempty']
const NUMBER_OPS: WhenOp[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'isempty', 'isnotempty']
const DATE_OPS: WhenOp[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'isempty', 'isnotempty']
const BOOLEAN_OPS: WhenOp[] = ['eq', 'neq', 'isempty', 'isnotempty']
const TAGS_OPS: WhenOp[] = ['eq', 'neq', 'contains', 'in', 'notin', 'isempty', 'isnotempty']
const FILE_OPS: WhenOp[] = ['isempty', 'isnotempty']
const ALL_OPS: WhenOp[] = [
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
  'contains', 'startswith', 'endswith',
  'in', 'notin',
  'isempty', 'isnotempty',
  'matches',
]

export function getWhenOpsForBranch(branch: Branch | undefined): WhenOp[] {
  if (!branch) return ALL_OPS
  switch (branch.type) {
    case 'number':  return NUMBER_OPS
    case 'date':    return DATE_OPS
    case 'boolean': return BOOLEAN_OPS
    case 'tags':    return TAGS_OPS
    case 'json':    return TAGS_OPS
    case 'file':    return FILE_OPS
    case 'text':    return branch.options?.length ? TEXT_OPTIONS_OPS : TEXT_OPS
    default:        return TEXT_OPS
  }
}
