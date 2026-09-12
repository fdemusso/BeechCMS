// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi } from 'vitest'
import { buildSearchParams, FluentQueryBuilder } from './query-builder.js'

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

  it('include parameter joined by comma', () => {
    const p = buildSearchParams({ include: ['author', 'tags'] })
    expect(p.get('include')).toBe('author,tags')
  })

  it('logic OR is forwarded into the filter payload', () => {
    const p = buildSearchParams({ filter: { status: 'draft' }, logic: 'OR' })
    const filter = JSON.parse(p.get('filter')!)
    expect(filter.logic).toBe('OR')
  })

  it('operator filter object produces one where entry per operator', () => {
    const p = buildSearchParams({ filter: { price: { gt: 10, lte: 50 } } })
    const filter = JSON.parse(p.get('filter')!)
    expect(filter.where).toEqual([
      { field: 'price', op: 'gt', value: 10 },
      { field: 'price', op: 'lte', value: 50 },
    ])
  })

  it('unknown operator throws TypeError', () => {
    expect(() => buildSearchParams({ filter: { price: { bogus: 1 } as never } })).toThrow(TypeError)
  })

  it('sort with no direction defaults orderDir to desc', () => {
    const p = buildSearchParams({ sort: { title: undefined } })
    expect(p.get('orderBy')).toBe('title')
    expect(p.get('orderDir')).toBe('desc')
  })

  it('sort with explicit direction sets both params', () => {
    const p = buildSearchParams({ sort: { title: 'asc' } })
    expect(p.get('orderBy')).toBe('title')
    expect(p.get('orderDir')).toBe('asc')
  })

  it('search sets the search param', () => {
    const p = buildSearchParams({ search: 'hello' })
    expect(p.get('search')).toBe('hello')
  })

  it('fields sets a comma-joined fields param', () => {
    const p = buildSearchParams({ fields: ['id', 'title'] })
    expect(p.get('fields')).toBe('id,title')
  })

  it('latest sets the latest param', () => {
    const p = buildSearchParams({ latest: 5 })
    expect(p.get('latest')).toBe('5')
  })

  it('page sets the page param', () => {
    const p = buildSearchParams({ page: 2 })
    expect(p.get('page')).toBe('2')
  })

  it('limit is capped at 100', () => {
    const p = buildSearchParams({ limit: 500 })
    expect(p.get('limit')).toBe('100')
  })

  it('limit under the cap passes through unchanged', () => {
    const p = buildSearchParams({ limit: 20 })
    expect(p.get('limit')).toBe('20')
  })
})

describe('FluentQueryBuilder', () => {
  it('builds query state and calls executor', async () => {
    const listSpy = vi.fn().mockResolvedValue({ data: { data: [], meta: { seed: 'posts' } }, error: null })
    const builder = new FluentQueryBuilder<{ id: string; title: string }>({
      first: vi.fn(),
      list: listSpy
    })

    const result = await builder
      .where({ title: { starts_with: 'Hello' } })
      .include(['author'])
      .select(['id', 'title'])
      .list({ cache: 'no-store' })

    expect(result.error).toBeNull()
    expect(listSpy).toHaveBeenCalledWith(
      {
        filter: { title: { starts_with: 'Hello' } },
        include: ['author'],
        fields: ['id', 'title']
      },
      { cache: 'no-store' }
    )
  })

  it('first() delegates to the executor with the accumulated query', async () => {
    const firstSpy = vi.fn().mockResolvedValue({ data: { data: { id: '1', title: 'A' }, meta: { seed: 'posts' } }, error: null })
    const builder = new FluentQueryBuilder<{ id: string; title: string }>({
      first: firstSpy,
      list: vi.fn(),
    })

    const result = await builder.where({ id: '1' }).first({ cache: 'no-store' })

    expect(result.error).toBeNull()
    expect(firstSpy).toHaveBeenCalledWith({ filter: { id: '1' } }, { cache: 'no-store' })
  })

  it('whereRelation() emits the nested filter JSON on the relation alias', async () => {
    const listSpy = vi.fn().mockResolvedValue({ data: { data: [], meta: { seed: 'posts' } }, error: null })
    const builder = new FluentQueryBuilder<{ id: string; category_id: string }>({
      first: vi.fn(),
      list: listSpy,
    })

    builder.whereRelation('category_id', { where: { name: 'Tech' } })
    const params = builder.build()
    const filter = JSON.parse(params.get('filter')!)

    expect(filter).toEqual({
      logic: 'AND',
      where: [{ field: 'category_id', op: 'in', value: { logic: 'AND', where: [{ field: 'name', op: 'eq', value: 'Tech' }] } }],
    })
  })

  it('whereRelation() composes with where() in one where array', () => {
    const builder = new FluentQueryBuilder<{ id: string; status: string; category_id: string }>({
      first: vi.fn(),
      list: vi.fn(),
    })

    builder.where({ status: 'published' }).whereRelation('category_id', { where: { name: 'Tech' } })
    const filter = JSON.parse(builder.build().get('filter')!)

    expect(filter.where).toEqual([
      { field: 'status', op: 'eq', value: 'published' },
      { field: 'category_id', op: 'in', value: { logic: 'AND', where: [{ field: 'name', op: 'eq', value: 'Tech' }] } },
    ])
  })

  it('logic: OR on the subquery reaches the inner encoded object', () => {
    const builder = new FluentQueryBuilder<{ id: string; category_id: string }>({
      first: vi.fn(),
      list: vi.fn(),
    })

    builder.whereRelation('category_id', { where: { name: 'Tech' }, logic: 'OR' })
    const filter = JSON.parse(builder.build().get('filter')!)

    expect(filter.where[0].value.logic).toBe('OR')
  })

  it('an invalid operator inside the subquery throws TypeError', () => {
    const builder = new FluentQueryBuilder<{ id: string; category_id: string }>({
      first: vi.fn(),
      list: vi.fn(),
    })

    builder.whereRelation('category_id', { where: { name: { bogus: 1 } as never } })

    expect(() => builder.build()).toThrow(TypeError)
  })

  it('a chain with only whereRelation() still emits the filter parameter', () => {
    const builder = new FluentQueryBuilder<{ id: string; category_id: string }>({
      first: vi.fn(),
      list: vi.fn(),
    })

    builder.whereRelation('category_id', { where: { name: 'Tech' } })

    expect(builder.build().get('filter')).not.toBeNull()
  })

  it('build() returns URLSearchParams matching the accumulated query', () => {
    const builder = new FluentQueryBuilder<{ id: string; title: string }>({
      first: vi.fn(),
      list: vi.fn()
    })
    
    builder.where({ id: '123' }).include(['author'])
    
    const params = builder.build()
    expect(params.get('include')).toBe('author')
    const filter = JSON.parse(params.get('filter')!)
    expect(filter.where[0]).toEqual({ field: 'id', op: 'eq', value: '123' })
  })
})
