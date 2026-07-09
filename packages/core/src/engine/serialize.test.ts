// SPDX-License-Identifier: MIT
import { describe, it, expect } from 'vitest'
import type { Seed, Branch } from './types.js'
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
  })
})