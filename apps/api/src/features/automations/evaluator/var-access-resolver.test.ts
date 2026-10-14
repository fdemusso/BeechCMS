// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from 'vitest'
import type { Seed } from '@beechcms/core'
import { resolveVarAccess } from './var-access-resolver'
import { parseTemplateKey } from './template-grammar'
import { materializeCollection } from '../executors/set-variable.executor'

const SEED = {
  slug: 'orders',
  label: 'Orders',
  branches: [{ id: 'br_01', alias: 'total', label: 'Total', type: 'number' }],
} as unknown as Seed

// Only keys carrying an inline condition parse as var_access; `(id!=none)` is true for every record.
function resolve(key: string, variables: Record<string, unknown>): unknown {
  const parsed = parseTemplateKey(key)
  if (!parsed || parsed.kind !== 'var_access') throw new Error(`not a var_access key: ${key}`)
  return resolveVarAccess(parsed, variables)
}

describe('resolveVarAccess — inherited object keys', () => {
  const variables = (): Record<string, unknown> => ({
    v: materializeCollection(SEED, [{ id: 'o1', total: 10, created_at: 1 }], null),
  })

  it('a variable name matching an Object.prototype member is not found', () => {
    expect(resolve('constructor.name.(id!=none)', variables())).toBeUndefined()
  })

  it('a field step does not walk into Object.prototype members of the record', () => {
    expect(resolve('v.firstone.constructor.(id!=none)', variables())).toBeUndefined()
  })

  it('an aggregate field does not walk into Object.prototype members of the aggregate map', () => {
    expect(resolve('v.sum.constructor.(id!=none)', variables())).toBeUndefined()
  })

  it('still resolves an own field of the first record', () => {
    expect(resolve('v.firstone.id.(id!=none)', variables())).toBe('o1')
  })
})

describe('resolveVarAccess — inline conditions over missing values', () => {
  // Number(null) is 0, which made `total<5` select a record that has no total at all.
  it('a numeric condition does not match a record whose field is null', () => {
    const variables = { v: materializeCollection(SEED, [{ id: 'o1', total: null, created_at: 1 }], null) }

    expect(resolve('v.count.(total<5)', variables)).toBe(0)
  })
})
