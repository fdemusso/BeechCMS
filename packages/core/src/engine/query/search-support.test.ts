// SPDX-License-Identifier: MIT
import { describe, it, expect } from 'vitest'
import type { Branch, Seed } from '../types.js'
import { buildSelectQuery } from './query.js'
import { isSearchSupported, resolveSearchSupport } from './search-support.js'

const customers: Seed = {
  slug: 'customers',
  label: 'Customer',
  allowDrafts: false,
  displayNameAlias: 'name',
  branches: [{ id: 'br_name', alias: 'name', type: 'text', label: 'Name' }],
}

const subscriptions: Seed = {
  slug: 'subscriptions',
  label: 'Subscription',
  allowDrafts: false,
  displayNameAlias: 'customer_id',
  branches: [
    { id: 'br_customer', alias: 'customer_id', type: 'relation', targetSeed: 'customers', label: 'Customer' },
    { id: 'br_mrr', alias: 'mrr', type: 'number', label: 'MRR' },
  ],
}

const lookup = (seeds: Seed[]) => (slug: string) => seeds.find((s) => s.slug === slug)

function withTargetName(branch: Partial<Branch>): Seed {
  return { ...customers, branches: [{ ...customers.branches[0], ...branch } as Branch] }
}

describe('resolveSearchSupport', () => {
  it('chooses fts when the seed has an indexable text branch', () => {
    const support = resolveSearchSupport(customers)

    expect(support.mode).toBe('fts')
  })

  it('chooses relation when the display name is a single relation to a plain text target', () => {
    const support = resolveSearchSupport(subscriptions, lookup([customers]))

    expect(support.mode).toBe('relation')
  })

  it('is none for a relation display name when no lookup is given', () => {
    const support = resolveSearchSupport(subscriptions)

    expect(support.mode).toBe('none')
  })

  it('is none when the relation target is unknown', () => {
    const support = resolveSearchSupport(subscriptions, lookup([]))

    expect(support.mode).toBe('none')
  })

  it('is none for a multiple relation', () => {
    const seed: Seed = {
      ...subscriptions,
      branches: [{ ...subscriptions.branches[0], multiple: true }, subscriptions.branches[1]],
    }

    const support = resolveSearchSupport(seed, lookup([customers]))

    expect(support.mode).toBe('none')
  })

  it.each([
    ['localized', { localized: true }],
    ['encrypted', { policies: { classification: 'confidential' as const } }],
    ['non-text', { type: 'number' as const }],
  ])('is none when the target display name is %s', (_label, override) => {
    const target = withTargetName(override)

    const support = resolveSearchSupport(subscriptions, lookup([target]))

    expect(support.mode).toBe('none')
  })

  it('is none for a seed without text branches or a relation display name', () => {
    const seed: Seed = { ...subscriptions, displayNameAlias: 'mrr' }

    expect(isSearchSupported(seed, lookup([customers]))).toBe(false)
  })
})

describe('buildSelectQuery relation search', () => {
  it('filters on the target display name through an IN subquery', () => {
    const query = buildSelectQuery(subscriptions, { search: 'acme', resolveSeed: lookup([customers]) })

    expect(query.sql).toContain(
      "content_subscriptions.customer_id IN (SELECT content_customers.id FROM content_customers" +
      " WHERE content_customers.name LIKE ? ESCAPE '\\' AND content_customers.deleted_at IS NULL)",
    )
    expect(query.bindings).toEqual(['%acme%'])
  })

  it('escapes LIKE wildcards in the search term', () => {
    const query = buildSelectQuery(subscriptions, { search: '50%_off\\', resolveSeed: lookup([customers]) })

    expect(query.bindings).toEqual(['%50\\%\\_off\\\\%'])
  })

  it('ignores the term when the target cannot be resolved', () => {
    const query = buildSelectQuery(subscriptions, { search: 'acme' })

    expect(query.sql).not.toContain('LIKE')
    expect(query.bindings).toEqual([])
  })
})
