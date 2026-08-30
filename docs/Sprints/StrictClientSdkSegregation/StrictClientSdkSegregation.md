# Sprint Plan: `@beechcms/client` Strict-by-Design Submodule Segregation

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

The current `@beechcms/client` package provides a single universal entrypoint (`import { createBeechClient } from '@beechcms/client'`) containing both read (`list`, `get`) and mutation (`create`, `update`) capabilities. While convenient for universal isomorphic environments, this architecture poses severe security and bundling hazards:
1. **Frontend Credential & Mutation Leakage:** In client-side single-page applications and browser bundles, shipping mutation methods (`POST /api/v1/public/:seed/add`, `PUT /api/v1/public/:seed/edit/:id`) alongside read methods creates the risk of accidental exposure of privileged write API keys, server secrets, and mutation logic.
2. **Suboptimal Bundle Tree-Shaking:** Importing a single universal client pulls unnecessary HTTP handling logic and mutation signatures into frontend bundles that only require read-only access.
3. **Runtime & Framework Agnosticism:** Modern server runtimes (Next.js App Router, Cloudflare Workers, Astro, Remix, Node.js) require native request options pass-through (such as `next: { revalidate, tags }`, custom caching headers, and `AbortSignal`), which must be cleanly supported without polluting browser-only consumers.

### Architectural Rationale & Invariants:
1. **Physical Entrypoint Segregation (Strict-by-Design):** This sprint physically separates the SDK into dedicated subpath exports:
   - `@beechcms/client/browser`: Read-only HTTP client (`list`, `get`). Mutation methods do not exist in its interface or compiled JavaScript.
   - `@beechcms/client/server`: Full CRUD HTTP client (`list`, `get`, `create`, `update`) with custom `fetch` injection and `RequestOptions` pass-through.
   - `@beechcms/client`: Pure types-only and query serialization utility (`buildSearchParams`). Exposes zero runtime client factory.
   - `@beechcms/client/webhooks`: Isomorphic cryptographic HMAC-SHA256 signature verification and event deserialization.
2. **Deterministic Result Pattern & RFC 9457 Problem Details:** All HTTP failures and low-level network interruptions are caught and normalized into standard `BeechResult<T>` discriminated unions (`{ data: T; error: null } | { data: null; error: BeechProblem }`). Network errors return `status: 0`. The client never throws unhandled runtime exceptions during network calls.
3. **Fail-Fast Configuration Validation:** Immediate synchronous validation of `baseUrl` and `apiKey` during client initialization ensures clear error feedback before any network requests are dispatched.
4. **Zero Workspace Side-Effects:** `@beechcms/client` is a leaf package. It never bypasses the Botanical Engine (`@beechcms/core`), executes zero direct D1 queries, and introduces zero dependencies on internal API slices (`apps/api`) or the admin dashboard (`apps/dashboard`).

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

1. **Current Package Exports (`packages/client/package.json`):**
   ```json
   "exports": {
     ".": {
       "import": "./dist/index.js",
       "types": "./dist/index.d.ts"
     },
     "./webhooks": {
       "import": "./dist/webhooks/index.js",
       "types": "./dist/webhooks/index.d.ts"
     }
   }
   ```
2. **Current Root Barrel (`packages/client/src/index.ts`):**
   Re-exports `createBeechClient`, `ContentResource`, `buildSearchParams`, types, and webhook verification utilities from a single root barrel.
3. **Current Client Implementation (`packages/client/src/client.ts`):**
   Exposes a single `ContentResource<TRow>` interface containing `list`, `get`, `create`, and `update`, instantiated by `createBeechClient`.
4. **Current HTTP Dispatcher (`packages/client/src/http.ts`):**
   Uses `fetch` with `X-API-Key` and returns `BeechResult<T>`, but lacks fine-grained `RequestOptions` pass-through (e.g. Next.js cache/revalidation tags, `AbortSignal`, custom headers) and strict initialization validation.
5. **Impact Analysis (`graphify affected`):**
   - `createBeechClient`: Only consumed internally within `packages/client/src/client.test.ts` and re-exported by `packages/client/src/index.ts`.
   - `packages/forms-react`: Declares `@beechcms/client` in `package.json` dependencies but contains zero source code imports from it.
   - `apps/api` and `apps/dashboard`: Zero imports from `@beechcms/client`.
   - Removing the runtime `createBeechClient` factory from the root `@beechcms/client` export is completely safe across the monorepo and enforces intentional, secure imports.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

1. `packages/client/package.json` — MODIFIED:
   - Configure subpath exports for `.`, `./browser`, `./server`, and `./webhooks`.
   - Remove unused runtime dependency on `@beechcms/core` (`dependencies: {}`).
2. `packages/client/src/types.ts` — MODIFIED:
   - Define `RequestOptions` for custom headers, signals, cache flags, and extended fetch options.
   - Define `BrowserContentResource<TRow>` (read-only: `list`, `get`).
   - Define `ServerContentResource<TRow>` (full CRUD: `list`, `get`, `create`, `update`).
   - Define `BeechBrowserClient<TRegistry>` and `BeechServerClient<TRegistry>`.
   - Maintain `BeechClientConfig`, `BeechProblem`, `BeechResult<T>`, `ListQuery<TRow>`, `ListMeta`, `Listable<TRow>`, `Single<TRow>`, `FieldFilter`, and `BeechFilterOperator`.
3. `packages/client/src/http.ts` — MODIFIED:
   - Export `validateClientConfig(config: BeechClientConfig): void` throwing descriptive errors for missing/invalid `baseUrl` or `apiKey`.
   - Enhance `request<T>` with URL normalization (trailing slash trimming), header merging, `RequestOptions` forwarding, RFC 9457 problem detail normalization, and network error handling (`status: 0`).
4. `packages/client/src/browser/client.ts` — NEW:
   - Implement `createBeechBrowserClient<TRegistry>` (and alias `createBeechClient`) returning `BeechBrowserClient<TRegistry>` exposing only read-only methods (`list`, `get`).
5. `packages/client/src/browser/index.ts` — NEW:
   - Entrypoint for `@beechcms/client/browser` exporting `createBeechClient`, `createBeechBrowserClient`, `BeechBrowserClient`, and `BrowserContentResource`.
6. `packages/client/src/browser/browser-client.test.ts` — NEW:
   - Unit tests for browser client: `list`, `get`, URL normalization, validation errors on invalid config, network error resilience, RFC 9457 error handling, and verification that mutation methods are absent.
7. `packages/client/src/server/client.ts` — NEW:
   - Implement `createBeechServerClient<TRegistry>` (and alias `createBeechClient`) returning `BeechServerClient<TRegistry>` exposing full CRUD (`list`, `get`, `create`, `update`) with `RequestOptions` support.
8. `packages/client/src/server/index.ts` — NEW:
   - Entrypoint for `@beechcms/client/server` exporting `createBeechClient`, `createBeechServerClient`, `BeechServerClient`, and `ServerContentResource`.
9. `packages/client/src/server/server-client.test.ts` — NEW:
   - Unit tests for server client: `list`, `get`, `create`, `update`, custom `fetch` injection, `RequestOptions` / Next.js tags forwarding, config validation, and problem details parsing.
10. `packages/client/src/index.ts` — MODIFIED:
    - Root entrypoint: Pure contracts and types export (`BeechClientConfig`, `BeechBrowserClient`, `BeechServerClient`, `BrowserContentResource`, `ServerContentResource`, `BeechResult`, `BeechProblem`, `ListQuery`, `ListMeta`, `Listable`, `Single`, `FieldFilter`, `BeechFilterOperator`, `RequestOptions`) and query serialization utility `buildSearchParams`. Re-export webhook utilities. Zero runtime client factories.
11. `packages/client/src/client.ts` & `packages/client/src/client.test.ts` — REMOVED:
    - Deleted in favor of `src/browser/` and `src/server/` dedicated modules.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### 4.1 — `packages/client/package.json`

Update package exports and dependencies:

```json
{
  "name": "@beechcms/client",
  "version": "0.6.0-preview.3",
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": [
    "dist"
  ],
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./browser": {
      "import": "./dist/browser/index.js",
      "types": "./dist/browser/index.d.ts"
    },
    "./server": {
      "import": "./dist/server/index.js",
      "types": "./dist/server/index.d.ts"
    },
    "./webhooks": {
      "import": "./dist/webhooks/index.js",
      "types": "./dist/webhooks/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc -w --preserveWatchOutput",
    "lint": "eslint .",
    "type-check": "tsc --noEmit",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage"
  },
  "dependencies": {},
  "devDependencies": {
    "@types/node": "^24.10.1",
    "@vitest/coverage-v8": "^4.1.0",
    "typescript": "^5.9.3",
    "vitest": "^4.1.0"
  },
  "license": "MIT"
}
```

---

### 4.2 — `packages/client/src/types.ts`

Define shared contracts, client interfaces, and configuration types:

```ts
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
```

---

### 4.3 — `packages/client/src/http.ts`

Standardized HTTP executor with RFC 9457 problem normalization and input validation:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { BeechClientConfig, BeechProblem, BeechResult, RequestOptions } from './types.js'

export function validateClientConfig(config: BeechClientConfig): void {
  if (!config || typeof config !== 'object') {
    throw new TypeError('Configuration object is required')
  }
  if (!config.baseUrl || typeof config.baseUrl !== 'string' || !config.baseUrl.trim()) {
    throw new Error('baseUrl is required and must be a non-empty string')
  }
  if (!config.apiKey || typeof config.apiKey !== 'string' || !config.apiKey.trim()) {
    throw new Error('apiKey is required and must be a non-empty string')
  }
}

export async function request<T>(
  cfg: BeechClientConfig,
  method: string,
  path: string,
  opts: { params?: URLSearchParams; body?: unknown; options?: RequestOptions } = {},
): Promise<BeechResult<T>> {
  const doFetch = cfg.fetch ?? fetch
  const base = cfg.baseUrl.replace(/\/+$/, '')
  const qs = opts.params && opts.params.size ? `?${opts.params}` : ''
  const url = `${base}/api/v1/public${path}${qs}`

  const headers = new Headers(cfg.headers)
  headers.set('X-API-Key', cfg.apiKey)

  if (opts.body !== undefined) {
    headers.set('Content-Type', 'application/json')
  }

  if (opts.options?.headers) {
    const extraHeaders = new Headers(opts.options.headers)
    extraHeaders.forEach((val, key) => headers.set(key, val))
  }

  const { headers: _, ...forwardOptions } = opts.options ?? {}

  let res: Response
  try {
    res = await doFetch(url, {
      ...forwardOptions,
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    } as RequestInit)
  } catch (e) {
    return { data: null, error: networkProblem(e) }
  }

  const ct = res.headers.get('Content-Type') ?? ''
  const payload = ct.includes('json') ? await res.json().catch(() => null) : null

  if (!res.ok) {
    return { data: null, error: normalizeProblem(res.status, payload, res.statusText) }
  }

  return { data: payload as T, error: null }
}

function networkProblem(e: unknown): BeechProblem {
  return {
    type: 'about:blank',
    title: 'Network Error',
    status: 0,
    detail: e instanceof Error ? e.message : 'fetch failed',
  }
}

function normalizeProblem(status: number, payload: unknown, statusText?: string): BeechProblem {
  if (payload && typeof payload === 'object') {
    const p = payload as Record<string, unknown>
    return {
      type: typeof p.type === 'string' ? p.type : 'about:blank',
      title: typeof p.title === 'string' ? p.title : (statusText || 'HTTP Error'),
      status: typeof p.status === 'number' ? p.status : status,
      detail: typeof p.detail === 'string' ? p.detail : `Request failed with status ${status}`,
      ...(typeof p.instance === 'string' ? { instance: p.instance } : {}),
      ...(Array.isArray(p.errors) ? { errors: p.errors as BeechProblem['errors'] } : {}),
    }
  }

  return {
    type: 'about:blank',
    title: statusText || 'HTTP Error',
    status,
    detail: typeof payload === 'string' && payload.trim() ? payload : `Request failed with status ${status}`,
  }
}
```

---

### 4.4 — `packages/client/src/browser/client.ts` & `packages/client/src/browser/index.ts`

Browser Client implementation exposing only `list` and `get`:

`packages/client/src/browser/client.ts`:
```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { BeechBrowserClient, BeechClientConfig, Listable, ListQuery, Single } from '../types.js'
import { buildSearchParams } from '../query-builder.js'
import { request, validateClientConfig } from '../http.js'

export function createBeechBrowserClient<TRegistry = Record<string, unknown>>(
  config: BeechClientConfig,
): BeechBrowserClient<TRegistry> {
  validateClientConfig(config)

  return {
    content(seed) {
      type TRow = TRegistry[typeof seed]
      const enc = encodeURIComponent(seed)
      return {
        list: (q, options) =>
          request<Listable<TRow>>(config, 'GET', `/${enc}`, {
            params: buildSearchParams(q as ListQuery<Record<string, unknown>>),
            options,
          }),
        get: (sel, options) => {
          const p = new URLSearchParams('id' in sel ? { id: sel.id } : { slug: sel.slug })
          return request<Single<TRow>>(config, 'GET', `/${enc}`, { params: p, options })
        },
      }
    },
  }
}

/** Alias for createBeechBrowserClient */
export const createBeechClient = createBeechBrowserClient
```

`packages/client/src/browser/index.ts`:
```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export { createBeechBrowserClient, createBeechClient } from './client.js'
export type { BeechBrowserClient, BrowserContentResource } from '../types.js'
```

---

### 4.5 — `packages/client/src/server/client.ts` & `packages/client/src/server/index.ts`

Server Client implementation exposing full CRUD operations:

`packages/client/src/server/client.ts`:
```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { BeechClientConfig, BeechServerClient, Listable, ListQuery, Single } from '../types.js'
import { buildSearchParams } from '../query-builder.js'
import { request, validateClientConfig } from '../http.js'

export function createBeechServerClient<TRegistry = Record<string, unknown>>(
  config: BeechClientConfig,
): BeechServerClient<TRegistry> {
  validateClientConfig(config)

  return {
    content(seed) {
      type TRow = TRegistry[typeof seed]
      const enc = encodeURIComponent(seed)
      return {
        list: (q, options) =>
          request<Listable<TRow>>(config, 'GET', `/${enc}`, {
            params: buildSearchParams(q as ListQuery<Record<string, unknown>>),
            options,
          }),
        get: (sel, options) => {
          const p = new URLSearchParams('id' in sel ? { id: sel.id } : { slug: sel.slug })
          return request<Single<TRow>>(config, 'GET', `/${enc}`, { params: p, options })
        },
        create: (input, options) =>
          request<Single<TRow>>(config, 'POST', `/${enc}/add`, { body: input, options }),
        update: (id, input, options) =>
          request<Single<TRow>>(config, 'PUT', `/${enc}/edit/${encodeURIComponent(id)}`, { body: input, options }),
      }
    },
  }
}

/** Alias for createBeechServerClient */
export const createBeechClient = createBeechServerClient
```

`packages/client/src/server/index.ts`:
```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export { createBeechServerClient, createBeechClient } from './client.js'
export type { BeechServerClient, ServerContentResource } from '../types.js'
```

---

### 4.6 — `packages/client/src/index.ts`

Root module exporting types, contracts, query serialization, and webhook tools (no runtime client factory):

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export { buildSearchParams } from './query-builder.js'
export type {
  BeechClientConfig,
  RequestOptions,
  BeechResult,
  BeechProblem,
  BeechFilterOperator,
  FieldFilter,
  ListQuery,
  ListMeta,
  Listable,
  Single,
  BrowserContentResource,
  BeechBrowserClient,
  ServerContentResource,
  BeechServerClient,
} from './types.js'

export {
  BEECH_SIGNATURE_HEADER,
  WebhookVerificationError,
  verifyBeechWebhookSignature,
  constructWebhookEvent,
} from './webhooks/index.js'
export type {
  VerifyWebhookSignatureOptions,
  ConstructWebhookEventOptions,
} from './webhooks/index.js'
```

---

### 4.7 — `packages/client/src/browser/browser-client.test.ts`

Comprehensive unit tests for the browser client:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi } from 'vitest'
import { createBeechBrowserClient, createBeechClient } from './index.js'
import type { BeechClientConfig } from '../types.js'

function mockFetch(status: number, body: unknown, contentType = 'application/json', statusText = 'OK') {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: new Headers({ 'Content-Type': contentType }),
    json: async () => body,
  } as unknown as Response)
}

const baseConfig: BeechClientConfig = {
  baseUrl: 'https://api.example.com/',
  apiKey: 'test-key',
}

describe('Browser Client (@beechcms/client/browser)', () => {
  it('throws error on missing or invalid configuration', () => {
    expect(() => createBeechBrowserClient(null as unknown as BeechClientConfig)).toThrow(TypeError)
    expect(() => createBeechBrowserClient({ baseUrl: '', apiKey: 'key' })).toThrow(/baseUrl is required/)
    expect(() => createBeechBrowserClient({ baseUrl: 'https://api.example.com', apiKey: '' })).toThrow(/apiKey is required/)
  })

  it('normalizes trailing slashes on baseUrl', async () => {
    const fetchMock = mockFetch(200, { data: [], meta: { total: 0, returned: 0, seed: 'posts' } })
    const client = createBeechBrowserClient({ ...baseConfig, baseUrl: 'https://api.example.com///', fetch: fetchMock })
    await client.content('posts').list()
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/public/posts',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('list sends GET request with X-API-Key and search params', async () => {
    const fetchMock = mockFetch(200, { data: [{ id: '1', title: 'A' }], meta: { total: 1, returned: 1, seed: 'posts' } })
    const client = createBeechBrowserClient({ ...baseConfig, fetch: fetchMock })
    const res = await client.content('posts').list({ search: 'hello', limit: 10 })
    expect(res.error).toBeNull()
    expect(res.data?.data).toHaveLength(1)
    const calledUrl: string = fetchMock.mock.calls[0][0]
    expect(calledUrl).toContain('search=hello')
    expect(calledUrl).toContain('limit=10')
  })

  it('get by id sends GET request with ?id=...', async () => {
    const fetchMock = mockFetch(200, { data: { id: 'p_123', title: 'Post' }, meta: { seed: 'posts' } })
    const client = createBeechBrowserClient({ ...baseConfig, fetch: fetchMock })
    const res = await client.content('posts').get({ id: 'p_123' })
    expect(res.error).toBeNull()
    expect(res.data?.data.id).toBe('p_123')
    const calledUrl: string = fetchMock.mock.calls[0][0]
    expect(calledUrl).toContain('id=p_123')
  })

  it('get by slug sends GET request with ?slug=...', async () => {
    const fetchMock = mockFetch(200, { data: { id: 'p_123', slug: 'my-slug' }, meta: { seed: 'posts' } })
    const client = createBeechBrowserClient({ ...baseConfig, fetch: fetchMock })
    const res = await client.content('posts').get({ slug: 'my-slug' })
    expect(res.error).toBeNull()
    expect(res.data?.data.slug).toBe('my-slug')
    const calledUrl: string = fetchMock.mock.calls[0][0]
    expect(calledUrl).toContain('slug=my-slug')
  })

  it('does NOT expose mutation methods (create, update)', () => {
    const client = createBeechBrowserClient(baseConfig)
    const resource = client.content('posts') as unknown as Record<string, unknown>
    expect(resource.create).toBeUndefined()
    expect(resource.update).toBeUndefined()
  })

  it('returns normalized RFC 9457 error on 4xx/5xx HTTP failure without throwing', async () => {
    const problem = {
      type: 'https://api.beechcms.com/errors/not-found',
      title: 'Not Found',
      status: 404,
      detail: 'Resource does not exist',
    }
    const fetchMock = mockFetch(404, problem, 'application/problem+json', 'Not Found')
    const client = createBeechBrowserClient({ ...baseConfig, fetch: fetchMock })
    const res = await client.content('posts').get({ id: 'missing' })
    expect(res.data).toBeNull()
    expect(res.error).toEqual(problem)
  })

  it('encapsulates network errors with status: 0 without throwing', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const client = createBeechBrowserClient({ ...baseConfig, fetch: fetchMock })
    const res = await client.content('posts').list()
    expect(res.data).toBeNull()
    expect(res.error).toEqual({
      type: 'about:blank',
      title: 'Network Error',
      status: 0,
      detail: 'Failed to fetch',
    })
  })

  it('alias createBeechClient works identically to createBeechBrowserClient', () => {
    expect(createBeechClient).toBe(createBeechBrowserClient)
  })
})
```

---

### 4.8 — `packages/client/src/server/server-client.test.ts`

Comprehensive unit tests for the server client:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi } from 'vitest'
import { createBeechServerClient, createBeechClient } from './index.js'
import type { BeechClientConfig } from '../types.js'

function mockFetch(status: number, body: unknown, contentType = 'application/json', statusText = 'OK') {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: new Headers({ 'Content-Type': contentType }),
    json: async () => body,
  } as unknown as Response)
}

const baseConfig: BeechClientConfig = {
  baseUrl: 'https://api.example.com',
  apiKey: 'server-secret-key',
}

describe('Server Client (@beechcms/client/server)', () => {
  it('throws error on missing or invalid configuration', () => {
    expect(() => createBeechServerClient(null as unknown as BeechClientConfig)).toThrow(TypeError)
    expect(() => createBeechServerClient({ baseUrl: '', apiKey: 'key' })).toThrow(/baseUrl is required/)
    expect(() => createBeechServerClient({ baseUrl: 'https://api.example.com', apiKey: '' })).toThrow(/apiKey is required/)
  })

  it('create sends POST request with body to /:seed/add', async () => {
    const fetchMock = mockFetch(201, { data: { id: 'p_1', title: 'New Article' }, meta: { seed: 'articles' } })
    const client = createBeechServerClient({ ...baseConfig, fetch: fetchMock })
    const res = await client.content('articles').create({ title: 'New Article' })
    expect(res.error).toBeNull()
    expect(res.data?.data.title).toBe('New Article')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/public/articles/add',
      expect.objectContaining({
        method: 'POST',
        headers: expect.any(Headers),
        body: JSON.stringify({ title: 'New Article' }),
      }),
    )
  })

  it('update sends PUT request with body to /:seed/edit/:id', async () => {
    const fetchMock = mockFetch(200, { data: { id: 'p_1', title: 'Updated' }, meta: { seed: 'articles' } })
    const client = createBeechServerClient({ ...baseConfig, fetch: fetchMock })
    const res = await client.content('articles').update('p_1', { title: 'Updated' })
    expect(res.error).toBeNull()
    expect(res.data?.data.title).toBe('Updated')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/public/articles/edit/p_1',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.any(Headers),
        body: JSON.stringify({ title: 'Updated' }),
      }),
    )
  })

  it('forwards custom RequestOptions (headers, signal, next tags)', async () => {
    const fetchMock = mockFetch(200, { data: [], meta: { total: 0, returned: 0, seed: 'posts' } })
    const client = createBeechServerClient({ ...baseConfig, fetch: fetchMock })
    const controller = new AbortController()
    await client.content('posts').list(undefined, {
      signal: controller.signal,
      headers: { 'X-Custom-Header': 'CustomValue' },
      next: { tags: ['posts-tag'], revalidate: 60 },
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/public/posts',
      expect.objectContaining({
        signal: controller.signal,
        next: { tags: ['posts-tag'], revalidate: 60 },
      }),
    )
  })

  it('normalizes 422 Unprocessable Entity with errors array', async () => {
    const problem = {
      type: 'https://api.beechcms.com/errors/validation',
      title: 'Validation Failed',
      status: 422,
      detail: 'Invalid input fields',
      errors: [{ field: 'email', expected: 'valid email', received: 'invalid', message: 'Invalid email format' }],
    }
    const fetchMock = mockFetch(422, problem, 'application/problem+json', 'Unprocessable Entity')
    const client = createBeechServerClient({ ...baseConfig, fetch: fetchMock })
    const res = await client.content('users').create({ email: 'invalid' })
    expect(res.data).toBeNull()
    expect(res.error).toEqual(problem)
    expect(res.error?.errors).toHaveLength(1)
  })

  it('encapsulates network errors with status: 0 without throwing', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Connection timed out'))
    const client = createBeechServerClient({ ...baseConfig, fetch: fetchMock })
    const res = await client.content('articles').create({ title: 'Test' })
    expect(res.data).toBeNull()
    expect(res.error).toEqual({
      type: 'about:blank',
      title: 'Network Error',
      status: 0,
      detail: 'Connection timed out',
    })
  })

  it('alias createBeechClient works identically to createBeechServerClient', () => {
    expect(createBeechClient).toBe(createBeechServerClient)
  })
})
```

---

### 4.9 — Delete Legacy Universal Client Files

Remove:
- `packages/client/src/client.ts`
- `packages/client/src/client.test.ts`

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run the following commands to validate building, linting, type-checking, and test execution:

```bash
# 1. Typecheck the client package
pnpm --filter @beechcms/client run type-check

# 2. Build the client package and verify dist artifacts
pnpm --filter @beechcms/client run build

# 3. Run all unit tests for the client package
pnpm --filter @beechcms/client run test

# 4. Run monorepo workspace validation to verify no downstream packages broke
pnpm --filter @beechcms/core run type-check
pnpm --filter @beechcms/forms-react run type-check
pnpm beech test --diff
```

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `packages/client/package.json` specifies valid subpath exports for `.`, `./browser`, `./server`, and `./webhooks`.
- [ ] Root import `@beechcms/client` exports only types, interfaces, `buildSearchParams`, and webhook verification utilities. `createBeechClient` is NOT exported from the root barrel.
- [ ] `@beechcms/client/browser` exports `createBeechBrowserClient` and `createBeechClient`, exposing only read-only operations (`list`, `get`). Methods `create` and `update` do not exist on its interface or runtime object.
- [ ] `@beechcms/client/server` exports `createBeechServerClient` and `createBeechClient`, exposing full CRUD operations (`list`, `get`, `create`, `update`) and supporting `RequestOptions` pass-through (headers, signal, cache, next).
- [ ] Both browser and server clients perform immediate configuration validation throwing an error when `baseUrl` or `apiKey` is empty or missing.
- [ ] Base URLs with trailing slashes are automatically normalized without malformed double slashes in request URLs.
- [ ] Low-level fetch network failures are caught and returned as `{ data: null, error: { type: 'about:blank', title: 'Network Error', status: 0, detail: ... } }` without throwing unhandled exceptions.
- [ ] HTTP 4xx and 5xx responses are normalized into RFC 9457 `BeechProblem` structures, populating `errors` for 422 responses.
- [ ] All `@beechcms/client` tests pass (browser client, server client, query builder, webhooks).
- [ ] Zero changes to `@beechcms/core`, `apps/api`, or `apps/dashboard`.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

1. **TipTap HTML AST Parser:** Transformation or auto-parsing of TipTap JSON nodes into HTML inside `@beechcms/client` is out of scope to avoid bundle bloat and runtime overhead in network SDKs.
2. **Backend Encryption & Confidential Fields (`apps/api`):** AES-GCM data encryption, blind indexes, and email automation handling in `apps/api` are out of scope.
3. **Public Form Anti-Bot Security (`packages/forms-react`):** Time-Trap tokens, Honeypot fields, and Origin verification inside `@beechcms/forms-react` are out of scope.
4. **Backward Compatibility of Root Client Factory:** Retaining deprecated universal `createBeechClient` on root `@beechcms/client` is explicitly forbidden to guarantee security-by-design.
