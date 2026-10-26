// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { slugify, generateEntrySlug, toTrashedSlug, fromTrashedSlug, TRASHED_SLUG_INFIX } from './slug-utils.js'

describe('Slug Utilities', () => {
  describe('toTrashedSlug', () => {
    it('appends _old_ and the millisecond timestamp to a lower-cased slug', () => {
      const trashed = toTrashedSlug('My-Post', 1_700_000_000_123)

      expect(trashed).toBe('my-post_old_1700000000123')
    })
  })

  describe('fromTrashedSlug', () => {
    it('returns the original slug for a value produced by toTrashedSlug', () => {
      const restored = fromTrashedSlug(toTrashedSlug('my-post', 1_700_000_000_123))

      expect(restored).toBe('my-post')
    })

    it('returns a slug without the suffix unchanged, so pre-feature trashed entries keep theirs', () => {
      const restored = fromTrashedSlug('legacy-trashed')

      expect(restored).toBe('legacy-trashed')
    })

    it.each(['a_old_x', 'a_old_1-b'])('strips only a trailing suffix of digits: %s is returned unchanged', (slug) => {
      expect(fromTrashedSlug(slug)).toBe(slug)
    })
  })

  describe('trashed infix invariant', () => {
    it.each(['snake_case_title', 'Mixed CASE with spaces', '__leading_and_trailing__', 'a_old_1'])(
      'slugify never emits an underscore for %s, so no live slug can carry the trashed infix',
      (input) => {
        const slug = slugify(input)

        expect(slug).not.toContain('_')
        expect(slug).not.toContain(TRASHED_SLUG_INFIX)
      },
    )
  })

  describe('slugify', () => {
    it('converts basic strings to slugs', () => {
      expect(slugify('Hello World')).toBe('hello-world')
      expect(slugify('  Trim Me  ')).toBe('trim-me')
    })

    it('normalizes accented characters', () => {
      expect(slugify('Café au Lait')).toBe('cafe-au-lait')
      expect(slugify('München')).toBe('munchen')
    })

    it('removes special characters', () => {
      expect(slugify('Hello @ World!')).toBe('hello-world')
    })

    it('limits length to 15 characters', () => {
      expect(slugify('This is a very long title for an article')).toBe('this-is-a-very')
    })

    it('handles multiple dashes and underscores', () => {
      expect(slugify('hello__world--test')).toBe('hello-world-tes')
    })
  })

  describe('generateEntrySlug', () => {
    it('uses provided slug if valid', () => {
      expect(generateEntrySlug({ slug: 'my-custom-slug' })).toBe('my-custom-slug')
    })

    it('generates from title if slug is missing', () => {
      expect(generateEntrySlug({ title: 'An Awesome Article' })).toBe('an-awesome-arti')
    })

    it('generates from name if title and slug are missing', () => {
      expect(generateEntrySlug({ name: 'John Doe' })).toBe('john-doe')
    })

    it('uses a fallback if no input provided', () => {
      const slug = generateEntrySlug({})
      expect(slug).toMatch(/^[a-z0-9]+$/)
      expect(slug.length).toBeLessThanOrEqual(15)
    })
  })
})
