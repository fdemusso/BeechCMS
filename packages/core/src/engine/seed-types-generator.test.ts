// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import type { Seed, Branch } from './types.js'
import { pascalCase, tsTypeForBranch, interfaceForSeed, generateSeedTypes } from './seed-types-generator.js'

describe('pascalCase', () => {
  it('converts kebab-case', () => expect(pascalCase('blog-posts')).toBe('BlogPosts'))
  it('converts snake_case', () => expect(pascalCase('my_seed')).toBe('MySeed'))
  it('preserves single word', () => expect(pascalCase('articles')).toBe('Articles'))
})

const b = (overrides: Partial<Branch>): Branch =>
  ({ alias: 'x', label: 'X', type: 'text', ...overrides } as Branch)

describe('tsTypeForBranch — type mapping matrix', () => {
  it('text → string', () => expect(tsTypeForBranch(b({ type: 'text' }))).toBe('string'))
  it('richtext → string', () => expect(tsTypeForBranch(b({ type: 'richtext' }))).toBe('string'))
  it('number → number', () => expect(tsTypeForBranch(b({ type: 'number' }))).toBe('number'))
  it('boolean → boolean', () => expect(tsTypeForBranch(b({ type: 'boolean' }))).toBe('boolean'))
  it('date → number', () => expect(tsTypeForBranch(b({ type: 'date' }))).toBe('number'))
  it('json → unknown', () => expect(tsTypeForBranch(b({ type: 'json' }))).toBe('unknown'))
  it('tags → string[]', () => expect(tsTypeForBranch(b({ type: 'tags' }))).toBe('string[]'))
  it('relation singular → string', () => expect(tsTypeForBranch(b({ type: 'relation' }))).toBe('string'))
  it('relation multiple → string[]', () => expect(tsTypeForBranch(b({ type: 'relation', multiple: true }))).toBe('string[]'))
  it('file singular → string', () => expect(tsTypeForBranch(b({ type: 'file' }))).toBe('string'))
  it('file multiple → string[]', () => expect(tsTypeForBranch(b({ type: 'file', multiple: true }))).toBe('string[]'))

  it('text with options → literal union', () => {
    expect(tsTypeForBranch(b({ type: 'text', options: ['a', 'b'] }))).toBe("'a' | 'b'")
  })
  it('tags with options → array of literal union', () => {
    expect(tsTypeForBranch(b({ type: 'tags', options: ['x', 'y'] }))).toBe("('x' | 'y')[]")
  })

  it('repeater → inline Array<{}>', () => {
    const branch = b({
      type: 'repeater',
      fields: [
        b({ alias: 'name', type: 'text', requiredOnCreate: true }),
        b({ alias: 'count', type: 'number' }),
      ],
    })
    expect(tsTypeForBranch(branch)).toBe("Array<{ name: string; count?: number }>")
  })
})

describe('interfaceForSeed', () => {
  const seed: Seed = {
    slug: 'articles',
    label: 'Articles',
    displayNameAlias: 'title',
    branches: [
      { alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
      { alias: 'body', label: 'Body', type: 'richtext' },
    ],
  }

  it('emits export interface with PascalCase name', () => {
    expect(interfaceForSeed(seed)).toContain('export interface Articles {')
  })

  it('includes system fields', () => {
    const out = interfaceForSeed(seed)
    expect(out).toContain('id: string')
    expect(out).toContain("status: 'draft' | 'review' | 'published' | 'archived'")
    expect(out).toContain('created_at: number')
    expect(out).toContain('updated_at: number')
  })

  it('required branch has no ?', () => expect(interfaceForSeed(seed)).toContain('  title: string'))
  it('optional branch has ?', () => expect(interfaceForSeed(seed)).toContain('  body?: string'))
})

describe('generateSeedTypes', () => {
  const seeds: Seed[] = [
    { slug: 'zoo', label: 'Zoo', displayNameAlias: 'name', branches: [] },
    { slug: 'animals', label: 'Animals', displayNameAlias: 'name', branches: [] },
  ]

  it('sorts by slug for stable output', () => {
    const out = generateSeedTypes(seeds)
    expect(out.indexOf('Animals')).toBeLessThan(out.indexOf('Zoo'))
  })

  it('starts with the auto-generated banner', () => {
    expect(generateSeedTypes(seeds)).toContain('generato automaticamente')
  })

  it('emits SeedRegistryTypes', () => {
    const out = generateSeedTypes(seeds)
    expect(out).toContain('export interface SeedRegistryTypes {')
    expect(out).toContain('animals: Animals')
    expect(out).toContain('zoo: Zoo')
  })

  it('is deterministic — same input same output', () => {
    expect(generateSeedTypes(seeds)).toBe(generateSeedTypes([...seeds].reverse()))
  })
})
