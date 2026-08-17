---
title: Vertical Slice Architecture
group: Developer Guide (Internals)
category: Development Guides
---

# Vertical Slice Architecture

This is a practical guide for engineers contributing to **BeechCMS**. It explains how to build, isolate, and maintain features using **Vertical Slice Architecture (VSA)** across both the Cloudflare Workers API backend and the React admin dashboard.

## Why Vertical Slice Architecture

Traditional layered architectures organize code by technical role: all controllers in one folder, all services in another, and all repositories in a third. Making a single change requires jumping across multiple directories, increasing cognitive load and merge conflicts.

Vertical Slice Architecture cuts across technical layers and groups code by **business feature**. Each slice owns its routing entry point, domain logic, data access, types, and constants in a single cohesive directory.

<p align="center">
  <img src="/images/vertical-slice-comparison.svg" alt="Layered vs Vertical Slice Architecture Comparison" style="width: 100%; max-width: 840px; margin: 16px 0;" />
</p>

> **The Golden Rule**: *High cohesion inside a slice, zero direct coupling between slices.*

## Monorepo Layout & Feature Placement

BeechCMS organizes features symmetrically across the API and Dashboard:

| Goal | Target Directory | Responsibilities |
| :--- | :--- | :--- |
| **API Feature Slice** | `apps/api/src/features/<feature>/` | Hono sub-app, thin handlers, local types & constants |
| **Dashboard Feature Slice** | `apps/dashboard/src/features/<feature>/` | React components, TanStack Query hooks, local UI state |
| **Shared Contracts & Engine** | `packages/core/src/` | Interfaces (`IContentRepository`), Botanical Engine, Zod schemas |
| **Infrastructure Implementations** | `apps/api/src/shared/` | Concrete D1/R2 repository classes injected by middleware |

## Anatomy of an API Slice

Every feature slice under `apps/api/src/features/` follows a strict structure:

```text
apps/api/src/features/content/
├── index.ts                # Public API barrel: mounts Hono sub-app
├── constants.ts            # Error messages and string literals
├── types.ts                # Feature-scoped request/response types
└── handlers/               # Thin async route handlers
    ├── list.ts
    ├── get.ts
    ├── create.ts
    ├── update.ts
    └── delete.ts
```

### The `index.ts` Entry Point

`index.ts` instantiates a scoped `new Hono()` sub-app, registers its handlers, and exports the feature:

```typescript
// apps/api/src/features/content/index.ts
import { Hono } from 'hono'
import type { Env, Variables } from '../../types'
import { listHandler } from './handlers/list'
import { getHandler } from './handlers/get'
import { createHandler } from './handlers/create'

export const contentFeature = new Hono<{ Bindings: Env; Variables: Variables }>()

contentFeature.get('/:schema', listHandler)
contentFeature.get('/:schema/:id', getHandler)
contentFeature.post('/:schema', createHandler)
```

The composition root (`apps/api/src/factory.ts`) mounts the entire feature at a single path:

```typescript
import { contentFeature } from './features/content'

apiProtected.route('/content', contentFeature)
```

## The Thin Handler Pattern

A handler has exactly one responsibility: **translate an incoming HTTP request into a domain operation and return an HTTP response**.

```typescript
// apps/api/src/features/content/handlers/create.ts
import type { Context } from 'hono'
import type { Env, Variables } from '../../../types'
import { CONTENT_ERRORS } from '../constants'
import { parseCreateBody } from '../types'

export async function createHandler(c: Context<{ Bindings: Env; Variables: Variables }>) {
  const schemaSlug = c.req.param('schema')
  const seed = c.getSeed(schemaSlug)

  if (!seed) {
    return c.json({ error: CONTENT_ERRORS.SEED_NOT_FOUND }, 404)
  }

  const rawBody = await c.req.json()
  const parsed = parseCreateBody(rawBody)

  if (!parsed.success) {
    return c.json({ error: CONTENT_ERRORS.INVALID_INPUT, details: parsed.error }, 400)
  }

  // Retrieve injected repository from context
  const repository = c.get('repository')
  const newEntry = await repository.create(schemaSlug, parsed.data)

  // Asynchronous side-effects (non-blocking)
  const jwt = c.get('jwtPayload')
  c.get('scheduler').waitUntil(
    c.get('activityLogger').log({
      action: 'create',
      entityType: 'content',
      entityId: newEntry.id,
      entitySlug: schemaSlug,
      actor: { id: jwt.sub, email: jwt.email ?? 'unknown', name: jwt.name ?? null },
    })
  )

  return c.json({ data: newEntry }, 201)
}
```

### Handler Rules

- **Do**: Parse inputs, validate Zod schemas, retrieve injected repositories (`c.get(...)`), and return JSON responses.
- **Do Not**: Access `c.env.DB` directly or execute inline SQL (`c.env.DB.prepare`).
- **Do Not**: Perform synchronous side-effects (wrap in `c.get('scheduler').waitUntil(...)`).
- **Do Not**: Import from another feature's internal directories.

## Middleware & Interface Injection

To keep slices decoupled from Cloudflare bindings and SQLite details, external dependencies are defined as interfaces in `packages/core` and injected into the Hono context via middleware.

### 1. Define Contract (`packages/core`)

```typescript
// packages/core/src/content.repository.ts
export interface IContentRepository {
  findById(seedSlug: string, id: string): Promise<ContentRecord | null>
  create(seedSlug: string, data: Record<string, unknown>): Promise<ContentRecord>
}
```

### 2. Implement with D1 (`apps/api/src/shared/`)

```typescript
// apps/api/src/shared/d1-content.repository.ts
import type { D1Database } from '@cloudflare/workers-types'
import type { IContentRepository, ContentRecord } from '@beechcms/core'

export class D1ContentRepository implements IContentRepository {
  constructor(private readonly db: D1Database) {}

  async findById(seedSlug: string, id: string): Promise<ContentRecord | null> {
    return this.db
      .prepare(`SELECT * FROM content_${seedSlug} WHERE id = ?`)
      .bind(id)
      .first<ContentRecord>()
  }

  async create(seedSlug: string, data: Record<string, unknown>): Promise<ContentRecord> {
    // Botanical Engine compilation & parameterized insert
    // ...
  }
}
```

### 3. Inject in Context (`apps/api/src/middleware/`)

```typescript
// apps/api/src/middleware/repository.middleware.ts
import { D1ContentRepository } from '../shared/d1-content.repository'

export function repositoryMiddleware() {
  return async (c: Context, next: Next) => {
    c.set('repository', new D1ContentRepository(c.env.DB))
    await next()
  }
}
```

## Anatomy of a Dashboard Slice

In the React SPA (`apps/dashboard/src/features/`), each feature is organized as a self-contained slice:

```text
apps/dashboard/src/features/drafts/
├── index.ts                # Public API barrel: exported components & hooks
├── api/                    # Axios API calls to apps/api
│   └── drafts.api.ts
├── components/             # React UI components
│   ├── drafts-table.tsx
│   └── draft-publish-button.tsx
├── hooks/                  # TanStack Query hooks
│   ├── use-global-drafts.ts
│   └── use-publish-draft.ts
└── types/                  # Local TypeScript types
    └── draft.types.ts
```

### Public Barrel Rule

External pages (e.g. `src/pages/drafts-list.tsx`) **only import from the slice barrel**:

```typescript
// [Compliant] Import from the slice's public API
import { DraftsTable, useGlobalDrafts } from '@/features/drafts'

// [Non-compliant] Deep internal import
import { DraftsTable } from '@/features/drafts/components/drafts-table'
```

## Dependency Rules & Boundaries

These isolation rules maintain system velocity and prevent spaghetti architecture:

<p align="center">
  <img src="/images/vsa-dependency-boundaries.svg" alt="BeechCMS Dependency & Isolation Boundaries" style="width: 100%; max-width: 840px; margin: 16px 0;" />
</p>

| Import Direction | Allowed | Rationale |
| :--- | :---: | :--- |
| `factory.ts` → `features/<slice>/index.ts` | Yes | Composition root mounts slices |
| `features/<slice>` → `packages/core` | Yes | Features consume pure contracts and schemas |
| `features/<slice>` → `apps/api/src/shared/` | Yes | Features consume shared utility functions |
| `features/auth` → `features/content` | No | **Forbidden**: Violates slice isolation |
| `packages/core` → `apps/api` | No | **Forbidden**: Core must remain framework-agnostic |
| Handler → `c.env.DB.prepare(...)` | No | **Forbidden**: Direct SQL bypasses repository layer |

## Step-by-Step Feature Walkthrough

Follow this step-by-step workflow when building a new capability:

### 1. Creating the API Slice

1. Create `apps/api/src/features/<feature-name>/`.
2. Add `constants.ts` with error codes and string literals.
3. Add `types.ts` with local request/response schemas.
4. Add `handlers/` with thin async operations.
5. If persistent data is needed:
   - Define `I<Domain>Repository` in `packages/core`.
   - Implement `D1<Domain>Repository` in `apps/api/src/shared/`.
   - Inject the repository in `apps/api/src/middleware/repository.middleware.ts`.
   - Declare the typing in `apps/api/src/types.ts` under `Variables`.
6. Add `index.ts` exporting `<featureName>Feature` (a Hono sub-app).
7. Mount the feature in `apps/api/src/factory.ts`.

### 2. Creating the Dashboard Slice

1. Create `apps/dashboard/src/features/<feature-name>/`.
2. Implement typed Axios calls in `api/<name>.api.ts`.
3. Wrap API calls in TanStack Query hooks (`hooks/use-<name>.ts`).
4. Build UI components in `components/`.
5. Export public components and hooks in `index.ts`.
6. Connect the feature to your target page or sidebar route.

## Anti-Patterns to Avoid

### Direct Database Queries in Handlers
```typescript
// [Non-compliant] Handler directly compiles SQL and queries D1
const row = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first()

// [Compliant] Handler delegates to injected repository
const userRepo = c.get('userRepository')
const user = await userRepo.findById(id)
```

### Synchronous Side-Effects
```typescript
// [Non-compliant] Blocks HTTP response waiting for external webhook
await fetch('https://webhook.site/xxx', { method: 'POST', body })

// [Compliant] Dispatched asynchronously via scheduler
c.get('scheduler').waitUntil(
  c.get('automationRunner').run({ seedSlug, event: 'create', entry })
)
```

### Cross-Feature Internal Imports
```typescript
// [Non-compliant] Content slice reaches into Auth internal utils
import { hashPassword } from '../auth/utils/password'

// [Compliant] Shared utility imported from core
import { sha256hex } from '@beechcms/core'
```

## Feature Checklist

Before opening a pull request for a new vertical slice:

- [ ] **Folder Structure**: Slice lives in `apps/api/src/features/<name>/` or `apps/dashboard/src/features/<name>/`.
- [ ] **Barrel Export**: `index.ts` is the only file imported from outside the slice.
- [ ] **No Direct SQL**: Handlers use injected repositories; zero `c.env.DB` usage.
- [ ] **No Cross-Feature Imports**: Slice has zero imports from sibling feature folders.
- [ ] **Typed Contracts**: Any new repository interface is declared in `packages/core` with JSDoc explanations.
- [ ] **Async Side-Effects**: All outbound emails, webhooks, and loggers are wrapped in `c.get('scheduler').waitUntil(...)`.
- [ ] **Testing**: Integration tests run against real local Docker containers (`pnpm test`).
