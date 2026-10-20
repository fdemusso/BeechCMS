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

describe('resolveVarAccess — filtered aggregates keep the collection definition', () => {
  const ORDERS_SEED = {
    slug: 'orders',
    label: 'Orders',
    branches: [
      { id: 'br_01', alias: 'amount', label: 'Amount', type: 'number' },
      { id: 'br_02', alias: 'status', label: 'Status', type: 'text' },
    ],
  } as unknown as Seed

  const ITEMS = [
    { id: '1', amount: 100, status: 'paid', created_at: 1 },
    { id: '2', amount: 50, status: 'open', created_at: 2 },
    { id: '3', amount: 200, status: 'paid', created_at: 3 },
  ]

  const variables = (pinned: string | null = null): Record<string, unknown> => ({
    orders: materializeCollection(ORDERS_SEED, ITEMS, pinned),
  })

  it('sum with an inline condition totals only the matching records', () => {
    expect(resolve('orders.sum.amount.(status=paid)', variables())).toBe(300)
  })

  it('avg, min and max with an inline condition use only the matching records', () => {
    expect(resolve('orders.avg.amount.(status=paid)', variables())).toBe(150)
    expect(resolve('orders.min.amount.(status=paid)', variables())).toBe(100)
    expect(resolve('orders.max.amount.(status=paid)', variables())).toBe(200)
  })

  it('pluck with an inline condition lists only the matching records', () => {
    expect(resolve('orders.pluck.status.(status=paid)', variables())).toBe('paid, paid')
  })

  it('sum over an array selector totals only the selected records', () => {
    expect(resolve('orders.array[1,3].sum.amount.(id!=none)', variables())).toBe(300)
  })

  it('a pinned collection stays pinned after filtering', () => {
    expect(resolve('orders.sum.(status=paid)', variables('amount'))).toBe(300)
  })
})

describe('resolveVarAccess — inline conditions over missing values', () => {
  // Number(null) is 0, which made `total<5` select a record that has no total at all.
  it('a numeric condition does not match a record whose field is null', () => {
    const variables = { v: materializeCollection(SEED, [{ id: 'o1', total: null, created_at: 1 }], null) }

    expect(resolve('v.count.(total<5)', variables)).toBe(0)
  })
})
