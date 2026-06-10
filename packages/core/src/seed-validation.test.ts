// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { validateSeedDefinitions, isSeedSetValid } from './seed-validation'
import type { Seed } from './types'

function makeSeed(overrides: Partial<Seed> & { slug: string }): Seed {
  return {
    slug: overrides.slug,
    label: overrides.label ?? overrides.slug,
    displayNameAlias: 'title',
    branches: [{ id: 'br_01', alias: 'title', label: 'Title', type: 'text' }],
    ...overrides,
  }
}

// ── Clean pass ────────────────────────────────────────────────────────────────

describe('validateSeedDefinitions', () => {
  it('returns no issues for a valid seed set', () => {
    const seeds = [
      makeSeed({ slug: 'posts' }),
      makeSeed({ slug: 'pages', branches: [{ id: 'br_01', alias: 'title', label: 'Title', type: 'text' }] }),
    ]
    expect(validateSeedDefinitions(seeds)).toEqual([])
  })

  // ── Fatal 1: unknown relation target ────────────────────────────────────────

  it('fatal: unknown relation target', () => {
    const seeds = [
      makeSeed({
        slug: 'posts',
        branches: [
          { id: 'br_01', alias: 'title', label: 'Title', type: 'text' },
          { id: 'br_02', alias: 'author', label: 'Author', type: 'relation', targetSeed: 'nonexistent' },
        ],
      }),
    ]
    const issues = validateSeedDefinitions(seeds)
    const fatal = issues.filter(i => i.fatal)
    expect(fatal.length).toBeGreaterThan(0)
    expect(fatal.some(i => i.slug === 'posts' && i.messages.some(m => m.includes('nonexistent')))).toBe(true)
  })

  // ── Fatal 2: multi-relation SET NULL ────────────────────────────────────────

  it('fatal: multi-relation with SET NULL', () => {
    const seeds = [
      makeSeed({ slug: 'tags' }),
      makeSeed({
        slug: 'posts',
        branches: [
          { id: 'br_01', alias: 'title', label: 'Title', type: 'text' },
          { id: 'br_02', alias: 'tags', label: 'Tags', type: 'relation', targetSeed: 'tags', multiple: true, onDelete: 'SET NULL' },
        ],
      }),
    ]
    const issues = validateSeedDefinitions(seeds)
    const fatal = issues.filter(i => i.fatal && i.slug === 'posts')
    expect(fatal.length).toBeGreaterThan(0)
    expect(fatal.some(i => i.messages.some(m => m.includes('SET NULL')))).toBe(true)
  })

  // ── Fatal 3: junction name collision ────────────────────────────────────────

  it('fatal: junction table name collision', () => {
    const seeds = [
      makeSeed({ slug: 'tags' }),
      makeSeed({
        slug: 'posts',
        branches: [
          { id: 'br_01', alias: 'title', label: 'Title', type: 'text' },
          { id: 'br_02', alias: 'tags', label: 'Tags', type: 'relation', targetSeed: 'tags', multiple: true },
          { id: 'br_03', alias: 'tags', label: 'Tags2', type: 'relation', targetSeed: 'tags', multiple: true },
        ],
      }),
    ]
    const issues = validateSeedDefinitions(seeds)
    const fatal = issues.filter(i => i.fatal)
    expect(fatal.some(i => i.messages.some(m => m.toLowerCase().includes('collision') || m.toLowerCase().includes('duplicate')))).toBe(true)
  })

  // ── Fatal 4: dependency cycle ────────────────────────────────────────────────

  it('fatal: dependency cycle', () => {
    const seeds = [
      makeSeed({
        slug: 'a',
        branches: [
          { id: 'br_01', alias: 'title', label: 'Title', type: 'text' },
          { id: 'br_02', alias: 'b_ref', label: 'B', type: 'relation', targetSeed: 'b' },
        ],
      }),
      makeSeed({
        slug: 'b',
        branches: [
          { id: 'br_01', alias: 'title', label: 'Title', type: 'text' },
          { id: 'br_02', alias: 'a_ref', label: 'A', type: 'relation', targetSeed: 'a' },
        ],
      }),
    ]
    const issues = validateSeedDefinitions(seeds)
    const fatal = issues.filter(i => i.fatal)
    expect(fatal.some(i => i.messages.some(m => m.toLowerCase().includes('cyclic')))).toBe(true)
  })

  // ── Fatal 5: invalid branch id ───────────────────────────────────────────────

  it('fatal: invalid branch id format', () => {
    const seeds = [
      makeSeed({
        slug: 'posts',
        branches: [{ id: 'invalid-id', alias: 'title', label: 'Title', type: 'text' }],
      }),
    ]
    const issues = validateSeedDefinitions(seeds)
    const fatal = issues.filter(i => i.fatal && i.slug === 'posts')
    expect(fatal.length).toBeGreaterThan(0)
    expect(fatal.some(i => i.messages.some(m => m.includes('invalid-id')))).toBe(true)
  })

  it('fatal: duplicate branch id within seed', () => {
    const seeds = [
      makeSeed({
        slug: 'posts',
        branches: [
          { id: 'br_01', alias: 'title', label: 'Title', type: 'text' },
          { id: 'br_01', alias: 'body', label: 'Body', type: 'text' },
        ],
      }),
    ]
    const issues = validateSeedDefinitions(seeds)
    const fatal = issues.filter(i => i.fatal && i.slug === 'posts')
    expect(fatal.some(i => i.messages.some(m => m.includes('br_01')))).toBe(true)
  })

  // ── Fatal 6: reserved alias ──────────────────────────────────────────────────

  it('fatal: reserved alias', () => {
    // 'this' is in AUTOMATION_RESERVED_WORDS
    const seeds = [
      makeSeed({
        slug: 'posts',
        displayNameAlias: 'title',
        branches: [
          { id: 'br_01', alias: 'title', label: 'Title', type: 'text' },
          { id: 'br_02', alias: 'this', label: 'This', type: 'text' },
        ],
      }),
    ]
    const issues = validateSeedDefinitions(seeds)
    const fatal = issues.filter(i => i.fatal && i.slug === 'posts')
    expect(fatal.some(i => i.messages.some(m => m.includes('reserved')))).toBe(true)
  })

  // ── Fatal 5b: unsafe branch alias (SQL injection guard) ──────────────────────

  it.each([
    'title); DROP TABLE users;--',
    'a b',          // space
    'Title',        // uppercase
    '1col',         // leading digit
    '_hidden',      // leading underscore
    'col"name',     // quote
    '',             // empty
  ])('fatal: rejects unsafe branch alias %j', (badAlias) => {
    const seeds = [
      makeSeed({
        slug: 'posts',
        displayNameAlias: 'title',
        branches: [
          { id: 'br_01', alias: 'title', label: 'Title', type: 'text' },
          { id: 'br_02', alias: badAlias, label: 'Evil', type: 'text' },
        ],
      }),
    ]
    const issues = validateSeedDefinitions(seeds)
    const fatal = issues.filter(i => i.fatal && i.slug === 'posts')
    expect(fatal.some(i => i.messages.some(m => m.includes('invalid')))).toBe(true)
  })

  it.each(['title', 'body_text', 'author2', 'x', 'publishedAt', 'coverImage'])(
    'accepts safe branch alias %j',
    (goodAlias) => {
      const seeds = [
        makeSeed({
          slug: 'posts',
          displayNameAlias: goodAlias,
          branches: [{ id: 'br_01', alias: goodAlias, label: 'Field', type: 'text' }],
        }),
      ]
      expect(isSeedSetValid(seeds)).toBe(true)
    },
  )

  // ── Warning 7: duplicate slug ────────────────────────────────────────────────

  it('warning: duplicate slug', () => {
    const seeds = [makeSeed({ slug: 'posts' }), makeSeed({ slug: 'posts' })]
    const issues = validateSeedDefinitions(seeds)
    const warnings = issues.filter(i => !i.fatal)
    expect(warnings.some(i => i.messages.some(m => m.includes('duplicate slug')))).toBe(true)
  })

  // ── Warning 8: duplicate branch alias ───────────────────────────────────────

  it('warning: duplicate branch alias within seed', () => {
    const seeds = [
      makeSeed({
        slug: 'posts',
        branches: [
          { id: 'br_01', alias: 'title', label: 'Title', type: 'text' },
          { id: 'br_02', alias: 'title', label: 'Title2', type: 'text' },
        ],
      }),
    ]
    const issues = validateSeedDefinitions(seeds)
    const warnings = issues.filter(i => !i.fatal && i.slug === 'posts')
    expect(warnings.some(i => i.messages.some(m => m.includes('duplicate branch alias')))).toBe(true)
  })

  // ── Warning 9: displayNameAlias not in branches ──────────────────────────────

  it('warning: displayNameAlias not in branches', () => {
    const seeds = [makeSeed({ slug: 'posts', displayNameAlias: 'nonexistent' })]
    const issues = validateSeedDefinitions(seeds)
    const warnings = issues.filter(i => !i.fatal && i.slug === 'posts')
    expect(warnings.some(i => i.messages.some(m => m.includes('displayNameAlias')))).toBe(true)
  })

  // ── isSeedSetValid ────────────────────────────────────────────────────────────

  it('isSeedSetValid returns true for clean set', () => {
    expect(isSeedSetValid([makeSeed({ slug: 'posts' })])).toBe(true)
  })

  it('isSeedSetValid returns false when fatal issues present', () => {
    const seeds = [
      makeSeed({
        slug: 'posts',
        branches: [{ id: 'bad', alias: 'title', label: 'T', type: 'text' }],
      }),
    ]
    expect(isSeedSetValid(seeds)).toBe(false)
  })

  // ── regression: same result for array vs single call ────────────────────────

  it('calling twice with the same seeds is idempotent', () => {
    const seeds = [
      makeSeed({
        slug: 'posts',
        branches: [
          { id: 'br_01', alias: 'title', label: 'Title', type: 'text' },
          { id: 'br_02', alias: 'author', label: 'Author', type: 'relation', targetSeed: 'ghost' },
        ],
      }),
    ]
    const first = validateSeedDefinitions(seeds)
    const second = validateSeedDefinitions(seeds)
    expect(first).toEqual(second)
  })
})
