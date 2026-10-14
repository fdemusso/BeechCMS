// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { projectSchemaContract, computeSchemaFingerprint, SCHEMA_FINGERPRINT_VERSION } from './schema-fingerprint.js'
import type { Branch, Seed } from '../types.js'

function textBranch(overrides: Partial<Branch> = {}): Branch {
  return { id: 'br_01', alias: 'title', label: 'Title', type: 'text', ...overrides }
}

function baseSeed(overrides: Partial<Seed> = {}): Seed {
  return {
    slug: 'posts',
    label: 'Post',
    displayNameAlias: 'title',
    branches: [textBranch()],
    ...overrides,
  }
}

describe('projectSchemaContract', () => {
  it('sorts seeds by slug and keeps branch declaration order', () => {
    const seeds = [
      baseSeed({ slug: 'zebras', branches: [textBranch({ alias: 'z' }), textBranch({ alias: 'a' })] }),
      baseSeed({ slug: 'authors' }),
    ]

    const contract = projectSchemaContract(seeds)

    expect(contract.seeds.map(s => s.slug)).toEqual(['authors', 'zebras'])
    expect(contract.seeds[1].branches.map(b => b.alias)).toEqual(['z', 'a'])
  })

  it('materializes policy defaults so an explicit default projects like an omitted one', () => {
    const implicit = projectSchemaContract([baseSeed({ branches: [textBranch()] })])
    const explicit = projectSchemaContract([
      baseSeed({ branches: [textBranch({ policies: { visibility: 'full', public: true, publicEdit: true } })] }),
    ])

    expect(explicit).toEqual(implicit)
  })

  it('projects repeater sub-fields recursively', () => {
    const seed = baseSeed({
      branches: [textBranch({ type: 'repeater', fields: [textBranch({ alias: 'sub', id: 'br_02' })] })],
    })

    const contract = projectSchemaContract([seed])

    expect(contract.seeds[0].branches[0].fields).toEqual([
      expect.objectContaining({ alias: 'sub' }),
    ])
  })

  it('omits branch ids, labels, hints and dashboard config from the projection', () => {
    const seed = baseSeed({
      label: 'Post',
      dashboard: { icon: 'Folder' },
      branches: [textBranch({ id: 'br_99', label: 'Title', hint: 'Enter a title' })],
    })

    const contract = projectSchemaContract([seed])

    expect(contract).toEqual({
      fingerprintVersion: SCHEMA_FINGERPRINT_VERSION,
      seeds: [{
        slug: 'posts',
        displayNameAlias: 'title',
        allowDrafts: false,
        allowPublicRead: false,
        allowPublicPost: false,
        allowPublicEdit: false,
        branches: [{
          alias: 'title',
          type: 'text',
          requiredOnCreate: false,
          requiredOnUpdate: false,
          visibility: 'full',
          publicRead: true,
          publicEdit: true,
        }],
      }],
    })
  })

  // Regression guard: published clients' fingerprints must not move.
  it('omits localized from the projection when false or absent', () => {
    const absent = projectSchemaContract([baseSeed({ branches: [textBranch()] })])
    const explicitFalse = projectSchemaContract([baseSeed({ branches: [textBranch({ localized: false })] })])

    expect(explicitFalse).toEqual(absent)
    expect(absent.seeds[0].branches[0]).not.toHaveProperty('localized')
    expect(explicitFalse.seeds[0].branches[0]).not.toHaveProperty('localized')
  })
})

describe('computeSchemaFingerprint', () => {
  it('returns the v2 prefix followed by 32 lowercase hex characters', async () => {
    const fingerprint = await computeSchemaFingerprint([baseSeed()])

    expect(fingerprint).toMatch(/^v2:[0-9a-f]{32}$/)
  })

  it('is stable across seed ordering and across key insertion order', async () => {
    const a = baseSeed({ slug: 'a' })
    const b = baseSeed({ slug: 'b', label: 'Bee' })

    const first = await computeSchemaFingerprint([a, b])
    const second = await computeSchemaFingerprint([b, a])

    expect(first).toBe(second)
  })

  it('is unchanged by a label, hint or dashboard icon edit', async () => {
    const baseline = await computeSchemaFingerprint([baseSeed()])
    const edited = await computeSchemaFingerprint([
      baseSeed({ label: 'Blog Post', dashboard: { icon: 'Newspaper' }, branches: [textBranch({ hint: 'New hint' })] }),
    ])

    expect(edited).toBe(baseline)
  })

  it('changes when a branch alias, type, required flag or public policy changes', async () => {
    const baseline = await computeSchemaFingerprint([baseSeed()])

    const mutations: Seed[] = [
      baseSeed({ branches: [textBranch({ alias: 'headline' })] }),
      baseSeed({ branches: [textBranch({ type: 'number' })] }),
      baseSeed({ branches: [textBranch({ requiredOnCreate: true })] }),
      baseSeed({ branches: [textBranch({ policies: { public: false } })] }),
    ]

    for (const mutated of mutations) {
      const fingerprint = await computeSchemaFingerprint([mutated])
      expect(fingerprint).not.toBe(baseline)
    }
  })

  it('changes when a seed is added or removed', async () => {
    const oneSeed = await computeSchemaFingerprint([baseSeed()])
    const twoSeeds = await computeSchemaFingerprint([baseSeed(), baseSeed({ slug: 'authors' })])

    expect(twoSeeds).not.toBe(oneSeed)
  })

  it('changes the fingerprint when a branch becomes localized', async () => {
    const baseline = await computeSchemaFingerprint([baseSeed()])
    const localized = await computeSchemaFingerprint([baseSeed({ branches: [textBranch({ localized: true })] })])

    expect(localized).not.toBe(baseline)
  })
})

describe('computeSchemaFingerprint — tags options', () => {
  const option = (value: string, color = '#64748b') => ({ value, color })
  const fingerprintOf = (branch: Partial<Branch>) =>
    computeSchemaFingerprint([baseSeed({ branches: [{ id: 'br_07', alias: 'priority', label: 'Priority', type: 'tags', ...branch }] })])

  it('does not change when an option color changes', async () => {
    const before = await fingerprintOf({ options: [option('a', '#64748b'), option('b')] })
    const after = await fingerprintOf({ options: [option('a', '#ef4444'), option('b')] })

    expect(after).toBe(before)
  })

  it('changes when an option value is added, removed or reordered', async () => {
    const base = await fingerprintOf({ options: [option('a'), option('b')] })

    const added = await fingerprintOf({ options: [option('a'), option('b'), option('c')] })
    const removed = await fingerprintOf({ options: [option('a')] })
    const reordered = await fingerprintOf({ options: [option('b'), option('a')] })

    expect(new Set([base, added, removed, reordered]).size).toBe(4)
  })

  it('changes from multiple to single choice; omitted and true hash the same', async () => {
    const omitted = await fingerprintOf({})
    const explicitTrue = await fingerprintOf({ multiple: true })
    const single = await fingerprintOf({ multiple: false })

    expect(explicitTrue).toBe(omitted)
    expect(single).not.toBe(omitted)
  })
})
