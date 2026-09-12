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

/** Mirrors the DOM `RequestCache` union without depending on the `dom` lib. */
export type FetchCacheMode =
  | 'default' | 'no-store' | 'reload' | 'no-cache' | 'force-cache' | 'only-if-cached'

export interface RequestOptions {
  headers?: Record<string, string> | Headers
  signal?: AbortSignal | null
  cache?: FetchCacheMode
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
  | { data: T; error: null; headers?: Headers }
  | { data: null; error: BeechProblem; headers?: Headers }

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
  include?: string[]
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

/** Stub for the auto-generated registry types */
export interface SeedRegistryTypes {
  [key: string]: Record<string, unknown>
}

/** Stub for the auto-generated schema fingerprint */
export const SCHEMA_FINGERPRINT = ''

/** Browser Client Content Resource: Strictly Read-Only (no create/update). */
export interface BrowserContentResource<TRow> {
  list(query?: ListQuery<TRow>, options?: RequestOptions): Promise<BeechResult<Listable<TRow>>>
  get(selector: { id: string } | { slug: string }, options?: RequestOptions): Promise<BeechResult<Single<TRow>>>
}

export interface FluentQuery<TRow> {
  where(filter: Record<string, FieldFilter>): this
  include(relations: string[]): this
  select(fields: Extract<keyof TRow, string>[]): this
  first(options?: RequestOptions): Promise<BeechResult<Single<TRow>>>
  list(options?: RequestOptions & { validate?: boolean }): Promise<BeechResult<Listable<TRow>>>
}

/** Browser Client Interface. */
export interface BeechBrowserClient<TRegistry = SeedRegistryTypes> {
  collection<K extends keyof TRegistry & string>(seed: K): FluentQuery<TRegistry[K]>
}

/** Server Client Content Resource: Content mutation and query operations (create, update, list, get). */
export interface ServerContentResource<TRow> {
  list(query?: ListQuery<TRow>, options?: RequestOptions): Promise<BeechResult<Listable<TRow>>>
  get(selector: { id: string } | { slug: string }, options?: RequestOptions): Promise<BeechResult<Single<TRow>>>
  create(input: Partial<TRow>, options?: RequestOptions): Promise<BeechResult<Single<TRow>>>
  update(id: string, input: Partial<TRow>, options?: RequestOptions): Promise<BeechResult<Single<TRow>>>
}

/** Server Client Interface. */
export interface BeechServerClient<TRegistry = SeedRegistryTypes> {
  collection<K extends keyof TRegistry & string>(seed: K): FluentQuery<TRegistry[K]> & {
    create(input: Partial<TRegistry[K]>, options?: RequestOptions): Promise<BeechResult<Single<TRegistry[K]>>>
    update(id: string, input: Partial<TRegistry[K]>, options?: RequestOptions): Promise<BeechResult<Single<TRegistry[K]>>>
  }
}
