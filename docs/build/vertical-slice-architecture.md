# Vertical Slice Architecture

This guide details the architectural philosophy governing the BeechCMS monorepo (`apps/api`, `apps/dashboard`, and packages). It provides concrete patterns and invariants for building isolated, maintainable features.

---

## Foundational Principles

Traditional layered architectures organize code horizontally by technical tier (controllers, services, repositories). Vertical Slice Architecture (VSA) groups code vertically by **business feature**:

<p align="center">
  <img src="/images/vertical-slice-comparison.svg" alt="Layered vs Vertical Slice Architecture Comparison" style="width: 100%; max-width: 840px; margin: 16px 0;" />
</p>

> **The Golden Rule**: *High cohesion inside a feature slice, zero direct coupling between sibling slices.*

---

## Anatomy of an API Slice (`apps/api/src/features/<slice>/`)

Each API feature lives in an isolated folder under `apps/api/src/features/`:

```text
apps/api/src/features/content/
├── index.ts              # Feature entry point: mounts scoped Hono sub-app
├── constants.ts          # Feature-scoped strings and error identifiers
├── types.ts              # Local request/response interfaces
└── handlers/             # Thin route handlers
    ├── list.ts
    ├── get.ts
    ├── create.ts
    ├── update.ts
    └── delete.ts
```

### 1. The Thin Handler Pattern

Route handlers in BeechCMS are strictly thin orchestrators. They:
- Parse and validate inputs (using Zod or Hono validators).
- Retrieve injected domain services from the Hono context via `c.get(...)`.
- Delegate business logic to the service.
- Return standard JSON responses or RFC 9457 Problem Details for errors.

**Rule**: Handlers must NEVER contain raw SQL strings or execute direct D1 queries.

```typescript
// apps/api/src/features/content/handlers/get.ts
import type { Context } from 'hono'
import type { Env, Variables } from '../../../types'

export async function getHandler(c: Context<{ Bindings: Env; Variables: Variables }>) {
  const seedSlug = c.req.param('slug')
  const entryId = c.req.param('id')

  // Retrieve injected repository service
  const repository = c.get('contentRepository')

  const entry = await repository.getById(seedSlug, entryId)
  if (!entry) {
    return c.json(
      {
        type: 'https://beechcms.dev/errors/not-found',
        title: 'Entry Not Found',
        status: 404,
        detail: `Entry ${entryId} was not found in seed ${seedSlug}`
      },
      404
    )
  }

  return c.json({ data: entry })
}
```

### 2. Middleware & Interface Injection

To eliminate cross-slice dependencies:
- Abstract service interfaces (e.g. `IContentRepository`, `ISeedRepository`) are defined centrally in `@beechcms/core`.
- Concrete database persistence classes live in `apps/api/src/shared/`.
- Repositories are instantiated in global middleware and injected into the Hono context:

```typescript
// apps/api/src/middleware/services.ts
app.use('*', async (c, next) => {
  const contentRepo = new D1ContentRepository(c.env.DB)
  c.set('contentRepository', contentRepo)
  await next()
})
```

---

## Anatomy of a Dashboard Slice (`apps/dashboard/src/features/<slice>/`)

The React admin dashboard mirrors the backend feature slicing:

```text
apps/dashboard/src/features/seeds/
├── index.ts              # Public barrel: explicitly exports allowed components
├── api/                  # Slice HTTP client API calls (e.g. seeds.api.ts)
├── components/           # Feature-scoped UI components
│   ├── SeedForm.tsx
│   ├── BranchList.tsx
│   └── SeedTable.tsx
├── hooks/                # TanStack Query hooks
│   └── useSeedMutations.ts
└── types/                # UI-scoped state types
```

### The Public Barrel Rule

A slice's `index.ts` is its only public contract. External parts of the dashboard may ONLY import what is explicitly exported from the slice barrel:

```typescript
// VALID: importing through public barrel
import { SeedForm, useSeed } from '@/features/seeds'

// INVALID (VETO): deep import into sibling feature slice internals
import { BranchRow } from '@/features/seeds/components/BranchRow'
```

---

## Dependency Boundaries Matrix

<p align="center">
  <img src="/images/vsa-dependency-boundaries.svg" alt="Vertical Slice Architecture Dependency Boundaries" style="width: 100%; max-width: 860px; margin: 16px 0;" />
</p>

| From | To | Allowed? | Rationale |
| :--- | :--- | :---: | :--- |
| `factory.ts` (API root) | `features/<feature>` | ✅ **YES** | Composition root mounts all feature sub-apps. |
| `features/<feature>` | `@beechcms/core` | ✅ **YES** | Shared interfaces, Zod schemas, and engine contracts. |
| `features/<feature>` | `shared/` (API) | ✅ **YES** | Shared utilities, auth middleware, and common types. |
| `features/<A>` | `features/<B>` | ❌ **NO (VETO)** | Features must never import sibling feature slices directly. |
| `@beechcms/core` | `apps/api` | ❌ **NO (VETO)** | Core engine must never depend on application consumers. |
| `handlers/*` | `c.env.DB` | ❌ **NO (VETO)** | Handlers must not execute raw SQL queries on D1 directly. |

---

## Anti-Patterns to Avoid

1. **Direct SQL / D1 Queries in Handlers**: Bypasses Botanical Engine serialization (`apiToDb` / `dbToApi`) and breaks column security policies.
2. **Cross-Slice Imports**: Feature A (`features/content/`) must never import from Feature B (`features/auth/`). Shared contracts belong in `@beechcms/core` or `shared/`.
3. **Synchronous Side-Effects**: Do not trigger long-running email delivery or remote webhooks synchronously inside request handlers; use `c.executionCtx.waitUntil()` or queues.

---

## Ponytail Architectural VETO Checklist

Before submitting code, verify compliance against the VETO invariants:

- [ ] **Botanical Dialect**: All content reads and mutations pass through `@beechcms/core` serialization. Zero raw SQLite queries touch content tables directly.
- [ ] **Branch ID Stability**: Fields are referenced internally by permanent Branch IDs (`br_XX`), never hardcoded alias strings.
- [ ] **Slice Isolation**: Zero imports between sibling slices under `apps/api/src/features/` or `apps/dashboard/src/features/`.
- [ ] **Thin Handlers**: Every API handler delegates database operations to injected repository contracts.
- [ ] **RFC 9457 Errors**: All non-2xx responses conform to RFC 9457 Problem Details specifications.
