# Technical Architecture

Starting from v0.4.0, the Beech CMS API follows a **Vertical Slice Architecture** and the **Repository Pattern**.

---

## Content Repository Pattern

The API does not interact directly with Cloudflare D1 SQL inside its handlers. Instead, it interacts through the platform-agnostic `ContentRepository` interface defined in `@beechcms/core` (`packages/core/src/content/content.repository.ts`).

- **Decoupling**: Business logic and HTTP handlers are separated from raw SQL queries.
- **Atomic Operations**: Operations like publishing a draft use the repository's batching capabilities (`database.batch`) to guarantee atomicity across content rows, draft mirrors, and relation junction tables.
- **Error Mapping**: Internal database errors are caught at the repository layer and mapped to standard Beech error classes (`EntryNotFoundError`, `SlugConflictError`, `RelationTargetNotFoundError`).

---

## Vertical Slice Implementation

Each API feature is a self-contained slice:
- Content operations: `apps/api/src/features/content/`
- Draft lifecycles: `apps/api/src/features/draft/`
- Authentication & Sessions: `apps/api/src/auth/`
- Widget data aggregations: `apps/api/src/features/widget/`
- Schema and Seed builder: `apps/api/src/features/seeds/`
- Event automations: `apps/api/src/features/automations/`

Handlers are "thin" and focus strictly on request validation, context injection, and response formatting, delegating data persistence to the repository layer.

---

## R2 Media Cleanup

Media cleanup during entry deletion is coordinated by the content delete handler using data returned by the repository. When an entry row is removed from D1, its associated uploaded files in Cloudflare R2 are deleted on a best-effort basis without rolling back the committed database transaction.

---

## Programmatic Lifecycle Hooks

`BeechConfig.hooks` (`apps/api/src/factory.ts`) accepts a `BeechHooks` object (defined in `@beechcms/core`, `packages/core/src/common/hooks.ts`) with optional `beforeCreate`, `beforeUpdate`, `beforeDelete`, `afterCreate`, `afterUpdate`, `afterDelete` callbacks. They are wired into `D1ContentRepository` via `repositoryMiddleware` and also execute for writes issued by the `AutomationRunner` (`edit_field`, `create_entry`).

Each hook receives a `HookContext`: `{ seed, repository, actor?, db, queue? }`:
- `seed`: The active Seed blueprint.
- `repository`: The `ContentRepository` instance — the sanctioned channel for side-effect reads/writes from a hook.
- `actor`: The JWT-derived `{ id, role, email? }` context (absent for background cron operations).
- `db`: The underlying database instance (`D1Database` in production, `better-sqlite3` in unit tests).
- `queue`: Optional `IQueueService` enabling lifecycle hooks to enqueue asynchronous background jobs via Cloudflare Queues.

`beforeCreate` / `beforeUpdate` may return a modified (alias-keyed) payload object to overwrite the persisted data, or return nothing (`void`) to leave the payload unchanged. Throwing a `HookValidationError` (from `@beechcms/core`) fails the write and maps to HTTP `422 Unprocessable Entity` with a field-level `errors[]` array.

### Registration

Hooks are configured at app-construction time via `createBeechApp` (`apps/api/src/index.ts`):

```typescript
import { createBeechApp } from './factory'
import { HookValidationError } from '@beechcms/core'

const app = createBeechApp({
  seeds: [],
  hooks: {
    beforeCreate: async (data, ctx) => {
      if (ctx.seed.slug !== 'events') return // scope to specific seed

      // 1. Business validation — prevents the write entirely
      if (data.endDate && data.startDate && data.endDate < data.startDate) {
        throw new HookValidationError('endDate must be after startDate', [
          { field: 'endDate', message: 'must be on or after startDate' },
        ])
      }

      // 2. Server-side derived field (return full payload)
      return { ...data, fullName: `${data.firstName} ${data.lastName}` }
    },

    beforeUpdate: async (id, patches, ctx) => {
      // Receives (id, patches, ctx) — return modified object to replace patch payload
      return patches
    },

    afterCreate: async (entry, ctx) => {
      // Non-blocking side effect (e.g. notify, sync to external system)
      await ctx.repository.update(ctx.seed, entry.id, { syncedAt: Math.floor(Date.now() / 1000) })
    },
  },
})
```

- `beforeCreate(data, ctx)` receives the incoming creation payload.
- `beforeUpdate(id, patches, ctx)` receives the target entry `id`, the update patches, and the context.
- `beforeDelete(id, ctx)` and `afterDelete(id, ctx)` receive the entry `id`.
- Use `ctx.seed.slug` to scope hooks to specific content types (`BeechHooks` is global across all seeds).

**Hard constraints (Cloudflare D1 has no interactive transactions — only `database.batch`):**

1. **No rollback for `after*` hooks.** They execute after the write batch has been committed. An unhandled error thrown from `afterCreate`/`afterUpdate`/`afterDelete` propagates to the client as an error, but the data **remains persisted**. Use `before*` hooks for checks that must abort the transaction.
2. **`mutateField(seed, id, fieldName, operation, options?)` bypasses document-level hooks.** It is a single atomic `UPDATE ... SET field = field ± ?` with optional `min`/`max` guards, used to avoid race conditions on counters (stock, balances).
3. **`runBatch(operations: BatchWrite[])` does not execute document-level hooks.** It composes `create`/`update`/`mutateField` operations from multiple seeds into a single `db.batch` call for multi-write atomicity.
