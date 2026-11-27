// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export type BeechFilterOperator =
  | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'contains' | 'not_contains' | 'starts_with' | 'ends_with'
  | 'is_empty' | 'is_not_empty' | 'in' | 'not_in'
  | 'has_tag' | 'has_any_tag' | 'has_all_tags'

/** Options shared by the browser and the server client. */
export interface BeechClientBaseConfig {
  baseUrl: string
  fetch?: typeof fetch
  headers?: Record<string, string> | Headers
  /**
   * `SCHEMA_FINGERPRINT` exported by `beech types generate`. When set, a response whose `X-Schema-Revision`
   * differs returns a 409 `schema_drift` problem instead of data typed against a stale schema.
   */
  schemaFingerprint?: string
}

/** Browser client: read-only, authenticated with the publishable key (`beech_pk_…`). */
export interface BeechBrowserClientConfig extends BeechClientBaseConfig {
  publishableKey: string
}

/** Server client: reads and writes with one instance, authenticated with the secret key (`beech_sk_…`). Never ship it to a browser. */
export interface BeechServerClientConfig extends BeechClientBaseConfig {
  secretKey: string
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

/**
 * `list()` options. `validate` was removed: it never validated the response, and the `RequestOptions` index
 * signature would accept it silently, so it is typed `never` to make passing it a compile error.
 */
export type ListOptions = RequestOptions & { validate?: never }

/** RFC 9457 Problem Details as returned by the Public API. */
export interface BeechProblem {
  type: string
  title: string
  status: number
  detail: string
  instance?: string
  errors?: { field: string; expected: string; received: string; message: string }[]
}

/**
 * Discriminated result returned by read and write operations.
 *
 * Network failures, HTTP errors (4xx/5xx), server validation errors, and schema drift resolve to
 * `{ data: null, error: BeechProblem }` without throwing.
 *
 * Client-side programmer misuse fails fast instead of returning a `BeechResult`:
 * - Invalid client config (`createBeechBrowserClient` / `createBeechServerClient`) throws synchronously.
 * - Conflicting `.where()` operators on the same field throw `Error` synchronously.
 * - Unknown filter operators throw `TypeError` at serialization time (`buildSearchParams()` / `.build()`
 *   synchronously, or reject `.list()` / `.first()` before any HTTP request is sent).
 */
export type BeechResult<T> =
  | { data: T; error: null; headers?: Headers }
  | { data: null; error: BeechProblem; headers?: Headers }

export type Listable<TRow> = { data: TRow[]; meta: ListMeta }
export type Single<TRow>   = { data: TRow;   meta: { seed: string } }

/** Ergonomic per-field comparator object → compiled to {field,op,value} server-side. */
export type FieldFilter =
  | string | number | boolean | null
  | Partial<Record<BeechFilterOperator, unknown>>

/** Inner query of a relation subquery filter: resolved server-side against the relation's target seed. */
export interface RelationSubquery {
  where: Record<string, FieldFilter>
  logic?: 'AND' | 'OR'
}

export interface ListQuery<TRow> {
  filter?: { [K in keyof TRow]?: FieldFilter } & Record<string, FieldFilter>
  logic?: 'AND' | 'OR'
  sort?: Partial<Record<keyof TRow & string, 'asc' | 'desc'>>
  search?: string
  fields?: (keyof TRow & string)[]
  include?: string[]
  /** Relation alias → subquery. Encoded into the `filter` parameter as a nested `in` value. */
  relationFilters?: Record<string, RelationSubquery>
  page?: number
  limit?: number
  latest?: number
  /** Response language (`?lang`). The API falls back to Accept-Language, then the project default. */
  lang?: string
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

/** Browser Client Content Resource: Strictly Read-Only (no create/update). */
export interface BrowserContentResource<TRow> {
  list(query?: ListQuery<TRow>, options?: RequestOptions): Promise<BeechResult<Listable<TRow>>>
  get(selector: { id: string } | { slug: string }, options?: RequestOptions): Promise<BeechResult<Single<TRow>>>
}

export interface FluentQuery<TRow> {
  /**
   * Merges field filters per operator across chained calls.
   * Throws `Error` synchronously when two calls pass different values for the same operator on the same field.
   * Unknown filter operators throw `TypeError` at query serialization time (`.build()`, `.list()`, `.first()`).
   */
  where(filter: Record<string, FieldFilter>): this
  include(relations: string[]): this
  select(fields: Extract<keyof TRow, string>[]): this
  /**
   * Filters the collection through a declared relation: keeps entries whose `alias` relation
   * points at any entry of the target seed matching `subquery`. Depth 1; the server refuses a
   * relation that `?include=` could not traverse, and refuses an over-broad subquery with 400.
   */
  whereRelation(alias: Extract<keyof TRow, string>, subquery: RelationSubquery): this
  /** Combines every `where()`/`whereRelation()` condition with AND (default) or OR. */
  logic(operator: 'AND' | 'OR'): this
  /** Sorts on one column. The Public API honours a single sort key; a later call replaces the earlier one. */
  orderBy(field: Extract<keyof TRow, string>, direction?: 'asc' | 'desc'): this
  /** Full-text keyword search across the seed's searchable branches. */
  search(term: string): this
  /** Page size. The serializer caps it at the Public API maximum of 100. */
  limit(count: number): this
  /** 1-based page number. */
  page(number: number): this
  /**
   * Requests one language: localized fields come back as plain values in that language, and filters and
   * sort compare in it. An unregistered code falls back to the project default; a malformed one is a 400.
   */
  lang(code: string): this
  first(options?: RequestOptions): Promise<BeechResult<Single<TRow>>>
  list(options?: ListOptions): Promise<BeechResult<Listable<TRow>>>
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
