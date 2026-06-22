// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { BeechFilterOperator, ListQuery } from './types.js'

const OPERATORS = new Set<BeechFilterOperator>([
  'eq','neq','gt','gte','lt','lte','contains','not_contains','starts_with',
  'ends_with','is_empty','is_not_empty','in','not_in','has_tag','has_any_tag','has_all_tags',
])

/** { status:'published', price:{ gt:10 } } → { where:[{field,op,value}], logic } */
export function buildSearchParams(query: ListQuery<Record<string, unknown>> = {}): URLSearchParams {
  const params = new URLSearchParams()

  if (query.filter) {
    const where: { field: string; op: BeechFilterOperator; value?: unknown }[] = []
    for (const [field, raw] of Object.entries(query.filter)) {
      if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
        for (const [op, value] of Object.entries(raw)) {
          if (!OPERATORS.has(op as BeechFilterOperator)) {
            throw new TypeError(`Invalid filter operator '${op}' on field '${field}'`)
          }
          where.push({ field, op: op as BeechFilterOperator, value })
        }
      } else {
        where.push({ field, op: 'eq', value: raw })
      }
    }
    if (where.length) {
      params.set('filter', JSON.stringify({ logic: query.logic ?? 'AND', where }))
    }
  }

  if (query.sort) {
    const [col, dir] = Object.entries(query.sort)[0] ?? []
    if (col) { params.set('orderBy', col); params.set('orderDir', dir ?? 'desc') }
  }
  if (query.search) params.set('search', query.search)
  if (query.fields?.length) params.set('fields', query.fields.join(','))
  if (typeof query.latest === 'number') params.set('latest', String(query.latest))
  if (typeof query.page === 'number') params.set('page', String(query.page))
  if (typeof query.limit === 'number') params.set('limit', String(Math.min(query.limit, 100)))

  return params
}
