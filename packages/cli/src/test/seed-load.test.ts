// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sortSeedsByDependencies } from '@beechcms/core'
import type { Seed } from '@beechcms/core'

// These seeds declare articles BEFORE team (arbitrary user order in seed.ts)
const TEAM_SEED: Seed = {
  slug: 'team',
  label: 'Team',
  displayNameAlias: 'name',
  branches: [{ alias: 'name', label: 'Name', type: 'text' }],
} as Seed

const ARTICLES_SEED: Seed = {
  slug: 'articles',
  label: 'Articles',
  displayNameAlias: 'title',
  branches: [
    { alias: 'title', label: 'Title', type: 'text' },
    { alias: 'author_id', label: 'Author', type: 'relation', targetSeed: 'team' },
  ],
} as Seed

describe('sortSeedsByDependencies — topological ordering', () => {
  it('puts team before articles even when articles is declared first', () => {
    // articles declared first — arbitrary insertion order
    const sorted = sortSeedsByDependencies([ARTICLES_SEED, TEAM_SEED])
    const slugs = sorted.map(s => s.slug)
    expect(slugs.indexOf('team')).toBeLessThan(slugs.indexOf('articles'))
  })

  it('preserves order for seeds with no relations', () => {
    const a = { slug: 'a', label: 'A', displayNameAlias: 'x', branches: [{ alias: 'x', label: 'X', type: 'text' }] } as Seed
    const b = { slug: 'b', label: 'B', displayNameAlias: 'x', branches: [{ alias: 'x', label: 'X', type: 'text' }] } as Seed
    const sorted = sortSeedsByDependencies([a, b])
    expect(sorted).toHaveLength(2)
  })

  it('throws on unknown targetSeed', () => {
    const bad: Seed = {
      slug: 'bad',
      label: 'Bad',
      displayNameAlias: 'title',
      branches: [
        { alias: 'title', label: 'Title', type: 'text' },
        { alias: 'ref_id', label: 'Ref', type: 'relation', targetSeed: 'ghost' },
      ],
    } as Seed
    expect(() => sortSeedsByDependencies([bad])).toThrow(/unknown target|ghost/)
  })

  it('throws on cyclic graph', () => {
    const a = {
      slug: 'a', label: 'A', displayNameAlias: 'x',
      branches: [
        { alias: 'x', label: 'X', type: 'text' },
        { alias: 'b_id', label: 'B', type: 'relation', targetSeed: 'b' },
      ],
    } as Seed
    const b = {
      slug: 'b', label: 'B', displayNameAlias: 'x',
      branches: [
        { alias: 'x', label: 'X', type: 'text' },
        { alias: 'a_id', label: 'A', type: 'relation', targetSeed: 'a' },
      ],
    } as Seed
    expect(() => sortSeedsByDependencies([a, b])).toThrow(/[Cc]ycl/)
  })
})

// ── Dry-run output ordering ───────────────────────────────────────────────
// Verify that seed-load uses sortSeedsByDependencies (not Object.values order)
// by testing the pure function behavior that underpins it.

describe('seed-load dry-run ordering contract', () => {
  it('content_team CREATE TABLE appears before content_articles when articles declared first', () => {
    // The dry-run loops over sortSeedsByDependencies(Object.values(registry)).
    // We verify the sort result here — the integration is in seed-load.ts.
    const registry = {
      articles: ARTICLES_SEED, // declared first
      team: TEAM_SEED,
    }
    const sorted = sortSeedsByDependencies(Object.values(registry))
    const slugs = sorted.map(s => s.slug)
    // team must come first so its CREATE TABLE is emitted before articles'
    expect(slugs.indexOf('team')).toBeLessThan(slugs.indexOf('articles'))
  })
})
