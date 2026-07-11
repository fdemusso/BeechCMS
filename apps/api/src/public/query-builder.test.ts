// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from 'vitest'
import {
  parsePublicFilter,
  toEngineFilters,
  parsePublicPagination,
  parseLatestCount,
} from './query-builder'
import type { Seed } from '@beechcms/core'

const SEED = {
  slug: 'posts',
  displayNameAlias: 'title',
  branches: [
    { id: 'br_01', alias: 'title', type: 'text' },
    { id: 'br_02', alias: 'count', type: 'number' },
    { id: 'br_03', alias: 'active', type: 'boolean' },
    { id: 'br_04', alias: 'published_at', type: 'date' },
    { id: 'br_05', alias: 'tags', type: 'tags' },
    { id: 'br_06', alias: 'body', type: 'richtext' },
    { id: 'br_07', alias: 'attachment', type: 'file' },
    { id: 'br_08', alias: 'meta', type: 'json' },
    { id: 'br_09', alias: 'ssn', type: 'text', policies: { public: false } },
    { id: 'br_10', alias: 'internal_note', type: 'text', policies: { filter: false } },
  ],
} as unknown as Seed

// ─── parsePublicFilter ────────────────────────────────────────────────────────

describe('parsePublicFilter', () => {
  it('returns null for undefined input', () => {
    expect(parsePublicFilter(undefined)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parsePublicFilter('')).toBeNull()
  })

  it('parses a valid filter with explicit AND logic', () => {
    const raw = JSON.stringify({ logic: 'AND', where: [{ field: 'title', op: 'eq', value: 'Hello' }] })
    const result = parsePublicFilter(raw)!
    expect(result.logic).toBe('AND')
    expect(result.where).toHaveLength(1)
    expect(result.where[0]).toEqual({ field: 'title', op: 'eq', value: 'Hello' })
  })

  it('defaults logic to AND when omitted', () => {
    const raw = JSON.stringify({ where: [{ field: 'title', op: 'contains', value: 'x' }] })
    expect(parsePublicFilter(raw)!.logic).toBe('AND')
  })

  it('accepts case-insensitive logic value', () => {
    const raw = JSON.stringify({ logic: 'or', where: [] })
    expect(parsePublicFilter(raw)!.logic).toBe('OR')
  })

  it('throws for malformed JSON', () => {
    expect(() => parsePublicFilter('{not-json')).toThrow('malformed JSON')
  })

  it('throws when parsed value is not an object', () => {
    expect(() => parsePublicFilter('"a string"')).toThrow('object expected')
  })

  it('throws for an invalid logic value', () => {
    const raw = JSON.stringify({ logic: 'BOTH', where: [] })
    expect(() => parsePublicFilter(raw)).toThrow("'AND' or 'OR'")
  })

  it('throws for an unknown operator in a where condition', () => {
    const raw = JSON.stringify({ where: [{ field: 'title', op: 'like', value: 'x' }] })
    expect(() => parsePublicFilter(raw)).toThrow("unknown operator 'like'")
  })

  it('throws when where is not an array', () => {
    const raw = JSON.stringify({ where: { field: 'title', op: 'eq' } })
    expect(() => parsePublicFilter(raw)).toThrow("'where' must be an array")
  })

  it('filters out null conditions from where (missing field/op)', () => {
    const raw = JSON.stringify({ where: [null, { field: 'title', op: 'eq', value: 'x' }] })
    const result = parsePublicFilter(raw)!
    expect(result.where).toHaveLength(1)
  })

  it('accepts all valid operators without throwing', () => {
    const operators = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'not_contains',
      'starts_with', 'ends_with', 'is_empty', 'is_not_empty', 'in', 'not_in',
      'has_tag', 'has_any_tag', 'has_all_tags']
    for (const op of operators) {
      const raw = JSON.stringify({ where: [{ field: 'title', op, value: 'x' }] })
      expect(() => parsePublicFilter(raw)).not.toThrow()
    }
  })
})

// ─── toEngineFilters ──────────────────────────────────────────────────────────

describe('toEngineFilters', () => {
  it('returns [] for null filter', () => {
    expect(toEngineFilters(SEED, null)).toEqual([])
  })

  it('returns [] when where array is empty', () => {
    expect(toEngineFilters(SEED, { where: [], logic: 'AND' })).toEqual([])
  })

  it('maps text branch to FilterType "text"', () => {
    const result = toEngineFilters(SEED, { where: [{ field: 'title', op: 'eq', value: 'Hi' }], logic: 'AND' })
    expect(result[0].type).toBe('text')
  })

  it('maps number branch to FilterType "number"', () => {
    const result = toEngineFilters(SEED, { where: [{ field: 'count', op: 'gt', value: 5 }], logic: 'AND' })
    expect(result[0].type).toBe('number')
  })

  it('maps boolean branch to FilterType "boolean"', () => {
    const result = toEngineFilters(SEED, { where: [{ field: 'active', op: 'eq', value: true }], logic: 'AND' })
    expect(result[0].type).toBe('boolean')
  })

  it('maps date branch to FilterType "date"', () => {
    const result = toEngineFilters(SEED, { where: [{ field: 'published_at', op: 'gt', value: '2024-01-01' }], logic: 'AND' })
    expect(result[0].type).toBe('date')
  })

  it('maps tags branch to FilterType "tags"', () => {
    const result = toEngineFilters(SEED, { where: [{ field: 'tags', op: 'has_tag', value: 'news' }], logic: 'AND' })
    expect(result[0].type).toBe('tags')
  })

  it('maps richtext branch to FilterType "text"', () => {
    const result = toEngineFilters(SEED, { where: [{ field: 'body', op: 'contains', value: 'x' }], logic: 'AND' })
    expect(result[0].type).toBe('text')
  })

  it('maps file branch to FilterType "text"', () => {
    const result = toEngineFilters(SEED, { where: [{ field: 'attachment', op: 'contains', value: 'url' }], logic: 'AND' })
    expect(result[0].type).toBe('text')
  })

  it('maps json branch to FilterType "json"', () => {
    const result = toEngineFilters(SEED, { where: [{ field: 'meta', op: 'eq', value: '{}' }], logic: 'AND' })
    expect(result[0].type).toBe('json')
  })

  it('maps system columns (id, slug, status) to FilterType "system"', () => {
    for (const field of ['id', 'slug', 'status', 'created_at', 'updated_at']) {
      const result = toEngineFilters(SEED, { where: [{ field, op: 'eq', value: 'x' }], logic: 'AND' })
      expect(result[0].type).toBe('system')
    }
  })

  it('maps unknown fields to FilterType "text"', () => {
    const result = toEngineFilters(SEED, { where: [{ field: 'ghost_field', op: 'eq', value: 'x' }], logic: 'AND' })
    expect(result[0].type).toBe('text')
  })

  it('rejects filtering on a branch with policies.public false', () => {
    const filter = { where: [{ field: 'ssn', op: 'eq' as const, value: '123-45-6789' }], logic: 'AND' as const }
    expect(() => toEngineFilters(SEED, filter)).toThrow("field 'ssn' is not filterable")
  })

  it('rejects filtering on a branch with policies.filter false', () => {
    const filter = { where: [{ field: 'internal_note', op: 'eq' as const, value: 'x' }], logic: 'AND' as const }
    expect(() => toEngineFilters(SEED, filter)).toThrow("field 'internal_note' is not filterable")
  })

  it('produces one FilterGroup per condition', () => {
    const filter = {
      where: [
        { field: 'title', op: 'eq' as const, value: 'A' },
        { field: 'count', op: 'gt' as const, value: 5 },
      ],
      logic: 'AND' as const,
    }
    expect(toEngineFilters(SEED, filter)).toHaveLength(2)
  })

  it('includes column and conditions in each FilterGroup', () => {
    const filter = { where: [{ field: 'title', op: 'contains' as const, value: 'hi' }], logic: 'AND' as const }
    const [group] = toEngineFilters(SEED, filter)
    expect(group.column).toBe('title')
    expect(group.conditions[0].op).toBe('contains')
    expect(group.conditions[0].value).toBe('hi')
  })
})

// ─── parsePublicPagination ────────────────────────────────────────────────────

describe('parsePublicPagination', () => {
  it('defaults to page=1 and limit=25 when input is empty', () => {
    expect(parsePublicPagination({})).toEqual({ page: 1, limit: 25 })
  })

  it('parses valid page and limit values', () => {
    expect(parsePublicPagination({ page: '3', limit: '10' })).toEqual({ page: 3, limit: 10 })
  })

  it('clamps limit to a maximum of 100', () => {
    expect(parsePublicPagination({ limit: '500' }).limit).toBe(100)
  })

  it('uses default for invalid (non-numeric) input', () => {
    expect(parsePublicPagination({ page: 'abc', limit: 'xyz' })).toEqual({ page: 1, limit: 25 })
  })
})

// ─── parseLatestCount ─────────────────────────────────────────────────────────

describe('parseLatestCount', () => {
  it('returns 10 for undefined', () => {
    expect(parseLatestCount(undefined)).toBe(10)
  })

  it('parses a valid integer string', () => {
    expect(parseLatestCount('5')).toBe(5)
  })

  it('clamps to 1 for values below minimum', () => {
    expect(parseLatestCount('0')).toBe(1)
    expect(parseLatestCount('-5')).toBe(1)
  })

  it('clamps to 100 for values above maximum', () => {
    expect(parseLatestCount('200')).toBe(100)
  })

  it('returns 10 for non-numeric input', () => {
    expect(parseLatestCount('abc')).toBe(10)
  })
})
