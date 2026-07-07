---
title: Creating a Vertical Slice
group: Developer Guide (Internals)
category: Development Guides
---

# Vertical Slice Architecture in Beech CMS

A practical guide to structuring features, enforcing isolation, and avoiding common pitfalls — grounded in how Beech CMS is actually built.

> For a deeper academic treatment of VSA, see the curated resource list at [mehdihadeli/awesome-software-architecture — Vertical Slice Architecture](https://github.com/mehdihadeli/awesome-software-architecture/blob/main/docs/vertical-slice-architecture.md).

---

## 1. What Is Vertical Slice Architecture

Traditional layered architecture organises code by technical role: all controllers in one folder, all services in another, all repositories in a third. This means that understanding or modifying a single feature requires jumping across many unrelated directories.

Vertical Slice Architecture (VSA) cuts through those horizontal layers and groups code by **business feature** instead. Each "slice" owns everything it needs — routing entry point, business logic, data access, types, and constants — in a single cohesive directory.

| Concern | Layer-Based | Vertical Slice |
|---|---|---|
| Code organisation | By technical type | By business domain |
| Navigating a feature | Jump across N folders | Read 1 folder |
| Modifying a feature | Touch files in many places | Touch files in 1 place |
| Deleting a feature | Treasure hunt | Delete 1 folder |
| Team ownership | Unclear, merge conflicts | One team per slice |
| Onboarding | Must understand whole system | Understand one slice |

### The core principle

> *"Vertical coupling inside a slice, zero coupling between slices."*

Each slice behaves like a self-contained mini-application. It has its own handlers, logic, types, and constants. Cross-slice communication happens only through well-defined public interfaces — never through direct internal imports.

---

## 2. Beech CMS Monorepo Layout

Beech CMS is a Turborepo monorepo. The relevant packages and applications are:

```
beechcms/
├── apps/
│   ├── api/                   # Hono on Cloudflare Workers (D1, R2, RateLimit bindings)
│   │   └── src/
│   │       ├── features/      # ← VERTICAL SLICES live here
│   │       ├── middleware/    # Cross-cutting Hono middleware (auth, repo, storage…)
│   │       ├── shared/        # Concrete implementations injected by middleware
│   │       ├── public/        # Public (unauthenticated) API routes
│   │       ├── factory.ts     # App composition root — assembles all slices
│   │       └── types.ts       # AppEnv: Bindings + Variables (Hono context shape)
│   │
│   └── dashboard/             # React + Vite + TanStack Query (in-memory token store)
│       └── src/
│           └── features/      # ← VERTICAL SLICES live here too
│
└── packages/
    └── core/                  # @beechcms/core — pure TypeScript, zero HTTP/cloud deps
        └── src/               # Interfaces: IContentRepository, IMediaRepository…
```

### Where to put a new feature

| Layer | Location |
|---|---|
| API feature | `apps/api/src/features/<feature-name>/` |
| Dashboard feature | `apps/dashboard/src/features/<feature-name>/` |
| Shared interface / contract | `packages/core/src/<domain>/` |
| Concrete D1/R2 implementation | `apps/api/src/shared/` |

---

## 3. Internal Structure of an API Slice

Every feature folder under `apps/api/src/features/` follows this consistent shape:

```
features/
└── content/
    ├── index.ts                # Barrel export — the ONLY file imported from outside
    ├── constants.ts            # Feature-scoped error messages and string literals
    ├── types.ts                # Local TypeScript types (no framework imports)
    └── handlers/               # One thin Hono handler per operation
        ├── list.ts
        ├── get.ts
        ├── create.ts
        ├── update.ts
        └── delete.ts
```

`index.ts` assembles a `new Hono()` sub-application and mounts the handlers:

```typescript
// apps/api/src/features/content/index.ts
import { Hono } from 'hono';
import type { Env, Variables } from '../../types';
import { listHandler }   from './handlers/list';
import { getHandler }    from './handlers/get';
import { createHandler } from './handlers/create';
import { updateHandler } from './handlers/update';
import { deleteHandler } from './handlers/delete';

export const contentFeature = new Hono<{ Bindings: Env; Variables: Variables }>();

contentFeature.get('/:schema',        listHandler);
contentFeature.get('/:schema/:id',    getHandler);
contentFeature.post('/:schema',       createHandler);
contentFeature.put('/:schema/:id',    updateHandler);
contentFeature.delete('/:schema/:id', deleteHandler);
```

`factory.ts` then mounts the whole feature at a single route:

```typescript
// apps/api/src/factory.ts (excerpt)
import { contentFeature } from './features/content';

apiProtected.route('/content', contentFeature);
```

The feature is invisible to the rest of the application except through the `contentFeature` export from its `index.ts`.

---

## 4. The Thin Handler Pattern

A handler in Beech CMS has exactly one job: **translate an HTTP request into a domain operation and return an HTTP response**. It must not contain inline SQL, direct cloud bindings, or business logic beyond orchestration.

```typescript
// apps/api/src/features/content/handlers/create.ts
import type { Context } from 'hono';
import type { Env, Variables } from '../../../types';
import { CONTENT_ERRORS } from '../constants';
import { parseCreateBody } from '../types';

export async function createHandler(context: Context<{ Bindings: Env; Variables: Variables }>) {
  const schemaSlug = context.req.param('schema');
  const seed = context.getSeed(schemaSlug);

  if (!seed) {
    return context.json({ error: CONTENT_ERRORS.SEED_NOT_FOUND }, 404);
  }

  const body = await context.req.json();
  const parsed = parseCreateBody(body);

  if (!parsed.success) {
    return context.json({ error: CONTENT_ERRORS.INVALID_INPUT, details: parsed.error }, 400);
  }

  const repository = context.get('repository');
  const newEntry = await repository.create(schemaSlug, parsed.data);

  const jwtPayload = context.get('jwtPayload');
  await context.get('activityLogger').log({
    action: 'create',
    entityType: 'content',
    entityId: newEntry.id,
    entitySlug: schemaSlug,
    actor: {
      id: jwtPayload.sub,
      email: jwtPayload.email ?? 'unknown',
      name: jwtPayload.name ?? null,
    },
  });

  return context.json({ data: newEntry }, 201);
}
```

**What a handler must do:**
- Parse and validate the request input
- Retrieve injected services from the Hono context (`context.get(...)`)
- Call the relevant repository or service method
- Build and return the HTTP response

**What a handler must never do:**
- Import `D1Database` or access `context.env.DB` directly
- Execute SQL or cloud SDK calls inline
- Extract actor identity inside a service or logger (always done in the handler)
- Import from another feature's internal files

---

## 5. Interface Injection via Middleware

The key to keeping slices decoupled from infrastructure is **middleware injection**. Every infrastructure dependency (database, storage, rate limiter, token service) is abstracted behind an interface defined in `packages/core` and injected into the Hono request context by a dedicated middleware.

### Middleware registration order in `factory.ts`

```
repositoryMiddleware      → IContentRepository, IMediaRepository, IActivityLogRepository…
storageMiddleware         → IBeechBucket (R2 / S3)
authProvidersMiddleware   → IHashProvider, ITokenService
rateLimiterMiddleware     → IRateLimiterRegistry
observabilityMiddleware   → IActivityLogger, INotificationService (depends on repositoryMiddleware)
```

Order matters: `observabilityMiddleware` must run after `repositoryMiddleware` because it depends on `notificationRepository` already being available in the context.

### Defining a contract in `packages/core`

```typescript
// packages/core/src/content.repository.ts
export interface IContentRepository {
  /** Finds a single entry by its unique ID within a given schema. */
  findById(schemaSlug: string, id: string): Promise<ContentRecord | null>;

  /** Creates a new entry and returns the persisted record. */
  create(schemaSlug: string, data: Record<string, unknown>): Promise<ContentRecord>;

  // … other methods
}
```

Rules for interfaces in `packages/core`:
- Zero imports from Hono, Cloudflare Workers, or any HTTP framework
- Every exported method has a JSDoc comment explaining **why** it exists, not just what it does
- Types use full descriptive English words — no abbreviations (`ContentRecord`, not `ContRec`)

### Concrete implementation in `apps/api/src/shared/`

```typescript
// apps/api/src/shared/d1-content.repository.ts
import type { D1Database } from '@cloudflare/workers-types';
import type { IContentRepository, ContentRecord } from '@beechcms/core';

export class D1ContentRepository implements IContentRepository {
  constructor(private readonly database: D1Database) {}

  async findById(schemaSlug: string, id: string): Promise<ContentRecord | null> {
    const row = await this.database
      .prepare(`SELECT * FROM content_${schemaSlug} WHERE id = ?`)
      .bind(id)
      .first<RawContentRow>();

    if (!row) return null;
    return mapRowToRecord(row);
  }
}
```

Rules for D1 repositories:
- `D1Database` is accessed **only** inside files in `apps/api/src/shared/` — never in handlers
- All SQL uses `?` placeholders with `.bind(...)` — no string interpolation
- All `snake_case` column names are mapped to `camelCase` TypeScript properties on every result

### Injecting in the middleware

```typescript
// apps/api/src/middleware/repository.middleware.ts
import { D1ContentRepository } from '../shared/d1-content.repository';

export function repositoryMiddleware() {
  return async (context: Context, next: Next) => {
    context.set('repository', new D1ContentRepository(context.env.DB));
    await next();
  };
}
```

### Consuming in a handler

```typescript
const repository = context.get('repository'); // typed as IContentRepository
const entry = await repository.findById(schemaSlug, id);
```

The handler never knows whether the data comes from D1, an in-memory store, or a mock — it only depends on the interface.

---

## 6. The Email Module — The Gold Standard Pattern

The email module defines the canonical pattern that every new abstraction in Beech must replicate:

```
apps/api/src/features/email/
├── index.ts           # Barrel export — public API only
├── email.provider.ts  # Interface: IEmailProvider
├── email.service.ts   # Orchestrator (factory function)
├── email.types.ts     # Shared types (no framework imports)
└── providers/
    └── resend-email.provider.ts   # Concrete implementation — knows Resend SDK
```

Rules extracted from this pattern:

1. **One interface per contract.** No abstract base classes.
2. **Concrete implementations in dedicated subfolders.** One class per file.
3. **One factory function at the module boundary** (`email.service.ts`).
4. **`index.ts` exports only the public API.** Never export internals.
5. **Shared pure types in `.types.ts`.** Zero framework coupling.
6. **Zero Hono coupling inside concrete implementations.** The class constructor receives its dependencies directly — never a `Context` object.

When you add a new domain module (e.g., `notifications`, `observability`), mirror this structure exactly.

---

## 7. Dependency Rules

These rules are enforced by convention and must be respected in every pull request.

```
┌──────────────────────────────────────────────────┐
│         ROUTING LAYER (factory.ts, index.ts)     │
│  May import from: features/ (index.ts only)      │
├──────────────────────────────────────────────────┤
│               FEATURES LAYER                     │
│  May import from: shared/, packages/core         │
│  ┌──────────┐  ┌──────────┐  ┌────────────────┐ │
│  │ content/ │  │  auth/   │  │ notifications/ │ │
│  └──────────┘  └──────────┘  └────────────────┘ │
│  MUST NOT import from: another feature!          │
├──────────────────────────────────────────────────┤
│               SHARED LAYER                       │
│  apps/api/src/shared/ — concrete implementations │
│  packages/core/src/   — interfaces and types     │
│  MUST NOT import from: features/                 │
└──────────────────────────────────────────────────┘
```

| Direction | Allowed | Reason |
|---|---|---|
| `factory.ts` → `features/<name>/index.ts` | ✅ | Composition root assembles slices |
| `features/<name>` → `shared/` | ✅ | Features depend on abstractions |
| `features/<name>` → `packages/core` | ✅ | Interfaces are the contract |
| `features/auth` → `features/content` | ❌ | Breaks slice isolation |
| `packages/core` → `apps/api` | ❌ | Core must stay framework-free |
| Handler → `context.env.DB` directly | ❌ | Bypasses interface injection |

### When two slices need to share behaviour

If two features need the same logic, there are three valid approaches in order of preference:

1. **Promote to `packages/core`** — define an interface and add a D1 implementation in `apps/api/src/shared/`. Inject it via middleware.
2. **Promote to `apps/api/src/shared/`** — for utilities that are infrastructure-aware but not feature-specific (e.g., `request-utils.ts`).
3. **Accept temporary duplication** — a small helper copied to two features is better than a cross-feature import. Promote to shared only when used a third time.

---

## 8. Naming Conventions

All names use full descriptive English words. Abbreviations are forbidden.

| Category | Pattern | Good example | Bad example |
|---|---|---|---|
| Hono sub-app export | `camelCase + Feature` | `contentFeature` | `contentApp`, `cF` |
| Handler file | `<operation>.ts` | `create.ts`, `delete.ts` | `createHandler.ts` |
| Repository interface | `I<Entity>Repository` | `IContentRepository` | `IContRepo`, `ContentRepo` |
| Repository class | `D1<Entity>Repository` | `D1ContentRepository` | `ContentDb` |
| Service interface | `I<Domain>Service` | `INotificationService` | `INotifSvc` |
| Middleware file | `<concern>.middleware.ts` | `repository.middleware.ts` | `repoMw.ts` |
| Constants file | `constants.ts` inside feature | `constants.ts` | `consts.ts` |
| Types file | `types.ts` inside feature | `types.ts` | `t.ts` |
| Test file | `<filename>.test.ts` | `d1-content.repository.test.ts` | `content.spec.ts` |
| Constants values | `SCREAMING_SNAKE_CASE` | `MAXIMUM_LIST_LIMIT` | `MAX_LIM`, `maxLimit` |

---

## 9. What `shared/` Contains (and What It Does Not)

`apps/api/src/shared/` holds **concrete implementations** of interfaces defined in `packages/core`. It is the only layer allowed to import `D1Database`, `R2Bucket`, or other Cloudflare binding types.

It does **not** contain business logic. It does not contain route handlers. It does not contain feature-specific code.

```
apps/api/src/shared/
├── d1-content.repository.ts
├── d1-media.repository.ts
├── d1-session.repository.ts
├── d1-activity-logger.ts
├── d1-notification.repository.ts
├── background-notification-service.ts
├── in-memory-activity-logger.ts       # Test double
├── in-memory-notification-service.ts  # Test double
└── request-utils.ts                   # Pure HTTP utilities (getClientIp etc.)
```

The rule for promotion is simple: a piece of code moves to `shared/` when it is needed by **two or more** features. Before that point, it lives inside the feature that needs it.

---

## 10. Adding a New Feature — Step by Step

### API feature

1. Create `apps/api/src/features/<feature-name>/`
2. Add `index.ts` — declare a `new Hono()` instance, mount handlers, export as `<featureName>Feature`
3. Add `constants.ts` — error messages and string literals specific to this feature
4. Add `types.ts` — local TypeScript types; no Hono or Cloudflare imports
5. Add `handlers/` — one file per operation, each a thin async function
6. If the feature needs a new repository: define the interface in `packages/core/src/<domain>.repository.ts`, implement it in `apps/api/src/shared/d1-<domain>.repository.ts`, inject it via `repository.middleware.ts`, and declare it in `apps/api/src/types.ts` under `Variables`
7. Mount the feature in `apps/api/src/factory.ts` via `apiProtected.route('<path>', <featureName>Feature)`
8. Update `docs/system-map.md` to reflect the new slice and any new interface

### Dashboard feature

1. Create `apps/dashboard/src/features/<feature-name>/`
2. Follow the internal structure:
   - `index.ts` — public API barrel (components, hooks, types only)
   - `components/` — React components for this feature
   - `hooks/` — TanStack Query hooks wrapping the API client
   - `api/` — `<name>.api.ts` with axios calls to `apps/api`
   - `types/` — TypeScript types local to this feature
3. Consume the feature from a page only via its `index.ts`
4. Never import from `apps/dashboard/src/features/<other-feature>/`

---

## 11. Anti-Patterns to Avoid

These patterns have been observed in early Beech code and were explicitly refactored out in the abstraction phases. Do not reintroduce them.

### Free functions that accept `Context`

```typescript
// ❌ WRONG — couples logging to Hono internals
export async function logActivity(context: Context, params: LogParams) {
  const userId = context.get('jwtPayload').sub; // Hono coupling inside the logger
  await context.env.DB.prepare('INSERT INTO activity_logs …').bind(userId).run();
}
```

```typescript
// ✅ CORRECT — IActivityLogger injected, caller extracts actor from context
const jwtPayload = context.get('jwtPayload');
await context.get('activityLogger').log({
  action: 'create',
  entityType: 'content',
  entityId: newEntry.id,
  actor: { id: jwtPayload.sub, email: jwtPayload.email ?? 'unknown', name: jwtPayload.name ?? null },
});
```

### Inline SQL in handlers

```typescript
// ❌ WRONG — handler knows about D1 and SQL
const result = await context.env.DB
  .prepare('SELECT * FROM content WHERE id = ?')
  .bind(id)
  .first();
```

```typescript
// ✅ CORRECT — handler uses the injected repository
const repository = context.get('repository');
const entry = await repository.findById(schemaSlug, id);
```

### Cross-feature imports

```typescript
// ❌ WRONG — content feature reaches into auth internals
import { verifyPassword } from '../auth/utils/password';
```

```typescript
// ✅ CORRECT — shared behaviour lives in packages/core or apps/api/src/shared/
import { sha256hex } from '@beechcms/core';
```

### Unexplained ternary chains

```typescript
// ❌ WRONG — intent is completely opaque
const result = a ? b ? c : d : e ? f : g;
```

```typescript
// ✅ CORRECT — extract to named boolean and guard clauses
if (!isAuthenticated) return context.json({ error: AUTH_ERRORS.UNAUTHORIZED }, 401);
if (!hasWritePermission) return context.json({ error: AUTH_ERRORS.FORBIDDEN }, 403);
const result = performOperation();
```

### Unresolved partial work

```typescript
// ❌ WRONG — silently incomplete
// TODO: handle error case
const data = await repository.findById(id);
return context.json({ data }); // crashes if data is null
```

```typescript
// ✅ CORRECT — every code path is handled; TODOs reference a GitHub issue
const entry = await repository.findById(schemaSlug, id);
if (!entry) {
  return context.json({ error: CONTENT_ERRORS.NOT_FOUND }, 404); // TODO: #42 add ETag support
}
return context.json({ data: entry });
```

---

## 12. Quality Checklist for Every New Slice

### Structure
- [ ] Feature folder exists under `apps/api/src/features/<name>/` or `apps/dashboard/src/features/<name>/`
- [ ] `index.ts` is the only file imported from outside the feature
- [ ] `constants.ts` holds all string literals; no magic strings inside handlers
- [ ] `types.ts` contains local types with zero framework imports

### Isolation
- [ ] No direct imports from other feature folders
- [ ] No `context.env.DB` or Cloudflare binding access inside handlers
- [ ] No free functions that accept a Hono `Context` as their primary dependency source

### Interfaces
- [ ] Any new data dependency has an interface in `packages/core`
- [ ] The concrete D1 implementation is in `apps/api/src/shared/`
- [ ] The interface is injected via a middleware and declared in `apps/api/src/types.ts`

### Code quality
- [ ] No chained ternary expressions
- [ ] No `if` nesting beyond 2 levels — use guard clauses
- [ ] No unexplained `TODO` comments — each one includes a GitHub issue reference
- [ ] All magic numbers are named constants at the top of the file
- [ ] Every exported interface method has a JSDoc explaining **why**, not just what

### Documentation
- [ ] `docs/system-map.md` updated if new interfaces or middleware were added
- [ ] Relevant API routes documented in `docs/api-reference.md`
- [ ] Tests co-located next to the source files they cover

---

## 13. Related Documents

- [architecture.md](architecture.md) — full system architecture and middleware injection model
- [system-map.md](system-map.md) — living map of all interfaces, repositories, and middleware
- [api-reference.md](api-reference.md) — HTTP routes and payload shapes
- [CONTRIBUTING.md](../CONTRIBUTING.md) — commit conventions, branch strategy, AI-assisted development
- [Sprints/02-abstraction.md](Sprints/02-abstraction.md) — Phase 1 and Phase 2 abstraction history
