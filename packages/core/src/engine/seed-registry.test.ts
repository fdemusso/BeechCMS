// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { SeedRegistry, InMemorySeedRegistry, sortSeedsByDependencies, findBranchById, nextBranchId } from './seed-registry.js'
import type { Seed, Branch } from './types.js'

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeSeed(overrides: Partial<Seed> & { slug: string }): Seed {
  return {
    slug: overrides.slug,
    label: overrides.label ?? overrides.slug,
    displayNameAlias: 'title',
    branches: [],
    ...overrides,
  }
}

const seedArticles = makeSeed({ slug: 'articles', label: 'Article', allowPublicRead: true })
const seedProjects = makeSeed({ slug: 'projects', label: 'Project', allowDrafts: true })
const seedHidden   = makeSeed({ slug: 'hidden-type', label: 'Hidden', dashboard: { hidden: true } })
const seedVisible  = makeSeed({ slug: 'visible-type', label: 'Visible', dashboard: { hidden: false } })
const seedPublic   = makeSeed({ slug: 'public-type', label: 'Public', allowPublicRead: true, allowPublicPost: true })
const seedDrafts   = makeSeed({ slug: 'draft-type', label: 'Draft', allowDrafts: true })

// ─── SeedRegistry ─────────────────────────────────────────────────────────────

describe('SeedRegistry', () => {
  describe('all()', () => {
    it('returns an empty array when constructed with no seeds', () => {
      const registry = new SeedRegistry([])
      expect(registry.all()).toEqual([])
    })

    it('returns all seeds in insertion order', () => {
      const registry = new SeedRegistry([seedArticles, seedProjects, seedHidden])
      expect(registry.all()).toEqual([seedArticles, seedProjects, seedHidden])
    })

    it('returns the same reference on repeated calls', () => {
      const registry = new SeedRegistry([seedArticles])
      expect(registry.all()).toBe(registry.all())
    })
  })

  describe('get(slug)', () => {
    it('returns the seed for a known slug', () => {
      const registry = new SeedRegistry([seedArticles, seedProjects])
      expect(registry.get('articles')).toBe(seedArticles)
      expect(registry.get('projects')).toBe(seedProjects)
    })

    it('returns null for an unknown slug', () => {
      const registry = new SeedRegistry([seedArticles])
      expect(registry.get('nonexistent')).toBeNull()
    })

    it('returns null when the registry is empty', () => {
      const registry = new SeedRegistry([])
      expect(registry.get('articles')).toBeNull()
    })
  })

  describe('visibleInDashboard()', () => {
    it('returns all seeds when none have dashboard.hidden set', () => {
      const registry = new SeedRegistry([seedArticles, seedProjects])
      expect(registry.visibleInDashboard()).toEqual([seedArticles, seedProjects])
    })

    it('excludes seeds with dashboard.hidden === true', () => {
      const registry = new SeedRegistry([seedVisible, seedHidden, seedArticles])
      const visible = registry.visibleInDashboard()
      expect(visible).toContain(seedVisible)
      expect(visible).toContain(seedArticles)
      expect(visible).not.toContain(seedHidden)
    })

    it('includes seeds with dashboard.hidden === false', () => {
      const registry = new SeedRegistry([seedVisible])
      expect(registry.visibleInDashboard()).toContain(seedVisible)
    })

    it('includes seeds with no dashboard field', () => {
      const noConfig = makeSeed({ slug: 'bare' })
      const registry = new SeedRegistry([noConfig])
      expect(registry.visibleInDashboard()).toContain(noConfig)
    })

    it('returns an empty array when all seeds are hidden', () => {
      const registry = new SeedRegistry([seedHidden])
      expect(registry.visibleInDashboard()).toEqual([])
    })
  })

  describe('publicReadable()', () => {
    it('returns only seeds with allowPublicRead === true', () => {
      const registry = new SeedRegistry([seedArticles, seedProjects, seedPublic])
      const readable = registry.publicReadable()
      expect(readable).toContain(seedArticles)
      expect(readable).toContain(seedPublic)
      expect(readable).not.toContain(seedProjects)
    })

    it('returns an empty array when no seed allows public read', () => {
      const registry = new SeedRegistry([seedProjects, seedHidden])
      expect(registry.publicReadable()).toEqual([])
    })

    it('returns an empty array for an empty registry', () => {
      expect(new SeedRegistry([]).publicReadable()).toEqual([])
    })
  })

  describe('draftEnabled()', () => {
    it('returns only seeds with allowDrafts === true', () => {
      const registry = new SeedRegistry([seedArticles, seedProjects, seedDrafts])
      const drafts = registry.draftEnabled()
      expect(drafts).toContain(seedProjects)
      expect(drafts).toContain(seedDrafts)
      expect(drafts).not.toContain(seedArticles)
    })

    it('returns an empty array when no seed enables drafts', () => {
      const registry = new SeedRegistry([seedArticles, seedPublic])
      expect(registry.draftEnabled()).toEqual([])
    })

    it('returns an empty array for an empty registry', () => {
      expect(new SeedRegistry([]).draftEnabled()).toEqual([])
    })
  })
})

// ─── Reserved alias guard ─────────────────────────────────────────────────────

describe('SeedRegistry reserved alias guard', () => {
  function makeSeeds(alias: string): Seed[] {
    return [makeSeed({
      slug: 'test',
      branches: [{ id: 'br_01', alias, label: alias, type: 'text' } as Branch],
    })]
  }

  it('throws when a branch alias is a reserved word', () => {
    expect(() => new SeedRegistry(makeSeeds('count'))).toThrow(
      'Seed "test" uses reserved alias "count"',
    )
  })

  it('includes seed slug and alias in the error message', () => {
    expect(() => new SeedRegistry(makeSeeds('sum'))).toThrow(
      /Seed "test" uses reserved alias "sum"/,
    )
  })

  it('throws for every reserved word in the set', () => {
    const reserved = ['this', 'batch', 'all', 'firstone', 'lastone', 'byid', 'where',
      'array', 'count', 'sum', 'avg', 'min', 'max', 'pluck', 'true', 'false', 'null']
    for (const word of reserved) {
      expect(() => new SeedRegistry(makeSeeds(word))).toThrow(`"${word}"`)
    }
  })

  it('does not throw for non-reserved aliases', () => {
    expect(() => new SeedRegistry(makeSeeds('nome'))).not.toThrow()
    expect(() => new SeedRegistry(makeSeeds('total_amount'))).not.toThrow()
  })

  it('does not throw for an empty registry', () => {
    expect(() => new SeedRegistry([])).not.toThrow()
  })

  it('does not throw for seeds with no branches', () => {
    expect(() => new SeedRegistry([makeSeed({ slug: 'bare' })])).not.toThrow()
  })
})

// ─── Branch id validation ─────────────────────────────────────────────────────

describe('SeedRegistry branch id validation', () => {
  function makeBranchSeed(branches: Partial<Branch>[]): Seed[] {
    return [makeSeed({
      slug: 'test',
      branches: branches.map((b, i) => ({
        id: `br_0${i + 1}`,
        alias: `field_${i + 1}`,
        label: `Field ${i + 1}`,
        type: 'text' as const,
        ...b,
      })),
    })]
  }

  it('throws when two branches in the same seed share an id', () => {
    expect(() => new SeedRegistry(makeBranchSeed([
      { id: 'br_01' },
      { id: 'br_01' },
    ]))).toThrow('Seed "test" has duplicate branch id "br_01"')
  })

  it('throws when a branch id is missing the br_ prefix', () => {
    expect(() => new SeedRegistry(makeBranchSeed([
      { id: 'invalid' },
    ]))).toThrow(/has invalid id "invalid"/)
  })

  it('throws when branch id is an empty string', () => {
    expect(() => new SeedRegistry(makeBranchSeed([
      { id: '' },
    ]))).toThrow(/has invalid id ""/)
  })

  it('throws when branch id is undefined', () => {
    expect(() => new SeedRegistry(makeBranchSeed([
      { id: undefined as unknown as string },
    ]))).toThrow(/has invalid id/)
  })

  it('accepts valid sequential ids across multiple branches', () => {
    expect(() => new SeedRegistry(makeBranchSeed([
      { id: 'br_01' },
      { id: 'br_02' },
      { id: 'br_03' },
    ]))).not.toThrow()
  })

  it('accepts alphanumeric ids like br_title or br_abc123', () => {
    expect(() => new SeedRegistry(makeBranchSeed([
      { id: 'br_title' },
      { id: 'br_abc123' },
    ]))).not.toThrow()
  })

  it('allows the same id across different seeds', () => {
    const seed1 = makeSeed({ slug: 'seed1', branches: [{ id: 'br_01', alias: 'title', label: 'Title', type: 'text' } as Branch] })
    const seed2 = makeSeed({ slug: 'seed2', branches: [{ id: 'br_01', alias: 'name', label: 'Name', type: 'text' } as Branch] })
    expect(() => new SeedRegistry([seed1, seed2])).not.toThrow()
  })
})

// ─── sortSeedsByDependencies ──────────────────────────────────────────────────

describe('sortSeedsByDependencies', () => {
  function makeRelationSeed(
    slug: string,
    targets: string[] = [],
    extra: Partial<Seed> = {},
  ): Seed {
    return {
      slug,
      label: slug,
      displayNameAlias: 'title',
      branches: targets.map((t, i) => ({
        id: `br_0${i + 1}`,
        alias: `${t}_id`,
        label: `${t} ref`,
        type: 'relation' as const,
        targetSeed: t,
      })),
      ...extra,
    }
  }

  it('returns independent seeds (no relations) in any order containing all slugs', () => {
    const a = makeRelationSeed('a')
    const b = makeRelationSeed('b')
    const c = makeRelationSeed('c')
    const result = sortSeedsByDependencies([a, b, c])
    expect(result).toHaveLength(3)
    expect(result.map(s => s.slug)).toEqual(expect.arrayContaining(['a', 'b', 'c']))
  })

  it('places the dependency before the dependant (articles → team)', () => {
    const team = makeRelationSeed('team')
    const articles = makeRelationSeed('articles', ['team'])
    const result = sortSeedsByDependencies([articles, team])
    const slugs = result.map(s => s.slug)
    expect(slugs.indexOf('team')).toBeLessThan(slugs.indexOf('articles'))
  })

  it('resolves a diamond: d before b and c, b and c before a', () => {
    // a → b, a → c, b → d, c → d
    const d = makeRelationSeed('d')
    const b = makeRelationSeed('b', ['d'])
    const c = makeRelationSeed('c', ['d'])
    const a = makeRelationSeed('a', ['b', 'c'])
    const result = sortSeedsByDependencies([a, b, c, d])
    const pos = Object.fromEntries(result.map((s, i) => [s.slug, i]))
    expect(pos.d).toBeLessThan(pos.b)
    expect(pos.d).toBeLessThan(pos.c)
    expect(pos.b).toBeLessThan(pos.a)
    expect(pos.c).toBeLessThan(pos.a)
  })

  it('throws on a cycle (a → b → a), mentioning both slugs', () => {
    const a = makeRelationSeed('a', ['b'])
    const b = makeRelationSeed('b', ['a'])
    expect(() => sortSeedsByDependencies([a, b])).toThrow(/a/)
    expect(() => sortSeedsByDependencies([a, b])).toThrow(/b/)
  })

  it('throws when a relation targets an unknown slug', () => {
    const a = makeRelationSeed('a', ['missing_target'])
    expect(() => sortSeedsByDependencies([a])).toThrow(/missing_target/)
  })
})

// ─── InMemorySeedRegistry ─────────────────────────────────────────────────────

describe('InMemorySeedRegistry', () => {
  it('is an instance of SeedRegistry', () => {
    expect(new InMemorySeedRegistry([])).toBeInstanceOf(SeedRegistry)
  })

  it('exposes the full ISeedRegistry interface', () => {
    const registry = new InMemorySeedRegistry([seedArticles, seedHidden])
    expect(registry.all()).toHaveLength(2)
    expect(registry.get('articles')).toBe(seedArticles)
    expect(registry.visibleInDashboard()).toEqual([seedArticles])
    expect(registry.publicReadable()).toEqual([seedArticles])
    expect(registry.draftEnabled()).toEqual([])
  })
})

// ─── findBranchById ───────────────────────────────────────────────────────────

describe('findBranchById', () => {
  const branchA: Branch = { id: 'br_01', alias: 'title', label: 'Title', type: 'text' }
  const branchB: Branch = { id: 'br_02', alias: 'body', label: 'Body', type: 'richtext' }
  const seed = makeSeed({ slug: 'test', branches: [branchA, branchB] })

  it('returns the branch with the matching id', () => {
    expect(findBranchById(seed, 'br_01')).toBe(branchA)
    expect(findBranchById(seed, 'br_02')).toBe(branchB)
  })

  it('returns null for a non-existent id', () => {
    expect(findBranchById(seed, 'br_does_not_exist')).toBeNull()
  })

  it('returns null for an empty string id', () => {
    expect(findBranchById(seed, '')).toBeNull()
  })

  it('returns null when the seed has no branches', () => {
    const empty = makeSeed({ slug: 'empty' })
    expect(findBranchById(empty, 'br_01')).toBeNull()
  })
})

// ─── nextBranchId ─────────────────────────────────────────────────────────────

describe('nextBranchId', () => {
  it('returns br_01 for an empty seed', () => {
    expect(nextBranchId({ branches: [] })).toBe('br_01')
  })

  it('returns br_04 for a seed with br_01 and br_03', () => {
    const seed = {
      branches: [
        { id: 'br_01', alias: 'a', label: 'A', type: 'text' as const },
        { id: 'br_03', alias: 'b', label: 'B', type: 'text' as const },
      ],
    }
    expect(nextBranchId(seed)).toBe('br_04')
  })

  it('returns br_01 for a seed with only a custom non-numeric id', () => {
    const seed = {
      branches: [{ id: 'br_title', alias: 'title', label: 'Title', type: 'text' as const }],
    }
    expect(nextBranchId(seed)).toBe('br_01')
  })

  it('zero-pads to at least 2 digits', () => {
    expect(nextBranchId({ branches: [] })).toMatch(/^br_\d{2,}$/)
  })

  it('handles high numbers without padding issues', () => {
    const branches = Array.from({ length: 100 }, (_, i) => ({
      id: `br_${String(i + 1).padStart(2, '0')}`,
      alias: `f${i}`,
      label: `F${i}`,
      type: 'text' as const,
    }))
    expect(nextBranchId({ branches })).toBe('br_101')
  })
})
