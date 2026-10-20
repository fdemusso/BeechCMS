// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * Unit tier. The `tags` branch rules (count, length, invisible characters, normalization, closed
 * vocabulary) driven through the public `validateAndSanitizeSeedPayload`; `tagsSchema` is private.
 * The HTTP round-trip of the same rules is covered by content-tag-options.integration.test.ts.
 */

import { describe, it, expect } from 'vitest'
import { validateAndSanitizeSeedPayload } from './index.js'
import type { Seed } from '../types.js'

const ZWSP = '\u200B'
const ZWJ = '\u200D'

const LEVELS = [
  { value: 'low', color: '#64748b' },
  { value: 'high', color: '#ef4444' },
]

// Twelve options so that a closed-vocabulary pick can exceed the 10-tag cap with valid options only.
const TWELVE_OPTIONS = Array.from({ length: 12 }, (_, i) => ({ value: `opt${i}`, color: '#3b82f6' }))

const SEED: Seed = {
  slug: 'posts',
  label: 'Post',
  displayNameAlias: 'title',
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text' },
    { id: 'br_02', alias: 'tags', label: 'Tags', type: 'tags' },
    { id: 'br_03', alias: 'level', label: 'Level', type: 'tags', multiple: false, options: LEVELS },
    { id: 'br_04', alias: 'many', label: 'Many', type: 'tags', options: TWELVE_OPTIONS },
    { id: 'br_05', alias: 'cafe', label: 'Cafe', type: 'tags', options: [{ value: 'caf\u00E9', color: '#a16207' }] },
  ],
}

function tagsIn(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `t${i}`)
}

describe('validateAndSanitizeSeedPayload — tags branch', () => {
  describe('count', () => {
    it('accepts exactly 10 free tags', () => {
      const result = validateAndSanitizeSeedPayload(SEED, { tags: tagsIn(10) })

      expect(result.details).toEqual([])
      expect(result.data.tags).toEqual(tagsIn(10))
    })

    it('rejects 11 free tags with tags(max:10) and yields no data for the field', () => {
      const result = validateAndSanitizeSeedPayload(SEED, { tags: tagsIn(11) })

      expect(result.details[0]).toMatchObject({ field: 'tags', expected: 'tags(max:10)' })
      expect(result.data).not.toHaveProperty('tags')
    })

    it('counts only tags that survive cleaning, so 10 real tags among 30 blanks pass', () => {
      const padded = [...tagsIn(10), ...Array.from({ length: 20 }, (_, i) => (i % 2 ? ' ' : ZWSP))]

      const result = validateAndSanitizeSeedPayload(SEED, { tags: padded })

      expect(result.details).toEqual([])
      expect(result.data.tags).toEqual(tagsIn(10))
    })

    it('still rejects 11 real tags hidden among blanks', () => {
      const padded = [...tagsIn(11), '', ' ', ZWSP]

      const result = validateAndSanitizeSeedPayload(SEED, { tags: padded })

      expect(result.details[0]).toMatchObject({ field: 'tags', expected: 'tags(max:10)' })
    })

    // The coarse 50-item guard exists so a hostile array is rejected before 50k strings are scanned.
    it('rejects an array of 51 blanks outright instead of cleaning it to []', () => {
      const result = validateAndSanitizeSeedPayload(SEED, { tags: Array.from({ length: 51 }, () => '') })

      expect(result.details[0]).toMatchObject({ field: 'tags', expected: 'tags(max:10)' })
    })

    it('rejects a 100k-item array without cleaning it', () => {
      const result = validateAndSanitizeSeedPayload(SEED, { tags: Array.from({ length: 100_000 }, () => 'x') })

      expect(result.details[0]).toMatchObject({ field: 'tags', expected: 'tags(max:10)' })
    })
  })

  describe('length', () => {
    it('accepts a 25-character tag and rejects a 26-character one with tags(item-max:25)', () => {
      const accepted = validateAndSanitizeSeedPayload(SEED, { tags: ['a'.repeat(25)] })
      const rejected = validateAndSanitizeSeedPayload(SEED, { tags: ['a'.repeat(26)] })

      expect(accepted.details).toEqual([])
      expect(rejected.details[0]).toMatchObject({ field: 'tags', expected: 'tags(item-max:25)' })
    })

    it('rejects one over-long tag even when the other nine are fine, persisting none of them', () => {
      const result = validateAndSanitizeSeedPayload(SEED, { tags: [...tagsIn(9), 'z'.repeat(26)] })

      expect(result.details[0]).toMatchObject({ field: 'tags', expected: 'tags(item-max:25)' })
      expect(result.data).not.toHaveProperty('tags')
    })

    it('rejects a 50,000-character tag, the old per-tag ceiling', () => {
      const result = validateAndSanitizeSeedPayload(SEED, { tags: ['a'.repeat(50_000)] })

      expect(result.details[0]).toMatchObject({ field: 'tags', expected: 'tags(item-max:25)' })
    })

    it('does not let padding push a valid 25-character tag over the limit', () => {
      const result = validateAndSanitizeSeedPayload(SEED, { tags: [`${' '.repeat(100)}${'a'.repeat(25)}${ZWSP.repeat(100)}`] })

      expect(result.details).toEqual([])
      expect(result.data.tags).toEqual(['a'.repeat(25)])
    })

    it('rejects a combining-mark flood that is one grapheme but hundreds of bytes', () => {
      const result = validateAndSanitizeSeedPayload(SEED, { tags: [`e${'\u0301'.repeat(500)}`] })

      expect(result.details[0]).toMatchObject({ field: 'tags', expected: 'tags(item-max:25)' })
    })
  })

  describe('invisible and malformed text', () => {
    it('drops a tag made only of zero-width characters instead of storing an invisible label', () => {
      const result = validateAndSanitizeSeedPayload(SEED, { tags: [`${ZWSP}\uFEFF${ZWJ}`, 'real'] })

      expect(result.details).toEqual([])
      expect(result.data.tags).toEqual(['real'])
    })

    it('rejects "a" and "a" plus a zero-width space as duplicates, not as two tags', () => {
      const result = validateAndSanitizeSeedPayload(SEED, { tags: ['a', `a${ZWSP}`] })

      expect(result.details[0]).toMatchObject({ field: 'tags', expected: 'tags(unique)' })
    })

    it('rejects the composed and the decomposed \u00E9 as duplicates', () => {
      const result = validateAndSanitizeSeedPayload(SEED, { tags: ['caf\u00E9', 'cafe\u0301'] })

      expect(result.details[0]).toMatchObject({ field: 'tags', expected: 'tags(unique)' })
    })

    it('stores the decomposed \u00E9 in its composed form', () => {
      const result = validateAndSanitizeSeedPayload(SEED, { tags: ['cafe\u0301'] })

      expect(result.data.tags).toEqual(['caf\u00E9'])
    })

    it('rejects "a b" and "a   b" typed with a tab as duplicates after whitespace collapsing', () => {
      const result = validateAndSanitizeSeedPayload(SEED, { tags: ['a b', 'a \t b'] })

      expect(result.details[0]).toMatchObject({ field: 'tags', expected: 'tags(unique)' })
    })

    it('rejects a tag containing a lone surrogate with tags(valid-text)', () => {
      const result = validateAndSanitizeSeedPayload(SEED, { tags: ['ok', 'bad\uD83D'] })

      expect(result.details[0]).toMatchObject({ field: 'tags', expected: 'tags(valid-text)' })
      expect(result.data).not.toHaveProperty('tags')
    })

    it('strips a bidi override so a reversed-looking label is stored plainly', () => {
      const result = validateAndSanitizeSeedPayload(SEED, { tags: ['\u202Egpj.exe'] })

      expect(result.data.tags).toEqual(['gpj.exe'])
    })

    it('keeps case-different tags as two distinct values', () => {
      const result = validateAndSanitizeSeedPayload(SEED, { tags: ['News', 'news'] })

      expect(result.details).toEqual([])
      expect(result.data.tags).toEqual(['News', 'news'])
    })

    it('keeps markup, SQL and prototype-looking labels literal', () => {
      const literal = ['<b>', "x'--", '__proto__', 'constructor']

      const result = validateAndSanitizeSeedPayload(SEED, { tags: literal })

      expect(result.details).toEqual([])
      expect(result.data.tags).toEqual(literal)
    })
  })

  describe('shape', () => {
    it('rejects non-string items of every JSON type', () => {
      const shapes: unknown[][] = [[1], [true], [null], [['a']], [{ a: 1 }], ['ok', 2]]

      const results = shapes.map((tags) => validateAndSanitizeSeedPayload(SEED, { tags }))

      expect(results.map((result) => result.details.length > 0)).toEqual(shapes.map(() => true))
    })

    it('rejects a JSON-encoded array string, an object and a number instead of coercing them', () => {
      const values: unknown[] = ['["a"]', { 0: 'a' }, 7]

      const results = values.map((tags) => validateAndSanitizeSeedPayload(SEED, { tags }))

      expect(results.map((result) => result.details[0]?.field)).toEqual(['tags', 'tags', 'tags'])
    })

    it('is idempotent: re-validating accepted output returns it unchanged', () => {
      const first = validateAndSanitizeSeedPayload(SEED, { tags: [` cafe\u0301${ZWSP} `, 'a \t b'] })

      const second = validateAndSanitizeSeedPayload(SEED, { tags: first.data.tags })

      expect(second.data.tags).toEqual(first.data.tags)
    })
  })

  describe('closed vocabulary', () => {
    it('rejects an option padded with a zero-width space', () => {
      const result = validateAndSanitizeSeedPayload(SEED, { level: [`high${ZWSP}`] })

      expect(result.details[0]).toMatchObject({ field: 'level', expected: 'tags(one-of:low|high)' })
    })

    it('rejects an option with a leading or trailing newline', () => {
      const results = ['\nhigh', 'high\n'].map((value) => validateAndSanitizeSeedPayload(SEED, { level: [value] }))

      expect(results.map((result) => result.details[0]?.expected)).toEqual(['tags(one-of:low|high)', 'tags(one-of:low|high)'])
    })

    it('rejects the empty string and a blank as a pick, never as "no value"', () => {
      const results = ['', ' '].map((value) => validateAndSanitizeSeedPayload(SEED, { many: [value] }))

      expect(results.map((result) => result.details[0]?.field)).toEqual(['many', 'many'])
    })

    it('accepts the decomposed form of an option and stores the declared composed form', () => {
      const result = validateAndSanitizeSeedPayload(SEED, { cafe: ['cafe\u0301'] })

      expect(result.details).toEqual([])
      expect(result.data.cafe).toEqual(['caf\u00E9'])
    })

    it('rejects 11 distinct valid picks with tags(max:10)', () => {
      const picks = TWELVE_OPTIONS.slice(0, 11).map((option) => option.value)

      const result = validateAndSanitizeSeedPayload(SEED, { many: picks })

      expect(result.details[0]).toMatchObject({ field: 'many', expected: 'tags(max:10)' })
    })

    it('accepts all 10 allowed picks out of 12 options in the order received', () => {
      const picks = TWELVE_OPTIONS.slice(2, 12).map((option) => option.value).reverse()

      const result = validateAndSanitizeSeedPayload(SEED, { many: picks })

      expect(result.details).toEqual([])
      expect(result.data.many).toEqual(picks)
    })

    it('rejects a single-choice pick written twice as tags(unique) before tags(max:1)', () => {
      const result = validateAndSanitizeSeedPayload(SEED, { level: ['low', 'low'] })

      expect(result.details[0]).toMatchObject({ field: 'level', expected: 'tags(unique)' })
    })
  })
})
