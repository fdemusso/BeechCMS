import { describe, expect, it } from 'vitest'
import { getSeed } from '@beechcms/core'
import {
  parsePublicFilter,
  buildPublicFilterWhereClause,
  parsePublicPagination,
  parseLatestCount,
} from '../src/public/query-builder'

describe('public/query-builder', () => {
  describe('parsePublicPagination', () => {
    it('returns defaults when input is empty', () => {
      expect(parsePublicPagination({})).toEqual({ page: 1, limit: 25 })
    })

    it('parses valid page and limit', () => {
      expect(parsePublicPagination({ page: '3', limit: '10' })).toEqual({ page: 3, limit: 10 })
    })

    it('clamps limit to 100', () => {
      expect(parsePublicPagination({ limit: '999' })).toEqual({ page: 1, limit: 100 })
    })

    it('falls back to page=1 for invalid page', () => {
      expect(parsePublicPagination({ page: '0' })).toEqual({ page: 1, limit: 25 })
    })

    it('falls back to limit=25 for invalid limit', () => {
      expect(parsePublicPagination({ limit: 'abc' })).toEqual({ page: 1, limit: 25 })
    })
  })

  describe('parseLatestCount', () => {
    it('returns 10 when undefined', () => {
      expect(parseLatestCount(undefined)).toBe(10)
    })

    it('parses a valid positive number', () => {
      expect(parseLatestCount('5')).toBe(5)
    })

    it('returns 10 for non-numeric input', () => {
      expect(parseLatestCount('abc')).toBe(10)
    })

    it('clamps to 1 when value is 0', () => {
      expect(parseLatestCount('0')).toBe(1)
    })

    it('clamps to 1 when value is negative', () => {
      expect(parseLatestCount('-5')).toBe(1)
    })

    it('clamps to 100 when value exceeds maximum', () => {
      expect(parseLatestCount('999')).toBe(100)
    })

    it('accepts the boundary values 1 and 100', () => {
      expect(parseLatestCount('1')).toBe(1)
      expect(parseLatestCount('100')).toBe(100)
    })
  })

  describe('parsePublicFilter', () => {
    it('returns null when raw is undefined', () => {
      expect(parsePublicFilter(undefined)).toBeNull()
    })

    it('returns null when raw is empty string', () => {
      expect(parsePublicFilter('')).toBeNull()
    })

    it('throws on malformed JSON', () => {
      expect(() => parsePublicFilter('{invalid')).toThrow('malformed JSON')
    })

    it('throws when root is a non-object (string)', () => {
      expect(() => parsePublicFilter('"string"')).toThrow()
    })

    it('throws when where is not an array', () => {
      expect(() =>
        parsePublicFilter(JSON.stringify({ where: 'notarray' }))
      ).toThrow()
    })

    it('throws on unknown operator', () => {
      expect(() =>
        parsePublicFilter(JSON.stringify({ where: [{ field: 'title', op: 'bad_op' }] }))
      ).toThrow("unknown operator 'bad_op'")
    })

    it('throws when logic is not AND or OR', () => {
      expect(() =>
        parsePublicFilter(JSON.stringify({ logic: 'XOR', where: [] }))
      ).toThrow("'logic' must be 'AND' or 'OR'")
    })

    it('throws when logic is a non-string', () => {
      expect(() =>
        parsePublicFilter(JSON.stringify({ logic: 42, where: [] }))
      ).toThrow("'logic' must be 'AND' or 'OR'")
    })

    it('defaults logic to AND when omitted', () => {
      const filter = parsePublicFilter(
        JSON.stringify({ where: [{ field: 'title', op: 'eq', value: 'x' }] })
      )
      expect(filter!.logic).toBe('AND')
    })

    it('normalises logic value to uppercase', () => {
      const filter = parsePublicFilter(
        JSON.stringify({ logic: 'or', where: [] })
      )
      expect(filter!.logic).toBe('OR')
    })

    it('parses a valid eq condition', () => {
      const filter = parsePublicFilter(
        JSON.stringify({ where: [{ field: 'title', op: 'eq', value: 'hello' }] })
      )
      expect(filter).not.toBeNull()
      expect(filter!.where).toHaveLength(1)
      expect(filter!.where[0].field).toBe('title')
      expect(filter!.where[0].op).toBe('eq')
      expect(filter!.where[0].value).toBe('hello')
    })

    it('returns empty where array when all conditions are null/invalid', () => {
      const filter = parsePublicFilter(
        JSON.stringify({ where: [null, undefined] })
      )
      expect(filter!.where).toHaveLength(0)
    })

    it('parses multiple conditions', () => {
      const filter = parsePublicFilter(
        JSON.stringify({
          logic: 'OR',
          where: [
            { field: 'title', op: 'contains', value: 'foo' },
            { field: 'title', op: 'contains', value: 'bar' },
          ],
        })
      )
      expect(filter!.where).toHaveLength(2)
      expect(filter!.logic).toBe('OR')
    })
  })

  describe('buildPublicFilterWhereClause', () => {
    const seed = getSeed('articoli')

    it('returns empty clause when filter is null', () => {
      expect(buildPublicFilterWhereClause(seed, null)).toEqual({ clause: '', bindings: [] })
    })

    it('returns empty clause when where array is empty', () => {
      expect(buildPublicFilterWhereClause(seed, { where: [], logic: 'AND' }))
        .toEqual({ clause: '', bindings: [] })
    })

    it('skips conditions for unknown fields', () => {
      const filter = parsePublicFilter(
        JSON.stringify({ where: [{ field: 'no_such_field_xyz', op: 'eq', value: 'v' }] })
      )!
      expect(buildPublicFilterWhereClause(seed, filter)).toEqual({ clause: '', bindings: [] })
    })

    it('builds eq clause for a text value', () => {
      const filter = parsePublicFilter(
        JSON.stringify({ where: [{ field: 'title', op: 'eq', value: 'test' }] })
      )!
      const { clause, bindings } = buildPublicFilterWhereClause(seed, filter)
      expect(clause).toContain('LOWER(TRIM(CAST(')
      expect(clause).toContain('= LOWER(TRIM(?))')
      expect(bindings).toContain('test')
    })

    it('builds neq clause for a string value', () => {
      const filter = parsePublicFilter(
        JSON.stringify({ where: [{ field: 'title', op: 'neq', value: 'excluded' }] })
      )!
      const { clause, bindings } = buildPublicFilterWhereClause(seed, filter)
      expect(clause).toContain('!= LOWER(TRIM(?))')
      expect(bindings).toContain('excluded')
    })

    it('builds eq clause for a boolean value', () => {
      const filter = parsePublicFilter(
        JSON.stringify({ where: [{ field: 'title', op: 'eq', value: false }] })
      )!
      const { clause, bindings } = buildPublicFilterWhereClause(seed, filter)
      // v0.4.0: real column — no CAST needed, binding is 0/1
      expect(clause).toContain('title')
      expect(bindings[0]).toBe(0)
    })

    it('builds neq clause for a boolean value', () => {
      const filter = parsePublicFilter(
        JSON.stringify({ where: [{ field: 'title', op: 'neq', value: true }] })
      )!
      const { clause, bindings } = buildPublicFilterWhereClause(seed, filter)
      expect(bindings[0]).toBe(1)
    })

    it('builds eq clause for a numeric value', () => {
      const filter = parsePublicFilter(
        JSON.stringify({ where: [{ field: 'title', op: 'eq', value: 42 }] })
      )!
      const { clause, bindings } = buildPublicFilterWhereClause(seed, filter)
      // v0.4.0: real column — no CAST needed
      expect(clause).toContain('title')
      expect(bindings[0]).toBe(42)
    })

    it('builds contains clause', () => {
      const filter = parsePublicFilter(
        JSON.stringify({ where: [{ field: 'title', op: 'contains', value: 'foo' }] })
      )!
      const { clause, bindings } = buildPublicFilterWhereClause(seed, filter)
      expect(clause).toContain('LIKE LOWER(?)')
      expect(bindings[0]).toBe('%foo%')
    })

    it('builds not_contains clause', () => {
      const filter = parsePublicFilter(
        JSON.stringify({ where: [{ field: 'title', op: 'not_contains', value: 'bar' }] })
      )!
      const { clause, bindings } = buildPublicFilterWhereClause(seed, filter)
      expect(clause).toContain('NOT LIKE LOWER(?)')
      expect(bindings[0]).toBe('%bar%')
    })

    it('builds starts_with clause', () => {
      const filter = parsePublicFilter(
        JSON.stringify({ where: [{ field: 'title', op: 'starts_with', value: 'abc' }] })
      )!
      const { bindings } = buildPublicFilterWhereClause(seed, filter)
      expect(bindings[0]).toBe('abc%')
    })

    it('builds ends_with clause', () => {
      const filter = parsePublicFilter(
        JSON.stringify({ where: [{ field: 'title', op: 'ends_with', value: 'xyz' }] })
      )!
      const { bindings } = buildPublicFilterWhereClause(seed, filter)
      expect(bindings[0]).toBe('%xyz')
    })

    it('builds is_empty clause', () => {
      const filter = parsePublicFilter(
        JSON.stringify({ where: [{ field: 'title', op: 'is_empty' }] })
      )!
      const { clause, bindings } = buildPublicFilterWhereClause(seed, filter)
      expect(clause).toContain('IS NULL')
      expect(bindings).toHaveLength(0)
    })

    it('builds is_not_empty clause', () => {
      const filter = parsePublicFilter(
        JSON.stringify({ where: [{ field: 'title', op: 'is_not_empty' }] })
      )!
      const { clause, bindings } = buildPublicFilterWhereClause(seed, filter)
      expect(clause).toContain('IS NOT NULL')
      expect(bindings).toHaveLength(0)
    })

    it('builds in clause', () => {
      const filter = parsePublicFilter(
        JSON.stringify({ where: [{ field: 'title', op: 'in', value: ['a', 'b'] }] })
      )!
      const { clause, bindings } = buildPublicFilterWhereClause(seed, filter)
      expect(clause).toContain('IN (?,?)')
      expect(bindings).toEqual(['a', 'b'])
    })

    it('builds not_in clause', () => {
      const filter = parsePublicFilter(
        JSON.stringify({ where: [{ field: 'title', op: 'not_in', value: ['x'] }] })
      )!
      const { clause, bindings } = buildPublicFilterWhereClause(seed, filter)
      expect(clause).toContain('NOT IN (?)')
      expect(bindings).toEqual(['x'])
    })

    it('throws when in value is an empty array', () => {
      const filter = parsePublicFilter(
        JSON.stringify({ where: [{ field: 'title', op: 'in', value: [] }] })
      )!
      expect(() => buildPublicFilterWhereClause(seed, filter)).toThrow('non-empty array')
    })

    it('throws when contains value is not a string', () => {
      const filter = parsePublicFilter(
        JSON.stringify({ where: [{ field: 'title', op: 'contains', value: 123 }] })
      )!
      expect(() => buildPublicFilterWhereClause(seed, filter)).toThrow('requires a string value')
    })

    it('builds has_tag clause on a json field', () => {
      const filter = parsePublicFilter(
        JSON.stringify({ where: [{ field: 'tags', op: 'has_tag', value: 'cms' }] })
      )!
      const { clause, bindings } = buildPublicFilterWhereClause(seed, filter)
      expect(clause).toContain('EXISTS (SELECT 1 FROM json_each(')
      expect(bindings).toContain('cms')
    })

    it('builds has_any_tag clause', () => {
      const filter = parsePublicFilter(
        JSON.stringify({ where: [{ field: 'tags', op: 'has_any_tag', value: ['cms', 'news'] }] })
      )!
      const { clause, bindings } = buildPublicFilterWhereClause(seed, filter)
      expect(clause).toContain('IN (?,?)')
      expect(bindings).toEqual(['cms', 'news'])
    })

    it('builds has_all_tags clause (multiple EXISTS AND-joined)', () => {
      const filter = parsePublicFilter(
        JSON.stringify({ where: [{ field: 'tags', op: 'has_all_tags', value: ['cms', 'news'] }] })
      )!
      const { clause, bindings } = buildPublicFilterWhereClause(seed, filter)
      expect(clause).toContain(' AND ')
      expect(clause.match(/EXISTS/g)?.length).toBe(2)
      expect(bindings).toEqual(['cms', 'news'])
    })

    it('throws when has_tag is used on a non-json field', () => {
      const filter = parsePublicFilter(
        JSON.stringify({ where: [{ field: 'title', op: 'has_tag', value: 'cms' }] })
      )!
      expect(() => buildPublicFilterWhereClause(seed, filter)).toThrow('requires a json field')
    })

    it('throws when has_tag value has no valid string tags', () => {
      const filter = parsePublicFilter(
        JSON.stringify({ where: [{ field: 'tags', op: 'has_any_tag', value: [null, null] }] })
      )!
      expect(() => buildPublicFilterWhereClause(seed, filter)).toThrow('requires tag string values')
    })

    it('builds gt clause for created_at with number', () => {
      const filter = parsePublicFilter(
        JSON.stringify({ where: [{ field: 'created_at', op: 'gt', value: 1700000000 }] })
      )!
      const { clause, bindings } = buildPublicFilterWhereClause(seed, filter)
      expect(clause).toContain('>')
      expect(bindings[0]).toBe(1700000000)
    })

    it('builds gte / lt / lte comparison clauses', () => {
      for (const [op, expected] of [['gte', '>='], ['lt', '<'], ['lte', '<=']] as const) {
        const filter = parsePublicFilter(
          JSON.stringify({ where: [{ field: 'created_at', op, value: 1000 }] })
        )!
        const { clause } = buildPublicFilterWhereClause(seed, filter)
        expect(clause).toContain(expected)
      }
    })

    it('joins multiple conditions with AND by default', () => {
      const filter = parsePublicFilter(
        JSON.stringify({
          where: [
            { field: 'title', op: 'contains', value: 'foo' },
            { field: 'title', op: 'contains', value: 'bar' },
          ],
        })
      )!
      const { clause } = buildPublicFilterWhereClause(seed, filter)
      expect(clause).toContain(' AND ')
    })

    it('joins multiple conditions with OR when logic is OR', () => {
      const filter = parsePublicFilter(
        JSON.stringify({
          logic: 'OR',
          where: [
            { field: 'title', op: 'contains', value: 'foo' },
            { field: 'title', op: 'contains', value: 'bar' },
          ],
        })
      )!
      const { clause } = buildPublicFilterWhereClause(seed, filter)
      expect(clause).toContain(' OR ')
      expect(clause).not.toContain(' AND ')
    })
  })
})
