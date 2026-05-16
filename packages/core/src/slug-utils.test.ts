import { describe, it, expect } from 'vitest'
import { slugify, generateEntrySlug } from './slug-utils.js'

describe('Slug Utilities', () => {
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
