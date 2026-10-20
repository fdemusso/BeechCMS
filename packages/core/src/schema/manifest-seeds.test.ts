// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { manifestToSeeds, seedsToManifest } from './manifest-seeds.js'
import { MANIFEST_VERSION } from './manifest.types.js'
import type { BeechSchemaManifest, ManifestSeed } from './manifest.types.js'
import type { Seed } from '../engine/types.js'

describe('manifestToSeeds', () => {
  it('assigns ids br_01, br_02, ... in declaration order to branches authored without one', () => {
    const manifest: BeechSchemaManifest = {
      version: MANIFEST_VERSION,
      seeds: [{
        slug: 'posts',
        label: 'Post',
        displayNameAlias: 'title',
        branches: [
          { alias: 'title', label: 'Title', type: 'text' },
          { alias: 'body', label: 'Body', type: 'richtext' },
        ],
      }],
    }

    const [seed] = manifestToSeeds(manifest)

    expect(seed.branches.map(b => b.id)).toEqual(['br_01', 'br_02'])
  })

  it('preserves an author-supplied br_* id and does not collide the next generated id with it', () => {
    const manifest: BeechSchemaManifest = {
      version: MANIFEST_VERSION,
      seeds: [{
        slug: 'posts',
        label: 'Post',
        displayNameAlias: 'title',
        branches: [
          { id: 'br_05', alias: 'title', label: 'Title', type: 'text' },
          { alias: 'body', label: 'Body', type: 'richtext' },
        ],
      }],
    }

    const [seed] = manifestToSeeds(manifest)

    expect(seed.branches.map(b => b.id)).toEqual(['br_05', 'br_06'])
  })

  it('assigns ids to repeater sub-fields under the same rule', () => {
    const manifest: BeechSchemaManifest = {
      version: MANIFEST_VERSION,
      seeds: [{
        slug: 'posts',
        label: 'Post',
        displayNameAlias: 'title',
        branches: [
          { alias: 'title', label: 'Title', type: 'text' },
          {
            alias: 'items',
            label: 'Items',
            type: 'repeater',
            fields: [{ alias: 'value', label: 'Value', type: 'text' }],
          },
        ],
      }],
    }

    const [seed] = manifestToSeeds(manifest)
    const repeater = seed.branches.find(b => b.alias === 'items')

    expect(repeater?.fields?.[0]?.id).toBe('br_01')
  })
})

describe('seedsToManifest', () => {
  it('strips layout and sorts seeds by slug; manifestToSeeds of that result reproduces the input branch ids', () => {
    const seeds: Seed[] = [
      {
        slug: 'posts',
        label: 'Post',
        displayNameAlias: 'title',
        layout: { some: 'server-populated-state' },
        branches: [{ id: 'br_01', alias: 'title', label: 'Title', type: 'text' }],
      },
      {
        slug: 'authors',
        label: 'Author',
        displayNameAlias: 'name',
        branches: [{ id: 'br_01', alias: 'name', label: 'Name', type: 'text' }],
      },
    ]

    const manifest = seedsToManifest(seeds)

    expect(manifest.seeds.map((s: ManifestSeed) => s.slug)).toEqual(['authors', 'posts'])
    expect(manifest.seeds.every(s => !('layout' in s))).toBe(true)

    const roundTripped = manifestToSeeds(manifest)
    const postsSeed = roundTripped.find(s => s.slug === 'posts')
    expect(postsSeed?.branches.map(b => b.id)).toEqual(['br_01'])
  })
})
