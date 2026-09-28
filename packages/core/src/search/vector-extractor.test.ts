// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import type { Seed } from '../engine/types.js'
import { extractIndexableText } from './vector-extractor.js'
import { sanitizeRichtext } from '../engine/validation/richtext-sanitizer.js'
import { serializeForDb, deserializeFromDb } from '../engine/query/serialize.js'

describe('extractIndexableText', () => {
  it('extracts and concatenates indexable text and richtext fields', () => {
    const seed: Seed = {
      slug: 'articles',
      label: 'Articles',
      displayNameAlias: 'title',
      branches: [
        { id: 'br_01', alias: 'title', label: 'Title', type: 'text' },
        { id: 'br_02', alias: 'content', label: 'Content', type: 'richtext' },
        { id: 'br_03', alias: 'views', label: 'Views', type: 'number' },
      ],
    }

    const entry = {
      id: 'art_123',
      title: 'Hello World',
      content: 'This is the body of the article.',
      views: 42,
    }

    const result = extractIndexableText(seed, entry)
    expect(result).toBe('Hello World This is the body of the article.')
  })

  it('extracts text from a richtext value that went through the real sanitize/serialize/deserialize pipeline (#451)', () => {
    const seed: Seed = {
      slug: 'articles',
      label: 'Articles',
      displayNameAlias: 'title',
      branches: [
        { id: 'br_01', alias: 'title', label: 'Title', type: 'text' },
        { id: 'br_02', alias: 'body', label: 'Body', type: 'richtext' },
      ],
    }
    const bodyBranch = seed.branches[1]

    const sanitized = sanitizeRichtext('Quantum entanglement explained for beginners', 1_000_000)
    const stored = serializeForDb(bodyBranch, sanitized.value)
    const body = deserializeFromDb(bodyBranch, stored)

    expect(typeof body).toBe('object') // deserialized richtext is a TipTap doc object, never a string

    const result = extractIndexableText(seed, { title: 'Intro', body })
    expect(result).toBe('Intro Quantum entanglement explained for beginners')
  })

  it('extracts richtext body text even when the entry has no other indexable text', () => {
    const seed: Seed = {
      slug: 'articles',
      label: 'Articles',
      displayNameAlias: 'title',
      branches: [
        { id: 'br_01', alias: 'title', label: 'Title', type: 'text' },
        { id: 'br_02', alias: 'body', label: 'Body', type: 'richtext' },
      ],
    }
    const bodyBranch = seed.branches[1]

    const sanitized = sanitizeRichtext('Quantum entanglement explained for beginners', 1_000_000)
    const stored = serializeForDb(bodyBranch, sanitized.value)
    const body = deserializeFromDb(bodyBranch, stored)

    const result = extractIndexableText(seed, { title: '', body })
    expect(result).toBe('Quantum entanglement explained for beginners')
  })

  it('indexes every locale of a localized richtext dictionary', () => {
    const seed: Seed = {
      slug: 'products',
      label: 'Products',
      displayNameAlias: 'title',
      branches: [
        { id: 'br_01', alias: 'body', label: 'Body', type: 'richtext', localized: true },
      ],
    }
    const bodyBranch = seed.branches[0]

    const it = sanitizeRichtext('Scarpa da corsa', 1_000_000).value
    const en = sanitizeRichtext('Running shoe', 1_000_000).value
    const stored = serializeForDb(bodyBranch, { it, en })
    const body = deserializeFromDb(bodyBranch, stored)

    const result = extractIndexableText(seed, { body })
    expect(result).toContain('Scarpa da corsa')
    expect(result).toContain('Running shoe')
  })

  it('excludes confidential, internal, and restricted fields', () => {
    const seed: Seed = {
      slug: 'articles',
      label: 'Articles',
      displayNameAlias: 'title',
      branches: [
        { id: 'br_01', alias: 'title', label: 'Title', type: 'text' },
        {
          id: 'br_02',
          alias: 'internal_notes',
          label: 'Internal Notes',
          type: 'text',
          policies: { classification: 'internal' },
        },
        {
          id: 'br_03',
          alias: 'secret_code',
          label: 'Secret Code',
          type: 'text',
          policies: { classification: 'confidential' },
        },
        {
          id: 'br_04',
          alias: 'restricted_token',
          label: 'Restricted Token',
          type: 'text',
          policies: { classification: 'restricted' },
        },
      ],
    }

    const entry = {
      title: 'Public Title',
      internal_notes: 'Do not publish this note',
      secret_code: 'TopSecret123',
      restricted_token: 'SecretTokenABC',
    }

    const result = extractIndexableText(seed, entry)
    expect(result).toBe('Public Title')
  })

  it('excludes fields with search: false or public: false policies', () => {
    const seed: Seed = {
      slug: 'articles',
      label: 'Articles',
      displayNameAlias: 'title',
      branches: [
        { id: 'br_01', alias: 'title', label: 'Title', type: 'text' },
        {
          id: 'br_02',
          alias: 'unsearchable',
          label: 'Unsearchable',
          type: 'text',
          policies: { search: false },
        },
        {
          id: 'br_03',
          alias: 'non_public',
          label: 'Non Public',
          type: 'text',
          policies: { public: false },
        },
      ],
    }

    const entry = {
      title: 'Public Title',
      unsearchable: 'Hidden from search',
      non_public: 'Not public',
    }

    const result = extractIndexableText(seed, entry)
    expect(result).toBe('Public Title')
  })

  it('returns null if seed has no indexable branches', () => {
    const seed: Seed = {
      slug: 'metrics',
      label: 'Metrics',
      displayNameAlias: 'count',
      branches: [
        { id: 'br_01', alias: 'count', label: 'Count', type: 'number' },
        { id: 'br_02', alias: 'active', label: 'Active', type: 'boolean' },
      ],
    }

    const entry = { count: 10, active: true }
    expect(extractIndexableText(seed, entry)).toBeNull()
  })

  it('returns null if all indexable fields are missing or empty', () => {
    const seed: Seed = {
      slug: 'articles',
      label: 'Articles',
      displayNameAlias: 'title',
      branches: [
        { id: 'br_01', alias: 'title', label: 'Title', type: 'text' },
        { id: 'br_02', alias: 'content', label: 'Content', type: 'richtext' },
      ],
    }

    expect(extractIndexableText(seed, {})).toBeNull()
    expect(extractIndexableText(seed, { title: '', content: '   ' })).toBeNull()
    expect(extractIndexableText(seed, { title: null, content: undefined })).toBeNull()
  })

  it('indexes every locale of a localized text dictionary', () => {
    const seed: Seed = {
      slug: 'products',
      label: 'Products',
      displayNameAlias: 'title',
      branches: [
        { id: 'br_01', alias: 'title', label: 'Title', type: 'text', localized: true },
      ],
    }

    const entry = { title: { it: 'Scarpa', en: 'Shoe' } }
    const result = extractIndexableText(seed, entry)
    expect(result).toContain('Scarpa')
    expect(result).toContain('Shoe')
  })

  it('ignores a dictionary-shaped object on a non-localized branch', () => {
    const seed: Seed = {
      slug: 'products',
      label: 'Products',
      displayNameAlias: 'title',
      branches: [
        { id: 'br_01', alias: 'title', label: 'Title', type: 'text' },
      ],
    }

    const entry = { title: { it: 'Scarpa', en: 'Shoe' } }
    expect(extractIndexableText(seed, entry)).toBeNull()
  })
})
