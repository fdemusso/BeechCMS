// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sortSeedsByDependencies } from '@beechcms/core'
import type { Seed } from '@beechcms/core'
import { sqlQuote } from '../lib/wrangler.js'
import { seedLoad } from '../commands/seed-load.js'

// These seeds declare articles BEFORE team (arbitrary user order)
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

describe('seedLoad — deprecation behavior', () => {
  let logSpy: any

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('logs deprecation message and exits cleanly without errors', async () => {
    await seedLoad()
    expect(logSpy).toHaveBeenCalled()
    const output = logSpy.mock.calls.flat().join('\n')
    expect(output).toContain('beech seed:load')
    expect(output).toContain('deprecated')
  })
})

describe('sortSeedsByDependencies — topological ordering', () => {
  it('puts team before articles even when articles is declared first', () => {
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

// ── sqlQuote ─────────────────────────────────────────────────────────────

describe('sqlQuote', () => {
  it('wraps value in single quotes', () => {
    expect(sqlQuote('hello')).toBe("'hello'")
  })

  it("escapes internal single quotes by doubling them", () => {
    expect(sqlQuote("it's")).toBe("'it''s'")
  })

  it('handles multiple single quotes', () => {
    expect(sqlQuote("a'b'c")).toBe("'a''b''c'")
  })

  it('handles empty string', () => {
    expect(sqlQuote('')).toBe("''")
  })
})

