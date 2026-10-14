// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from 'vitest'
import { CANONICAL_SEEDS } from '@beechcms/testing'
import { automationReferencesAlias, relationChangeReasons } from './seeds.helpers'

describe('automationReferencesAlias', () => {
  const automation = {
    id: 'auto_1',
    name: 'Notify',
    actions: [{ type: 'send_mail', to: 'ops@example.com', subject_template: 'New {{this.title}}', body_template: 'Sub: {{this.subtitle}}' }],
  }

  it.each([
    ['title', true],
    ['subtitle', true],
    ['sub', false],
    ['itle', false],
    ['a', false],
    ['name', false],
    ['subject_template', false],
  ])('alias %s referenced=%s', (alias, expected) => {
    // Only whole identifiers inside string values count; substrings and JSON keys are not references.
    const result = automationReferencesAlias(automation, alias)

    expect(result).toBe(expected)
  })

  it('finds an alias held as a whole string value', () => {
    const result = automationReferencesAlias({ id: 'auto_2', actions: [{ type: 'edit_field', field: 'title', value: 1 }] }, 'title')

    expect(result).toBe(true)
  })
})

describe('relationChangeReasons', () => {
  it.each([
    { alias: 'author_id', onDelete: 'SET NULL' as const },
    { alias: 'related_posts', onDelete: 'CASCADE' as const },
  ])('accepts the explicit default delete rule for $alias', ({ alias, onDelete }) => {
    const posts = CANONICAL_SEEDS.find(seed => seed.slug === 'posts')
    const stored = posts?.branches.find(branch => branch.alias === alias)
    if (!stored) throw new Error(`canonical ${alias} branch missing`)
    const incoming = { ...stored, onDelete }

    // Implicit FK defaults and their explicit spelling produce the same physical schema.
    const reasons = relationChangeReasons(stored, incoming)

    expect(reasons).toEqual([])
  })

  it('accepts explicit false for an implicit single relation', () => {
    const posts = CANONICAL_SEEDS.find(seed => seed.slug === 'posts')
    const stored = posts?.branches.find(branch => branch.alias === 'author_id')
    if (!stored) throw new Error('canonical author_id branch missing')
    const incoming = { ...stored, multiple: false }

    const reasons = relationChangeReasons(stored, incoming)

    expect(reasons).toEqual([])
  })
})
