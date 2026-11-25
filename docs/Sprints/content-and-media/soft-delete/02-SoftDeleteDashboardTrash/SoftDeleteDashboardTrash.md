# Sprint Plan — SoftDeleteDashboardTrash (Sprint 2/2)

Roadmap: `stages/01_sprint_planning/output/backlog/ROADMAP.md` → Sprint 2.
Feature brief: `stages/00_ideation/output/feature_brief.md`.
Previous sprint (shipped, archived): `docs/Sprints/SoftDeleteBackend/` (commit `7b1ca45`).

---

### Pre-Computation Analysis

**a) God Nodes identified via the CLI**

| Node | Degree / role | Why it matters here |
|------|---------------|---------------------|
| `contentApi` (`apps/dashboard/src/features/content-management/api/content.api.ts`) | 19 reverse edges at depth 2 (`graphify affected "contentApi" --depth 2`): every content hook, the seed-builder slice (`use-seeds.ts`, `SeedDangerZone.tsx`, `DeleteSeedDialog.tsx`, `SeedBuilderPage.tsx`), `App.tsx`, `main.tsx`, 4 test files | Any **signature change** to `contentApi.delete` ripples into the seed-builder slice. Therefore the purge flag is added as an **optional third parameter**, never as a changed positional arity. |
| `ContentListPage` (`apps/dashboard/src/pages/content-list.tsx`) | Composition root of the whole content surface; `graphify affected "useContentListModals" --depth 2` → `ContentListPage` → `content-list.tsx` → `App.tsx` (the only chain) | The Trash entry point belongs here (composition root), not inside a slice: it keeps the new route out of every slice's import graph. |
| `ContentDeleteDialog` (`apps/dashboard/src/features/content-delete-dialog/`) | Degree 6: `<- ContentListModals.tsx [imports]`, `<- index.ts [re_exports]`, `-> usePermissions()`, `-> useContentDeleteDialog()`, `<- content-delete-dialog.test.tsx` | Copy change (`"moved to Trash"` vs `"deleted forever"`) must stay **additive** (optional `mode` prop): its only production consumer is `ContentListModals`, and its unit test asserts the current copy. |
| `ContentTableView` | Degree 2 — consumed only by `ContentListPage` | The Trash table is a **sibling** component, not a variant of this one: adding trash branches here would drag restore/purge callbacks through 30+ props already in `ContentTableViewProps`. |
| `D1ContentRepository.rowToData` (`apps/api/src/shared/db/repositories/content.repository.d1.ts:177`) | The single row→API mapper for `findMany`/`findById`/`findBySlug`/`findPendingDrafts` | It is the reason `deleted_at` never reaches any HTTP payload today (see the blocker below). |

**b) Architectural boundaries affected**

| Package | Touched? | What exactly |
|---------|----------|--------------|
| `@beechcms/core` | **NO** | Zero files. `Seed.softDelete`, `Seed.retentionDays`, `SYSTEM_COLUMNS` (`deleted_at` already in it, `ddl.ts:54`) and the `ContentRepository` contract all shipped in Sprint 1 and are consumed as-is. |
| `apps/api` | **Yes — 2 files, contract-completing only** | `features/content/handlers/trash.ts` (list envelope + `applyVisibility`), `shared/db/repositories/content.repository.d1.ts` (`rowToData` carries `deleted_at` when non-null). No new route, no new permission rule, no middleware order change. |
| `apps/dashboard` | **Yes — the sprint's body** | New: `features/content-management/api/trash.api.ts`, `hooks/use-content-trash.ts`, `lib/retention.ts`, `components/ContentTrashView.tsx`, `pages/content-trash.tsx`. Modified: `consts/content.keys.ts`, `hooks/use-content-facets.ts`, `api/content.api.ts`, `index.ts` (barrel), `lib/dynamic-columns.tsx` (one optional field), `pages/content-list.tsx` (entry-point button), `App.tsx` (route), `features/content-delete-dialog/*` (optional `mode`), `locales/{en,it}.json`. |
| `@beechcms/cli` / `@beechcms/mcp` / `@beechcms/client` | **NO** | Out of scope; MCP content manipulation stays deferred (brief §5). |

**c) `graphify affected` impact analysis (breaking-change proof)**

```
$ graphify affected "contentApi" --depth 2
- App.tsx [imports] apps/dashboard/src/App.tsx:L26
- use-bulk-update.ts / use-content-facets.ts / use-content-item.ts / use-content-list.ts [imports]
- content-management-api.test.ts [imports]
- use-seeds.ts [imports] apps/dashboard/src/features/seed-builder/hooks/use-seeds.ts:L9
- main.tsx [imports_from]  •  app.test.tsx [imports_from]
- content-management/index.ts [re_exports]
- use-content-list-modals.ts / use-content-list-query.ts [imports_from]
- use-draft-hooks.test.ts / content-list-relation.test.tsx [imports_from]
- seed-builder/index.ts [re_exports]
- DeleteSeedDialog.tsx / SeedBuilderPage.tsx / SeedDangerZone.tsx / use-seed-editor-dialog.tsx [imports_from]

$ graphify affected "useContentListModals" --depth 2
- ContentListPage() [calls] apps/dashboard/src/pages/content-list.tsx:L45
- content-list.tsx [imports] apps/dashboard/src/pages/content-list.tsx:L24
- App.tsx [imports] apps/dashboard/src/App.tsx:L9

$ graphify explain "ContentDeleteDialog"      → degree 6 (listed in (a))
$ graphify explain "ContentTableView"         → degree 2 (ContentListPage only)
$ graphify path "ContentListPage" "contentApi" → No directed path
   ⇒ the page never calls the API layer directly; it goes through hooks. The Trash page
     MUST follow the same shape (page → hook → api), or it breaks the established layering.
```

**Breaking-change verdict:** every change in this sprint is additive (optional prop, optional
parameter, optional field, new files). No consumer listed above needs editing to keep compiling.

**d) BLOCKER found during pre-computation — the frozen contract is not consumable as-is**

The roadmap assumed Sprint 2 is "pure presentation over a frozen HTTP contract". Reading the
shipped code proves two gaps that make the required UI **impossible** to build without an API-side
correction:

1. **`deleted_at` never reaches the wire.** `rowToData` (`content.repository.d1.ts:177-184`)
   hand-builds its result from `id, slug, status, created_at, updated_at` + branch aliases.
   `deleted_at` is a system column (`ddl.ts:54`) that is selected by `buildSelectQuery` and used
   for `ORDER BY deleted_at DESC` in `trashListHandler`, but it is **dropped by the mapper**.
   The deliverable "`deleted_at` column + retention countdown" cannot be rendered from the current
   payload.
2. **`GET /:slug/trash` skips `applyVisibility` and the `data` envelope.** `trashListHandler`
   returns `repository.findMany()` items raw, while `listHandler` returns
   `{ ...item, has_pending_draft, data: applyVisibility(item, seed, actor) }`. Two consequences:
   the dashboard's `ContentEntry` type (flat system fields + nested `data`) does not match trash
   items, **and** branches carrying `policies.visibility: 'masked' | 'hidden'` are emitted in the
   clear on the trash route while being masked on the main list — a field-level leak.

Both are fixed in **T1**, inside the `apps/api` content slice, in ≤ 8 lines. This is contract
completion for the consumer this sprint exists to build, not new backend scope: no new route,
no new permission, no schema change, no behaviour change for any seed without `softDelete`.

---

### VETO Audit

**Botanical Invariant — no D1 access bypassing `@beechcms/core`.**
The dashboard issues zero SQL and holds zero physical column names: it renders `entry.data[branch.alias]`
using aliases read from the `Seed` served by `GET /api/schema`, and the two system timestamps
`created_at` / `deleted_at`, which are members of `SYSTEM_COLUMNS` in `packages/core/src/engine/ddl.ts:54`
— addressed by name because they are system columns, never because a table shape was assumed.
T1's repository edit adds `deleted_at` to the mapper output only when the row already carries a
non-null value; the value itself comes from `buildSelectQuery`, the engine's single select chokepoint.
No handler in this sprint writes raw SQL. **PASS.**

**Public API isolation (brief §2) — unchanged and unreachable from here.**
Sprint 1's chokepoint is `SelectOptions.trashed`, defaulting to `'active'` in `buildSelectQuery`
(`query.ts:67`). Nothing in this sprint passes `trashed` on any public path. The `rowToData` edit
is guarded by `row.deleted_at != null`, and a public/active query can never return a row with a
non-null `deleted_at` — so every public and protected **active** payload stays byte-identical.
Regression-guarded by the existing `public-trash-isolation.integration.test.ts`. **PASS.**

**VSA — zero cross-feature imports.**
The Trash view, its hooks, its API client and its retention helper all live inside
`apps/dashboard/src/features/content-management/`. It imports only: `@/components/ui/*` (shared UI
primitives), `@/lib/api` (shared HTTP client), `@/features/shared` (the shared slice — the existing
home of `usePermissions`, `useActiveSeed`, `DASHBOARD_QUERY_KEYS`, `BACKREF_QUERY_KEY`), and
`@beechcms/core` types. Composition with `content-delete-dialog`, `navigation` and the sidebar
happens in `pages/content-trash.tsx` — the composition root, exactly as `pages/content-list.tsx`
already composes five sibling slices through their public barrels. **No new slice-to-slice deep
import is introduced.** `content-delete-dialog` is modified from inside its own slice. **PASS.**

**Cloudflare purity.** No new binding, no job, no scheduler. The retention countdown is a pure
client-side computation over `deleted_at + seed.retentionDays`; `findExpiredByRetention` stays
uncalled, as Sprint 1 left it (brief §2). **PASS.**

**YAGNI adjustments made in this audit (plan changed before drafting):**
- **REJECTED** — registering `"trash"` as a fourth `DashboardView` in `@beechcms/core`
  (`resolveAuthorizedViews`): it would push a UI mode into the engine's seed contract and into
  `viewRegistry`, for a surface with no per-seed configuration. Replaced by a plain route.
- **REJECTED** — reusing `generateColumns()` / `useContentTableConfig` for the trash table:
  they wire edit, delete, grouping, conditional formats, filter DSL and cell-activation. The Trash
  needs 6 read-only columns and 2 actions. Reuse here costs more coupling than duplication.
- **REJECTED** — server-side sorting/filter/search on `GET /:slug/trash`. The endpoint is
  `ORDER BY deleted_at DESC` with `page`/`limit` only. The UI matches the endpoint; extending the
  endpoint is not this sprint's job.
- **REJECTED** — a "Restore all" / "Empty trash" affordance. Not in the brief's user stories;
  `bulk-purge` is capped at 500 ids server-side (`MAX_BULK_SIZE`) and page-scoped selection
  already satisfies "select multiple and act in bulk".

---

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

This is the **final** sprint of the roadmap; it exists *after* `SoftDeleteBackend` and could not
have been built before it. The hard sequential gate was stated in the roadmap: the dashboard is
pure presentation over an HTTP contract, and a UI written against an unimplemented contract is
untestable fiction. That gate is now cleared — the five routes, their permission rules and their
D1 semantics shipped and passed review (`docs/Sprints/SoftDeleteBackend/review_report.md`: PASS).

Architecturally the sprint earns its place for three reasons:

1. **It closes the user-facing half of a feature whose backend is already paid for.** Soft delete
   is live today: `DELETE /api/content/:slug/:id` on a `softDelete: true` seed already trashes
   instead of erasing. Without this sprint, the trashed rows are invisible and unreachable to the
   only human who can act on them — an editor. The feature is currently *worse* than no feature:
   data silently accumulates in a bin nobody can open.

2. **VSA is respected by construction.** Every new file lands in the `content-management` slice,
   whose charter is exactly "listing and acting on content entries of one seed". The Trash is a
   second listing of the same entity with two extra verbs. Nothing is added to `@beechcms/core`,
   because nothing here is shared by two consumers: the retention countdown has exactly one caller,
   and YAGNI forbids promoting it to core on speculation.

3. **The Botanical Invariant holds without effort, because the dashboard never sees the database.**
   The Trash renders `Seed` metadata (`softDelete`, `retentionDays`, `displayNameAlias`, branch
   aliases) served by `GET /api/schema`, and rows served by `GET /api/content/:slug/trash` already
   translated by `dbToApi`. The one backend edit in this sprint (T1) exists precisely to keep that
   property: rather than let the dashboard infer a deletion time from somewhere else, the value is
   published through the same engine mapper every other field goes through.

The sprint also repairs a field-level visibility leak on the trash route (T1.2), discovered while
verifying the contract. Repairing it here is correct: it is one line in the handler that consumes
the route, it is invisible to every other surface, and shipping a Trash UI on top of a leaking
endpoint would make the leak user-reachable for the first time.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Backend — the frozen contract (all shipped in Sprint 1, verified by reading the routes):**

`apps/api/src/features/content/index.ts` — registration order (static before dynamic is mandatory
and already correct; **do not reorder**):

```
content.patch('/:slug/:id/kanban-move')
content.patch('/:slug/:id/kanban-position')
content.get  ('/:slug/view-config')
content.put  ('/:slug/view-config')
content.get  ('/:slug/trash',                trashListHandler)      ← before /:slug/:id
content.post ('/:slug/trash/bulk-restore',   bulkRestoreHandler)
content.post ('/:slug/trash/bulk-purge',     bulkPurgeHandler)
content.post ('/:slug/trash/reconcile',      reconcilePurgesHandler)
content.get  ('/:slug',                      listHandler)
content.get  ('/:slug/facets')
content.get  ('/:schema_slug/by-slug/:entry_slug')
content.post ('/:slug/:id/restore',          restoreHandler)        ← before POST /:slug
content.get  ('/:slug/:id')   content.post('/:slug')   content.patch('/:slug/bulk')
content.put  ('/:slug/:id')   content.delete('/:slug/:id', deleteHandler)
```

Permission rules — `apps/api/src/middleware/permission.middleware.ts:119-123`, all ahead of the
generic `/:slug/:id` patterns:

| Method | Pattern | Requirement |
|---|---|---|
| GET | `/api/content/{slug}/trash` | `content:read` on `{slug}` |
| POST | `/api/content/{slug}/trash/bulk-restore` | `content:update` on `{slug}` |
| POST | `/api/content/{slug}/trash/bulk-purge` | `content:delete` on `{slug}` |
| POST | `/api/content/{slug}/trash/reconcile` | `content:delete` on `{slug}` |
| POST | `/api/content/{slug}/{id}/restore` | `content:update` on `{slug}` |

Response shapes as implemented (`handlers/trash.ts`, `handlers/delete.ts`):

```
GET    /api/content/:slug/trash?page=1&limit=25
       200 { items: Row[], total: number, page: number, limit: number }   // ORDER BY deleted_at DESC
       409 problem+json  type: 'content-soft-delete-disabled'   when seed.softDelete !== true
       404 problem+json  type: 'content-seed-not-found'
POST   /api/content/:slug/:id/restore
       200 { success: true, slug: string }        // slug MAY differ: auto-rename on conflict
       404 problem+json when no trashed row with that id
POST   /api/content/:slug/trash/bulk-restore   body { ids: string[] }   (1..500)
       200 { succeeded: string[], failed: [{ id, problem: { status, type, detail } }] }
       400 type:'bulk-invalid-ids' | 'bulk-size-exceeded' | 'content-invalid-json'
POST   /api/content/:slug/trash/bulk-purge     body { ids: string[] }   (1..500)
       200 { succeeded: string[], failed: [{ id, problem: { status, type, detail } }] }
DELETE /api/content/:slug/:id[?purge=true]
       200 { success: true, softDeleted: boolean }   // softDeleted=false ⇒ irreversible + R2 wiped
```

`MAX_BULK_SIZE = 500` (`handlers/trash.ts:15`). Trash pagination caps `limit` at 100
(`Math.min(parsePositiveInt(query.limit, 25), 100)`).

**Backend — the two gaps (see Pre-Computation (d)):**
`content.repository.d1.ts:177-184` `rowToData` emits `{ id, slug, status, created_at, updated_at }`
+ branch aliases — **no `deleted_at`**. `trashListHandler` returns those items raw, without the
`data` envelope and without `applyVisibility`, unlike `listHandler` (`handlers/list.ts:188-198`).

**Frontend — the idioms this sprint must mirror:**

- **Layering (proved by `graphify path "ContentListPage" "contentApi"` → no directed path):**
  page → hook (`hooks/*.ts`) → api object (`api/*.ts`) → `@/lib/api`. Pages never call the API layer.
- **Query keys** — `consts/content.keys.ts`: `CONTENT_QUERY_KEYS.{all,lists,list,details,detail,draft}`,
  `FACET_QUERY_KEYS`. Invalidation idiom (`use-content-facets.ts:32-46`): on delete, invalidate
  `CONTENT_QUERY_KEYS.all` + `DASHBOARD_QUERY_KEYS.activity()` + `[BACKREF_QUERY_KEY]`.
- **Entry shape** — `apps/dashboard/src/lib/dynamic-columns.tsx:52-69`:
  `{ id, schema_slug, slug, status, has_pending_draft?, data: Record<string, unknown>, created_at, updated_at }`.
- **Table** — `@/components/ui/data-table`. `getRowId` returns `row.id`
  (`use-data-table-state.ts:198`), so `RowSelectionState` keys **are** entry ids; `selectedIds` is
  `Object.keys(rowSelection).filter(id => rowSelection[id])` (`use-content-list-modals.ts:118-120`).
  Timestamps render through `<RelativeTime value={...}/>` from `@/components/ui/relative-time`,
  which normalizes unix seconds to ms itself.
- **Permissions** — `usePermissions()` from `@/features/shared/hooks/use-permissions`:
  `can(permission: Permission, scope: Scope)`. UI hiding is cosmetic; the server gate enforces.
  Disabled-destructive-button-with-tooltip idiom: `content-delete-dialog.tsx:65-91`.
- **Seed metadata reaches the dashboard whole**: `GET /api/schema` returns full `Seed` objects
  (`apps/api/src/features/schema/schema.handler.ts:53-71`, filtered per-seed by `content:read`),
  so `seed.softDelete` and `seed.retentionDays` are available client-side via
  `useActiveSeed(slug)` with **no new endpoint**.
- **Routes** — `App.tsx`: `/content/:slug/create`, `/content/:slug/:id`, `/content/:slug`, each
  wrapped in `<ProtectedRoute>`.
- **i18n** — `apps/dashboard/src/locales/{en,it}.json`; existing block `content.deleteDialog.{title,single,multiple}`
  at line 605 in both files. Both files must stay key-identical.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

**`apps/api` — contract completion only (2 files, no new routes, no new permissions)**

| File | Change |
|---|---|
| `apps/api/src/shared/db/repositories/content.repository.d1.ts` | `rowToData`: carry `deleted_at` when non-null (3 lines). |
| `apps/api/src/features/content/handlers/trash.ts` | `trashListHandler`: emit the `listHandler` envelope (`{ ...item, data: applyVisibility(item, seed, actor) }`). |
| `apps/api/src/features/content/test/integration/soft-delete.integration.test.ts` | +2 `it()` blocks (payload carries `deleted_at`; masked branch is masked on the trash route). |

**`apps/dashboard` — new files**

| File | Content |
|---|---|
| `src/features/content-management/api/trash.api.ts` | `trashApi` = `fetchTrash` / `restore` / `bulkRestore` / `bulkPurge`, plus the trash response types. |
| `src/features/content-management/hooks/use-content-trash.ts` | `useContentTrash`, `useRestoreContent`, `useBulkRestoreContent`, `useBulkPurgeContent`, `usePurgeContent`. |
| `src/features/content-management/lib/retention.ts` | `retentionRemainingDays()` — pure, no clock read inside. |
| `src/features/content-management/components/ContentTrashView.tsx` | Trash table + bulk action bar + per-row actions. Presentational; all state passed in. |
| `src/pages/content-trash.tsx` | `ContentTrashPage` — composition root for `/content/:slug/trash`. |
| `src/features/content-management/test/unit/trash-api.test.ts` | Unit — request construction for every trash call. |
| `src/features/content-management/test/unit/retention.test.ts` | Unit — retention matrix. |
| `src/features/content-management/test/unit/use-content-trash.test.ts` | Unit — mutation success ⇒ cache invalidation. |

**`apps/dashboard` — modified files**

| File | Change |
|---|---|
| `src/features/content-management/consts/content.keys.ts` | `+ TRASH_QUERY_KEYS`. |
| `src/features/content-management/api/content.api.ts` | `delete(slug, id, options?: { purge?: boolean })` — optional 3rd param. |
| `src/features/content-management/hooks/use-content-facets.ts` | `useDeleteContent` accepts `purge?`, invalidates `TRASH_QUERY_KEYS.all` too. |
| `src/features/content-management/index.ts` | Barrel: export the 4 new modules. |
| `src/lib/dynamic-columns.tsx` | `ContentEntry.deleted_at?: number | null` (optional ⇒ no consumer breaks). |
| `src/pages/content-list.tsx` | Trash button in the page header, rendered only when `seed.softDelete === true`. |
| `src/App.tsx` | `+ /content/:slug/trash` route, above `/content/:slug/:id`. |
| `src/features/content-delete-dialog/use-content-delete-dialog.ts` | `+ mode?: "trash" | "purge"` in props; resolved default. |
| `src/features/content-delete-dialog/content-delete-dialog.tsx` | Copy + confirm-label + irreversibility warning driven by `mode`. |
| `src/features/content-delete-dialog/test/unit/content-delete-dialog.test.tsx` | +1 `it()` per mode. |
| `src/locales/en.json`, `src/locales/it.json` | `content.trash.*` block + `content.deleteDialog.*` additions. |

**Explicitly NOT produced:** no `@beechcms/core` change, no new API route, no new permission rule,
no `reconcile` UI, no scheduler, no MCP tool. See SECTION 7.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### T1 — API: complete the trash payload (`apps/api`)

**T1.1 — `apps/api/src/shared/db/repositories/content.repository.d1.ts`**, in `rowToData`
(currently lines 177-184), immediately after the base object literal:

```ts
  private async rowToData(seed: Seed, row: any): Promise<Record<string, any>> {
    const data: Record<string, any> = {
      id: row.id,
      slug: row.slug,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }

    // A live row always has deleted_at NULL, so every active-path payload (public API included)
    // stays byte-identical; only a row read through `trashed: 'trashed' | 'all'` carries the key.
    if (row.deleted_at != null) {
      data.deleted_at = row.deleted_at
    }

    // …unchanged branch mapping below…
```

Do **not** add `deleted_at` unconditionally: a `deleted_at: null` key on every active row is a
silent contract change for the Public API, the client SDK and the generated types.

**T1.2 — `apps/api/src/features/content/handlers/trash.ts`**, `trashListHandler` only.
Add the imports and replace the response construction:

```ts
import { EntryNotFoundError, type ActorContext } from '@beechcms/core'
import { applyVisibility } from '../../../shared/policies/apply-policies'
```

```ts
    const repository = context.get('repository')
    const { items, total } = await repository.findMany(seed, {
      trashed: 'trashed',
      pagination: { limit, offset },
      orderBy: { column: 'deleted_at', dir: 'DESC' },
    })

    // Same envelope as listHandler: the dashboard consumes one entry shape, and a branch marked
    // `policies.visibility: 'masked' | 'hidden'` must not become readable just because the row
    // is in the Trash.
    const jwtPayload = context.get('jwtPayload')
    const actor: ActorContext = context.get('actor') ?? {
      type: 'authenticated',
      userId: jwtPayload?.sub,
      role: jwtPayload?.role,
    }
    const entries = items.map((item) => ({ ...item, data: applyVisibility(item, seed, actor) }))

    return context.json({ items: entries, total, page, limit })
```

`has_pending_draft` is deliberately NOT computed here: a trashed entry is not editable, and the
per-row `repository.hasDraft()` call `listHandler` makes would add N queries for a value the Trash
never renders.

Leave `restoreHandler`, `bulkRestoreHandler`, `bulkPurgeHandler`, `reconcilePurgesHandler`
untouched.

### T2 — Dashboard: entry type + purge flag

**`src/lib/dynamic-columns.tsx`**, inside `interface ContentEntry` (after `updated_at`):

```ts
  /** Epoch timestamp of the soft deletion. Present only on rows read from the Trash endpoint. */
  deleted_at?: number | null
```

**`src/features/content-management/api/content.api.ts`** — optional third parameter, existing
call sites untouched:

```ts
  /**
   * Delete a content entry.
   * On a `softDelete: true` seed this moves the entry to the Trash; `options.purge` forces the
   * irreversible path (row + junction + drafts + R2 + ledger event).
   */
  delete: async (
    slug: string,
    id: string,
    options?: { purge?: boolean }
  ): Promise<{ success: boolean; softDeleted?: boolean }> => {
    const response = await api.delete<{ success: boolean; softDeleted?: boolean }>(
      `/content/${slug}/${id}${options?.purge ? "?purge=true" : ""}`
    )
    return response.data
  },
```

### T3 — Dashboard: `api/trash.api.ts` (new)

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { api } from "@/lib/api"
import type { ContentEntry } from "@/lib/dynamic-columns"

/** Mirrors the API's `MAX_BULK_SIZE` (apps/api/src/features/content/handlers/trash.ts). */
export const MAX_TRASH_BULK_SIZE = 500

export interface TrashListParams {
  page: number
  limit: number
}

export interface TrashListResponse {
  items: ContentEntry[]
  total: number
  page: number
  limit: number
}

export interface BulkTrashFailedItem {
  id: string
  problem: { status: number; type: string; detail: string }
}

export interface BulkTrashResult {
  succeeded: string[]
  failed: BulkTrashFailedItem[]
}

export interface RestoreResult {
  success: boolean
  /** The slug the entry actually ended up with — auto-renamed when the original was reassigned. */
  slug: string | null
}

/**
 * Trash API within the Content Management Slice.
 * Every route is protected and gated: read ⇒ `content:read`, restore ⇒ `content:update`,
 * purge ⇒ `content:delete`.
 */
export const trashApi = {
  fetchTrash: async (slug: string, params: TrashListParams): Promise<TrashListResponse> => {
    const response = await api.get<TrashListResponse>(`/content/${slug}/trash`, { params })
    return response.data
  },

  restore: async (slug: string, id: string): Promise<RestoreResult> => {
    const response = await api.post<RestoreResult>(`/content/${slug}/${id}/restore`)
    return response.data
  },

  bulkRestore: async (slug: string, ids: string[]): Promise<BulkTrashResult> => {
    const response = await api.post<BulkTrashResult>(`/content/${slug}/trash/bulk-restore`, { ids })
    return response.data
  },

  bulkPurge: async (slug: string, ids: string[]): Promise<BulkTrashResult> => {
    const response = await api.post<BulkTrashResult>(`/content/${slug}/trash/bulk-purge`, { ids })
    return response.data
  },
}
```

### T4 — Dashboard: query keys

**`src/features/content-management/consts/content.keys.ts`** — append:

```ts
export const TRASH_QUERY_KEYS = {
  all: ["trash"] as const,
  lists: () => [...TRASH_QUERY_KEYS.all, "list"] as const,
  list: (slug: string, page: number, limit: number) =>
    [...TRASH_QUERY_KEYS.lists(), slug, page, limit] as const,
}
```

A separate root (not a child of `CONTENT_QUERY_KEYS.all`) is required: soft-deleting from the main
list invalidates `CONTENT_QUERY_KEYS.all`, and the Trash must be invalidated by the *same* events
but also by restore/purge, which do not belong to the content list's key space.

### T5 — Dashboard: `lib/retention.ts` (new, pure)

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/** Seconds in a day — the unit `retentionDays` is expressed in on `Seed`. */
const SECONDS_PER_DAY = 86_400

/**
 * Whole days left before `deletedAt` falls outside the seed's retention window.
 *
 * Mirrors the server-side predicate documented on `ContentRepository.findExpiredByRetention`
 * (`deleted_at + retentionDays * 86400 <= now`). Returns `null` when the seed declares no
 * retention or the row carries no deletion timestamp — the UI then shows no countdown at all,
 * because "0 days left" and "no policy" must never look alike.
 *
 * @param nowSeconds Unix seconds, supplied by the caller. Never read the clock in here.
 */
export function retentionRemainingDays(
  deletedAt: number | null | undefined,
  retentionDays: number | undefined,
  nowSeconds: number
): number | null {
  if (deletedAt == null || retentionDays == null || retentionDays <= 0) return null
  const expiresAt = deletedAt + retentionDays * SECONDS_PER_DAY
  return Math.max(0, Math.ceil((expiresAt - nowSeconds) / SECONDS_PER_DAY))
}
```

### T6 — Dashboard: `hooks/use-content-trash.ts` (new)

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query"
import { DASHBOARD_QUERY_KEYS, BACKREF_QUERY_KEY } from "@/features/shared"
import { contentApi } from "../api/content.api"
import { trashApi, type BulkTrashResult, type RestoreResult, type TrashListResponse } from "../api/trash.api"
import { CONTENT_QUERY_KEYS, TRASH_QUERY_KEYS } from "../consts/content.keys"

/**
 * A trash mutation moves a row between the two listings, so both key spaces go stale at once;
 * the activity feed and back-refs follow the same rule the delete path already applies
 * (see `useDeleteContent`).
 */
function invalidateTrashSurfaces(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: TRASH_QUERY_KEYS.all })
  queryClient.invalidateQueries({ queryKey: CONTENT_QUERY_KEYS.all })
  queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.activity() })
  queryClient.invalidateQueries({ queryKey: [BACKREF_QUERY_KEY] })
}

export function useContentTrash(
  slug: string | undefined,
  params: { page: number; limit: number },
  options?: { enabled?: boolean }
) {
  return useQuery<TrashListResponse>({
    queryKey: TRASH_QUERY_KEYS.list(slug || "", params.page, params.limit),
    queryFn: () => {
      if (!slug) throw new Error("Slug is required")
      return trashApi.fetchTrash(slug, params)
    },
    enabled: Boolean(slug) && (options?.enabled ?? true),
    placeholderData: (previous) => previous,
    staleTime: 10 * 1000,
  })
}

export function useRestoreContent(slug: string) {
  const queryClient = useQueryClient()
  return useMutation<RestoreResult, Error, { id: string }>({
    mutationFn: ({ id }) => trashApi.restore(slug, id),
    onSuccess: () => invalidateTrashSurfaces(queryClient),
  })
}

export function usePurgeContent(slug: string) {
  const queryClient = useQueryClient()
  return useMutation<{ success: boolean }, Error, { id: string }>({
    mutationFn: ({ id }) => contentApi.delete(slug, id, { purge: true }),
    onSuccess: () => invalidateTrashSurfaces(queryClient),
  })
}

export function useBulkRestoreContent(slug: string) {
  const queryClient = useQueryClient()
  return useMutation<BulkTrashResult, Error, { ids: string[] }>({
    mutationFn: ({ ids }) => trashApi.bulkRestore(slug, ids),
    onSuccess: () => invalidateTrashSurfaces(queryClient),
  })
}

export function useBulkPurgeContent(slug: string) {
  const queryClient = useQueryClient()
  return useMutation<BulkTrashResult, Error, { ids: string[] }>({
    mutationFn: ({ ids }) => trashApi.bulkPurge(slug, ids),
    onSuccess: () => invalidateTrashSurfaces(queryClient),
  })
}
```

**Also update `hooks/use-content-facets.ts`** so a soft delete from the main list refreshes the
Trash:

```ts
export function useDeleteContent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ slug, id, purge }: { slug: string; id: string; purge?: boolean }) =>
      contentApi.delete(slug, id, purge ? { purge: true } : undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONTENT_QUERY_KEYS.all })
      // A soft delete creates a Trash row; a purge removes one. Either way the Trash is stale.
      queryClient.invalidateQueries({ queryKey: TRASH_QUERY_KEYS.all })
      queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.activity() })
      queryClient.invalidateQueries({ queryKey: [BACKREF_QUERY_KEY] })
    },
  })
}
```

`purge` is optional, so `use-content-list-modals.ts`'s existing `deleteContent({ slug, id })` call
keeps compiling and keeps its current behaviour.

### T7 — Dashboard: `components/ContentTrashView.tsx` (new)

Presentational. Owns no fetching; receives rows, selection state and callbacks. Columns, in order:

| id | header | cell |
|---|---|---|
| `select` | header checkbox (page-scoped) | row checkbox |
| `display` | `seed.label` | `String(row.data[seed.displayNameAlias ?? "title"] ?? row.id)`, truncated |
| `slug` | `content.table.slug` fallback `"Slug"` | monospace, `—` when null |
| `deleted_at` | `content.trash.deletedAt` | `<RelativeTime value={row.deleted_at ?? null} />` |
| `retention` | `content.trash.retention` | `retentionRemainingDays(...)` ⇒ `t("content.trash.daysLeft", { count })`, or `—` when `null` |
| `actions` | — | Restore (`content:update`) + Delete forever (`content:delete`), both `disabled` when the permission is missing |

```tsx
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table"
import type { Seed } from "@beechcms/core"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DataTable } from "@/components/ui/data-table"
import { RelativeTime } from "@/components/ui/relative-time"
import { SmallCta } from "@/components/ui/small-cta"
import type { ContentEntry } from "@/lib/dynamic-columns"
import { retentionRemainingDays } from "../lib/retention"

export interface ContentTrashViewProps {
  seed: Seed
  data: ContentEntry[]
  /** Unix seconds, resolved once per render by the page — keeps this component pure w.r.t. time. */
  nowSeconds: number
  rowSelection: RowSelectionState
  onRowSelectionChange: (updater: RowSelectionState | ((old: RowSelectionState) => RowSelectionState)) => void
  selectedIds: string[]
  pageIndex: number
  onPageIndexChange: (index: number) => void
  pageSize: number
  pageCount: number
  totalRows: number
  canRestore: boolean
  canPurge: boolean
  isMutating: boolean
  onRestore: (id: string) => void
  onPurge: (id: string) => void
  onBulkRestore: (ids: string[]) => void
  onBulkPurge: (ids: string[]) => void
}
```

Body notes for the executing agent:

- `columns` in a `React.useMemo` keyed on `[seed, t, nowSeconds, canRestore, canPurge, isMutating, onRestore, onPurge]`.
- The bulk bar renders above `<DataTable>` only when `selectedIds.length > 0`:
  `t("content.trash.selectedCount", { count: selectedIds.length })` + `Restore` +
  `Delete forever` (`variant="destructive"`), each disabled by the matching permission or
  `isMutating`.
- `emptyState`: `<SmallCta svgPath={`${import.meta.env.BASE_URL}noResult.svg`} title={t("content.trash.empty")} />`.
- `<DataTable>` props: `columns`, `data`, `rowSelection`, `onRowSelectionChange`, `pageSize`,
  `pageIndex`, `onPageIndexChange`, `pageCount`, `totalRows`, `manualPagination`, `emptyState`.
  Row ids come from `row.id` via the table's own `getRowId`, so `Object.keys(rowSelection)` are
  entry ids — do not re-map them.
- Never render an edit affordance: a trashed entry is not editable.

### T8 — Dashboard: `pages/content-trash.tsx` (new)

Mirrors `pages/content-list.tsx`'s shell (`SidebarProvider` → `SiteHeader` → `AppSidebar` →
`SidebarInset`). Behaviour:

```tsx
const { slug } = useParams<{ slug: string }>()
const navigate = useNavigate()
const { can } = usePermissions()
const { seed, isLoading: isSeedLoading } = useActiveSeed(slug)

const [page, setPage] = React.useState(1)
const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})
const PAGE_SIZE = 25

const softDeleteEnabled = seed?.softDelete === true
const trash = useContentTrash(slug, { page, limit: PAGE_SIZE }, { enabled: softDeleteEnabled })
```

- `seed === null && !isSeedLoading` → the same destructive-box error block the content list uses.
- `seed && !softDeleteEnabled` → `SmallCta` with `t("content.trash.disabled")` and a button back to
  `/content/${slug}`. **Do not call the endpoint**: it answers 409 `content-soft-delete-disabled`.
- `nowSeconds`: `React.useMemo(() => Math.floor(Date.now() / 1000), [trash.dataUpdatedAt])` — one
  reading per data refresh; no interval timer.
- Confirmations reuse the `content-delete-dialog` slice barrel:
  - Restore (single and bulk) acts immediately — restore is reversible, a confirmation is friction.
  - Purge (single and bulk) opens `<ContentDeleteDialog mode="purge" … />`; `onConfirm` awaits the
    mutation and rethrows on failure so the dialog renders the error (its `handleConfirm` already
    catches and displays).
- After a successful bulk action: `setRowSelection({})`, and `toast.success` /
  `toast.error(t("content.trash.partialFailure", { count: result.failed.length }))` when
  `result.failed.length > 0`.
- After a successful single restore, when `result.slug` differs from the row's slug:
  `toast.success(t("content.trash.restoredRenamed", { slug: result.slug }))` — surfaces the
  documented auto-rename (brief §4) instead of letting the slug change silently.
- Page title: `t("content.trash.title", { type: seed.labelPlural ?? seed.label })`; a back button
  to `/content/${slug}`.
- Pagination: `pageIndex = page - 1`, `pageCount = Math.ceil((trash.data?.total ?? 0) / PAGE_SIZE)`,
  `onPageIndexChange = (i) => setPage(i + 1)`.

**`src/App.tsx`** — register above the `/content/:slug/:id` entry:

```tsx
      {
        path: "/content/:slug/trash",
        element: (
          <ProtectedRoute>
            <ContentTrashPage />
          </ProtectedRoute>
        ),
      },
```

### T9 — Dashboard: Trash entry point on the content list

**`src/pages/content-list.tsx`**, inside the existing header block (the `<div className="mb-6">`),
turn it into a row and append:

```tsx
{seed.softDelete === true && (
  <Button variant="outline" size="sm" onClick={() => navigate(`/content/${slug}/trash`)}>
    <Trash2 className="size-4" />
    {t("content.trash.open")}
  </Button>
)}
```

Requires `useNavigate` (already imported from `react-router-dom`? the file imports `useParams`,
`useSearchParams` — add `useNavigate`) and `Trash2` from `lucide-react`. The button is not
permission-gated beyond the seed flag: the Trash page itself is read-gated by `content:read`, which
the user already holds if they can see this list.

### T10 — Dashboard: delete-dialog copy by mode

**`src/features/content-delete-dialog/use-content-delete-dialog.ts`**:

```ts
/** `trash` = reversible move to the Trash; `purge` = irreversible erasure (GDPR path). */
export type ContentDeleteMode = "trash" | "purge"

export interface ContentDeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  seed: Seed
  entryIds: string[] | null
  onConfirm: () => Promise<void>
  /** Defaults to the seed's own policy: a `softDelete` seed trashes, anything else erases. */
  mode?: ContentDeleteMode
}
```

In the hook, return the resolved mode alongside the existing values:

```ts
const resolvedMode: ContentDeleteMode = mode ?? (seed.softDelete === true ? "trash" : "purge")
```

(the hook's parameter `Pick<…>` widens to include `seed` and `mode`).

**`content-delete-dialog.tsx`** — drive copy from `resolvedMode`:

| | `trash` | `purge` |
|---|---|---|
| title | `content.deleteDialog.trashTitle` | `content.deleteDialog.purgeTitle` |
| body (1) | `content.deleteDialog.trashSingle` | `content.deleteDialog.purgeSingle` |
| body (n) | `content.deleteDialog.trashMultiple` | `content.deleteDialog.purgeMultiple` |
| extra | — | `content.deleteDialog.purgeWarning` in a `text-destructive` block |
| confirm | `content.deleteDialog.trashConfirm` | `content.deleteDialog.purgeConfirm` |

The `canDelete` gate, the disabled-button tooltip and `isDeleting` handling stay exactly as they
are. Keep the old `content.deleteDialog.{title,single,multiple}` keys in the locale files: they are
still the copy for a seed without `softDelete` if any caller passes no mode — remove nothing.

### T11 — Dashboard: barrel + locales

**`src/features/content-management/index.ts`** — append:

```ts
export * from "./hooks/use-content-trash"
export * from "./api/trash.api"
export * from "./lib/retention"
export * from "./components/ContentTrashView"
```

**`src/locales/en.json`** — under `content`:

```json
"trash": {
  "open": "Trash",
  "title": "Trash — {{type}}",
  "back": "Back to list",
  "deletedAt": "Deleted",
  "retention": "Retention",
  "daysLeft_one": "{{count}} day left",
  "daysLeft_other": "{{count}} days left",
  "empty": "The Trash is empty",
  "disabled": "This content type does not use the Trash: deletions are immediate and irreversible.",
  "restore": "Restore",
  "purge": "Delete forever",
  "selectedCount_one": "{{count}} selected entry",
  "selectedCount_other": "{{count}} selected entries",
  "restored": "Entry restored",
  "restoredRenamed": "Entry restored with the slug \"{{slug}}\" — the original slug was taken.",
  "purged": "Entry deleted forever",
  "partialFailure_one": "{{count}} entry could not be processed",
  "partialFailure_other": "{{count}} entries could not be processed"
}
```

and inside the existing `content.deleteDialog` block:

```json
"trashTitle": "Move to Trash",
"trashSingle": "Move this \"{{type}}\" entry to the Trash? You can restore it later.",
"trashMultiple": "Move {{count}} \"{{type}}\" entries to the Trash? You can restore them later.",
"trashConfirm": "Move to Trash",
"purgeTitle": "Delete forever",
"purgeSingle": "Delete this \"{{type}}\" entry forever?",
"purgeMultiple": "Delete {{count}} \"{{type}}\" entries forever?",
"purgeWarning": "This cannot be undone. Attached media are deleted and the erasure is recorded permanently, so the entry stays deleted even after a database restore.",
"purgeConfirm": "Delete forever"
```

**`src/locales/it.json`** — the identical key set, Italian copy (`"open": "Cestino"`,
`"title": "Cestino — {{type}}"`, `"purge": "Elimina definitivamente"`,
`"purgeWarning": "L'operazione è irreversibile. I media allegati vengono eliminati e la cancellazione
viene registrata in modo permanente: la voce resta eliminata anche dopo un ripristino del database."`,
…). Both files must end with exactly the same key set — a missing key in `it.json` renders the raw
key string in the UI.

### T12 — Tests

Tiers, placement and anatomy per `_config/testing_conventions.md`. All new dashboard tests are
**unit** tier (they mock `@/lib/api`, touch no network — Rule 0.2), and live inside the owning
slice (Rule 1.1).

**1. `apps/dashboard/src/features/content-management/test/unit/trash-api.test.ts`** — subject:
request construction. `vi.mock("@/lib/api", …)` at the top (Rule 3.9), `beforeEach(() => vi.clearAllMocks())`.
`describe("trashApi", …)`, one `it()` each:
- `"fetchTrash requests the trash route with page and limit as query params"`
- `"restore posts to the entry's restore route and returns the slug the server assigned"`
- `"bulkRestore posts the id list to the bulk-restore route"`
- `"bulkPurge posts the id list to the bulk-purge route"`
- in `describe("contentApi.delete", …)`: `"appends purge=true only when the purge option is set"`
  (two asserted call URLs, one arrangement — permitted by Rule 1.6).

**2. `…/test/unit/retention.test.ts`** — subject: `retentionRemainingDays`. One matrix `it()`
driven by an array (Rule 1.6) over: no `retentionDays` ⇒ `null`; no `deletedAt` ⇒ `null`;
`retentionDays <= 0` ⇒ `null`; half a window elapsed ⇒ ceil of the remainder; exactly expired ⇒ `0`;
past expiry ⇒ `0`. Fixed integer timestamps, never `Date.now()` (Rule §7.7).

**3. `…/test/unit/use-content-trash.test.ts`** — subject: cache invalidation, following the
`use-draft-hooks.test.ts` idiom exactly (`renderHook` + `QueryClientProvider`, a fresh
`QueryClient` per test with `retry: false`). Spy with
`vi.spyOn(queryClient, "invalidateQueries")`; `it()` names:
- `"a successful restore invalidates both the trash and the content list key spaces"`
- `"a successful bulk purge invalidates both the trash and the content list key spaces"`
- `"useContentTrash stays idle while the enabled flag is false"` (asserts `api.get` was never
  called — this is the guard that keeps the page off the 409 path for a non-soft-delete seed).

**4. `apps/dashboard/src/features/content-delete-dialog/test/unit/content-delete-dialog.test.tsx`**
— extend the existing suite with:
- `"a trash-mode dialog offers a reversible move and no irreversibility warning"`
- `"a purge-mode dialog states the deletion is permanent"`
Assert on rendered copy via the existing test's i18n setup; do not snapshot (Rule §7.9).

**5. `apps/api/src/features/content/test/integration/soft-delete.integration.test.ts`** — extend
the existing suite (integration tier, real D1, `createTestHarness`), inside
`describe('GET /:slug/trash', …)` or as siblings of the existing trash test:
- `"GET /:slug/trash returns each item with its deleted_at timestamp and a data envelope"` —
  ARRANGE: create + `DELETE` one entry of `trash_orders`; ACT: `admin.get('/api/content/trash_orders/trash')`;
  ASSERT: status 200, `typeof body.items[0].deleted_at === "number"`,
  `body.items[0].data.title` equals the created title.
- `"a masked branch stays masked on the trash route"` — add a branch with
  `policies: { visibility: 'masked' }` to the local `trashSeed` fixture (Rule 3.5's exception:
  the canonical set has no soft-delete seed), create an entry with a value for it, delete it, then
  assert the trash payload's `data` carries `'••••••••'` and not the clear value. Comment the test
  with the mechanism it guards (Rule 6.2.4): *the trash route reuses `applyVisibility` so a branch
  hidden on the main list cannot be read through the Trash.*
- The existing `"GET /:slug/trash returns only trashed rows, newest-first"` test must keep passing
  unchanged — it asserts `items[].id`, which the envelope preserves.

Do **not** add a dashboard test that asserts an active-list payload lacks `deleted_at`; that
property is the API's, and it is covered by the existing `public-trash-isolation.integration.test.ts`
plus the guard in T1.1.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

```bash
# 1. Types — core untouched, but prove it
pnpm --filter @beechcms/core exec tsc --noEmit
pnpm --filter @beechcms/api  exec tsc --noEmit
pnpm --filter @beechcms/dashboard exec tsc --noEmit

# 2. Build
pnpm --filter @beechcms/core run build
pnpm --filter @beechcms/dashboard run build

# 3. Lint
pnpm beech lint

# 4. Tests — full workspace (the API integration tier needs the local D1 state)
pnpm beech db:reset && pnpm beech db:migrate
pnpm beech test

# 5. Scoped re-run while iterating
pnpm --filter @beechcms/dashboard exec vitest run src/features/content-management/test/unit
pnpm --filter @beechcms/dashboard exec vitest run src/features/content-delete-dialog
pnpm --filter @beechcms/api exec vitest run src/features/content/test/integration/soft-delete.integration.test.ts

# 6. Manual smoke against the dev stack (a seed with softDelete: true + retentionDays must exist)
pnpm beech dev
#   /content/<slug>          → "Trash" button visible only on a softDelete seed
#   delete one entry         → dialog reads "Move to Trash"; row leaves the list
#   /content/<slug>/trash    → row present, Deleted column filled, retention countdown shown
#   Restore                  → row returns to the main list, disappears from the Trash
#   select 2 rows → Restore  → both return; selection clears
#   Delete forever           → dialog states it is permanent; row gone from both listings
#   /content/<other>/trash   → (seed without softDelete) the "Trash not enabled" state, no request fired
```

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

**API (T1)**
- [ ] `rowToData` adds `deleted_at` **only** when `row.deleted_at != null`; an active-row payload is
      byte-identical to `master` (asserted by the untouched public-isolation and list suites).
- [ ] `GET /api/content/:slug/trash` returns items in the `listHandler` envelope: system fields at
      the top level plus a `data` object.
- [ ] The trash payload runs through `applyVisibility` with the request's actor; a branch with
      `policies.visibility: 'masked'` is masked there exactly as on the main list.
- [ ] No route added, removed or reordered in `features/content/index.ts`; no rule added, removed or
      reordered in `permission.middleware.ts`.
- [ ] `@beechcms/core` has **zero** modified files in the diff.

**Dashboard — contract**
- [ ] `contentApi.delete` keeps its 2-argument call sites compiling; `purge` is optional and yields
      `?purge=true` only when `true`.
- [ ] `ContentEntry.deleted_at` is optional; no existing consumer required an edit to compile.
- [ ] `trashApi` methods target exactly: `GET /content/:slug/trash`, `POST /content/:slug/:id/restore`,
      `POST /content/:slug/trash/bulk-restore`, `POST /content/:slug/trash/bulk-purge`.
- [ ] No `any` in a new signature, hook, component prop or parsed response type.

**Dashboard — behaviour**
- [ ] The Trash button appears on the content list **only** when `seed.softDelete === true`.
- [ ] `/content/:slug/trash` on a seed without `softDelete` renders the disabled state and fires
      **no** request to the trash endpoint.
- [ ] The Trash table shows: display name, slug, `deleted_at` (relative), retention countdown when
      `seed.retentionDays` is set and `—` when it is not.
- [ ] Restore and purge are offered per row and in bulk; multi-select reuses `RowSelectionState`
      keyed by entry id, as the main table does.
- [ ] Purge (single and bulk) requires an explicit confirmation stating the action is permanent;
      restore does not.
- [ ] Restore / purge / bulk actions invalidate `TRASH_QUERY_KEYS.all` **and**
      `CONTENT_QUERY_KEYS.all`, so both listings agree without a manual refresh.
- [ ] `useDeleteContent` (main list) also invalidates `TRASH_QUERY_KEYS.all`.
- [ ] A restore that returns a different slug surfaces it to the user.
- [ ] Restore actions are gated on `content:update`, purge actions on `content:delete`, using
      `usePermissions().can(…, slug)` — disabled, never hidden-and-clickable.
- [ ] Partial bulk failures (`failed.length > 0`) are reported; a partial success never shows as a
      clean success.

**VSA / architecture**
- [ ] Every new dashboard file lives in `features/content-management/` except
      `pages/content-trash.tsx` (composition root).
- [ ] The Trash page calls hooks, never `trashApi`/`contentApi` directly
      (`graphify path "ContentTrashPage" "trashApi"` must find no directed path).
- [ ] No new import from one `features/*` slice into another outside the pages layer.
- [ ] No SQL, no physical column name and no `br_XX` literal anywhere in the dashboard diff.

**i18n**
- [ ] `en.json` and `it.json` carry the identical key set; no key removed.

**Tests & build**
- [ ] New test files: one tier each, placed in the owning slice, byte-identical SPDX header,
      `it()` names stating behaviour + outcome without "should".
- [ ] No `vi.useFakeTimers()`, no `Date.now()` in fixtures, no `.only` / `.skip`, no snapshot of an
      API response, no conditional assertion.
- [ ] `pnpm beech test` passes in full with zero regressions against `devs`.
- [ ] `pnpm beech lint` clean; all three `tsc --noEmit` runs clean.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executing agent MUST NOT build or modify the following.

**Deferred beyond this feature (ROADMAP.md → "Deferred beyond this feature"):**
1. **Legacy table slug rebuild.** A table materialized before `softDelete` was enabled keeps its
   inline `slug … UNIQUE` `sqlite_autoindex`, so a trashed slug is not freed there. The 12-step
   SQLite rebuild stays deferred. Do not attempt a workaround in the UI.
2. **Retention scheduler.** `findExpiredByRetention` remains uncalled. The countdown shown in the
   Trash is informational; nothing must delete anything on a timer, client- or server-side.
3. **MCP content-manipulation tools** (`beech_content_delete`, `restore`, …) — a future dedicated
   MCP Content CRUD & Operations upgrade.

**Out of scope for this sprint specifically:**
4. **`POST /:slug/trash/reconcile` UI.** The post-restore reconciliation route exists and is
   permission-gated; it is an operator/compliance action, not an editor action. No button, no page.
5. **Any new API route, permission rule or middleware registration.** T1 is confined to the payload
   of an existing handler and one repository mapper.
6. **Any change to `@beechcms/core`.** If something feels like it belongs there, it has one consumer
   and therefore does not.
7. **Server-side search, filtering or column sorting on the Trash listing.** The endpoint offers
   `page`/`limit` and a fixed `deleted_at DESC` order; do not extend it, and do not fake client-side
   sorting over a single page.
8. **A trash mode inside `ContentTableView`, `useContentTableConfig`, `generateColumns`,
   `ContentToolbar` or `viewRegistry`.** The Trash is a separate table, deliberately.
9. **Registering `"trash"` as a `DashboardView`** in `resolveAuthorizedViews` / `viewRegistry`.
10. **Trash for Seeds or system tables.** Soft delete applies to `content_*` instances only
    (brief §5). `SeedDangerZone` / `DeleteSeedDialog` stay untouched.
11. **Global "Empty trash" / "Restore all" actions**, cross-seed trash views, and trash entries in
    the sidebar or the global drafts page.
12. **Kanban and gallery views.** Neither gains trash awareness; both already read the active list,
    which excludes trashed rows at the engine chokepoint.
13. **Restoring a purged entry from the R2 deletion ledger.** The ledger is append-only evidence of
    erasure, never a recovery source.
