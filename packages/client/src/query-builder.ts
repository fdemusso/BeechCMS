// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { BeechFilterOperator, ListQuery, FluentQuery, FieldFilter, RequestOptions, BeechResult, Single, Listable, RelationSubquery } from './types.js'

const OPERATORS = new Set<BeechFilterOperator>([
  'eq','neq','gt','gte','lt','lte','contains','not_contains','starts_with',
  'ends_with','is_empty','is_not_empty','in','not_in','has_tag','has_any_tag','has_all_tags',
])

export type QueryExecutor<TRow> = {
  first(query: ListQuery<TRow>, options?: RequestOptions): Promise<BeechResult<Single<TRow>>>
  list(query: ListQuery<TRow>, options?: RequestOptions & { validate?: boolean }): Promise<BeechResult<Listable<TRow>>>
}

export class FluentQueryBuilder<TRow> implements FluentQuery<TRow> {
  private query: ListQuery<TRow> = {}

  constructor(private executor: QueryExecutor<TRow>) {}

  where(filter: Record<string, FieldFilter>): this {
    this.query.filter = { ...this.query.filter, ...filter } as ListQuery<TRow>['filter']
    return this
  }

  include(relations: string[]): this {
    this.query.include = relations
    return this
  }

  select(fields: Extract<keyof TRow, string>[]): this {
    this.query.fields = fields
    return this
  }

  whereRelation(alias: Extract<keyof TRow, string>, subquery: RelationSubquery): this {
    this.query.relationFilters = { ...this.query.relationFilters, [alias]: subquery }
    return this
  }

  first(options?: RequestOptions): Promise<BeechResult<Single<TRow>>> {
    return this.executor.first(this.query, options)
  }

  list(options?: RequestOptions & { validate?: boolean }): Promise<BeechResult<Listable<TRow>>> {
    return this.executor.list(this.query, options)
  }

  build(): URLSearchParams {
    return buildSearchParams(this.query as ListQuery<Record<string, unknown>>)
  }
}

type WireCondition = { field: string; op: BeechFilterOperator; value?: unknown }

function toWireConditions(filter: Record<string, FieldFilter>): WireCondition[] {
  const where: WireCondition[] = []
  for (const [field, raw] of Object.entries(filter)) {
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
  return where
}

/** { status:'published', price:{ gt:10 } } → { where:[{field,op,value}], logic } */
export function buildSearchParams(query: ListQuery<Record<string, unknown>> = {}): URLSearchParams {
  const params = new URLSearchParams()

  const where: WireCondition[] = query.filter ? toWireConditions(query.filter) : []

  for (const [alias, subquery] of Object.entries(query.relationFilters ?? {})) {
    where.push({
      field: alias,
      op: 'in',
      value: { logic: subquery.logic ?? 'AND', where: toWireConditions(subquery.where) },
    })
  }

  if (where.length) {
    params.set('filter', JSON.stringify({ logic: query.logic ?? 'AND', where }))
  }

  if (query.sort) {
    const [col, dir] = Object.entries(query.sort)[0] ?? []
    if (col) { params.set('orderBy', col); params.set('orderDir', dir ?? 'desc') }
  }
  if (query.search) params.set('search', query.search)
  if (query.fields?.length) params.set('fields', query.fields.join(','))
  if (query.include?.length) params.set('include', query.include.join(','))
  if (typeof query.latest === 'number') params.set('latest', String(query.latest))
  if (typeof query.page === 'number') params.set('page', String(query.page))
  if (typeof query.limit === 'number') params.set('limit', String(Math.min(query.limit, 100)))

  return params
}
