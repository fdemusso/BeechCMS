# Sprint: ContentViewsPersistence

Sprint 1 of 5 of **Saved Views** (roadmap: `backlog/ROADMAP.md`).

Today Table, Gallery and Kanban are three fixed views. `ContentListPage` builds one `UserViewInstance` per authorized
type with `id === type`. Titles and conditional formats live in a `useState` overlay that resets on reload. The code
flags this with `// TODO: load and save view configuration at the user level`. The only persisted per-view state is the
Kanban blob in `seed_layouts.view_config`, keyed by seed slug and shared by "the" Kanban.

This sprint adds the backend half of the feature. A **view instance** becomes a persisted, shared, ordered row per seed,
with a validated configuration (filters, sort, groupBy, appearance, conditional formats, Kanban sub-config). The config
references branches **by Branch ID only**. Everything is exposed through five content-slice routes behind RBAC.
**Zero changes under `apps/dashboard/`.** The dashboard keeps rendering the three fixed views until Sprint 2. The legacy
`/view-config` endpoints stay untouched until Sprint 2 removes them together with their only consumer.

---

### Pre-Computation Analysis

The graph was refreshed first with `graphify update . --force` (24 117 nodes, 35 666 edges, 2 247 communities). It
includes the uncommitted working tree of `fix/gallery-categories-review`, which only touches dashboard gallery files
that this sprint does not touch.

#### a) God Nodes identified via CLI

| Node | Degree | Source | Role in this sprint |
|------|--------|--------|---------------------|
| `Seed` | **71** | `packages/core/src/engine/types.ts:L229` | **Not modified.** Read for `dashboard.views` (allow-list) and `branches` (Branch-ID cleanup). |
| `AppEnv` | **58** | `apps/api/src/types.ts:L283` | **Not modified** (type alias over `Variables`). |
| `Variables` | **46** | `apps/api/src/types.ts:L167` | Gains one key: `contentViewRepository: IContentViewRepository`. This is additive. No existing key changes. |
| `ContentToolbar()` | 8 | `apps/dashboard/src/features/content-toolbar/content-toolbar.tsx:L25` | **Not touched** (Sprint 2/3). |
| `useKanbanViewConfig()` | 6 | `apps/dashboard/src/features/content-kanban/hooks/use-kanban-view-config.ts:L7` | **Not touched.** It is the legacy consumer of `/view-config` and is deleted in Sprint 2. |
| `ViewRegistryImpl` | 5 | `apps/dashboard/src/features/content-toolbar/view-registry.ts:L7` | **Not touched** (Sprint 3 harness). |
| `repositoryMiddleware()` | 4 | `apps/api/src/middleware/repository.middleware.ts:L101` | Registers `D1ContentViewRepository`. |
| `getViewConfigHandler()` | 4 | `apps/api/src/features/content/handlers/view-config.ts:L11` | Pattern reference (seed lookup, `publicProblem`, repository via context). Not modified. |
| `resolveAuthorizedViews()` / `isViewAuthorized()` | 3 / – | `packages/core/src/dashboard-layout/view-authorization.ts:L24 / L33` | Consumed unchanged. They give the bootstrap set and the visibility/creation gate. |
| `permissionMiddleware()` | 3 | `apps/api/src/middleware/permission.middleware.ts:L262` | Its route table gains five rows. |

#### b) Architectural boundaries affected

| Boundary | Touched? | Exact surface |
|----------|----------|---------------|
| `@beechcms/core` — `dashboard-layout/` | **Yes** | New `content-view.ts`, `content-view.repository.ts`, `content-view.test.ts`. Two export lines in `src/index.ts`. No existing symbol changes. |
| `@beechcms/core` — `engine/` | **No** | `Seed`, `DashboardSeedConfig`, `findBranchById` are consumed as-is. |
| `apps/api/migrations` | **Yes** | New `0033_seed_views.sql`. `wrangler.jsonc` uses `migrations_dir` and needs no edit. |
| `apps/api/src/shared/db/repositories` | **Yes** | New `content-view.repository.d1.ts`. |
| `apps/api/src/middleware` | **Yes** | `repository.middleware.ts` (override + `context.set`), `permission.middleware.ts` (five rows). |
| `apps/api/src/types.ts` | **Yes** | `Variables.contentViewRepository`. |
| `apps/api/src/features/content` | **Yes** | New `handlers/views.ts`. Modified `index.ts` (five routes) and `constants.ts` (five messages). New `test/integration/content-views.integration.test.ts`. |
| `apps/api/src/features/*` other slices | **No** | No cross-slice import is introduced (see VETO Audit). |
| `@beechcms/testing` | **Yes** | The canonical `posts` seed gains `dashboard: { views: ['table', 'gallery'] }`. `createTestHarness` clears `seed_views`. |
| `apps/dashboard` | **No** | Zero files. |
| `@beechcms/client`, `api-client`, `mcp`, `cli` | **No** | Zero files. `packages/cli/src/commands/init.ts` embeds only `0000_v040_base.sql` and already lags 0030–0032, so it stays out (see §7). |

#### c) `graphify affected` impact analysis (breaking-change proof)

```
$ graphify affected "UserViewInstance" --depth 2
  use-content-table-config.ts, UseContentTableConfigOptions, content-toolbar/index.ts, use-view-name.ts,
  content-toolbar/types.ts, ContentToolbarProps, content-list.tsx, drafts-list.tsx, view-switcher.tsx,
  ViewSwitcherProps, UseViewNameProps, content-management/index.ts, use-content-list-query.ts,
  barrels.test.ts, content-toolbar.tsx, use-content-toolbar.ts, use-automation.ts, App.tsx,
  toolbar-hooks.test.ts, useContentToolbar()
```
→ 20 dashboard nodes depend on the in-memory view shape. **This sprint does not modify `UserViewInstance`.** The new
persisted shape is a separate core type (`ContentView`), so none of these 20 nodes can break. Sprint 2 owns the switch.

```
$ graphify affected "seedViewConfigSchema" --depth 2
  seed-layout.test.ts
$ graphify affected "D1SeedLayoutRepository" --depth 2
  repository.middleware.ts, seed-layout.repository.d1.test.ts, factory.ts, createBeechApp(),
  repository-privacy-middleware.test.ts
$ graphify affected "ISeedLayoutRepository" --depth 2
  No affected nodes found.
```
→ The legacy Kanban persistence chain is **not modified**. `seed_layouts` and its repository keep working byte-for-byte.

```
$ graphify affected "ContentListPage" --depth 2
  App.tsx, content-list.tsx, app.test.tsx, main.tsx
```
→ Not touched. Listed to show the dashboard blast radius that Sprint 2 will own.

```
$ graphify affected "DashboardView" --depth 2
  engine/types.ts, DashboardSeedConfig, … (re-export fan-out through engine/types.ts: 36 core files)
```
→ `DashboardView` is **consumed, not modified**. The fan-out comes from `engine/types.ts` importing it, and no edit
reaches those files.

```
$ graphify path "putViewConfigHandler" "D1SeedLayoutRepository"
  putViewConfigHandler() <-imports- index.ts -imports_from-> types.ts <-imports_from- repository.middleware.ts
  -imports-> D1SeedLayoutRepository
```
→ This confirms the pattern the new handlers copy. A handler reaches D1 only through a core-typed repository injected
by `repositoryMiddleware`. It never imports a D1 class.

---

### VETO Audit

Evaluated against `_config/ponytail_arch.md`.

1. **Botanical invariant (rule 2).** `seed_views` is a **system table**, like `seed_layouts`, `dashboard_layouts` and
   `automations`. It is not a `content_{slug}` table, so `apiToDb`/`dbToApi` do not apply. The established access path
   holds: interface in `@beechcms/core` (`IContentViewRepository`), D1 implementation in
   `apps/api/src/shared/db/repositories/`, injection via `repositoryMiddleware`. No handler issues SQL. **Hardcoded field
   names:** the persisted config accepts a column reference only as `br_XX` or as one of four engine system columns
   (`slug`, `status`, `created_at`, `updated_at`). An alias such as `title` fails the zod schema with a 422. Unknown
   Branch IDs are stripped on write and on read. ✅
2. **VSA (rule 3).** All routes live in `features/content/`, which already owns `/:slug/view-config`. The handlers
   import only `@beechcms/core`, `../../../public/errors/problem-details`, `../constants` and `../../../types`. These are
   the same imports `view-config.ts` already has. No `features/*` → `features/*` import is introduced. Shared logic
   (schema, cleanup, projection) is pure and sits in core, so Sprint 2's dashboard reuses it without crossing slices. ✅
3. **Cloudflare purity (rule 4).** One forward migration in the numbered workflow. Writes are single statements or
   `db.batch` (atomic in D1). No background job, no ORM. ✅
4. **YAGNI cuts applied here** (each one was proposed, then vetoed):
   - *Separate core-only sprint.* **VETO: contract has no consumer until API ships.** The core surface is three pure
     functions and one interface, consumed only by this sprint's handlers in the same PR. Splitting would merge an
     untested contract. The boundary that does need a separate merge is the dashboard (Sprint 2).
   - *Reserved View Type catalogue (Calendar, Map, …) in core.* **VETO: no runtime behaviour; dashboard-only identifiers.**
     The API rejects any type outside `table|gallery|kanban` through the zod enum. The disabled picker entries are
     Sprint 3 dashboard constants.
   - *`If-Match` optimistic concurrency on `PATCH /views/:id`.* **VETO: per-row last-write-wins suffices for shared views.**
     Row-per-instance already isolates concurrent edits on different views.
   - *Per-type instance cap / locked default views.* **VETO: brief §5 discards it.**
   - *Migrating `seed_layouts.view_config.kanban` into the new rows.* **VETO: brief §4 discards it.**
   - *Cascade delete on seed hard-delete.* **VETO: parity with `seed_layouts`; read-time cleanup covers stale refs.**
   - *Server-side default titles (i18n).* **VETO: `title: null` means "translated type label" client-side.**
   - *A `CHECK (view_type IN …)` constraint.* **VETO: blocks future types without table rebuild.** The type is
     validated in core (zod enum on write, `isViewAuthorized` on read).
5. **Minimal blueprint (rule 5):** core 2 source files → api 1 migration + 1 repository + 1 handler file + 4 wiring
   edits → testing 2 edits. Dashboard: none.

No violation remains. HANDOFF -> caveman_coder.

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Every later sprint (instances in the dashboard, the harness/switcher, universal Element formatting) reads and writes
view instances. Today no storage can hold N instances per type, so the dashboard has nothing to build on. The brief also
requires the instances to be **shared and server-persisted** (§4). That requires a server contract before any UI work:
a dashboard-first approach would have to invent a storage shape and then migrate it.

- **Vertical Slice Architecture:** the API surface sits inside the `content` slice, next to the `view-config` routes it
  will replace. Validation and projection logic is pure and lives in `@beechcms/core`. Sprint 2's dashboard imports it
  from core, so no slice imports another.
- **Botanical invariants:** persisted configs hold Branch IDs, never aliases. A branch rename cannot break a saved view,
  and a deleted branch silently drops out of every view, as `validateCardConfigAgainstSeed` already does for Kanban
  cards. Storage access goes core interface → D1 implementation → context injection, with no SQL in handlers.
- **Safe rollout:** the new routes have no UI consumer. Production behaviour is unchanged until Sprint 2 switches
  `ContentListPage` over.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**View authorization (core, unchanged):** `packages/core/src/dashboard-layout/view-authorization.ts`
- `type DashboardView = 'table' | 'gallery' | 'kanban'`. `AUTHORIZABLE_VIEWS` gives the canonical order.
  `DEFAULT_AUTHORIZED_VIEWS = ['table']`.
- `resolveAuthorizedViews(seed)` deduplicates, strips unknown values, always adds `'table'`, and returns canonical order.
- `isViewAuthorized(seed, view): view is DashboardView`.
- `Seed.dashboard.views?: DashboardView[]` (`engine/types.ts:L225`) is the seed-author allow-list.

**Legacy per-view persistence (unchanged this sprint, removed in Sprint 2):**
- `seed_layouts(slug PK, layout, view_config TEXT, updated_at, updated_by)`. `view_config` holds
  `seedViewConfigSchema = { kanban?: KanbanViewConfig, card?: KanbanCardConfig }`, a passthrough object.
- `ISeedLayoutRepository.getViewConfig/setViewConfig` → `D1SeedLayoutRepository`.
- `GET/PUT /api/content/:slug/view-config` (`features/content/handlers/view-config.ts`). RBAC rows
  `permission.middleware.ts:L119-120` (`content:read` / `content:update`, `capture1`).
- Only consumer: dashboard `useKanbanViewConfig(seedSlug)`.

**Dashboard in-memory views (unchanged this sprint):** `pages/content-list.tsx` maps `resolveAuthorizedViews(seed)` to
`UserViewInstance { id: type, label, type, enabledTools, conditionalFormats }`. Overlays are held in `useState`.
Conditional-format rules (`lib/conditional-format.ts`) use `{ columnId: alias, group: ToolbarFilterGroup, tone,
target: 'row'|'cell', textStyles }`. Filter operators: `eq gt gte lt lte contains is_empty is_not_empty`. Max 3
conditions per filter (`MAX_CONDITIONS_PER_FILTER`). Densities: `compact | normal | comfortable` (`lib/density.ts`).

**API middleware registration order** (`apps/api/src/factory.ts`):
1. `app.use('*', repositoryMiddleware(...))` (L131). Sets every repository on `context`, including `seedLayoutRepository`
   (L152). `resolvedClock` / `resolvedIdGenerator` are resolved at L103-104.
2. `seedRegistryMiddleware()` (L145) → `getSeed`.
3. `storageMiddleware` (L148) → `queueMiddleware` (L152) → `authProvidersMiddleware` (L154) → `rateLimiterMiddleware`
   (L155) → `observabilityMiddleware` (L156) → two inline `*` middlewares (L158, L199) → `/api/*` inline (L210).
4. Public auth apps routed (L232-236).
5. `apiProtected`: `authMiddleware({ acceptOAuth: true })` → `oauthScopeMiddleware()` → `permissionMiddleware()`
   (L241-248). Then `/content` mounts in order: `notificationsApp`, `statsApp`, `rotateFieldApp`, `draftApp`,
   `backrefsApp`, `contentFeature` (L255-260).
6. `app.route('/api', apiProtected)` (L295).

This sprint adds **no middleware**. It adds a repository to step 1, rows to the step-5 permission table, and routes to
`contentFeature`.

**Permission table:** first match wins. Per-seed rows (`capture1` = seed slug) come before the generic
`/api/content/([^/]+)/[^/]+$` rows (L138-140). An unmapped path gets 403 `route_not_registered` (fail-closed).
`PUT /api/content/posts/views/order` (3 segments) matches **no** existing row, so explicit rows are mandatory.
`GET /api/content/posts/views` would fall to the generic GET row (`content:read`). It gets an explicit row anyway, for
readability and so the method set stays visible in one place.

**OAuth:** `/views` routes are deliberately **not** added to `OAUTH_SCOPE_ROUTES`. OAuth tokens stay fail-closed, which
matches `/view-config`.

**Ids & time:** `IIdGenerator.uuid()` and `IClock.now()` (ms) are injected. Abstraction-sprint rule: no
`crypto.randomUUID`/`Date.now` in feature code. Existing system tables store unix **seconds**.

**Migrations:** active files `0000_v040_base.sql`, `0030_test_seeds.sql`, `0031_import_jobs_seed.sql`,
`0032_rbac_and_user_activation.sql`. The next number is **0033**. The archived `_archive/0033_dashboard_layouts.sql` was
squashed into `0000` and has a different filename. Wrangler tracks applied migrations by filename, so there is no clash.
The integration tier loads every file in `apps/api/migrations` via `readD1Migrations`
(`vitest.workers.config.ts:L11`).

**Test isolation:** `@cloudflare/vitest-pool-workers` isolates D1 **per file, not per test**
(`packages/testing/src/seeds/provision.ts:L20-27`). `createTestHarness` already clears content tables for that reason.
It must also clear `seed_views`, or tests in one file would see each other's rows (Rule 3.3).

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

New files:
1. `packages/core/src/dashboard-layout/content-view.ts`: schemas, types, `validateViewConfigAgainstSeed`,
   `projectContentView(s)`, `emptyViewConfig`.
2. `packages/core/src/dashboard-layout/content-view.repository.ts`: `IContentViewRepository` + record types.
3. `packages/core/src/dashboard-layout/content-view.test.ts`: unit tier.
4. `apps/api/migrations/0033_seed_views.sql`
5. `apps/api/src/shared/db/repositories/content-view.repository.d1.ts`
6. `apps/api/src/features/content/handlers/views.ts`
7. `apps/api/src/features/content/test/integration/content-views.integration.test.ts`: integration tier.

Modified files:
8. `packages/core/src/index.ts`: two `export *` lines.
9. `apps/api/src/types.ts`: `Variables.contentViewRepository`.
10. `apps/api/src/middleware/repository.middleware.ts`: import, override key, `context.set`.
11. `apps/api/src/middleware/permission.middleware.ts`: five rows.
12. `apps/api/src/features/content/index.ts`: five routes.
13. `apps/api/src/features/content/constants.ts`: five `CONTENT_ERRORS` messages.
14. `packages/testing/src/seeds/canonical.seeds.ts`: `posts.dashboard.views`.
15. `packages/testing/src/harness.ts` + `packages/testing/src/seeds/provision.ts`: `resetSeedViews`.

Explicitly **excluded**: every file under `apps/dashboard/`, the `/view-config` handlers, `seed-layout.ts`,
`seed_layouts`, `packages/cli`.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

Quote style: single quotes everywhere in this sprint (`packages/*`, `apps/api`). Core files carry the MIT header used by
the sibling files in `dashboard-layout/`. `apps/api` and `packages/testing` files carry the BUSL header.

### Task 1 — `packages/core/src/dashboard-layout/content-view.ts` (new)

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { z } from 'zod'
import type { Seed } from '../engine/types.js'
import { findBranchById } from '../engine/seeds/seed-registry.js'
import { isViewAuthorized, type DashboardView } from './view-authorization.js'
import {
  kanbanViewConfigSchema,
  kanbanCardConfigSchema,
  validateCardConfigAgainstSeed,
  type KanbanViewConfig,
} from './seed-layout.js'
import { resolveKanbanConfig } from './kanban/kanban.js'

// ---------------------------------------------------------------------------
// View types
// ---------------------------------------------------------------------------

/** Zod needs a tuple. Kept equal to AUTHORIZABLE_VIEWS by content-view.test.ts. */
export const VIEW_TYPE_IDS = ['table', 'gallery', 'kanban'] as const satisfies readonly DashboardView[]

// ---------------------------------------------------------------------------
// Column references — Branch IDs or engine system columns, never aliases
// ---------------------------------------------------------------------------

export const VIEW_SYSTEM_COLUMNS = ['slug', 'status', 'created_at', 'updated_at'] as const
export type ViewSystemColumn = (typeof VIEW_SYSTEM_COLUMNS)[number]

const BRANCH_REF_RE = /^br_[A-Za-z0-9]+$/

export const viewColumnRefSchema = z.union([
  z.enum(VIEW_SYSTEM_COLUMNS),
  z.string().regex(BRANCH_REF_RE),
])
export type ViewColumnRef = z.infer<typeof viewColumnRefSchema>

// ---------------------------------------------------------------------------
// Config building blocks
// ---------------------------------------------------------------------------

/** Mirrors the dashboard toolbar operator set (apps/dashboard/src/lib/filter-dsl.ts). */
export const VIEW_FILTER_OPERATORS = [
  'eq', 'gt', 'gte', 'lt', 'lte', 'contains', 'is_empty', 'is_not_empty',
] as const
/** Mirrors MAX_CONDITIONS_PER_FILTER in the dashboard toolbar. */
export const MAX_VIEW_CONDITIONS = 3

export const viewConditionSchema = z.object({
  op: z.enum(VIEW_FILTER_OPERATORS),
  value: z.union([z.string().max(500), z.number(), z.boolean(), z.null()]),
})

export const viewFilterSchema = z.object({
  columnRef: viewColumnRefSchema,
  conditions: z.array(viewConditionSchema).min(1).max(MAX_VIEW_CONDITIONS),
})

export const viewSortSchema = z.object({
  columnRef: viewColumnRefSchema,
  desc: z.boolean(),
})

export const viewGroupBySchema = z.object({
  columnRef: viewColumnRefSchema,
  /** Only meaningful on a date column; stripped otherwise by validateViewConfigAgainstSeed. */
  datePrecision: z.object({ year: z.boolean(), month: z.boolean(), day: z.boolean() }).optional(),
})

export const VIEW_DENSITIES = ['compact', 'normal', 'comfortable'] as const

export const viewAppearanceSchema = z.object({
  density: z.enum(VIEW_DENSITIES).optional(),
  hiddenColumns: z.array(viewColumnRefSchema).max(200).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
})

export const VIEW_FORMAT_TONES = ['neutral', 'info', 'success', 'warning', 'danger'] as const
/**
 * View-neutral targets: `element` is the whole row (Table) or card (Gallery/Kanban), `field` is
 * the intersection element × columnRef. The dashboard's legacy `row`/`cell` map 1:1 (Sprint 2).
 */
export const VIEW_FORMAT_TARGETS = ['element', 'field'] as const
export const VIEW_TEXT_STYLES = ['bold', 'italic', 'underline'] as const

export const viewConditionalFormatSchema = z.object({
  id: z.string().min(1).max(64),
  enabled: z.boolean(),
  /** Ascending: 0 wins over 10. */
  priority: z.number().int().min(0).max(1000),
  label: z.string().max(60).optional(),
  columnRef: viewColumnRefSchema,
  conditions: z.array(viewConditionSchema).min(1).max(MAX_VIEW_CONDITIONS),
  tone: z.enum(VIEW_FORMAT_TONES),
  target: z.enum(VIEW_FORMAT_TARGETS),
  textStyles: z.array(z.enum(VIEW_TEXT_STYLES)).max(3).default([]),
})

// ---------------------------------------------------------------------------
// The config
// ---------------------------------------------------------------------------

/**
 * Persisted per-instance configuration. Every key has a default, so `{}` parses into a complete
 * config, and a stored row written by an older dashboard reads back fully shaped. Unknown keys
 * are stripped (zod default), never rejected.
 */
export const contentViewConfigSchema = z.object({
  filters: z.array(viewFilterSchema).max(50).default([]),
  sort: viewSortSchema.nullable().default(null),
  groupBy: viewGroupBySchema.nullable().default(null),
  appearance: viewAppearanceSchema.default({}),
  conditionalFormats: z.array(viewConditionalFormatSchema).max(50).default([]),
  /** Kanban-only. Dropped from any non-kanban instance. */
  kanban: kanbanViewConfigSchema.optional(),
  /** Kanban-only card layout. Dropped from any non-kanban instance. */
  card: kanbanCardConfigSchema.optional(),
})
export type ContentViewConfig = z.output<typeof contentViewConfigSchema>
export type ViewFilter = z.output<typeof viewFilterSchema>
export type ViewConditionalFormat = z.output<typeof viewConditionalFormatSchema>

export function emptyViewConfig(): ContentViewConfig {
  return contentViewConfigSchema.parse({})
}

// ---------------------------------------------------------------------------
// Request bodies
// ---------------------------------------------------------------------------

export const VIEW_TITLE_MAX_LENGTH = 60

/** Trimmed. Empty or whitespace-only collapses to null, which means "render the translated type label". */
export const viewTitleSchema = z
  .string()
  .trim()
  .max(VIEW_TITLE_MAX_LENGTH)
  .nullable()
  .transform((value) => (value === null || value.length === 0 ? null : value))

export const createContentViewInputSchema = z.object({
  type: z.enum(VIEW_TYPE_IDS),
  title: viewTitleSchema.optional(),
  config: contentViewConfigSchema.optional(),
})
export type CreateContentViewInput = z.output<typeof createContentViewInputSchema>

export const updateContentViewInputSchema = z
  .object({
    title: viewTitleSchema.optional(),
    /** Whole-config replacement, not a deep merge. */
    config: contentViewConfigSchema.optional(),
  })
  .refine((body) => body.title !== undefined || body.config !== undefined, {
    message: 'Provide at least one of title, config',
  })
export type UpdateContentViewInput = z.output<typeof updateContentViewInputSchema>

export const reorderContentViewsInputSchema = z.object({
  ids: z.array(z.string().min(1).max(64)).min(1).max(200),
})

// ---------------------------------------------------------------------------
// Records and the public shape
// ---------------------------------------------------------------------------

/** The API shape. Timestamps are unix seconds, like every other system table. */
export interface ContentView {
  id: string
  seedSlug: string
  type: DashboardView
  /** null → the client renders the translated label of `type`. */
  title: string | null
  position: number
  config: ContentViewConfig
  createdAt: number
  updatedAt: number
  updatedBy: string
}

/** Storage shape: `type` is unchecked text until projectContentView narrows it. */
export interface ContentViewRecord extends Omit<ContentView, 'type'> {
  type: string
}

// ---------------------------------------------------------------------------
// Cleanup against the live seed
// ---------------------------------------------------------------------------

const SYSTEM_COLUMN_SET = new Set<string>(VIEW_SYSTEM_COLUMNS)
const DATE_SYSTEM_COLUMNS = new Set<string>(['created_at', 'updated_at'])

function refExists(seed: Seed, ref: string): boolean {
  return SYSTEM_COLUMN_SET.has(ref) || findBranchById(seed, ref) !== null
}

function isDateRef(seed: Seed, ref: string): boolean {
  return DATE_SYSTEM_COLUMNS.has(ref) || findBranchById(seed, ref)?.type === 'date'
}

function cleanKanban(kanban: KanbanViewConfig, seed: Seed): KanbanViewConfig {
  const { candidates } = resolveKanbanConfig(seed)
  const axisOk = kanban.axisBranchId !== null && candidates.some((c) => c.branchId === kanban.axisBranchId)
  const sortOk = kanban.sort !== null && findBranchById(seed, kanban.sort.branchId) !== null
  return {
    ...kanban,
    axisBranchId: axisOk ? kanban.axisBranchId : null,
    sort: sortOk ? kanban.sort : null,
  }
}

/**
 * Pure auto-cleanup, never an error: drops references to branches the seed no longer has,
 * duplicate filters on one column, date precision on a non-date grouping, and the Kanban
 * sub-config on a non-kanban instance. Same policy as validateCardConfigAgainstSeed.
 */
export function validateViewConfigAgainstSeed(
  config: ContentViewConfig,
  seed: Seed,
  type: DashboardView,
): ContentViewConfig {
  const seenFilterRefs = new Set<string>()
  const filters = config.filters.filter((filter) => {
    if (!refExists(seed, filter.columnRef) || seenFilterRefs.has(filter.columnRef)) return false
    seenFilterRefs.add(filter.columnRef)
    return true
  })

  const sort = config.sort && refExists(seed, config.sort.columnRef) ? config.sort : null

  let groupBy = config.groupBy && refExists(seed, config.groupBy.columnRef) ? config.groupBy : null
  if (groupBy?.datePrecision && !isDateRef(seed, groupBy.columnRef)) {
    groupBy = { columnRef: groupBy.columnRef }
  }

  const appearance = { ...config.appearance }
  if (appearance.hiddenColumns) {
    appearance.hiddenColumns = [...new Set(appearance.hiddenColumns)].filter((ref) => refExists(seed, ref))
  }

  const conditionalFormats = config.conditionalFormats.filter((rule) => refExists(seed, rule.columnRef))

  const cleaned: ContentViewConfig = { filters, sort, groupBy, appearance, conditionalFormats }
  if (type !== 'kanban') return cleaned
  if (config.kanban) cleaned.kanban = cleanKanban(config.kanban, seed)
  if (config.card) cleaned.card = validateCardConfigAgainstSeed(config.card, seed).cleaned
  return cleaned
}

// ---------------------------------------------------------------------------
// Projection (storage → API)
// ---------------------------------------------------------------------------

/** null when the seed's allow-list does not authorize the record's type (hidden, never deleted). */
export function projectContentView(record: ContentViewRecord, seed: Seed): ContentView | null {
  const type = record.type
  if (!isViewAuthorized(seed, type)) return null
  return { ...record, type, config: validateViewConfigAgainstSeed(record.config, seed, type) }
}

/** Order-preserving. The caller passes records already sorted by position. */
export function projectContentViews(records: readonly ContentViewRecord[], seed: Seed): ContentView[] {
  const views: ContentView[] = []
  for (const record of records) {
    const view = projectContentView(record, seed)
    if (view) views.push(view)
  }
  return views
}
```

Notes for the executor:
- `zod` is `^4.3.6`. Numbers reject `Infinity`/`NaN` by default, so do not add `.finite()`.
- In zod 4, `.default(x)` returns `x` without parsing it. Every default above is a valid output value.
- Do **not** import `@beechcms/testing` or anything from `apps/`. Core stays dependency-free apart from `zod`.

### Task 2 — `packages/core/src/dashboard-layout/content-view.repository.ts` (new)

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { DashboardView } from './view-authorization.js'
import type { ContentViewConfig, ContentViewRecord } from './content-view.js'

export interface NewContentView {
  seedSlug: string
  type: DashboardView
  title: string | null
  /** Already cleaned by validateViewConfigAgainstSeed. */
  config: ContentViewConfig
}

export interface ContentViewPatch {
  /** undefined → keep; null → reset to the translated type label. */
  title?: string | null
  /** undefined → keep; otherwise replaces the whole config. */
  config?: ContentViewConfig
}

export type RemoveContentViewResult = 'deleted' | 'not-found' | 'last-table'

/**
 * Persistence for shared, ordered view instances (`seed_views`). Every write is one statement
 * or one D1 batch, so each method is atomic. Implementations own id minting and timestamps
 * (IIdGenerator / IClock injected).
 */
export interface IContentViewRepository {
  /** All rows of a seed, including types the allow-list currently hides, ordered by position. */
  listBySeed(seedSlug: string): Promise<ContentViewRecord[]>
  get(seedSlug: string, id: string): Promise<ContentViewRecord | null>
  /**
   * Inserts one untitled instance per type, at positions 0..n-1. Each insert is skipped when the
   * seed already has an instance of that type, so concurrent first reads never duplicate.
   */
  ensureDefaults(seedSlug: string, types: readonly DashboardView[], updatedBy: string): Promise<void>
  /** Appends after the current last position. */
  create(input: NewContentView, updatedBy: string): Promise<ContentViewRecord>
  update(seedSlug: string, id: string, patch: ContentViewPatch, updatedBy: string): Promise<ContentViewRecord | null>
  /** Refuses ('last-table') to delete the seed's only Table instance, atomically. */
  remove(seedSlug: string, id: string): Promise<RemoveContentViewResult>
  /** Writes position = index for each id. Ids not listed keep their position. */
  reorder(seedSlug: string, orderedIds: readonly string[], updatedBy: string): Promise<void>
}
```

### Task 3 — `packages/core/src/index.ts`

Directly after `export * from './dashboard-layout/view-authorization.js'` (L91):

```ts
export * from './dashboard-layout/content-view.js'
export * from './dashboard-layout/content-view.repository.js'
```

Before committing, run `grep -rn "VIEW_TYPE_IDS\|ContentView\b\|emptyViewConfig\|viewTitleSchema" packages/core/src`.
It must show exactly one definition of each name, which proves no name collides in the barrel.

### Task 4 — `apps/api/migrations/0033_seed_views.sql` (new)

```sql
-- =============================================================================
-- SEED VIEWS — shared, ordered, named view instances per content type
--
--     One row per instance (Table / Gallery / Kanban today). Config is a JSON
--     ContentViewConfig whose column references are Branch IDs (br_XX) or engine
--     system columns, never aliases (validated in @beechcms/core).
--
--     No CHECK on view_type: the set of view types grows with the View Harness
--     and an SQLite CHECK change requires a table rebuild. The type is validated
--     in core on write (zod enum) and on read (isViewAuthorized).
--
--     Named seed_views, not content_views: content_{slug} is the namespace of
--     seed-owned tables, and a seed slugged "views" would own content_views.
--
--     Rows are never cascaded from seeds (parity with seed_layouts).
-- =============================================================================

CREATE TABLE IF NOT EXISTS seed_views (
    id          TEXT    NOT NULL PRIMARY KEY,           -- IIdGenerator.uuid()
    seed_slug   TEXT    NOT NULL,                       -- seeds.slug
    view_type   TEXT    NOT NULL,                       -- 'table' | 'gallery' | 'kanban'
    title       TEXT,                                   -- NULL = translated type label
    position    INTEGER NOT NULL,                       -- tab order within seed_slug, ascending
    config      TEXT    NOT NULL DEFAULT '{}',          -- JSON ContentViewConfig
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_by  TEXT    NOT NULL                        -- users.id of the last writer
);

CREATE INDEX IF NOT EXISTS idx_seed_views_seed_position ON seed_views(seed_slug, position);
CREATE INDEX IF NOT EXISTS idx_seed_views_seed_type     ON seed_views(seed_slug, view_type);
```

`idx_seed_views_seed_position` serves `listBySeed`. `idx_seed_views_seed_type` serves the `NOT EXISTS` guard in
`ensureDefaults` and the `COUNT(*)` guard in `remove`. Positions get no `UNIQUE` index on purpose: a reorder batch
passes through transient duplicates.

### Task 5 — `apps/api/src/shared/db/repositories/content-view.repository.d1.ts` (new)

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import {
  contentViewConfigSchema,
  emptyViewConfig,
  type ContentViewConfig,
  type ContentViewPatch,
  type ContentViewRecord,
  type DashboardView,
  type IClock,
  type IContentViewRepository,
  type IIdGenerator,
  type NewContentView,
  type RemoveContentViewResult,
} from '@beechcms/core'

interface SeedViewRow {
  id: string
  seed_slug: string
  view_type: string
  title: string | null
  position: number
  config: string
  created_at: number
  updated_at: number
  updated_by: string
}

const COLUMNS = 'id, seed_slug, view_type, title, position, config, created_at, updated_at, updated_by'

/** A corrupt or pre-schema blob reads as an empty config instead of failing the whole list. */
function parseConfig(raw: string): ContentViewConfig {
  try {
    const parsed = contentViewConfigSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : emptyViewConfig()
  } catch {
    return emptyViewConfig()
  }
}

function toRecord(row: SeedViewRow): ContentViewRecord {
  return {
    id: row.id,
    seedSlug: row.seed_slug,
    type: row.view_type,
    title: row.title,
    position: row.position,
    config: parseConfig(row.config),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  }
}

export class D1ContentViewRepository implements IContentViewRepository {
  constructor(
    private readonly db: D1Database,
    private readonly ids: IIdGenerator,
    private readonly clock: IClock,
  ) {}

  private nowSeconds(): number {
    return Math.floor(this.clock.now() / 1000)
  }

  async listBySeed(seedSlug: string): Promise<ContentViewRecord[]> {
    const rs = await this.db
      .prepare(`SELECT ${COLUMNS} FROM seed_views WHERE seed_slug = ? ORDER BY position ASC, created_at ASC, id ASC`)
      .bind(seedSlug)
      .all<SeedViewRow>()
    return (rs.results ?? []).map(toRecord)
  }

  async get(seedSlug: string, id: string): Promise<ContentViewRecord | null> {
    const row = await this.db
      .prepare(`SELECT ${COLUMNS} FROM seed_views WHERE seed_slug = ? AND id = ? LIMIT 1`)
      .bind(seedSlug, id)
      .first<SeedViewRow>()
    return row ? toRecord(row) : null
  }

  async ensureDefaults(seedSlug: string, types: readonly DashboardView[], updatedBy: string): Promise<void> {
    if (types.length === 0) return
    const now = this.nowSeconds()
    const sql = `
      INSERT INTO seed_views (id, seed_slug, view_type, title, position, config, created_at, updated_at, updated_by)
      SELECT ?, ?, ?, NULL, ?, '{}', ?, ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM seed_views WHERE seed_slug = ? AND view_type = ?)`
    await this.db.batch(
      types.map((type, position) =>
        this.db.prepare(sql).bind(this.ids.uuid(), seedSlug, type, position, now, now, updatedBy, seedSlug, type),
      ),
    )
  }

  async create(input: NewContentView, updatedBy: string): Promise<ContentViewRecord> {
    const now = this.nowSeconds()
    const row = await this.db
      .prepare(`
        INSERT INTO seed_views (id, seed_slug, view_type, title, position, config, created_at, updated_at, updated_by)
        VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM seed_views WHERE seed_slug = ?), ?, ?, ?, ?)
        RETURNING ${COLUMNS}`)
      .bind(this.ids.uuid(), input.seedSlug, input.type, input.title, input.seedSlug,
        JSON.stringify(input.config), now, now, updatedBy)
      .first<SeedViewRow>()
    if (!row) throw new Error('seed_views insert returned no row')
    return toRecord(row)
  }

  async update(
    seedSlug: string,
    id: string,
    patch: ContentViewPatch,
    updatedBy: string,
  ): Promise<ContentViewRecord | null> {
    // Field-level CASE/COALESCE instead of read-modify-write: a rename and a config save racing
    // on the same row must both land.
    const row = await this.db
      .prepare(`
        UPDATE seed_views
        SET title      = CASE WHEN ? = 1 THEN ? ELSE title END,
            config     = COALESCE(?, config),
            updated_at = ?,
            updated_by = ?
        WHERE seed_slug = ? AND id = ?
        RETURNING ${COLUMNS}`)
      .bind(
        patch.title !== undefined ? 1 : 0,
        patch.title ?? null,
        patch.config ? JSON.stringify(patch.config) : null,
        this.nowSeconds(),
        updatedBy,
        seedSlug,
        id,
      )
      .first<SeedViewRow>()
    return row ? toRecord(row) : null
  }

  async remove(seedSlug: string, id: string): Promise<RemoveContentViewResult> {
    // The COUNT guard sits in the DELETE itself: two concurrent deletes of the last two Table
    // instances must not both pass a check made before the write.
    const result = await this.db
      .prepare(`
        DELETE FROM seed_views
        WHERE seed_slug = ? AND id = ?
          AND (view_type <> 'table'
               OR (SELECT COUNT(*) FROM seed_views WHERE seed_slug = ? AND view_type = 'table') > 1)`)
      .bind(seedSlug, id, seedSlug)
      .run()
    if (result.meta.changes > 0) return 'deleted'
    return (await this.get(seedSlug, id)) ? 'last-table' : 'not-found'
  }

  async reorder(seedSlug: string, orderedIds: readonly string[], updatedBy: string): Promise<void> {
    if (orderedIds.length === 0) return
    const now = this.nowSeconds()
    const sql = 'UPDATE seed_views SET position = ?, updated_at = ?, updated_by = ? WHERE seed_slug = ? AND id = ?'
    await this.db.batch(
      orderedIds.map((id, position) => this.db.prepare(sql).bind(position, now, updatedBy, seedSlug, id)),
    )
  }
}
```

### Task 6 — `apps/api/src/types.ts`

In `interface Variables`, directly after `seedLayoutRepository: ISeedLayoutRepository` (L246):

```ts
  /** Repository for shared, ordered dashboard view instances (`seed_views`). */
  contentViewRepository: IContentViewRepository
```
Add `IContentViewRepository` to the existing `@beechcms/core` import on L13 of this file.

### Task 7 — `apps/api/src/middleware/repository.middleware.ts`

1. Import, next to the `D1SeedLayoutRepository` import (L23):
   `import { D1ContentViewRepository } from '../shared/db/repositories/content-view.repository.d1'`
   and add `IContentViewRepository` to the file's `import type { … } from '@beechcms/core'` (L37).
2. `interface RepositoryOverrides` (L46): after `seedLayoutRepository?: ISeedLayoutRepository` add
   `contentViewRepository?: IContentViewRepository`.
3. Directly after `context.set('seedLayoutRepository', …)` (L152):
   ```ts
   context.set('contentViewRepository', overrides?.contentViewRepository ?? new D1ContentViewRepository(database, resolvedIdGenerator, resolvedClock))
   ```
The middleware **order is unchanged**. This is one more `context.set` inside the existing `repositoryMiddleware`.

### Task 8 — `apps/api/src/features/content/constants.ts`

Append to `CONTENT_ERRORS` (before `} as const`):

```ts
  INVALID_VIEW: 'Invalid view payload',
  VIEW_NOT_FOUND: 'View not found',
  VIEW_TYPE_NOT_AUTHORIZED: 'This view type is not authorized for this content type',
  VIEW_LAST_TABLE: 'A content type must keep at least one Table view',
  VIEW_ORDER_MISMATCH: 'The order must list every visible view of this content type exactly once',
```

### Task 9 — `apps/api/src/features/content/handlers/views.ts` (new)

Contract (problem `type` values are normalized to `https://beechcms.dev/problems/<type>`):

| Route | Success | Errors |
|-------|---------|--------|
| `GET /api/content/:slug/views` | 200 `ContentView[]` (position order; hidden types omitted; configs cleaned) | 400 `content-invalid-slug`, 404 `content-seed-not-found` |
| `POST /api/content/:slug/views` body `{ type, title?, config? }` | 201 `ContentView` | 400 `content-invalid-body`, 422 `content-invalid-view`, 422 `content-view-type-not-authorized`, 404 seed |
| `PATCH /api/content/:slug/views/:viewId` body `{ title?, config? }` (≥1) | 200 `ContentView` | 400 body, 422 `content-invalid-view`, 404 `content-view-not-found`, 404 seed |
| `DELETE /api/content/:slug/views/:viewId` | 204 | 404 `content-view-not-found`, 409 `content-view-last-table`, 404 seed |
| `PUT /api/content/:slug/views/order` body `{ ids }` | 200 `ContentView[]` (new order) | 400 body, 422 `content-invalid-view`, 422 `content-view-order-mismatch`, 404 seed |

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Context } from 'hono'
import {
  createContentViewInputSchema,
  emptyViewConfig,
  isViewAuthorized,
  projectContentView,
  projectContentViews,
  reorderContentViewsInputSchema,
  resolveAuthorizedViews,
  updateContentViewInputSchema,
  validateViewConfigAgainstSeed,
  type ContentViewRecord,
  type Seed,
} from '@beechcms/core'
import { publicProblem } from '../../../public/errors/problem-details'
import { CONTENT_ERRORS } from '../constants'
import type { AppEnv } from '../../../types'

type Resolved<T> = { ok: true; value: T } | { ok: false; response: Response }

function resolveSeed(context: Context<AppEnv>): Resolved<{ slug: string; seed: Seed }> {
  const slug = context.req.param('slug')
  if (!slug) {
    return { ok: false, response: publicProblem(context, { type: 'content-invalid-slug', title: 'Bad Request', status: 400, detail: CONTENT_ERRORS.INVALID_SLUG }) }
  }
  const seed = context.get('getSeed')(slug)
  if (!seed) {
    return { ok: false, response: publicProblem(context, { type: 'content-seed-not-found', title: 'Not Found', status: 404, detail: CONTENT_ERRORS.SEED_NOT_FOUND }) }
  }
  return { ok: true, value: { slug, seed } }
}

async function readJsonBody(context: Context<AppEnv>): Promise<Resolved<unknown>> {
  try {
    return { ok: true, value: await context.req.json() }
  } catch {
    return { ok: false, response: publicProblem(context, { type: 'content-invalid-body', title: 'Bad Request', status: 400, detail: CONTENT_ERRORS.INVALID_JSON_BODY }) }
  }
}

function invalidView(context: Context<AppEnv>, detail: string | undefined): Response {
  return publicProblem(context, { type: 'content-invalid-view', title: 'Unprocessable Entity', status: 422, detail: detail ?? CONTENT_ERRORS.INVALID_VIEW })
}

function viewNotFound(context: Context<AppEnv>): Response {
  return publicProblem(context, { type: 'content-view-not-found', title: 'Not Found', status: 404, detail: CONTENT_ERRORS.VIEW_NOT_FOUND })
}

/**
 * Brief §2: Table always has at least one instance. A seed with zero rows (new seed, or any
 * seed on first read after this migration) gets one untitled instance per authorized type.
 * Runs before every write as well, so a first-ever POST cannot leave a seed without Table.
 */
async function loadOrBootstrap(context: Context<AppEnv>, slug: string, seed: Seed): Promise<ContentViewRecord[]> {
  const repository = context.get('contentViewRepository')
  const records = await repository.listBySeed(slug)
  if (records.length > 0) return records
  await repository.ensureDefaults(slug, resolveAuthorizedViews(seed), context.get('jwtPayload').sub)
  return repository.listBySeed(slug)
}

export async function listViewsHandler(context: Context<AppEnv>) {
  const resolved = resolveSeed(context)
  if (!resolved.ok) return resolved.response
  const { slug, seed } = resolved.value

  const records = await loadOrBootstrap(context, slug, seed)
  return context.json(projectContentViews(records, seed))
}

export async function createViewHandler(context: Context<AppEnv>) {
  const resolved = resolveSeed(context)
  if (!resolved.ok) return resolved.response
  const { slug, seed } = resolved.value

  const body = await readJsonBody(context)
  if (!body.ok) return body.response
  const parsed = createContentViewInputSchema.safeParse(body.value)
  if (!parsed.success) return invalidView(context, parsed.error.issues[0]?.message)

  const { type } = parsed.data
  if (!isViewAuthorized(seed, type)) {
    return publicProblem(context, { type: 'content-view-type-not-authorized', title: 'Unprocessable Entity', status: 422, detail: CONTENT_ERRORS.VIEW_TYPE_NOT_AUTHORIZED })
  }

  await loadOrBootstrap(context, slug, seed)
  const record = await context.get('contentViewRepository').create(
    {
      seedSlug: slug,
      type,
      title: parsed.data.title ?? null,
      config: validateViewConfigAgainstSeed(parsed.data.config ?? emptyViewConfig(), seed, type),
    },
    context.get('jwtPayload').sub,
  )
  const view = projectContentView(record, seed)
  if (!view) return viewNotFound(context)
  return context.json(view, 201)
}

export async function updateViewHandler(context: Context<AppEnv>) {
  const resolved = resolveSeed(context)
  if (!resolved.ok) return resolved.response
  const { slug, seed } = resolved.value
  const viewId = context.req.param('viewId')
  if (!viewId) return viewNotFound(context)

  const repository = context.get('contentViewRepository')
  const existing = await repository.get(slug, viewId)
  const existingType = existing?.type
  if (!existingType || !isViewAuthorized(seed, existingType)) return viewNotFound(context)

  const body = await readJsonBody(context)
  if (!body.ok) return body.response
  const parsed = updateContentViewInputSchema.safeParse(body.value)
  if (!parsed.success) return invalidView(context, parsed.error.issues[0]?.message)

  const updated = await repository.update(
    slug,
    viewId,
    {
      title: parsed.data.title,
      config: parsed.data.config ? validateViewConfigAgainstSeed(parsed.data.config, seed, existingType) : undefined,
    },
    context.get('jwtPayload').sub,
  )
  const view = updated ? projectContentView(updated, seed) : null
  if (!view) return viewNotFound(context)
  return context.json(view)
}

export async function deleteViewHandler(context: Context<AppEnv>) {
  const resolved = resolveSeed(context)
  if (!resolved.ok) return resolved.response
  const { slug, seed } = resolved.value
  const viewId = context.req.param('viewId')
  if (!viewId) return viewNotFound(context)

  const repository = context.get('contentViewRepository')
  const existing = await repository.get(slug, viewId)
  if (!existing || !isViewAuthorized(seed, existing.type)) return viewNotFound(context)

  const result = await repository.remove(slug, viewId)
  if (result === 'not-found') return viewNotFound(context)
  if (result === 'last-table') {
    return publicProblem(context, { type: 'content-view-last-table', title: 'Conflict', status: 409, detail: CONTENT_ERRORS.VIEW_LAST_TABLE })
  }
  return context.body(null, 204)
}

export async function reorderViewsHandler(context: Context<AppEnv>) {
  const resolved = resolveSeed(context)
  if (!resolved.ok) return resolved.response
  const { slug, seed } = resolved.value

  const body = await readJsonBody(context)
  if (!body.ok) return body.response
  const parsed = reorderContentViewsInputSchema.safeParse(body.value)
  if (!parsed.success) return invalidView(context, parsed.error.issues[0]?.message)

  const visible = projectContentViews(await loadOrBootstrap(context, slug, seed), seed)
  const requested = parsed.data.ids
  const visibleIds = new Set(visible.map((view) => view.id))
  const isPermutation =
    requested.length === visibleIds.size &&
    new Set(requested).size === requested.length &&
    requested.every((id) => visibleIds.has(id))
  if (!isPermutation) {
    return publicProblem(context, { type: 'content-view-order-mismatch', title: 'Unprocessable Entity', status: 422, detail: CONTENT_ERRORS.VIEW_ORDER_MISMATCH })
  }

  const repository = context.get('contentViewRepository')
  await repository.reorder(slug, requested, context.get('jwtPayload').sub)
  return context.json(projectContentViews(await repository.listBySeed(slug), seed))
}
```

A `content:read` user's first `GET` writes the bootstrap rows. This is intentional. It materialises the Table invariant
and is not a user-initiated mutation, so no `content:update` check applies. The write happens once per seed.

### Task 10 — `apps/api/src/features/content/index.ts`

Import:
```ts
import { listViewsHandler, createViewHandler, updateViewHandler, deleteViewHandler, reorderViewsHandler } from './handlers/views'
```
Register **directly after** the two `view-config` lines (L30-31). `GET /:slug/views` must precede `GET /:slug/:id`
(L44), or `views` would be captured as an entry id:
```ts
content.get('/:slug/views', listViewsHandler)                       // before /:slug/:id
content.post('/:slug/views', createViewHandler)
content.put('/:slug/views/order', reorderViewsHandler)              // literal segment, before /:slug/views/:viewId
content.patch('/:slug/views/:viewId', updateViewHandler)
content.delete('/:slug/views/:viewId', deleteViewHandler)
```

### Task 11 — `apps/api/src/middleware/permission.middleware.ts`

Insert **directly after** the two `view-config` rows (L119-120), inside the "per-seed: capture group 1 IS the scope"
block. They must precede the generic `/api/content/([^/]+)/[^/]+$` rows:
```ts
  { method: 'GET',    pattern: /^\/api\/content\/([^/]+)\/views$/,          requirement: perm('content:read',   'capture1') },
  { method: 'POST',   pattern: /^\/api\/content\/([^/]+)\/views$/,          requirement: perm('content:update', 'capture1') },
  { method: 'PUT',    pattern: /^\/api\/content\/([^/]+)\/views\/order$/,   requirement: perm('content:update', 'capture1') },
  { method: 'PATCH',  pattern: /^\/api\/content\/([^/]+)\/views\/[^/]+$/,   requirement: perm('content:update', 'capture1') },
  { method: 'DELETE', pattern: /^\/api\/content\/([^/]+)\/views\/[^/]+$/,   requirement: perm('content:update', 'capture1') },
```
View management needs `content:update` (same gate as `PUT /view-config`), not `content:create` or `content:delete`.
No content entry is created or deleted. Do **not** touch `OAUTH_SCOPE_ROUTES`.

### Task 12 — `@beechcms/testing`

1. `packages/testing/src/seeds/canonical.seeds.ts`, `posts` seed: add `dashboard: { views: ['table', 'gallery'] },`
   after `allowDrafts: true,`. This gives the integration tier an authorized non-table type (`gallery`) and an
   unauthorized one (`kanban`) without hand-rolled seeds (Rule 3.5). `allowDrafts: true` also makes `posts`
   Kanban-incompatible, which this sprint does not rely on.
2. `packages/testing/src/seeds/provision.ts`: add, next to `resetContentTables`:
   ```ts
   /**
    * Clears dashboard view instances. D1 is isolated per test *file* (see resetContentTables), and
    * GET /api/content/:slug/views bootstraps rows on first read, so a prior test's rows would
    * otherwise change what the next test's first read returns.
    */
   export async function resetSeedViews(db: D1Database): Promise<void> {
     try {
       await db.prepare('DELETE FROM seed_views').run()
     } catch {
       // Database migrated before 0033 (no seed_views table) — nothing to clear.
     }
   }
   ```
3. `packages/testing/src/harness.ts`, `createTestHarness`: call `await resetSeedViews(options.db)` directly after
   `await resetContentTables(options.db, seeds)`. Import it alongside `resetContentTables`.

### Task 13 — `packages/core/src/dashboard-layout/content-view.test.ts` (new, unit tier)

Header: MIT core header (same as `seed-layout.test.ts`). Fixture: one local `defineSeed` with a why-comment. Core
cannot import `@beechcms/testing`, because that package depends on core. This is the idiom `seed-layout.test.ts`
already uses.

```ts
// @beechcms/testing depends on @beechcms/core, so core suites cannot import the canonical
// seeds; this seed carries exactly the branch types the cleanup rules distinguish.
const ARTICLES = defineSeed({
  slug: 'articles',
  label: 'Article',
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text' },
    { id: 'br_02', alias: 'published_on', label: 'Published on', type: 'date' },
    { id: 'br_03', alias: 'stage', label: 'Stage', type: 'text', options: ['todo', 'done'] },
    { id: 'br_04', alias: 'summary', label: 'Summary', type: 'richtext' },
  ],
  dashboard: { views: ['table', 'gallery'] },
})
```

Required `it()` cases (names are the spec, four-zone anatomy, one act each):

`describe('VIEW_TYPE_IDS')`
- `'lists exactly the authorizable views in canonical order'`: `expect([...VIEW_TYPE_IDS]).toEqual([...AUTHORIZABLE_VIEWS])`.

`describe('contentViewConfigSchema')`
- `'parses an empty object into a complete default config'`: `toEqual({ filters: [], sort: null, groupBy: null,
  appearance: {}, conditionalFormats: [] })`.
- `'rejects a column reference written as an alias'`: a filter with `columnRef: 'title'` → `success === false`.
  Regression guard comment: persisted configs must survive branch renames (Botanical invariant).
- `'rejects a filter with more conditions than the toolbar allows'`: 4 conditions → `success === false`.
- `'rejects a conditional format whose target is the legacy row value'`: `target: 'row'` → `success === false`.

`describe('viewTitleSchema')`
- `'trims the title and collapses a whitespace-only title to null'`: drive from an array
  `[['  Covers ', 'Covers'], ['   ', null], [null, null]]` (Rule 1.6, one cause).
- `'rejects a title longer than 60 characters'`.

`describe('updateContentViewInputSchema')`
- `'rejects a body that carries neither title nor config'`.

`describe('validateViewConfigAgainstSeed')`
- `'drops every reference to a branch the seed does not have'`: `br_99` in filters, sort, groupBy,
  appearance.hiddenColumns and conditionalFormats. All are removed, and `br_01` entries are kept.
- `'keeps only the first filter on a repeated column'`.
- `'drops date precision when grouping by a non-date column'`: groupBy `br_03` with precision → `{ columnRef: 'br_03' }`.
  Grouping by `br_02` keeps it (second `it`).
- `'omits the kanban and card sub-config on a non-kanban instance'`.
- `'resets a kanban axis that is not an axis candidate'`: type `kanban`, `axisBranchId: 'br_01'` (text without
  options) → `null`. `axisBranchId: 'br_03'` → kept (second `it`).

`describe('projectContentViews')`
- `'omits records whose type the seed does not authorize and keeps the order of the rest'`: records `[table@0,
  kanban@1, gallery@2]` → ids `[table, gallery]`.

### Task 14 — `apps/api/src/features/content/test/integration/content-views.integration.test.ts` (new, integration tier)

Follow template §9.1 exactly: BUSL header, a docblock ("Content slice — view instances, integration tier. Covers the
`/views` surface against real D1 through the full middleware chain. Config cleanup rules are unit-tested in
`packages/core/src/dashboard-layout/content-view.test.ts`."),
`describe('content slice — views (real D1)')`, `beforeEach` = `__resetSeedRegistryCache()` + `createTestHarness`
(`createBeechApp({ seeds: [], authProviders })`) + `admin = await harness.asUser('admin')`. Bodies are typed at the
call site with a local `type ViewBody = { id: string; type: string; title: string | null; position: number; config:
{ filters: Array<{ columnRef: string }>; kanban?: unknown } }`. **No `any`.** Error assertions use
`body.type === 'https://beechcms.dev/problems/<code>'` (Rule 5.4: status + code, never `detail`). Zone-4 state reads
use `harness.db.prepare('SELECT … FROM seed_views WHERE seed_slug = ?')`. `seed_views` has no engine representation
(Rule 3.8). Rows for hidden-type and stale-config arrangements are inserted with direct SQL, with a why-comment.

Required cases:

`describe('GET /api/content/:slug/views')`
1. `'bootstraps one untitled instance per authorized type on a seed with no views'`: 200, types `['table','gallery']`,
   titles `null`, positions `[0,1]`, ids `toMatch(UUID_V4_PATTERN)`. State: 2 rows for `posts`.
2. `'returns the bootstrapped instances on a second read instead of creating more'`: arrange one GET. Act: GET again.
   Same ids. State: still 2 rows.
3. `'hides an instance whose type the seed does not authorize and keeps its row'`: arrange GET + SQL insert of a
   `kanban` row. Response has no `kanban`. State: 3 rows.
4. `'returns a stored config without references to branches the seed no longer has'`: arrange GET + SQL `UPDATE`
   of the table row's config to filters on `br_05` and `br_99`. Response filters `[{ columnRef: 'br_05' }]` (partial
   match).

`describe('POST /api/content/:slug/views')`
5. `'appends an authorized instance with a trimmed title and a cleaned config'`: `{ type: 'gallery', title: '  Covers ',
   config: { filters: [br_05 gt 10, br_99 eq 'x'] } }` → 201, `title 'Covers'`, `position 2`, one filter. State: the
   row's stored `config` JSON has one filter.
6. `'refuses a type the seed does not authorize and stores no instance of it'`: `kanban` → 422
   `content-view-type-not-authorized`. State: 0 `kanban` rows.
7. `'refuses a reserved view type that has no implementation'`: `calendar` → 422 `content-invalid-view`. State: 0 rows
   for `posts` (validation runs before bootstrap).
8. `'bootstraps the defaults before the first create so the seed keeps a Table instance'`: no prior GET. POST
   `gallery` → 201. State: exactly 1 `table` row for `posts`.
9. `'refuses a user without content:update and stores nothing'`: `harness.asUser('viewer')` POST → 403. State: 0 rows.

`describe('PATCH /api/content/:slug/views/:viewId')`
10. `'renames an instance and leaves its config untouched'`: arrange GET + PATCH config with one filter. Act: PATCH
    `{ title: 'Mine' }`. Response title `'Mine'`, filter still present.
11. `'drops the kanban sub-config from a non-kanban instance'`: PATCH table view with `config.kanban`. Response and
    stored JSON have no `kanban` key.
12. `'answers 404 content-view-not-found for an id the seed does not own'`: random UUID from
    `crypto.randomUUID()` is **not** allowed (Rule 7.7). Use the literal `'00000000-0000-4000-8000-000000000000'` with a
    comment. State: row count unchanged.

`describe('DELETE /api/content/:slug/views/:viewId')`
13. `'deletes a non-table instance'`: 204. State: the gallery row is gone.
14. `'refuses to delete the only Table instance with 409 content-view-last-table'`. State: the row still exists.
    Regression-guard comment: Table is the universal fallback (brief §2).
15. `'deletes a Table instance when another Table instance exists'`: arrange POST a second table. 204. State: 1
    table row.

`describe('PUT /api/content/:slug/views/order')`
16. `'rewrites positions to the requested order'`: `[gallery, table]` → 200, response order matches. State:
    `position` 0 = gallery, 1 = table.
17. `'refuses an order that omits a visible instance and keeps every position'`: `[table]` → 422
    `content-view-order-mismatch`. State: positions unchanged.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run in this order. Every command must exit 0.

```bash
# 1. Core contract builds and its unit suite passes
cd packages/core && pnpm run build && pnpm test -- content-view

# 2. Testing package typechecks against the new core (source-exported, no build script)
cd ../testing && pnpm run type-check

# 3. API typechecks (TS 7.0.2)
cd ../../apps/api && npx tsc --noEmit

# 4. Migration applies on a clean local D1
cd ../.. && pnpm beech db:reset && pnpm beech db:migrate

# 5. Integration tier — the new suite, then the whole tier (canonical-seed change must not break other suites)
cd apps/api && pnpm run test:integration -- content-views && pnpm run test:integration

# 6. Workspace regression run, scoped to changed packages
cd ../.. && pnpm beech test --diff

# 7. Lint (TS files go through the noopParser workaround; still catches JS-side config errors)
pnpm lint
```

Manual smoke (optional, local stack via `pnpm beech dev`, admin token):
`GET /api/content/<seed>/views` twice → same ids. Then `DELETE` the only table view → 409.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `0033_seed_views.sql` exists, applies on a clean DB, and has no `CHECK` on `view_type` and no `UNIQUE` on `position`.
- [ ] `content-view.ts` and `content-view.repository.ts` import nothing outside `packages/core/src` except `zod`.
- [ ] `ContentViewConfig` rejects alias column references. Only `br_XX` and the four system columns parse.
- [ ] Conditional-format targets are `element | field`. `row | cell` are rejected.
- [ ] `validateViewConfigAgainstSeed` is pure and never throws. It strips unknown branches, duplicate filters,
      non-date precision, and non-kanban `kanban`/`card`.
- [ ] `VIEW_TYPE_IDS` equals `AUTHORIZABLE_VIEWS` (unit test).
- [ ] The first `GET /views` on a seed with zero rows creates exactly one untitled instance per authorized type.
      Repeated or concurrent reads create no duplicates (guarded `INSERT … WHERE NOT EXISTS` in one D1 batch).
- [ ] The first-ever `POST /views` on a seed also bootstraps, so the seed always has ≥1 Table instance.
- [ ] Deleting the seed's only Table instance returns 409 `content-view-last-table`, enforced inside the `DELETE`
      statement and not only in the handler.
- [ ] Instances whose type the allow-list no longer authorizes are hidden from every route and never deleted.
- [ ] `PUT /views/order` accepts only an exact permutation of the visible ids.
- [ ] All five routes have explicit permission rows (`content:read` for GET, `content:update` otherwise), placed
      before the generic per-seed rows. None is added to `OAUTH_SCOPE_ROUTES`.
- [ ] Handlers call no `crypto.randomUUID()` / `Date.now()`. Ids and time come from the injected `IIdGenerator` / `IClock`.
- [ ] No handler issues SQL. All storage goes through `context.get('contentViewRepository')`.
- [ ] No new import from one `apps/api/src/features/*` slice into another.
- [ ] `createTestHarness` clears `seed_views`. Canonical `posts` authorizes `['table', 'gallery']`.
- [ ] Unit + integration suites follow `_config/testing_conventions.md` (tier placement, SPDX header, four zones, one
      act, status-first, typed bodies, zone-4 state on every write and rejection, no `any`, no fake timers).
- [ ] The full integration tier, `pnpm beech test --diff` and `npx tsc --noEmit` (api) pass.
- [ ] `git diff --stat -- apps/dashboard` is empty. The `/view-config` handlers, `seed-layout.ts`,
      `seed-layout.repository.d1.ts` and `packages/cli` are unchanged.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executing agent MUST NOT:

- Touch any file under `apps/dashboard/`: no API client, hooks, switcher, picker, empty state or toolbar changes
  (→ ROADMAP §2 `ViewInstancesDashboard`, §3 `ViewHarnessSwitcher`).
- Remove or change `GET/PUT /api/content/:slug/view-config`, `seedViewConfigSchema`,
  `ISeedLayoutRepository.getViewConfig/setViewConfig`, `seed_layouts.view_config`, or `useKanbanViewConfig`
  (→ ROADMAP §2, removed together with their only consumer).
- Migrate the legacy Kanban blob into `seed_views` (discarded by brief §4).
- Add reserved View Type identifiers (Chart, Calendar, Map, …) anywhere (→ ROADMAP §3, dashboard-only).
- Extend `ViewRegistry` / `ViewDefinition` or build any harness, Element contract or renderer (→ ROADMAP §3, §4).
- Move conditional-format evaluation out of `useContentTableConfig` (→ ROADMAP §4).
- Touch the Gallery peek panel, the Entry Editor or `generateDefaultLayout` (→ ROADMAP §5).
- Add `If-Match`/ETag concurrency, per-type instance caps, locked default views, per-user views, or cascade deletes
  of `seed_views` on seed deletion (VETO Audit §4).
- Add server-side default titles or i18n. `title: null` is the contract.
- Add the routes to `OAUTH_SCOPE_ROUTES`, the MCP server, `@beechcms/client` or `api-client`.
- Update `packages/cli/src/commands/init.ts`. Its embedded schema mirrors only `0000` and already lags 0030–0032. Syncing
  it is a separate CLI concern.
