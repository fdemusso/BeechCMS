// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import type { Seed } from '@beechcms/core'
import { orderSeedsForApply } from '../lib/manifest-order.js'

describe('manifest-order', () => {
  // Rule 3.5: Hand-rolled fixture because canonical seeds have no relation pairs that fit exactly this shape.
  const a = { slug: 'a', label: 'a', displayNameAlias: 'a', branches: [] } as Seed
  const b = { slug: 'b', label: 'b', displayNameAlias: 'b', branches: [{ type: 'relation', alias: 'r', targetSeed: 'a' } as any] } as Seed
  const c = { slug: 'c', label: 'c', displayNameAlias: 'c', branches: [{ type: 'relation', alias: 'r', targetSeed: 'b' } as any] } as Seed

  it('places a relation target before the seed that points at it', () => {
    const result = orderSeedsForApply([c, b, a])
    expect(result.ordered.map(s => s.slug)).toEqual(['a', 'b', 'c'])
    expect(result.cycles).toEqual([])
  })

  it('orders independent seeds by slug so two runs over one manifest are identical', () => {
    const z = { slug: 'z', label: 'z', displayNameAlias: 'z', branches: [] } as Seed
    const x = { slug: 'x', label: 'x', displayNameAlias: 'x', branches: [] } as Seed
    const result = orderSeedsForApply([z, a, x])
    expect(result.ordered.map(s => s.slug)).toEqual(['a', 'x', 'z'])
  })

  it('ignores a relation whose target is not in the manifest', () => {
    const d = { slug: 'd', label: 'd', displayNameAlias: 'd', branches: [{ type: 'relation', alias: 'r', targetSeed: 'missing' } as any] } as Seed
    const result = orderSeedsForApply([d, a])
    expect(result.ordered.map(s => s.slug)).toEqual(['a', 'd'])
  })

  it('ignores a self-referencing relation instead of reporting a cycle', () => {
    const e = { slug: 'e', label: 'e', displayNameAlias: 'e', branches: [{ type: 'relation', alias: 'r', targetSeed: 'e' } as any] } as Seed
    const result = orderSeedsForApply([e])
    expect(result.ordered.map(s => s.slug)).toEqual(['e'])
    expect(result.cycles).toEqual([])
  })

  it('reports the exact slugs of a two-seed cycle', () => {
    const cycle1 = { slug: 'cycle1', label: '1', displayNameAlias: '1', branches: [{ type: 'relation', alias: 'r', targetSeed: 'cycle2' } as any] } as Seed
    const cycle2 = { slug: 'cycle2', label: '2', displayNameAlias: '2', branches: [{ type: 'relation', alias: 'r', targetSeed: 'cycle1' } as any] } as Seed
    const result = orderSeedsForApply([cycle1, cycle2, a])
    expect(result.cycles).toContainEqual(['cycle1', 'cycle2', 'cycle1'])
    // 'a' gets processed
    expect(result.ordered.map(s => s.slug)).toEqual(['a', 'cycle2', 'cycle1'])
  })
})
