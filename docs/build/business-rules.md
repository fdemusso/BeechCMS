---
title: Business Rules, Hooks & Automations
description: Enforce cross-field validation, derived fields, atomic stock counters, multi-seed batches, custom endpoints, and event automations in BeechCMS.
keywords: validation rule, cross-field, unique, stock, decrement, increment, mutateField, runBatch, computed field, derived field, custom endpoint, customRoutes, hooks, beforeCreate, beforeUpdate, beforeDelete, afterCreate, HookValidationError, automations, public form
---

# Business Rules, Hooks & Automations

BeechCMS separates schema definitions (stored in D1 and managed via the dashboard or MCP) from business logic. When a project needs validation rules, computed values, atomic stock updates, automatic emails, or custom endpoints, choose the mechanism that matches the invariant.

---

## Decision Matrix

| Need | Mechanism | Where it lives | Deploy needed? |
|---|---|---|---|
| Cross-field validation, uniqueness check, aborting a write (`422`) | **Lifecycle hooks** (`beforeCreate`, `beforeUpdate`, `beforeDelete` + `HookValidationError`) | Application code (`hooks.ts` -> `worker.ts`) | Yes |
| Server-derived / computed fields before save | **Lifecycle hooks** (`beforeCreate`, `beforeUpdate` returning modified payload) | Application code | Yes |
| Race-safe counter / stock decrement (`field ± n` with `min`/`max`) | **`repository.mutateField(...)`** inside a hook or custom route | Application code | Yes |
| Multi-seed atomic writes (`create` / `update` / `mutateField` in one batch) | **`repository.runBatch([...])`** | Application code | Yes |
| Custom REST endpoints or background queue jobs | **`customRoutes`** & **`jobs`** in `createBeechApp(...)` | Application code | Yes |
| Async email, webhook, draft entry creation, or single-field edit on the triggering entry | **Automations** (`POST /api/automations`, `beech.automations.*`) | Stored in D1 (dashboard / script) | No |
| Bulk content updates, imports, or one-off maintenance | **Agent / CLI scripts** (`beech run` + `beech` SDK) | `.beech/scripts/*.ts` | No |
| Anonymous form submissions, spam protection, rate limits, idempotency | **Public API flags** (`allowPublicPost`, `defaultPublicStatus`, Time-Trap, `Idempotency-Key`) | Seed definition + Worker config | Seed only |

---

## 1. Programmatic Lifecycle Hooks

Hooks are configured at Worker startup via `createBeechApp({ hooks })` (see [Technical Architecture](/reference/architecture#programmatic-lifecycle-hooks)). In a project scaffolded with `@beechcms/cms`, generate a typed `hooks.ts` file with:

```bash
npx beech hooks init
```

This creates `hooks.ts` and wires it into `worker.ts` (or prints the import snippet if `worker.ts` was already customized; in the monorepo, wire hooks in `apps/api/src/index.ts`).

### Cross-Field Validation & Derived Fields

`BeechHooks` is **global across all seeds** — always scope callbacks with `ctx.seed.slug`. Throw `HookValidationError` from `@beechcms/core` inside a `before*` hook to abort the write with HTTP `422 Unprocessable Entity` and field-level `errors[]`:

```typescript
import { HookValidationError, type BeechHooks } from '@beechcms/core'

export const hooks: BeechHooks = {
  beforeCreate: async (data, ctx) => {
    if (ctx.seed.slug !== 'bookings') return // scope to specific seed

    if (data.end_date && data.start_date && data.end_date < data.start_date) {
      throw new HookValidationError('end_date must be on or after start_date', [
        { field: 'end_date', message: 'must be on or after start_date' },
      ])
    }

    // Return modified payload to compute server-derived fields
    return { ...data, code: `BK-${String(data.customer_ref ?? '').toUpperCase()}` }
  },
}
```

### Atomic Counters (`mutateField`) & Multi-Seed Batches (`runBatch`)

Use `ctx.repository.mutateField(...)` for stock, quotas, or balances instead of read-modify-write `update()` calls, which race under concurrent requests:

```typescript
// Decrement stock atomically; throws RepositoryError if stock would drop below 0
const { newValue } = await ctx.repository.mutateField(
  productsSeed,
  productId,
  'stock',
  { type: 'decrement', value: quantity },
  { min: 0 },
)
```

For multi-seed writes that must succeed or fail together, use `ctx.repository.runBatch(operations)` (executes in a single D1 `db.batch`), combining `create`, `update`, and `mutateField` entries.

### Hard Constraints (Cloudflare D1)

1. **No rollback for `after*` hooks.** D1 has no interactive SQL transactions. `afterCreate`, `afterUpdate`, and `afterDelete` run *after* the write batch commits. An error thrown in `after*` reaches the caller, **but the row stays persisted**. Put every aborting check in `before*`.
2. **`mutateField` and `runBatch` bypass document-level hooks.** Neither triggers `beforeCreate`/`afterCreate`/`beforeUpdate`/`afterUpdate`/`beforeDelete`/`afterDelete`.
3. **Automation writes trigger hooks.** `AutomationRunner` actions (`edit_field`, `create_entry`) write through `D1ContentRepository` and invoke `BeechHooks` — guard against `hook -> automation -> hook` loops.

---

## 2. Custom Endpoints & Queue Jobs

When business logic needs its own HTTP surface (for example, an atomic checkout endpoint that resolves multiple seeds and calls `runBatch`, or a third-party callback), register `customRoutes` in `createBeechApp(...)`:

```typescript
import { createBeechApp } from '@beechcms/api'
import { hooks } from './hooks'

export default createBeechApp({
  seeds: [],
  hooks,
  customRoutes: ({ publicRouter, protectedRouter }) => {
    // Mounted at /api/custom/public/* (no auth middleware)
    publicRouter.get('/health', (c) => c.json({ ok: true }))

    // Mounted at /api/custom/* (requires dashboard JWT + active account)
    protectedRouter.post('/checkout', async (c) => {
      const repo = c.get('repository')
      const registry = c.get('seedRegistry')
      // Use repo.mutateField / repo.runBatch here — never raw c.env.DB.prepare()
      return c.json({ ok: true, seeds: registry.all().length })
    })
  },
})
```

For asynchronous background work, register `jobs` on `createBeechApp({ jobs })` and enqueue from hooks via `ctx.queue?.enqueue(name, payload)` or from custom routes via `c.get('queue').enqueue(name, payload)`.

---

## 3. Event Automations (No Deploy Required)

Automations react to `create`, `update`, `delete`, or `cron` schedules using recursive `WhenNode` conditions and sequential actions (`set_variable`, `send_mail`, `webhook`, `edit_field`, `create_entry`).

- Manage them in the dashboard, via the REST API ([Automations API](/reference/automations-api)), or from an agent script (`beech.automations.list`, `get`, `create`, `update`, `toggle`, `delete`).
- Writing automations via an agent script follows the approval policy (`publish` requires approval in `production`; `delete` is `destructive` in all environments).
- **Important limits** (for rules that exceed these, use **Lifecycle hooks** or **Custom endpoints**):
  - `edit_field` only updates the **triggering entry** itself (cannot update a parent or sibling seed) and refuses localized fields.
  - `send_mail.to` supports `{{...}}` placeholders (for example `{{this.email}}`), whereas `webhook.url` must be a static `https://` URL.
  - `create_entry.field_map` maps field names or literal strings (no `{{...}}` template interpolation) and always creates entries with status `'draft'`.
  - Templates support field access and collection aggregates (`count`, `sum`, `avg`, `min`, `max`, `pluck`), **not** arithmetic (`+`, `-`, `*`, `/`).
  - `WhenNode` conditions cannot inspect previous field values (`old`/`prev`) or variables declared by `set_variable`.

---

## 4. Public Form Submissions

For anonymous intake forms (leads, bookings, contact requests), configure the Seed flags (`allowPublicPost: true`, `defaultPublicStatus: 'draft' | 'review' | 'published'`) rather than building a custom endpoint. The Public API automatically enforces Time-Trap anti-bot verification, honeypot fields, per-IP rate limiting, and `Idempotency-Key` deduplication. See [Public API](/reference/public-api) and [Forms SDK & Protection](/features/forms).
