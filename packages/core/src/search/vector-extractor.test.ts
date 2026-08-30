// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import type { Seed } from '../engine/types.js'
import { extractIndexableText } from './vector-extractor.js'

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
})
