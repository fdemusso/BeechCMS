// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { projectSchemaContract, computeSchemaFingerprint, SCHEMA_FINGERPRINT_VERSION } from './schema-fingerprint.js'
import type { Branch, Seed } from './types.js'

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
})

describe('computeSchemaFingerprint', () => {
  it('returns the v1 prefix followed by 32 lowercase hex characters', async () => {
    const fingerprint = await computeSchemaFingerprint([baseSeed()])

    expect(fingerprint).toMatch(/^v1:[0-9a-f]{32}$/)
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
})
