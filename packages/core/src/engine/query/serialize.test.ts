// SPDX-License-Identifier: MIT
import { describe, it, expect } from 'vitest'
import type { Seed, Branch } from '../types.js'
import { serializeForDb, deserializeFromDb } from './serialize.js'

const mockSeed: Seed = {
  slug: 'articles',
  label: 'Articles',
  allowDrafts: true,
  displayNameAlias: 'title',
  branches: [
    { id: 'br_title', alias: 'title', type: 'text', label: 'Title', requiredOnCreate: true },
    { id: 'br_content', alias: 'content', type: 'richtext', label: 'Content' },
    { id: 'br_published', alias: 'published', type: 'boolean', label: 'Published' },
    { id: 'br_price', alias: 'price', type: 'number', label: 'Price' },
    { id: 'br_tags', alias: 'tags', type: 'tags', label: 'Tags' },
    { id: 'br_cover', alias: 'cover', type: 'file', label: 'Cover' },
  ]
}

describe('Serialize', () => {
  describe('Serialization / Deserialization', () => {
    const textBranch: Branch = { id: 'br_t', alias: 't', type: 'text', label: 'T' }
    const boolBranch: Branch = { id: 'br_b', alias: 'b', type: 'boolean', label: 'B' }
    const jsonBranch: Branch = { id: 'br_j', alias: 'j', type: 'json', label: 'J' }
    const dateBranch: Branch = { id: 'br_d', alias: 'd', type: 'date', label: 'D' }

    it('serializes values for DB', () => {
      expect(serializeForDb(boolBranch, true)).toBe(1)
      expect(serializeForDb(boolBranch, false)).toBe(0)
      expect(serializeForDb(jsonBranch, { foo: 'bar' })).toBe('{"foo":"bar"}')
      
      const timestamp = Math.floor(Date.now() / 1000)
      expect(serializeForDb(dateBranch, timestamp)).toBe(timestamp)
    })

    it('deserializes values from DB', () => {
      expect(deserializeFromDb(boolBranch, 1)).toBe(true)
      expect(deserializeFromDb(boolBranch, 0)).toBe(false)
      expect(deserializeFromDb(jsonBranch, '{"foo":"bar"}')).toEqual({ foo: 'bar' })
      
      const dateStr = '2023-10-27T10:00:00.000Z'
      const timestamp = Math.floor(new Date(dateStr).getTime() / 1000)
      expect(deserializeFromDb(dateBranch, timestamp)).toBe(new Date(timestamp * 1000).toISOString())
    })

    it('handles null and undefined', () => {
      expect(serializeForDb(boolBranch, null)).toBeNull()
      expect(serializeForDb(boolBranch, undefined)).toBeNull()
      expect(deserializeFromDb(boolBranch, null)).toBeNull()
      expect(deserializeFromDb(boolBranch, undefined)).toBeNull()
    })

    it('serializes and deserializes date strings properly', () => {
      const dateStr = '2023-10-27T00:00:00.000Z'
      const timestamp = Math.floor(new Date(dateStr).getTime() / 1000)
      
      const dateOnlyBranch: Branch = { id: 'br_d', alias: 'd', type: 'date', label: 'D', format: 'date' }
      
      // serialization
      expect(serializeForDb(dateOnlyBranch, dateStr)).toBe(timestamp)
      // invalid date
      expect(serializeForDb(dateOnlyBranch, 'invalid')).toBeNull()

      // deserialization
      expect(deserializeFromDb(dateOnlyBranch, timestamp)).toBe('2023-10-27')
    })

    it('serializes and deserializes asset lists properly', () => {
      const assetListBranch: Branch = { id: 'br_f', alias: 'f', type: 'file', label: 'F', multiple: true }
      expect(serializeForDb(assetListBranch, ['https://a.com', 'https://b.com'])).toBe('["https://a.com","https://b.com"]')
      expect(deserializeFromDb(assetListBranch, '["https://a.com","https://b.com"]')).toEqual(['https://a.com', 'https://b.com'])
      expect(deserializeFromDb(assetListBranch, ['https://a.com'])).toEqual(['https://a.com'])
    })

    it('serializes and deserializes a single (non-list) file branch', () => {
      const fileBranch: Branch = { id: 'br_f', alias: 'f', type: 'file', label: 'F' }
      expect(serializeForDb(fileBranch, 'https://a.com')).toBe('https://a.com')
      expect(serializeForDb(fileBranch, 42)).toBeNull()
      expect(deserializeFromDb(fileBranch, 'https://a.com')).toBe('https://a.com')
      expect(deserializeFromDb(fileBranch, 42)).toBeNull()
    })

    it('serializes and deserializes repeater branches', () => {
      const repeaterBranch: Branch = { id: 'br_r', alias: 'r', type: 'repeater', label: 'R' }
      expect(serializeForDb(repeaterBranch, [{ name: 'a' }])).toBe('[{"name":"a"}]')
      expect(serializeForDb(repeaterBranch, 'not-an-array')).toBe('[]')
      expect(deserializeFromDb(repeaterBranch, '[{"name":"a"}]')).toEqual([{ name: 'a' }])
      expect(deserializeFromDb(repeaterBranch, '')).toEqual([])
      expect(deserializeFromDb(repeaterBranch, '{"not":"an-array"}')).toEqual([])
    })

    it('serializes and deserializes json/tags/richtext string and non-string values', () => {
      const jsonBranch: Branch = { id: 'br_j', alias: 'j', type: 'json', label: 'J' }
      expect(serializeForDb(jsonBranch, 'already-a-string')).toBe('already-a-string')
      expect(deserializeFromDb(jsonBranch, { already: 'an-object' })).toEqual({ already: 'an-object' })
      expect(deserializeFromDb(jsonBranch, 'not-valid-json')).toBe('not-valid-json')
    })

    it('serializes a date with no explicit value type and a plain date-time string', () => {
      const dateBranch: Branch = { id: 'br_d', alias: 'd', type: 'date', label: 'D' }
      expect(serializeForDb(dateBranch, true)).toBeNull()

      const dateStr = '2023-10-27T10:00:00.000Z'
      const timestamp = Math.floor(new Date(dateStr).getTime() / 1000)
      expect(serializeForDb(dateBranch, dateStr)).toBe(timestamp)

      expect(deserializeFromDb(dateBranch, 'not-a-number')).toBeNull()
    })

    it('serializes non-string, non-number values on a plain type to null', () => {
      const textBranch: Branch = { id: 'br_t', alias: 't', type: 'text', label: 'T' }
      expect(serializeForDb(textBranch, { not: 'a string or number' })).toBeNull()
    })
  })

  describe('serializeForDb — localized branches', () => {
    const localizedTextBranch: Branch = { id: 'br_t', alias: 't', type: 'text', label: 'T', localized: true }
    const localizedRichtextBranch: Branch = { id: 'br_r', alias: 'r', type: 'richtext', label: 'R', localized: true }

    it('serializes a localized dictionary to compact JSON', () => {
      expect(serializeForDb(localizedTextBranch, { it: 'a', en: null, fr: '' })).toBe('{"it":"a"}')
    })

    it('serializes an all-blank localized dictionary to null', () => {
      expect(serializeForDb(localizedTextBranch, { it: null, en: '' })).toBeNull()
    })

    it('keeps serializing a plain string on a localized text branch as the raw string', () => {
      expect(serializeForDb(localizedTextBranch, 'Scarpa')).toBe('Scarpa')
    })

    // Regression guard: non-localized text must never change shape.
    it('leaves a JSON-looking string on a non-localized text branch as a string', () => {
      const plainTextBranch: Branch = { id: 'br_p', alias: 'p', type: 'text', label: 'P' }
      expect(serializeForDb(plainTextBranch, '{"it":"a"}')).toBe('{"it":"a"}')
    })

    it('round-trips a localized richtext dictionary of envelopes', () => {
      const doc = { it: { type: 'doc', content: [] }, en: { type: 'doc', content: [] } }
      const serialized = serializeForDb(localizedRichtextBranch, doc)
      expect(typeof serialized).toBe('string')
      expect(deserializeFromDb(localizedRichtextBranch, serialized)).toEqual(doc)
    })
  })

  describe('deserializeFromDb — localized branches', () => {
    const localizedTextBranch: Branch = { id: 'br_t', alias: 't', type: 'text', label: 'T', localized: true }

    it('deserializes a stored dictionary on a localized text branch to an object', () => {
      expect(deserializeFromDb(localizedTextBranch, '{"it":"a","en":"b"}')).toEqual({ it: 'a', en: 'b' })
    })

    it('returns a legacy plain string on a localized text branch unchanged', () => {
      expect(deserializeFromDb(localizedTextBranch, 'Scarpa')).toBe('Scarpa')
    })
  })
})