// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from 'vitest'
import { CANONICAL_SEEDS } from '@beechcms/testing'
import { relationChangeReasons } from './seeds.helpers'

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
