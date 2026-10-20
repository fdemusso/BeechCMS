// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { validateManifest } from './manifest-validation.js'
import { MANIFEST_VERSION } from './manifest.types.js'
import type { BeechSchemaManifest } from './manifest.types.js'

describe('validateManifest', () => {
  it('a valid two-seed manifest with a relation between them returns zero fatal issues', () => {
    const manifest: BeechSchemaManifest = {
      version: MANIFEST_VERSION,
      seeds: [
        {
          slug: 'posts',
          label: 'Post',
          displayNameAlias: 'title',
          branches: [
            { alias: 'title', label: 'Title', type: 'text' },
            { alias: 'author_id', label: 'Author', type: 'relation', targetSeed: 'authors' },
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

    const issues = validateManifest(manifest)

    expect(issues.some(i => i.fatal)).toBe(false)
  })

  it('a relation pointing at a slug absent from the manifest returns a fatal issue for the owning seed', () => {
    const manifest: BeechSchemaManifest = {
      version: MANIFEST_VERSION,
      seeds: [{
        slug: 'posts',
        label: 'Post',
        displayNameAlias: 'title',
        branches: [
          { alias: 'title', label: 'Title', type: 'text' },
          { alias: 'author_id', label: 'Author', type: 'relation', targetSeed: 'nonexistent' },
        ],
      }],
    }

    const issues = validateManifest(manifest)

    expect(issues.some(i => i.fatal && i.slug === 'posts')).toBe(true)
  })

  it('a duplicate branch alias within one seed is reported as a validation issue for that seed', () => {
    // The engine treats a duplicate alias as a warning (non-fatal), not a fatal rejection —
    // validateManifest reuses validateSeedDefinitions verbatim rather than reimplementing it.
    const manifest: BeechSchemaManifest = {
      version: MANIFEST_VERSION,
      seeds: [{
        slug: 'posts',
        label: 'Post',
        displayNameAlias: 'title',
        branches: [
          { alias: 'title', label: 'Title', type: 'text' },
          { alias: 'title', label: 'Title Again', type: 'text' },
        ],
      }],
    }

    const issues = validateManifest(manifest)

    expect(issues.some(i => i.slug === 'posts' && !i.fatal)).toBe(true)
  })

  it('a manifest carrying a function returns one fatal issue and does not throw', () => {
    const manifest = {
      version: MANIFEST_VERSION,
      seeds: [{
        slug: 'posts',
        label: 'Post',
        displayNameAlias: 'title',
        branches: [{ alias: 'title', label: 'Title', type: 'text', validate: () => true }],
      }],
    } as unknown as BeechSchemaManifest

    const issues = validateManifest(manifest)

    expect(issues.filter(i => i.fatal)).toHaveLength(1)
  })

  it('a wrong version returns a fatal issue and never reaches validateSeedDefinitions', () => {
    const manifest = { version: 999, seeds: [{ slug: 'posts' }] } as unknown as BeechSchemaManifest

    const issues = validateManifest(manifest)

    expect(issues).toHaveLength(1)
    expect(issues[0].fatal).toBe(true)
  })
})
