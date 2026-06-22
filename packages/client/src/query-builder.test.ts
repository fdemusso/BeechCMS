// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { buildSearchParams } from './query-builder.js'

describe('buildSearchParams', () => {
  it('empty query returns empty params', () => {
    const p = buildSearchParams()
    expect([...p].length).toBe(0)
  })

  it('shorthand equality filter', () => {
    const p = buildSearchParams({ filter: { status: 'published' } })
    const filter = JSON.parse(p.get('filter')!)
    expect(filter).toEqual({ logic: 'AND', where: [{ field: 'status', op: 'eq', value: 'published' }] })
  })

  it('operator object filter', () => {
    const p = buildSearchParams({ filter: { price: { gt: 10 } } })
    const filter = JSON.parse(p.get('filter')!)
    expect(filter.where[0]).toEqual({ field: 'price', op: 'gt', value: 10 })
  })

  it('multiple filters with OR logic', () => {
    const p = buildSearchParams({ filter: { a: 'x', b: 'y' }, logic: 'OR' })
    const filter = JSON.parse(p.get('filter')!)
    expect(filter.logic).toBe('OR')
    expect(filter.where).toHaveLength(2)
  })

  it('throws on invalid operator', () => {
    expect(() => buildSearchParams({ filter: { x: { invalid_op: 1 } as never } })).toThrow(TypeError)
  })

  it('sort maps to orderBy/orderDir', () => {
    const p = buildSearchParams({ sort: { created_at: 'asc' } })
    expect(p.get('orderBy')).toBe('created_at')
    expect(p.get('orderDir')).toBe('asc')
  })

  it('limit is clamped to 100', () => {
    const p = buildSearchParams({ limit: 200 })
    expect(p.get('limit')).toBe('100')
  })

  it('fields joined by comma', () => {
    const p = buildSearchParams({ fields: ['id', 'title', 'slug'] })
    expect(p.get('fields')).toBe('id,title,slug')
  })

  it('search param forwarded', () => {
    const p = buildSearchParams({ search: 'hello' })
    expect(p.get('search')).toBe('hello')
  })

  it('latest param forwarded', () => {
    const p = buildSearchParams({ latest: 5 })
    expect(p.get('latest')).toBe('5')
  })

  it('null filter value uses eq shorthand', () => {
    const p = buildSearchParams({ filter: { deleted: null } })
    const filter = JSON.parse(p.get('filter')!)
    expect(filter.where[0]).toEqual({ field: 'deleted', op: 'eq', value: null })
  })

  it('is_empty operator (no value)', () => {
    const p = buildSearchParams({ filter: { bio: { is_empty: undefined } } })
    const filter = JSON.parse(p.get('filter')!)
    expect(filter.where[0].op).toBe('is_empty')
  })
})
