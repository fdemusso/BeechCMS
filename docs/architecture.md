# Architecture — Beech CMS

This document describes the structural reasoning behind the Beech CMS monorepo: how packages relate, why specific storage and compute choices were made, and how the system is actively migrating from a layered architecture toward **Vertical Slice Architecture (VSA)**.

Every design decision documented here is grounded in the source code and explicitly chosen — not inherited by default.

---

## Table of Contents

1. [Monorepo Topology](#1-monorepo-topology)
2. [Turborepo Build Strategy](#2-turborepo-build-strategy)
3. [`@beechcms/core` — The Single Source of Truth](#3-beechcore--the-single-source-of-truth)
4. [The Botanical Engine — Schema Compiler](#4-the-botanical-engine)
5. [The Per-Type SQL Model](#5-the-per-type-sql-model)
6. [Cloudflare D1 — SQLite at the Edge](#6-cloudflare-d1--sqlite-at-the-edge)
7. [Vertical Slice Architecture — API Feature Implementation](#7-vertical-slice-architecture--api-feature-implementation)
8. [Dependency Rules](#8-dependency-rules)
9. [Content Repository Pattern](#9-content-repository-pattern)
10. [Pending Draft Workflow — Mirror Tables](#10-pending-draft-workflow)
11. [Storage & Media Abstraction](#11-storage--media-abstraction)
12. [Performance Layer](#12-performance-layer)
13. [Auth & Rate-Limit Abstraction Layer](#13-auth--rate-limit-abstraction-layer)
14. [Widget, Search & Analytics Abstraction (Phase 3)](#14-widget-search--analytics-abstraction-phase-3)

---

## 1. Monorepo Topology

The monorepo uses **npm workspaces** at the root. `apps/api` and `apps/dashboard` both declare `"@beechcms/core": "*"` (workspace protocol) in their `package.json` dependencies.

```text
@beechcms/cms/
├── apps/
│   ├── api/          # Hono REST API — Cloudflare Workers
│   └── dashboard/    # React + Vite SPA
├── packages/
│   └── core/         # @beechcms/core — shared engine, types, validation
├── docs/
├── turbo.json
└── package.json      # Root: npm workspaces ["apps/*", "packages/*"]

```

### Dependency Layers

| Layer | Package | Allowed Imports |
|---|---|---|
| **Apps** | `apps/api`, `apps/dashboard` | `@beechcms/core`, npm, local src |
| **Core** | `packages/core` | npm only (no app imports) |
| **Shared** | `src/components/ui`, `src/lib` | npm, `@beechcms/core` — _never_ `features/*` |

---

## 2. Turborepo Build Strategy

`turbo.json` defines a DAG-based pipeline. Turborepo resolves the workspace dependency graph and executes tasks in topological order:

-   **@beechcms/core (build)** → **apps/api (build)**

-   **@beechcms/core (build)** → **apps/dashboard (build)**


This means `packages/core` is **always compiled first**. The apps consume the compiled output at `packages/core/dist/index.js`.

```bash
# Development Mode
npm run dev

# 1. packages/core: tsc -w (rebuilds dist/ on change)
# 2. apps/api: wrangler dev (reads dist/ via @beechcms/core)
# 3. apps/dashboard: vite dev (reads dist/ via @beechcms/core)
```

**Why this matters:** Any type mismatch in the core results in a **compile-time error** across all apps simultaneously, preventing runtime drift.

---

## 3. `@beechcms/core` — The Single Source of Truth

No business logic touching schema, validation, or translation exists in the apps. They are pure consumers of `@beechcms/core`.

```typescript
// packages/core/src/index.ts
export * from './types';           // Seed, Branch, DbPayload, ApiPayload
export * from './seeds';           // SEED_REGISTRY, getSeed
export * from './engine';          // generateCreateTable, buildSelectQuery, etc.
export * from './validation';      // validateAndSanitizeSeedPayload
export * from './richtext';        // TipTap Envelopes
export * from './richtext-render'; // TipTap → HTML
export * from './slug-utils';      // slugify logic
```

### Branch Policies — `resolvePolicies`

Every `Branch` in a seed can declare an optional `policies` object that controls how the field is stored, exposed, and surfaced in the UI:

| Policy | Type | Default | Effect |
|---|---|---|---|
| `privacy` | `'plain' \| 'hash' \| 'encrypt'` | `'plain'` | `hash` → value is SHA-256 hex-digested server-side before writing; `encrypt` → 501 placeholder |
| `visibility` | `'full' \| 'masked' \| 'hidden'` | `'full'` (or `'hidden'` when `privacy !== 'plain'`) | `masked` → returns `'••••••••'` on read; `hidden` → field is stripped from responses |
| `search` | `boolean` | `true` | When `false`, the column is excluded from full-text search queries |
| `filter` | `boolean` | `true` | When `false`, the column is not offered in the dashboard filter UI |
| `sort` | `boolean` | `true` | When `false`, the column is not offered in the dashboard sort UI |
| `public` | `boolean` | `true` | When `false`, the field is stripped from Public API responses |

**`privacy` and `visibility` are coupled by design.** When `privacy` is `hash` or `encrypt`, `resolvePolicies` automatically defaults `visibility` to `'hidden'`, so the stored digest is never returned to callers. This default can be explicitly overridden in the seed definition if needed.

**`privacy: 'hash'` write flow:**
```
client sends plaintext  →  API validates (Zod)  →  sha256hex()  →  Botanic Engine serializes  →  DB stores hash in real column
```
The plaintext never persists. Sensitive fields cannot be updated via PUT — the handler returns `422` if any non-plain field appears in the patch.

**Comparing a hashed field** (e.g. password verification): use `verifyHashField` from `@beechcms/core` inside a dedicated server-side handler. Never expose the hash to the client.

```typescript
import { verifyHashField } from '@beechcms/core'

const match = await verifyHashField(storedHash, candidatePlaintext)
```

All policy resolution **must** go through `resolvePolicies(branch)` from `@beechcms/core`. Never inline-check `branch.policies?.x ?? default`.

```typescript
import { resolvePolicies } from '@beechcms/core'

const { privacy, visibility, search, filter, sort, public: isPublic } = resolvePolicies(branch)
```

Existing branches without a `policies` field behave exactly as before — all defaults are permissive.

---

### The `Seed` Interface — Required Fields

Every seed definition (`packages/core/src/seeds.ts`) must include a `displayNameAlias` field:

```typescript
export interface Seed {
  slug: string           // URL identifier (e.g. "articoli")
  label: string          // Singular UI label (e.g. "Articolo")
  labelPlural?: string   // Plural UI label
  displayNameAlias: string // REQUIRED — alias of the branch used as human-readable name
  // ...
  branches: Branch[]
}
```

**`displayNameAlias` is mandatory.** It points to the alias of the branch that serves as the human-readable identifier for a content entry (e.g., `"title"` for articles, `"name"` for products, `"author"` for testimonials). Without it, UI components cannot reliably display a meaningful label for an entry without hard-coding field names:

| Seed | `displayNameAlias` | Branch label |
|---|---|---|
| `articoli` | `title` | Titolo |
| `prodotti` | `name` | Nome |
| `team` | `name` | Nome |
| `testimonianze` | `author` | Autore |
| `pagine` | `title` | Titolo |
| `messaggi` | `name` | Nome mittente |

UI consumers (`QuickDraftWidget`, gallery title resolution, content lists) read `displayNameAlias` from the seed instead of relying on heuristics or hard-coded aliases.

---

## 4. The Botanical Engine — Schema Compiler

In v0.4.0, the Botanical Engine evolves from a runtime translator to a **Schema Compiler**. It reads the TypeScript Seed definitions and generates deterministic SQL DDL and queries.

### Responsibilities

1. **DDL Generation**: `generateCreateTable(seed)` produces the SQL to create `content_{slug}` tables.
2. **Migration Generation**: `generateAddColumn(seed, branch)` handles schema evolution.
3. **Query Building**: `buildSelectQuery(seed, options)` constructs optimized SQL queries using real column names.
4. **Serialization**: `serializeForDb` and `deserializeFromDb` handle type conversion (e.g., booleans to 0/1, JSON objects to strings).

### Removal of Internal IDs

Internal IDs like `br01` are eliminated. The `alias` defined in the Seed is now used directly as the SQL column name. This simplifies the engine and improves database readability.

---

## 5. The Per-Type SQL Model

Beech CMS uses a dedicated table for each content type. This ensures maximum performance, native SQL constraints, and reliable mathematical operations.

### SQL Schema (Example: `articoli`)

```sql
CREATE TABLE content_articoli (
  id          TEXT    NOT NULL PRIMARY KEY, -- UUID v4
  slug        TEXT    NOT NULL UNIQUE,      -- URL identifier
  status      TEXT    NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'published', 'archived')),
  title       TEXT,                         -- Real column from alias
  body        TEXT,                         -- Real column from alias
  price       REAL,                         -- Correct SQLite type
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
```

### Design Decisions

- **Per-Type Tables**: Every Seed generates a `content_{seed.slug}` table.
- **Native Types**: `number` branches become `REAL`, `boolean` become `INTEGER` (0/1), etc.
- **No JSON Blobs**: Content data is stored in real columns, enabling B-tree indexing and native SQL filters.
- **Automatic Indexing**: The engine automatically generates indexes for `status`, `created_at`, and any branch marked for filtering.


---

## 6. Cloudflare D1 — SQLite at the Edge

Beech leverages D1 to co-locate read replicas with Worker execution nodes, eliminating regional latency.

| Option | Latency | Note |
|---|---|---|
| **External Postgres** | 20–100ms | Egress overhead |
| **Cloudflare D1** | **<1ms** | Co-located with Worker |

---

## 7. Vertical Slice Architecture — API Feature Implementation

Beech CMS API has migrated to a **Vertical Slice Architecture (VSA)**. Instead of organizing code by technical layers (controllers, services, etc.), we organize by business features.

### Feature Structure (`apps/api/src/features/`)

Each feature (e.g., `content`, `auth`, `draft`) is self-contained:

```text
features/content/
├── handlers/          # Thin Hono handlers
│   ├── list.ts
│   ├── get.ts
│   ├── create.ts
│   ├── update.ts
│   └── delete.ts
├── constants.ts       # Feature-specific constants and error messages
├── types.ts           # Local types
└── index.ts           # Feature entry point (Barrel)
```

### The "Thin Handler" Pattern

Handlers are responsible for:
1. Parsing and validating request parameters.
2. Retrieving the **Repository** from the Hono context.
3. Delegating data operations to the Repository.
4. Handling specific repository errors (e.g., `EntryNotFoundError`) and mapping them to HTTP responses.
5. Performing side effects like R2 cleanup or activity logging.

---

## 8. Dependency Rules

1.  **Feature Isolation**: Features **never** import from other features.
2.  **Repository Access**: Features interact with the database ONLY through the `ContentRepository` interface.
3.  **Encapsulation**: The main application factory (`factory.ts`) registers features via their barrel `index.ts`.

---

## 9. Content Repository Pattern

To decouple business logic from the underlying database (Cloudflare D1), Beech CMS implements a Repository Pattern.

### Core Interface (`@beechcms/core`)

The `ContentRepository` interface defines all supported data operations. This allows for:
- **Testability**: Easily swap D1 implementation with a `StaticContentRepository` for deterministic testing.
- **Portability**: The API logic remains agnostic of the SQL dialect or database provider.

### D1 Implementation (`apps/api/src/shared/`)

- **`BaseD1Repository`**: An abstract class providing common D1 utilities (table name resolution, error mapping).
- **`D1ContentRepository`**: The production implementation that handles SQL generation, Mirror Tables logic, and atomic batch operations.

### Middleware Injection

The repository is instantiated and injected into the Hono request context via `repositoryMiddleware`:

```typescript
// apps/api/src/middleware/repository.middleware.ts
export const repositoryMiddleware = () => {
  return async (c: Context, next: Next) => {
    const repo = new D1ContentRepository(c.env.DB);
    c.set('repository', repo);
    await next();
  };
};
```

---

## 10. Pending Draft Workflow — Mirror Tables

### Overview

The pending draft system allows editorial content types to maintain a **separate draft** on top of a live (published) entry. v0.4.0 uses a mirror table strategy instead of a JSON column.

This feature is opt-in per seed via the `allowDrafts` flag in `@beechcms/core`:

```typescript
// packages/core/src/seeds.ts
export const ARTICOLO_SEED: Seed = {
  slug: 'articoli',
  allowDrafts: true,  // ← enables draft tables for this type
  // ...
}
```

### Storage

A separate table `content_{slug}_drafts` is created for each Seed with `allowDrafts: true`. It contains the same columns as the main table (mapped from branches) plus an `entry_id` foreign key.

```sql
CREATE TABLE content_articoli_drafts (
  entry_id    TEXT NOT NULL PRIMARY KEY REFERENCES content_articoli(id) ON DELETE CASCADE,
  title       TEXT,
  body        TEXT,
  ...
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
```

### API Surface

All draft endpoints are JWT-protected (internal API only).

| Method | Path | Description |
|---|---|---|
| `PUT` | `/api/content/:slug/:id/draft` | Writes to the `content_{slug}_drafts` table. Relaxed validation. |
| `GET` | `/api/content/:slug/:id/draft` | Reads from the mirror table. |
| `POST` | `/api/content/:slug/:id/draft/publish` | Atomic promotion: `INSERT INTO content_{slug} ... SELECT ... FROM content_{slug}_drafts`. |
| `DELETE` | `/api/content/:slug/:id/draft` | Discards the draft row. |

### Data Flow

```
Editor saves changes
       │
       ▼
PUT /:slug/:id/draft
  validateAndSanitizeSeedPayload (operation=update, enforceRequired=false)
  INSERT INTO content_{slug}_drafts (SQL columns)
       │
       ▼ (review / approval)
POST /:slug/:id/draft/publish
  INSERT INTO content_{slug} (...) SELECT ... FROM content_{slug}_drafts  ← atomic
       │
       ▼
Live content updated, draft row deleted
```

### Invariants

- **`content_{slug}` is never modified by draft endpoints.** Only `POST /draft/publish` performs the write.
- **Botanical Engine generates optimized DD## 11. Storage & Media Abstraction

Beech CMS abstracts object storage and media metadata tracking to ensure the same business logic works across Local (R2 Binding), Production (S3/R2 via HTTP), and CDN environments.

### The `BeechBucket` Interface

Object storage operations are handled through the `BeechBucket` interface in `@beechcms/core`.

- **`R2BindingBucket`**: Uses native Cloudflare R2 bindings. Used in local development and production when the Worker has direct bucket access.
- **`S3Bucket`**: Connects via S3-compatible HTTP API. Used for production environments requiring cross-account access or specific CDN configurations.
- **`NullBucket`**: A fail-safe provider that throws only when storage operations are invoked, allowing the rest of the API to function without configuration.

### Media & Stats Repositories

Database tracking for media is separated from the storage provider via specialized repositories:

- **`MediaRepository`**: Tracks `media_objects` (key, filename, size, owner). Used for the Media Library UI and orphan detection.
- **`SystemStatsRepository`**: Manages global metrics like `total_storage_bytes`.

### Middleware Injection

Providers are instantiated via `createBucketProvider` (using capability detection) and injected into the Hono context:

```typescript
const bucket = c.get('bucket');
const mediaRepo = c.get('mediaRepository');
const statsRepo = c.get('systemStatsRepository');

// Agnostic upload flow
await bucket.put(key, body, { contentType });
await mediaRepo.trackUpload({ key, filename, ... });
await statsRepo.incrementStorage(size);
```

---

## 12. Performance Layer

### FTS5 — SQL Triggers

In v0.4.0, full-text search is managed entirely within the database using SQLite's FTS5 engine and triggers. This replaces the complex application-layer synchronization used in previous versions.

### Automatic Synchronization

The Botanical Engine generates the necessary SQL triggers to keep the virtual `fts_{slug}` table synchronized:

```sql
CREATE TRIGGER fts_articoli_insert AFTER INSERT ON content_articoli BEGIN
  INSERT INTO fts_articoli(entry_id, body) VALUES (new.id, new.body);
END;
```

**Limitation:** Only the `body` field (of type `richtext`) is indexed in FTS5. Other fields use standard B-tree indexes on real columns.

### Indexes on Real Columns

Filtering and sorting queries are now extremely fast because they operate on real SQL columns with dedicated indexes:

```sql
CREATE INDEX idx_content_articoli_status ON content_articoli(status);
CREATE INDEX idx_content_articoli_created_at ON content_articoli(created_at DESC);
CREATE INDEX idx_content_articoli_title ON content_articoli(title);
```

### Media Library — Metadata Tracking

Every file uploaded to R2 is tracked in the `media_objects` table via the `MediaRepository`. This table enables:
- Media library UI (file list with owner and size)
- Orphan detection (files not referenced in any entry)
- User storage usage (`WHERE uploaded_by = ?`)
- Canonical source for total storage: `SELECT SUM(size_bytes) FROM media_objects`

### Per-Seed Analytics (migration `0022`)

The `analytics` table has been recreated with a `seed TEXT NOT NULL DEFAULT ''` column. The empty string is the sentinel for global metrics (using NULL would have broken the `ON CONFLICT` upsert due to SQLite's uniqueness property constraints on NULLs).

The middleware in `index.ts` extracts the seed from the URL (`/api/v1/public/:seed`) and logs it in the column. Global widget queries filter with `AND seed = ''`.

### Worker Cache API for Public Reads

GET requests on `/api/v1/public/:seed` are now cached via `caches.default` with a 60-second TTL. The pattern:

```typescript
// Check cache before hitting D1
const hit = await caches.default.match(c.req.raw)
if (hit) return hit

// ... execute D1 query ...

// Asynchronous caching via waitUntil
c.executionCtx.waitUntil(
  caches.default.put(cacheKey, cachedResponse)
)
```

Only 200 responses are cached. Errors (404, 403, 500) are never cached. Cache key = full URL including query params — different queries produce separate entries.

---

_Beech CMS Architecture Guide — Built for Scale at the Edge._

---

## 13. Auth & Rate-Limit Abstraction Layer

Phase 1 of the abstraction plan decoupled every external dependency in the auth and rate-limiting subsystems behind interfaces defined in `@beechcms/core`. The goal: `bcryptjs`, `jose`, and Cloudflare RateLimit bindings are each imported in exactly one file. All other code references the interface.

### Interfaces in `@beechcms/core`

| Interface | Contract | Core types |
|---|---|---|
| `IHashProvider` | `hash(plaintext): Promise<string>`, `verify(plaintext, stored): Promise<boolean>` | — |
| `ITokenService` | `issue(claims, options?): Promise<string>`, `verify(token): Promise<JwtClaims \| null>` | `JwtClaims`, `IssueTokenOptions` |
| `IUserRepository` | CRUD + profile update operations on the `users` table | `UserRecord`, `NewUserInput` |
| `ISessionRepository` | Refresh token lifecycle (save, validate, revoke, list) on `refresh_tokens` | `NewRefreshToken`, `RefreshTokenRecord`, `ActiveSessionSummary` |
| `IPasswordResetTokenRepository` | Reset token lifecycle on `password_reset_tokens` | `NewPasswordResetToken`, `ValidatedResetToken` |
| `IRateLimiter` | `checkLimit(key): Promise<RateLimitResult>` | `RateLimitResult` |

### Concrete Implementations in `apps/api`

```text
apps/api/src/
  auth/
    bcrypt-hash-provider.ts      -- BcryptHashProvider (sole bcryptjs import)
    in-memory-hash-provider.ts   -- InMemoryHashProvider (test double)
    jose-token-service.ts        -- JoseTokenService (sole jose import)
    static-token-service.ts      -- StaticTokenService (test double)
  shared/
    d1-user.repository.ts        -- D1UserRepository (sole user SQL)
    d1-session.repository.ts     -- D1SessionRepository (sole session SQL)
    d1-password-reset-token.repository.ts -- D1PasswordResetTokenRepository
  rate-limit/
    cloudflare-rate-limiter.ts   -- CloudflareRateLimiter (sole RateLimit binding access)
    no-op-rate-limiter.ts        -- NoOpRateLimiter (fallback when binding absent)
    in-memory-rate-limiter.ts    -- InMemoryRateLimiter (test double)
```

### Middleware Injection Chain

```
factory.ts
  ├── repositoryMiddleware()       → c.set("userRepository", "sessionRepository", "passwordResetTokenRepository", ...)
  ├── authProvidersMiddleware()    → c.set("hashProvider", "tokenService")
  └── rateLimiterMiddleware()      → c.set("rateLimiters": IRateLimiterRegistry)
```

`authProvidersMiddleware` accepts an optional `overrides` parameter (`{ hashProvider?, tokenService? }`) for injecting test doubles in Vitest. `rateLimiterMiddleware` similarly accepts `{ registry? }`.

### Rate Limiter Names

`IRateLimiterRegistry.getLimiter(name)` accepts a typed union:

```typescript
type RateLimiterName =
  | 'login' | 'tokenRefresh' | 'forgotPassword' | 'resetPassword'
  | 'publicApiRead' | 'publicApiWrite'
```

Each name maps to a Cloudflare RateLimit binding in `wrangler.jsonc`. If the binding is absent (local dev without `--remote`), `buildDefaultRegistry` falls back to `NoOpRateLimiter` so the API remains functional.

### Isolation Rules

- `bcryptjs` → imported only in `bcrypt-hash-provider.ts`
- `jose` → imported only in `jose-token-service.ts`
- Cloudflare RateLimit binding → accessed only in `cloudflare-rate-limiter.ts`
- `D1Database` → accessed only in `D1*Repository` files. Phase 3 closed the remaining direct-query sites in `widget.ts`, `search.ts`, the analytics middleware, and the analytics counters of `stats.handler.ts` (see §14).

---

## 14. Widget, Search & Analytics Abstraction (Phase 3)

Phase 3 of the abstraction plan removed every direct `c.env.DB.prepare` call from the widget, search, and analytics surfaces. Three new contracts now live in `@beechcms/core`:

- `IWidgetRepository` (`packages/core/src/widget/widget.repository.ts`) — `aggregate`, `growth`, `leaderboard`, `list`, `timeseries`. Implementations validate every column alias against `seed.branches` (or a `SYSTEM_COLUMNS` allowlist) before composing SQL, and bind every user-supplied value through `?` placeholders. ORDER direction is selected via hardcoded `ASC`/`DESC` branches, never interpolated. Unknown aliases throw `UNSAFE_COLUMN`, which `widget.ts` maps to `400 Bad Request`.
- `ISearchRepository` (`packages/core/src/search/search.repository.ts`) — `search` and `count`. Implementations delegate SQL composition to the existing pure helper `buildFtsQuery`. The `EMPTY_QUERY` sentinel surfaces as an empty result set, never a 500. The route handler shapes the wire response via `mapSearchResultRow`.
- `IAnalyticsRepository` (`packages/core/src/observability/analytics.repository.ts`) — `recordRequest`, `sumByMetric`, `groupByMetric`. The interface is metric-aware (`AnalyticsMetric = 'requests' | 'visitors'`); the metric name is bound, not interpolated. The D1 implementation maps onto the long-format table `analytics(day_ts, metric, seed, value)` with `INSERT … ON CONFLICT(day_ts, metric, seed) DO UPDATE`.

### Concrete Implementations

```
apps/api/src/shared/
  d1-widget.repository.ts
  d1-search.repository.ts
  d1-analytics.repository.ts
```

All three are wired into the Hono context by `repositoryMiddleware`:

```ts
c.set('widgetRepository',    new D1WidgetRepository(c.env.DB))
c.set('searchRepository',    new D1SearchRepository(c.env.DB))
c.set('analyticsRepository', new D1AnalyticsRepository(c.env.DB))
```

### Migration Surface

| Site | Before | After |
|------|--------|-------|
| `apps/api/src/widget.ts` | 5 routes building SQL by string concatenation | Routes call `widgetRepository.{aggregate,growth,leaderboard,list,timeseries}`; only query-string parsing and response shaping remain |
| `apps/api/src/search.ts` | Direct `DB.prepare(sql).bind(...)` for FTS query and count | Parallel `searchRepository.search` + `searchRepository.count`; mapping via `mapSearchResultRow` |
| `apps/api/src/factory.ts` (analytics middleware) | Inline `INSERT INTO analytics … ON CONFLICT` | `analyticsRepository.recordRequest(seedSlug)` inside `executionCtx.waitUntil` (day bucket computed inside the repository via injected `IClock`) |
| `apps/api/src/features/stats/stats.handler.ts` (`/health`, `/cloudflare`) | Inline `SELECT SUM(value) … GROUP BY metric` | `analyticsRepository.sumByMetric('requests'|'visitors', '', sinceTimestamp)` |

## Phase 4: Time and ID Abstractions (`IClock`, `IIdGenerator`)

Phase 4 introduces two cross-cutting utilities that replace direct calls to `Date.now()` / `Math.floor(Date.now() / 1000)` and `crypto.randomUUID()` in repository and service code, making time- and ID-sensitive logic deterministic in tests.

```
packages/core/src/clock.ts          → IClock + SystemClock (production singleton)
packages/core/src/id-generator.ts   → IIdGenerator + SystemIdGenerator (production singleton)
apps/api/src/shared/fixed-clock.ts          → FixedClock (test-only)
apps/api/src/shared/sequential-id-generator.ts → SequentialIdGenerator (test-only)
```

### Injection Strategy

Unlike repositories and providers from Phases 1–3, `IClock` and `IIdGenerator` are **constructor-injected** into the concrete D1* classes and `JoseTokenService`. They are *not* exposed via `c.var` — the granularity is the class that needs them, not the request context.

The middleware that instantiates each class passes `SystemClock` / `SystemIdGenerator` by default and accepts override objects for testing:

```ts
repositoryMiddleware({ clock?, idGenerator?, … })
authProvidersMiddleware({ clock?, … })
observabilityMiddleware({ clock?, idGenerator?, … })
```

### Updated Constructor Signatures

| Class | Constructor |
|------|-------------|
| `D1ActivityLogger` | `(db, clock, idGenerator, scheduleBackgroundTask?)` |
| `D1NotificationRepository` | `(db, clock, idGenerator)` |
| `D1PasswordResetTokenRepository` | `(db, idGenerator)` — generates the token id internally |
| `D1SessionRepository` | `(db, clock)` — `saveRefreshToken` writes `created_at` from clock |
| `D1AnalyticsRepository` | `(db, clock)` — `recordRequest(seedSlug)` computes the day bucket internally |
| `JoseTokenService` | `(secret, config, clock)` — passes `nowSeconds()` to `setIssuedAt()` and uses absolute `setExpirationTime(iat + ttl)` |

### Interface Refactor

`IAnalyticsRepository.recordRequest(seedSlug)` no longer accepts a `dayTimestamp`. The day-bucket math (`Math.floor(seconds / SECONDS_PER_DAY) * SECONDS_PER_DAY`) is encapsulated inside `D1AnalyticsRepository`, with `SECONDS_PER_DAY` as a named constant.

### Test Surface

```ts
new D1ActivityLogger(db, new FixedClock(1700000000_000), new SequentialIdGenerator())
new JoseTokenService(secret, {}, new FixedClock(1700000000_000))
```

`FixedClock` returns a constant millisecond timestamp; `SequentialIdGenerator` emits `test-id-0001`, `test-id-0002`, … with `reset()` for per-test isolation.