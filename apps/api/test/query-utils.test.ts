import { describe, expect, it } from 'vitest'
import { getSeed } from '@beech/core'
import {
  buildOrderClause,
  buildWhereClause,
  cleanStr,
  parsePositiveInt,
  parseQueryFilters,
  rowToEntry,
  safeParseJson,
} from '../src/shared/query-utils'

describe('shared/query-utils', () => {
  it('cleanStr e parsePositiveInt gestiscono fallback correttamente', () => {
    expect(cleanStr('  hello  ')).toBe('hello')
    expect(cleanStr('   ')).toBeNull()
    expect(parsePositiveInt('12', 1)).toBe(12)
    expect(parsePositiveInt('0', 5)).toBe(5)
    expect(parsePositiveInt(undefined, 7)).toBe(7)
  })

  it('safeParseJson ritorna oggetto vuoto con JSON invalido', () => {
    expect(safeParseJson('{"ok":1}')).toEqual({ ok: 1 })
    expect(safeParseJson('invalid-json')).toEqual({})
    expect(safeParseJson('["a"]')).toEqual({})
  })

  it('parseQueryFilters parsea gruppi validi e ignora input malformato', () => {
    const malformed = parseQueryFilters('{not-json')
    expect(malformed).toEqual([])

    const filters = parseQueryFilters(
      JSON.stringify({
        group1: {
          columnId: 'title',
          type: 'text',
          conditions: [{ op: 'contains', value: 'Beech' }],
        },
      })
    )

    expect(filters).toHaveLength(1)
    expect(filters[0].columnId).toBe('title')
    expect(filters[0].conditions[0].op).toBe('contains')
  })

  it('buildWhereClause costruisce SQL con search e filtri seed-aware', () => {
    const seed = getSeed('articoli')
    if (!seed) {
      throw new Error('Seed articoli non trovato')
    }

    const filters = parseQueryFilters(
      JSON.stringify({
        titleContains: {
          columnId: 'title',
          type: 'text',
          conditions: [{ op: 'contains', value: 'guida' }],
        },
      })
    )

    const { whereSql, whereBindings } = buildWhereClause('articoli', 'cms', filters, seed)
    expect(whereSql).toContain('schema_slug = ?')
    expect(whereSql).toContain('slug LIKE ?')
    expect(whereSql).toContain('json_extract')
    // Per-column search: slug + status + one binding per searchable branch (7 in articoli)
    const searchableBranchCount = seed.branches.length // all default to search: true
    const expectedSearchBindings = 2 + searchableBranchCount // slug, status, + each branch
    expect(whereBindings[0]).toBe('articoli')
    // All intermediate bindings should be '%cms%'
    for (let i = 1; i <= expectedSearchBindings; i++) {
      expect(whereBindings[i]).toBe('%cms%')
    }
    // Last binding is the filter value
    expect(whereBindings[whereBindings.length - 1]).toBe('%guida%')
  })

  it('buildOrderClause usa fallback sicuro e ordinamento per alias seed', () => {
    const seed = getSeed('prodotti')
    if (!seed) {
      throw new Error('Seed prodotti non trovato')
    }

    const fallback = buildOrderClause('', 'asc', seed)
    expect(fallback).toBe('ORDER BY created_at DESC')

    const byPrice = buildOrderClause('price', 'asc', seed)
    expect(byPrice).toContain('ORDER BY CAST(')
    expect(byPrice).toContain('AS REAL) ASC')
  })

  it('rowToEntry non va in crash con JSON corrotto', () => {
    const entry = rowToEntry({
      id: 'row-1',
      schema_slug: 'articoli',
      slug: null,
      status: 'draft',
      data: 'not-json',
      created_at: 1,
      updated_at: 2,
    })
    expect(entry.id).toBe('row-1')
    expect(entry.data).toEqual({})
  })
})

