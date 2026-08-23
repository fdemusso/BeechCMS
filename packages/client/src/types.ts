// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export type BeechFilterOperator =
  | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'contains' | 'not_contains' | 'starts_with' | 'ends_with'
  | 'is_empty' | 'is_not_empty' | 'in' | 'not_in'
  | 'has_tag' | 'has_any_tag' | 'has_all_tags'

export interface BeechClientConfig {
  baseUrl: string
  apiKey: string
  fetch?: typeof fetch
  headers?: Record<string, string> | Headers
}

export interface RequestOptions {
  headers?: Record<string, string> | Headers
  signal?: AbortSignal | null
  cache?: RequestCache
  next?: {
    revalidate?: number | false
    tags?: string[]
  }
  [key: string]: unknown
}

/** RFC 9457 Problem Details as returned by the Public API. */
export interface BeechProblem {
  type: string
  title: string
  status: number
  detail: string
  instance?: string
  errors?: { field: string; expected: string; received: string; message: string }[]
}

/** Discriminated result — the client NEVER throws on HTTP/validation errors. */
export type BeechResult<T> =
  | { data: T; error: null }
  | { data: null; error: BeechProblem }

export type Listable<TRow> = { data: TRow[]; meta: ListMeta }
export type Single<TRow>   = { data: TRow;   meta: { seed: string } }

/** Ergonomic per-field comparator object → compiled to {field,op,value} server-side. */
export type FieldFilter =
  | string | number | boolean | null
  | Partial<Record<BeechFilterOperator, unknown>>

export interface ListQuery<TRow> {
  filter?: { [K in keyof TRow]?: FieldFilter } & Record<string, FieldFilter>
  logic?: 'AND' | 'OR'
  sort?: Partial<Record<keyof TRow & string, 'asc' | 'desc'>>
  search?: string
  fields?: (keyof TRow & string)[]
  page?: number
  limit?: number
  latest?: number
}

export interface ListMeta {
  total: number
  page?: number
  limit?: number
  returned: number
  seed: string
}

/** Browser Client Content Resource: Strictly Read-Only (no create/update). */
export interface BrowserContentResource<TRow> {
  list(query?: ListQuery<TRow>, options?: RequestOptions): Promise<BeechResult<Listable<TRow>>>
  get(selector: { id: string } | { slug: string }, options?: RequestOptions): Promise<BeechResult<Single<TRow>>>
}

/** Browser Client Interface. */
export interface BeechBrowserClient<TRegistry = Record<string, unknown>> {
  content<K extends keyof TRegistry & string>(seed: K): BrowserContentResource<TRegistry[K]>
}

/** Server Client Content Resource: Full CRUD operations. */
export interface ServerContentResource<TRow> {
  list(query?: ListQuery<TRow>, options?: RequestOptions): Promise<BeechResult<Listable<TRow>>>
  get(selector: { id: string } | { slug: string }, options?: RequestOptions): Promise<BeechResult<Single<TRow>>>
  create(input: Partial<TRow>, options?: RequestOptions): Promise<BeechResult<Single<TRow>>>
  update(id: string, input: Partial<TRow>, options?: RequestOptions): Promise<BeechResult<Single<TRow>>>
}

/** Server Client Interface. */
export interface BeechServerClient<TRegistry = Record<string, unknown>> {
  content<K extends keyof TRegistry & string>(seed: K): ServerContentResource<TRegistry[K]>
}
