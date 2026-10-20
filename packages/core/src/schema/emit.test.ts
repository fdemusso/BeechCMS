// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { emitManifestModule } from './emit.js'
import { CanonicalSerializationError } from '../common/canonical-json.js'
import type { BeechSchemaManifest, ManifestSeed } from './manifest.types.js'

const seed = (overrides: Partial<ManifestSeed>): ManifestSeed =>
  ({ slug: 'x', label: 'X', displayNameAlias: 'x', branches: [], ...overrides }) as ManifestSeed

function extractLiteral(source: string): string {
  const start = source.indexOf('defineSchema(') + 'defineSchema('.length
  const end = source.lastIndexOf(')')
  return source.slice(start, end)
}

describe('emitManifestModule', () => {
  it('embeds the seeds as a canonical JSON literal a JSON parser reads back unchanged', () => {
    const manifest: BeechSchemaManifest = { version: 1, seeds: [seed({ slug: 'posts', label: 'Posts' })] }

    const source = emitManifestModule(manifest)

    const parsed = JSON.parse(extractLiteral(source))
    expect(parsed).toEqual({ seeds: [seed({ slug: 'posts', label: 'Posts' })] })
  })

  it('sorts seeds by slug so two exports of the same schema are byte-identical', () => {
    const zoo = seed({ slug: 'zoo', label: 'Zoo' })
    const animals = seed({ slug: 'animals', label: 'Animals' })

    const first = emitManifestModule({ version: 1, seeds: [zoo, animals] })
    const second = emitManifestModule({ version: 1, seeds: [animals, zoo] })

    expect(first).toBe(second)
  })

  it('imports defineSchema from the authoring subpath, not from the package root', () => {
    const source = emitManifestModule({ version: 1, seeds: [] })

    expect(source).toContain("from '@beechcms/core/schema'")
  })

  it('omits the manifest version from the defineSchema argument, which the DSL supplies itself', () => {
    const source = emitManifestModule({ version: 1, seeds: [seed({ slug: 'posts' })] })

    const parsed = JSON.parse(extractLiteral(source))
    expect(parsed.version).toBeUndefined()
  })

  it('propagates the canonical serializer error for a value that cannot round-trip', () => {
    const broken = seed({ slug: 'posts', label: (() => {}) as unknown as string })

    expect(() => emitManifestModule({ version: 1, seeds: [broken] })).toThrow(CanonicalSerializationError)
  })
})
