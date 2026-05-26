// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { validateSeeds } from '../commands/validate.js'
import type { Seed } from '@beechcms/core'

function makeSeed(slug: string, branches: Seed['branches'] = []): Seed {
  return {
    slug,
    label: slug,
    displayNameAlias: branches[0]?.alias ?? 'title',
    branches: branches.length > 0 ? branches : [{ alias: 'title', label: 'Title', type: 'text' }],
  } as Seed
}

// ── Unknown relation target ────────────────────────────────────────────────

describe('validateSeeds — unknown relation target', () => {
  it('emits a fatal error when targetSeed not in registry', () => {
    const registry = {
      articles: makeSeed('articles', [
        { alias: 'title', label: 'Title', type: 'text' },
        { alias: 'author_id', label: 'Author', type: 'relation', targetSeed: 'team' },
      ]),
    }

    const errors = validateSeeds(registry as Record<string, Seed>)
    const fatal = errors.filter(e => e.fatal)

    expect(fatal).toHaveLength(1)
    expect(fatal[0].slug).toBe('articles')
    expect(fatal[0].messages[0]).toContain('author_id')
    expect(fatal[0].messages[0]).toContain('team')
  })

  it('no fatal error when targetSeed is in registry', () => {
    const registry = {
      team: makeSeed('team', [{ alias: 'name', label: 'Name', type: 'text' }]),
      articles: makeSeed('articles', [
        { alias: 'title', label: 'Title', type: 'text' },
        { alias: 'author_id', label: 'Author', type: 'relation', targetSeed: 'team' },
      ]),
    }

    const errors = validateSeeds(registry as Record<string, Seed>)
    const fatal = errors.filter(e => e.fatal)
    expect(fatal).toHaveLength(0)
  })
})

// ── Cyclic dependency ─────────────────────────────────────────────────────

describe('validateSeeds — cyclic dependency', () => {
  it('emits a fatal error listing both slugs in a cycle', () => {
    const registry = {
      a: {
        slug: 'a',
        label: 'A',
        displayNameAlias: 'title',
        branches: [
          { alias: 'title', label: 'Title', type: 'text' },
          { alias: 'b_id', label: 'B', type: 'relation', targetSeed: 'b' },
        ],
      },
      b: {
        slug: 'b',
        label: 'B',
        displayNameAlias: 'title',
        branches: [
          { alias: 'title', label: 'Title', type: 'text' },
          { alias: 'a_id', label: 'A', type: 'relation', targetSeed: 'a' },
        ],
      },
    }

    const errors = validateSeeds(registry as Record<string, Seed>)
    const fatal = errors.filter(e => e.fatal)

    // One fatal entry for the cycle
    expect(fatal.length).toBeGreaterThan(0)
    const cycleMsg = fatal.find(e => e.messages.some(m => m.includes('Cyclic')))
    expect(cycleMsg).toBeDefined()
    expect(cycleMsg!.messages[0]).toContain('a')
    expect(cycleMsg!.messages[0]).toContain('b')
  })
})

// ── Existing warning checks still work ────────────────────────────────────

describe('validateSeeds — existing warning checks', () => {
  it('flags missing displayNameAlias as warning (not fatal)', () => {
    const registry = {
      items: {
        slug: 'items',
        label: 'Items',
        displayNameAlias: 'nonexistent',
        branches: [{ alias: 'title', label: 'Title', type: 'text' }],
      },
    }

    const errors = validateSeeds(registry as Record<string, Seed>)
    const warnings = errors.filter(e => !e.fatal)
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings[0].messages[0]).toContain('displayNameAlias')
  })
})
