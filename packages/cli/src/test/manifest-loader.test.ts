// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { MANIFEST_VERSION } from '@beechcms/core/schema'
import type { BeechSchemaManifest } from '@beechcms/core/schema'
import { interpretManifestModule, ManifestLoadError } from '../lib/manifest-loader.js'

const validManifest: BeechSchemaManifest = {
  version: MANIFEST_VERSION,
  seeds: [
    {
      slug: 'posts',
      label: 'Posts',
      displayNameAlias: 'title',
      branches: [{ alias: 'title', label: 'Title', type: 'text' }],
    },
  ],
} as BeechSchemaManifest

describe('interpretManifestModule', () => {
  it('returns the manifest unchanged for a valid default export', () => {
    const manifest = interpretManifestModule({ default: validManifest }, 'beech.schema.ts')

    expect(manifest).toEqual(validManifest)
  })

  it('rejects a module with no default export', () => {
    expect(() => interpretManifestModule({}, 'beech.schema.ts')).toThrow(ManifestLoadError)
  })

  it('rejects a manifest declaring an unsupported version', () => {
    const badVersion = { ...validManifest, version: 999 }

    expect(() => interpretManifestModule({ default: badVersion }, 'beech.schema.ts')).toThrow(ManifestLoadError)
  })

  it('rejects a manifest whose seeds fail whole-set validation and carries the issues', () => {
    const withUnknownRelationTarget: BeechSchemaManifest = {
      version: MANIFEST_VERSION,
      seeds: [
        {
          slug: 'posts',
          label: 'Posts',
          displayNameAlias: 'title',
          branches: [
            { alias: 'title', label: 'Title', type: 'text' },
            { alias: 'author', label: 'Author', type: 'relation', targetSeed: 'nobody-declares-this' },
          ],
        },
      ],
    } as BeechSchemaManifest

    let error: unknown
    try {
      interpretManifestModule({ default: withUnknownRelationTarget }, 'beech.schema.ts')
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(ManifestLoadError)
    expect((error as ManifestLoadError).issues.length).toBeGreaterThan(0)
  })
})
