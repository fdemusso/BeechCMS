// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { defineSchema, defineSeed, defineGroup, defineField } from './define.js'
import { MANIFEST_VERSION } from './manifest.types.js'
import type { ManifestBranch } from './manifest.types.js'

describe('defineSeed', () => {
  it('splices a defineGroup() bundle into branches in declaration position, leaving no trace of the group name', () => {
    const title: ManifestBranch = { alias: 'title', label: 'Title', type: 'text' }
    const seoGroup = defineGroup('seo', [
      { alias: 'meta_title', label: 'Meta Title', type: 'text' },
      { alias: 'meta_description', label: 'Meta Description', type: 'text' },
    ])
    const body: ManifestBranch = { alias: 'body', label: 'Body', type: 'richtext' }

    const seed = defineSeed({
      slug: 'posts',
      label: 'Post',
      displayNameAlias: 'title',
      branches: [title, seoGroup, body],
    })

    expect(seed.branches.map(b => b.alias)).toEqual(['title', 'meta_title', 'meta_description', 'body'])
    expect(JSON.stringify(seed)).not.toContain('seo')
  })

  it('preserves branch declaration order, since it is the physical column order', () => {
    const seed = defineSeed({
      slug: 'posts',
      label: 'Post',
      displayNameAlias: 'c',
      branches: [
        { alias: 'c', label: 'C', type: 'text' },
        { alias: 'a', label: 'A', type: 'text' },
        { alias: 'b', label: 'B', type: 'text' },
      ],
    })

    expect(seed.branches.map(b => b.alias)).toEqual(['c', 'a', 'b'])
  })
})

describe('defineField', () => {
  it('relation produces type "relation" and carries targetSeed through', () => {
    const branch = defineField.relation({ alias: 'author_id', label: 'Author', targetSeed: 'authors' })

    expect(branch.type).toBe('relation')
    expect(branch.targetSeed).toBe('authors')
  })

  it('repeater produces type "repeater" and carries fields through', () => {
    const subField: ManifestBranch = { alias: 'value', label: 'Value', type: 'text' }
    const branch = defineField.repeater({ alias: 'items', label: 'Items', fields: [subField] })

    expect(branch.type).toBe('repeater')
    expect(branch.fields).toEqual([subField])
  })

  it('relation does not compile without targetSeed', () => {
    // @ts-expect-error targetSeed is required for defineField.relation
    defineField.relation({ alias: 'author_id', label: 'Author' })
  })

  it('repeater does not compile without fields', () => {
    // @ts-expect-error fields is required for defineField.repeater
    defineField.repeater({ alias: 'items', label: 'Items' })
  })
})

describe('defineSchema', () => {
  it('stamps version with MANIFEST_VERSION', () => {
    const manifest = defineSchema({ seeds: [] })

    expect(manifest.version).toBe(MANIFEST_VERSION)
  })
})
