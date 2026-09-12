// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { toCanonicalJson, fromCanonicalJson, ManifestSerializationError } from './canonical.js'
import { MANIFEST_VERSION } from './manifest.types.js'
import type { BeechSchemaManifest } from './manifest.types.js'

function twoSeedManifest(): BeechSchemaManifest {
  return {
    version: MANIFEST_VERSION,
    seeds: [
      {
        slug: 'posts',
        label: 'Post',
        displayNameAlias: 'title',
        branches: [
          { alias: 'title', label: 'Title', type: 'text' },
          { id: 'br_02', alias: 'author_id', label: 'Author', type: 'relation', targetSeed: 'authors' },
        ],
      },
      {
        slug: 'authors',
        label: 'Author',
        displayNameAlias: 'name',
        branches: [{ alias: 'name', label: 'Name', type: 'text' }],
      },
    ],
  }
}

describe('toCanonicalJson', () => {
  it('is stable across object key insertion order and seed declaration order', () => {
    const declaredPostsFirst = twoSeedManifest()
    // Same content as twoSeedManifest(), but every object's keys are inserted in a
    // different order and the seeds array is declared authors-first.
    const declaredAuthorsFirstWithShuffledKeys: BeechSchemaManifest = {
      seeds: [
        {
          displayNameAlias: 'name',
          branches: [{ type: 'text', alias: 'name', label: 'Name' }],
          label: 'Author',
          slug: 'authors',
        },
        {
          branches: [
            { alias: 'title', type: 'text', label: 'Title' },
            { targetSeed: 'authors', id: 'br_02', type: 'relation', alias: 'author_id', label: 'Author' },
          ],
          slug: 'posts',
          displayNameAlias: 'title',
          label: 'Post',
        },
      ],
      version: MANIFEST_VERSION,
    }

    expect(toCanonicalJson(declaredAuthorsFirstWithShuffledKeys)).toBe(toCanonicalJson(declaredPostsFirst))
  })

  it('drops undefined-valued properties while preserving null as data', () => {
    const manifest: BeechSchemaManifest = {
      version: MANIFEST_VERSION,
      seeds: [{
        slug: 'posts',
        label: 'Post',
        labelPlural: undefined,
        retentionDays: null as unknown as undefined,
        displayNameAlias: 'title',
        branches: [{ alias: 'title', label: 'Title', type: 'text' }],
      }],
    }

    const json = toCanonicalJson(manifest)

    expect(json).not.toContain('labelPlural')
    expect(JSON.parse(json).seeds[0].retentionDays).toBeNull()
  })

  it('preserves branch array order, in contrast to seed order which is sorted by slug', () => {
    const manifest: BeechSchemaManifest = {
      version: MANIFEST_VERSION,
      seeds: [{
        slug: 'posts',
        label: 'Post',
        displayNameAlias: 'c',
        branches: [
          { alias: 'c', label: 'C', type: 'text' },
          { alias: 'a', label: 'A', type: 'text' },
        ],
      }],
    }

    const parsed = JSON.parse(toCanonicalJson(manifest))

    expect(parsed.seeds[0].branches.map((b: { alias: string }) => b.alias)).toEqual(['c', 'a'])
  })

  it('a function anywhere in the tree throws ManifestSerializationError naming its path', () => {
    const manifest = {
      version: MANIFEST_VERSION,
      seeds: [{
        slug: 'posts',
        label: 'Post',
        displayNameAlias: 'title',
        branches: [{ alias: 'title', label: 'Title', type: 'text', validate: () => true }],
      }],
    } as unknown as BeechSchemaManifest

    let error: unknown
    try {
      toCanonicalJson(manifest)
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(ManifestSerializationError)
    expect((error as ManifestSerializationError).path).toBe('seeds[0].branches[0].validate')
  })

  it('a Date, a Map and a RegExp each throw ManifestSerializationError', () => {
    const offendingValues = [new Date(), new Map(), /x/]

    for (const offendingValue of offendingValues) {
      const manifest = {
        version: MANIFEST_VERSION,
        seeds: [{
          slug: 'posts',
          label: 'Post',
          displayNameAlias: 'title',
          branches: [{ alias: 'title', label: 'Title', type: 'text', weird: offendingValue }],
        }],
      } as unknown as BeechSchemaManifest

      expect(() => toCanonicalJson(manifest)).toThrow(ManifestSerializationError)
    }
  })
})

describe('fromCanonicalJson', () => {
  it('round-trips a two-seed manifest with a relation byte-for-byte', () => {
    const bytes = toCanonicalJson(twoSeedManifest())

    expect(toCanonicalJson(fromCanonicalJson(bytes))).toBe(bytes)
  })

  it('throws on a version that is not MANIFEST_VERSION', () => {
    const bytes = JSON.stringify({ version: 999, seeds: [] })

    expect(() => fromCanonicalJson(bytes)).toThrow(/unsupported manifest version|Unsupported manifest version/i)
  })
})
