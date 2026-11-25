# Dashboard Composer — Sprint 02: Persistence & API

> **Audience:** an AI coding agent implementing this sprint end-to-end with no prior
> knowledge of the Beech CMS codebase. Everything needed to implement is inline.
> Do not grep beyond what is referenced here unless something disagrees with the
> live code — in that case, trust live code and note the drift.

Depends on [Sprint 01](./01-dashboard-layout-core.md) (core types, validator,
`canEditDashboard` must exist in `@beechcms/core`). If they don't, STOP and run
Sprint 01 first.

After this sprint nothing visible changes for end users; we ship the D1 store
and the REST surface. The closest precedent in the repo is the **seed-layouts
store** from the entry-editor initiative — copy its shape file-by-file.

---

## 0. ROLE & GROUND RULES

You are a senior TypeScript engineer working on the **Beech CMS monorepo** (Turborepo).

1. **Cloudflare Workers runtime.** `apps/api` runs on Workers — no filesystem at
   request time. SQL is compiled-in TS strings.
2. **Repository pattern is mandatory.** Handlers never touch `context.env.DB`.
   Interface in `@beechcms/core`, D1 impl under `apps/api/src/shared/`, wired in
   `apps/api/src/middleware/repository.middleware.ts`, typed on
   `apps/api/src/types.ts`, read via `context.get('dashboardLayoutRepository')`.
3. **Vertical Slice Architecture.** New routes live in a new slice
   `apps/api/src/features/dashboard-layout/`, not in an existing handler.
4. **RFC 7807.** All error responses are `application/problem+json` via the
   existing problem helper used by the schema feature.
5. **Migrations.** New numbered SQL file in `apps/api/migrations/`; never edit
   applied ones; never skip numbers. Highest file at the time of writing is
   `0032_seeds.sql` → this sprint creates `0033_dashboard_layouts.sql`
   (**verify the next free number before creating it**).
6. **Docs are English.**

---

## 1. WHAT THIS SPRINT BUILDS

1. **D1 table** `dashboard_layouts(scope PK, layout, updated_at, updated_by)`.
2. **Core repository contract** `IDashboardLayoutRepository` + record type.
3. **D1 implementation** + unit tests against `D1TestDatabase` (better-sqlite3).
4. **Middleware wiring** + `Variables`/`RepositoryOverrides` typing.
5. **New VSA slice** `features/dashboard-layout/` with:
   - `GET  /api/dashboard-layout` — any authenticated user
   - `PUT  /api/dashboard-layout` — `canEditDashboard` only
   - `DELETE /api/dashboard-layout` — `canEditDashboard` only (Reset)
6. **Docs**: `docs/api-reference.md` + `docs/SYSTEM_MAP.md` entries.

The `scope` column ships now but only the literal `'default'` is used until
[Sprint 06](./06-role-based-dashboards.md) — designing the PK correctly today
avoids a migration later.

---

## 2. CONFIRMED DESIGN DECISIONS

- **(D1)** One row per scope. This sprint: only `'default'`.
- **(D4)** Server validates Zod shape + `validateDashboardLayout` semantics
  (seed auto-cleanup, span sums, 8 KB config cap). It stores the **cleaned**
  layout. Unknown widget types pass through untouched.
- **(D5)** Reset = `DELETE` of the row. `GET` after reset returns
  `{ scope: 'default', layout: null }` and the client regenerates the default.
- **(D6)** Write guard is `canEditDashboard(context.get('jwtPayload')?.role)`.
  `role` is already in the JWT (landed with entry-editor sprint 04a).

---

## 3. CURRENT STATE (verbatim reference)

### 3.1 Template repository — seed layouts

- Interface: `packages/core/src/seed-layout.repository.ts`
  (`ISeedLayoutRepository`: `get`, `getAllAsMap`, `upsert`, `remove`).
- D1 impl: `apps/api/src/shared/seed-layout.repository.d1.ts` — `JSON.parse` on
  read with corrupt-row skip, `INSERT ... ON CONFLICT ... DO UPDATE` upsert,
  unix-seconds timestamps.
- Tests: `apps/api/src/shared/seed-layout.repository.d1.test.ts` (D1TestDatabase
  harness) — copy the setup verbatim.

### 3.2 Wiring points

- `apps/api/src/middleware/repository.middleware.ts` — each repo constructed
  from `context.env.DB` and `context.set(...)`; `RepositoryOverrides` interface
  in the same file gets an optional `dashboardLayoutRepository?` for tests.
- `apps/api/src/types.ts` — add to `Variables`:
  `dashboardLayoutRepository: IDashboardLayoutRepository`.
- `apps/api/src/factory.ts` — slices are mounted on the JWT-protected app, e.g.
  `apiProtected.route('/widget', widgetApp)`. Mount the new slice as
  `apiProtected.route('/dashboard-layout', dashboardLayoutApp)`.

### 3.3 RBAC + JWT

`context.get('jwtPayload')` is `JwtClaims` from core and carries `role`
(`'admin' | 'editor'`). The schema handler's `PUT /:slug/layout` shows the exact
guard/problem-response pattern to copy.

---

## 4. MIGRATION — `apps/api/migrations/0033_dashboard_layouts.sql` (new)

```sql
CREATE TABLE IF NOT EXISTS dashboard_layouts (
  scope        TEXT NOT NULL PRIMARY KEY,   -- 'default' | 'role:admin' | 'role:editor'
  layout       TEXT NOT NULL,               -- JSON of DashboardLayout
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_by   TEXT NOT NULL                -- users.id of the writer
);
```

Wrangler auto-discovers via `migrations_dir`. Verify with
`pnpm run db:reset:local` in `apps/api/`.

---

## 5. REPOSITORY

### 5.1 Contract — `packages/core/src/dashboard-layout.repository.ts` (new)

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { DashboardLayout } from './dashboard-layout.js'

export interface DashboardLayoutRecord {
  scope: string
  layout: DashboardLayout
  updatedAt: number      // unix seconds
  updatedBy: string      // user id
}

export interface IDashboardLayoutRepository {
  /** Stored layout for a scope, or null if none was ever saved. */
  get(scope: string): Promise<DashboardLayoutRecord | null>
  /** Scopes that currently have a stored row — used by the Sprint 06 builder UI. */
  listScopes(): Promise<string[]>
  /** Upsert. `updatedBy` is the writer's user id. */
  upsert(scope: string, layout: DashboardLayout, updatedBy: string): Promise<void>
  /** Remove the stored row — the "Reset" action. */
  remove(scope: string): Promise<void>
}
```

Export from the core barrel.

### 5.2 D1 implementation — `apps/api/src/shared/dashboard-layout.repository.d1.ts` (new)

Mirror `seed-layout.repository.d1.ts` exactly: parameterized statements only,
`JSON.parse` guarded (corrupt row → `null` from `get`), upsert via
`ON CONFLICT(scope) DO UPDATE`.

---

## 6. API SLICE — `apps/api/src/features/dashboard-layout/` (new)

Structure matches existing slices (e.g. `features/schema/`): a `*.handler.ts`
exporting a Hono app, plus `index.ts` re-export.

### 6.1 `GET /api/dashboard-layout`

Any authenticated user.

```ts
dashboardLayoutApp.get('/', async (context) => {
  const repo = context.get('dashboardLayoutRepository')
  const record = await repo.get('default')
  if (!record) return context.json({ scope: 'default', layout: null })

  // Read-time auto-cleanup: strip widgets pointing at deleted seeds.
  const seedSlugs = new Set(context.get('seedRegistry').all().map(s => s.slug))
  const { cleaned } = validateDashboardLayout(record.layout, { seedSlugs })
  return context.json({ scope: 'default', layout: cleaned })
})
```

> The cleaned result is NOT written back on read (read paths stay side-effect
> free); persistence catches up on the next admin save.

### 6.2 `PUT /api/dashboard-layout`

Guarded by `canEditDashboard`. Pipeline (copy the schema-handler layout PUT):

1. `403` problem if `!canEditDashboard(context.get('jwtPayload')?.role)`.
2. `400` problem on unparsable JSON body.
3. `422` problem if `dashboardLayoutSchema.safeParse` fails (Zod shape).
4. `validateDashboardLayout(parsed.data, { seedSlugs })` — on `ok: false`,
   `422` problem with `errors.join('; ')`.
5. `upsert('default', cleaned, jwtPayload.sub)`.
6. `200` → `{ ok: true, layout: cleaned, warnings }` (warnings surface
   unknown-type notices to the builder without blocking).

### 6.3 `DELETE /api/dashboard-layout`

Same guard. `repo.remove('default')` → `{ ok: true }`.

### 6.4 Mount

`apps/api/src/factory.ts`:
`apiProtected.route('/dashboard-layout', dashboardLayoutApp)` — final paths are
`/api/dashboard-layout` (the protected app is mounted under `/api`).

---

## 7. FILES TO TOUCH (checklist)

Core:
- `packages/core/src/dashboard-layout.repository.ts` (new)
- `packages/core/src/index.ts` — barrel export

API:
- `apps/api/migrations/0033_dashboard_layouts.sql` (new — verify number)
- `apps/api/src/shared/dashboard-layout.repository.d1.ts` (new)
- `apps/api/src/shared/dashboard-layout.repository.d1.test.ts` (new)
- `apps/api/src/middleware/repository.middleware.ts` — wire + `RepositoryOverrides`
- `apps/api/src/types.ts` — `Variables.dashboardLayoutRepository`
- `apps/api/src/features/dashboard-layout/dashboard-layout.handler.ts` (new)
- `apps/api/src/features/dashboard-layout/index.ts` (new)
- `apps/api/src/features/dashboard-layout/__tests__/dashboard-layout.handler.test.ts` (new)
- `apps/api/src/factory.ts` — mount the slice

Docs:
- `docs/api-reference.md` — document the three endpoints
- `docs/SYSTEM_MAP.md` — add `dashboard_layouts` to the system tables list

---

## 8. ACCEPTANCE

1. `npx tsc --noEmit` passes in `packages/core` and `apps/api`.
2. `pnpm run db:reset:local` succeeds with the new table.
3. Handler tests (vitest, repository override pattern used by other slices):
   - `GET` with no row → `{ scope: 'default', layout: null }`.
   - `PUT` valid layout as admin → `200 { ok: true }`; subsequent `GET` returns it.
   - `PUT` as editor → `403` problem+json.
   - `PUT` invalid shape → `422`; duplicate widget ids → `422`.
   - Layout containing `config.seedSlug` of a non-existent seed → stored
     **without** that widget; `warnings` non-empty in the response.
   - Layout containing an unknown widget type `@acme/ghost` → stored
     **unchanged** (D3), warning only when `knownWidgetTypes` provided (it is
     not, server-side — so no warning; assert pass-through).
   - `DELETE` as admin → `200`; next `GET` → `layout: null`. `DELETE` as
     editor → `403`.
4. Repository tests: upsert/overwrite/get/remove/listScopes round-trips; corrupt
   JSON row → `get` returns `null` without throwing.
5. No dashboard change: the SPA does not call these endpoints yet (Sprint 03).

---

## 9. OPEN QUESTIONS (defaults inline)

- **Should `GET` 404 instead of `layout: null` when no row exists?** *Default:
  200 with `layout: null` — simpler client (single query, no error branch),
  consistent with "absence means generated default".*
- **Activity log entry on layout save?** The activity-log repository exists.
  *Default: yes, log `dashboard.layout.updated` / `dashboard.layout.reset` if
  the slice can do it in ≤10 lines via the existing repository; otherwise defer
  to Sprint 05.*
