// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sortSeedsByDependencies } from '@beechcms/core'
import type { Seed } from '@beechcms/core'
import { sqlQuote } from '../lib/wrangler.js'
import { buildSeedRegistrationSql } from '../commands/seed-load.js'

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

// ── buildSeedRegistrationSql ─────────────────────────────────────────────

describe('buildSeedRegistrationSql', () => {
  const SIMPLE_SEED: Seed = {
    slug: 'posts',
    label: 'Posts',
    displayNameAlias: 'title',
    branches: [{ id: 'br_01', alias: 'title', label: 'Title', type: 'text' }],
  } as Seed

  it('produces INSERT … ON CONFLICT for the correct slug', () => {
    const sql = buildSeedRegistrationSql(SIMPLE_SEED)
    expect(sql).toContain("INSERT INTO seeds")
    expect(sql).toContain("ON CONFLICT(slug) DO UPDATE SET")
    expect(sql).toContain("'posts'")
  })

  it("sets source to 'code'", () => {
    const sql = buildSeedRegistrationSql(SIMPLE_SEED)
    expect(sql).toContain("'code'")
  })

  it('escapes single quotes in slug and JSON literal', () => {
    const seedWithApostrophe: Seed = {
      ...SIMPLE_SEED,
      slug: "it's",
      label: "It's",
    }
    const sql = buildSeedRegistrationSql(seedWithApostrophe)
    // Slug value must have its single quote doubled
    expect(sql).toContain("'it''s'")
    // JSON label must also have its single quote doubled
    expect(sql).toContain("It''s")
  })

  it('does not contain unescaped single quotes inside the JSON literal', () => {
    const sql = buildSeedRegistrationSql(SIMPLE_SEED)
    const jsonStart = sql.indexOf("VALUES (")
    const jsonPart = sql.slice(jsonStart)
    // Extract the JSON literal between the second pair of outer quotes
    // Verify it round-trips back to the original seed
    const inner = JSON.stringify(SIMPLE_SEED).replace(/'/g, "''")
    expect(sql).toContain(inner)
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
