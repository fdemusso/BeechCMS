# Sprint Plan — Kanban View (Sprint 01 / Foundation & Contracts)

> Feature Brief: `stages/00_ideation/output/feature_brief.md` (Kanban View v1.0)
> Scope of THIS sprint: the foundational tier only — `@beechcms/core` contracts,
> the D1 system schema, the backend reorder endpoint skeleton, and the dashboard
> slice scaffold + view registration. The interactive dnd-kit / virtualized board
> is explicitly a **downstream sprint** (see Section 7).

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

The Kanban View is a large feature (KB-U01…U25, KB-S01…S31) that spans all three
tiers of the monorepo. Building the interactive board first would force the UI to
invent its own data contracts, its own compatibility heuristics, and its own
persistence shape — every one of which violates a Beech invariant the moment it
lands. This sprint builds the **single source of truth** the board will later
consume, so that no downstream slice ever has to guess.

**Botanical Engine invariant.** Card ordering (KB-S04*) introduces a new
persistence concern: a per-`(seed, axis, entry)` fractional-index position. It
MUST NOT be expressed as a column on any `content_{slug}` table (that would couple
schema-compiled content tables to a dashboard-only concern and break the
deterministic DDL contract). Instead it is a **system table** (`kanban_positions`),
reached exclusively through a core repository contract (`IKanbanPositionRepository`)
— exactly the pattern already used for `media_objects` / `seed_layouts`. No handler
ever touches D1 directly; all reads/writes go through `@beechcms/core` interfaces.
The axis is keyed by `Branch.id` (`br_XX`), never by alias, so it survives alias
renames (same rule the FormLayout already follows).

**Vertical Slice Architecture.** Kanban compatibility logic (KB-S01,
`resolveKanbanConfig`) is shared knowledge about a Seed — it lives in core, not in
the UI. The dashboard gets a brand-new isolated slice
(`apps/dashboard/src/features/content-kanban/`) that imports only from core,
shared libs, and `ui/`. It does **not** cross-import from `content-gallery` or
`content-toolbar`. The existing `content-list.tsx` page composes the slice exactly
as it already composes `<ContentGallery>` (a conditional render on `activeViewId`).

**Why foundational pieces block everything else.** The board's reducer, optimistic
update, and rollback (KB-S15/S16/S21/S22) all key off a `position` string and an
`axisValue` that only exist once the schema, the endpoint, and the display model
are defined. The settle-timer / closestCenter machinery (KB-S14*) is pure UI on top
of those contracts. Ship the contracts first, frozen; iterate the UI against them.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

Mapped via `graphify query` / direct read of the returned god nodes:

**Tier 3 — `@beechcms/core`**
- `packages/core/src/types.ts` — `Seed` (L190), `Branch` (L57, carries `id: 'br_XX'`,
  `alias`, `type`, `options?`), `SelectOptions` (L259: `filters?`, `orderBy?`,
  `pagination?`, `status?`, `search?`, `fields?`), `FilterGroup`/`FilterCondition`.
- `packages/core/src/engine.ts` — `buildSelectQuery(seed, options)` (L298) is the
  single query compiler. It emits `SELECT {table}.* FROM {table}` with an optional
  FTS `INNER JOIN`, `WHERE`, and an `ORDER BY` that defaults to `{table}.created_at DESC`.
  It has **no concept of a join to an external ordering table** today. `SYSTEM_COLUMNS`
  + `isValidColumn(seed, col)` gate every column name.
- `packages/core/src/seed-layout.ts` — `FormLayout` (`version: 1`, `tabs[]`), the
  zod schema `formLayoutSchema`, and `SeedLayoutRecord`. **This is the entry-editor
  form layout, not a generic view-preferences blob** (important — see Section 4, Task D).
- `packages/core/src/index.ts` — barrel; every public contract is re-exported here.
- `ContentRepository` interface (`content.repository.ts`) — `findMany`, `findById`,
  `update`, `create`, `existsSlug`, `hasDraft`.

**Tier 2 — `apps/api`**
- `apps/api/src/types.ts` — `AppEnv = { Bindings: Env; Variables }`. `Variables`
  exposes the per-request injected contracts: `repository: ContentRepository`,
  `getSeed`, `seedRegistry`, `seedLayoutRepository: ISeedLayoutRepository`,
  `idGenerator`, `clock`, `jwtPayload`, … (L53–90). New repositories are added here.
- `apps/api/src/middleware/repository.middleware.ts` — constructs and `context.set(...)`s
  every repository onto `Variables` (registration site for a new repo).
- `apps/api/src/features/content/index.ts` — the content router. Current order:
  `GET /:slug` → `GET /:slug/facets` → `GET /:schema_slug/by-slug/:entry_slug` →
  `GET /:slug/:id` → `POST /:slug` → `PATCH /:slug/bulk` → `PUT /:slug/:id` →
  `DELETE /:slug/:id`.
- `apps/api/src/features/content/handlers/list.ts` — `listHandler` reads
  `page/limit/search/sortBy/sortDir/filters`, builds `SelectOptions`, calls
  `repository.findMany(seed, options)`, returns `{ items, total, page, limit, relations }`.
- `apps/api/src/features/content/handlers/update.ts` — `updateHandler` (the `PUT`):
  validates via `validateAndSanitizeSeedPayload`, `allowNull: true` (already accepts
  `null` patches), then `repository.update(seed, id, mergedData, status, { actor })`.
- `apps/api/src/shared/content.repository.d1.ts` — `D1ContentRepository`. `.update()`
  (L535) already batches a single main `UPDATE` (one-row write path exists).
- `apps/api/src/shared/seed-layout.repository.d1.ts` — `D1SeedLayoutRepository`:
  `get/getAllAsMap/upsert/remove` over table `seed_layouts(slug, layout, updated_at, updated_by)`.
- `apps/api/migrations/` — sequential numbered SQL. Highest applied: `0033_dashboard_layouts.sql`.
  **Next free number: `0034`.** Each file must also be appended to the `migrations`
  array in `apps/api/wrangler.jsonc` (per `database_workflow.md`). `content_{slug}`
  tables are engine-generated (not migrations); `id` is `TEXT`.

**Tier 1 — `apps/dashboard`**
- `apps/dashboard/src/pages/content-list.tsx` — the composing page. Views are local
  state: `views: UserViewInstance[]` (L223) currently `['table','gallery']`,
  `activeViewId` (L165). Each view is rendered by a conditional block
  (`activeViewId === 'gallery'` → `<ContentGallery seed data isLoading onEdit/>`, L920).
  `<ContentToolbar … views activeViewId onChangeView/>` (L781) drives the tab strip.
  `useActiveSeed(slug)` provides the reactive `seed`. Data comes from `useContentList`.
- `apps/dashboard/src/features/content-gallery/` — the slice to **mirror**: `index.ts`
  barrel, `content-gallery.tsx` entry component, `types.ts`, `gallery-hooks`,
  `gallery-card-display.ts` (display-model computation), `gallery-components/*`.
- `apps/dashboard/src/lib/content-api.ts` — typed fetch wrappers (`fetchContentListServer`,
  `updateContent`, …) over the `api` axios instance. New endpoint wrapper lands here.
- `apps/dashboard/src/features/content-toolbar/shared.ts` — only existing reference to
  the string `kanban` (a view-type placeholder). No `resolveKanbanConfig`,
  no `kanban_positions`, no kanban slice exist yet — **greenfield**.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

**Tier 3 — `@beechcms/core` (contracts + pure logic, fully implemented)**
- `packages/core/src/kanban.ts` *(new)* — `KanbanAxisBranchType`, `KanbanAxisCandidate`,
  `KanbanConfig`, `KanbanColumnDescriptor`, and the pure function `resolveKanbanConfig(seed)`.
- `packages/core/src/kanban-position.repository.ts` *(new)* — `KanbanPositionRecord`
  + `IKanbanPositionRepository` interface (contract only, no impl).
- `packages/core/src/kanban.test.ts` *(new)* — unit tests for `resolveKanbanConfig`
  and column ordering (Q2).
- `packages/core/src/types.ts` *(modified)* — extend `SelectOptions` with optional
  `kanbanOrder?: { seedSlug: string; axisBranchId: string }`.
- `packages/core/src/engine.ts` *(modified)* — `buildSelectQuery` honours `kanbanOrder`
  via a `LEFT JOIN kanban_positions` + nulls-last `ORDER BY`.
- `packages/core/src/engine.test.ts` *(modified)* — add a case asserting the join SQL.
- `packages/core/src/index.ts` *(modified)* — export the two new modules.

**Tier 2 — `apps/api` (system schema + endpoint skeleton)**
- `apps/api/migrations/0034_kanban_foundation.sql` *(new)* — `kanban_positions` table +
  index + additive `seed_layouts.view_config` column.
- `apps/api/wrangler.jsonc` *(modified)* — register `0034_kanban_foundation.sql`.
- `apps/api/src/shared/kanban-position.repository.d1.ts` *(new)* — `D1KanbanPositionRepository`
  implementing `IKanbanPositionRepository` (single-row upsert, column read, batch rebalance).
- `apps/api/src/features/content/handlers/kanban-position.ts` *(new)* — `kanbanPositionHandler`
  for `PATCH /:slug/:id/kanban-position`.
- `apps/api/src/features/content/index.ts` *(modified)* — register the new route.
- `apps/api/src/types.ts` *(modified)* — add `kanbanPositionRepository: IKanbanPositionRepository`
  to `Variables`.
- `apps/api/src/middleware/repository.middleware.ts` *(modified)* — construct + inject it.
- `apps/api/src/shared/kanban-position.repository.d1.test.ts` *(new)* — repo unit tests.

**Tier 1 — `apps/dashboard` (slice scaffold + view registration only — NO board UI)**
- `apps/dashboard/src/features/content-kanban/index.ts` *(new)* — barrel.
- `apps/dashboard/src/features/content-kanban/types.ts` *(new)* — `KanbanCardDisplayModel`,
  `KanbanColumnModel`, `ContentKanbanProps`.
- `apps/dashboard/src/features/content-kanban/constants.ts` *(new)* — `KANBAN_*` UI constants.
- `apps/dashboard/src/features/content-kanban/content-kanban.tsx` *(new)* — **no-op stub**:
  renders the unconfigured-axis prompt (KB-U02) or a "board coming in next sprint"
  placeholder. No dnd, no virtualization.
- `apps/dashboard/src/lib/content-api.ts` *(modified)* — add `updateKanbanPosition(...)` wrapper.
- `apps/dashboard/src/pages/content-list.tsx` *(modified)* — register the `kanban` view,
  gated by `resolveKanbanConfig(seed).compatible` (KB-S26: tab hidden when incompatible).

**Explicitly excluded from this sprint:** the dnd-kit board, the `useReducer` drag
state machine, virtualization, settle timer, optimistic update/rollback, auto-scroll,
per-column infinite fetch, fractional-index client math. See Section 7.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### Task A — D1 system schema (`0034_kanban_foundation.sql`)

```sql
-- =============================================================================
-- Kanban Foundation
--  kanban_positions : per-(seed, axis, entry) fractional-index ordering.
--                     System table — NEVER a column on content_{slug}.
--  seed_layouts.view_config : additive JSON blob for per-seed dashboard view
--                     preferences (kanban axis/sort/hidden columns). Nullable,
--                     so existing rows are untouched.
-- =============================================================================

CREATE TABLE IF NOT EXISTS kanban_positions (
  seed_slug      TEXT    NOT NULL,
  entry_id       TEXT    NOT NULL,
  axis_branch_id TEXT    NOT NULL,                  -- Branch.id (br_XX), not alias
  position       TEXT    NOT NULL,                  -- fractional-indexing key
  updated_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (seed_slug, entry_id, axis_branch_id)
);

-- Column fetch path: ORDER BY position within one (seed, axis).
CREATE INDEX IF NOT EXISTS idx_kanban_positions_column
  ON kanban_positions (seed_slug, axis_branch_id, position);

-- Per-seed dashboard view preferences (KB-S02). Additive, nullable.
ALTER TABLE seed_layouts ADD COLUMN view_config TEXT;
```

> NOTE — no `ON DELETE` FK to `content_{slug}` (those tables are engine-generated and
> not present at migration time). Orphan rows are pruned opportunistically by the
> repository / a future hook; a stale `kanban_positions` row is harmless (it only
> participates in a `LEFT JOIN`). Append `"0034_kanban_foundation.sql"` to the
> `migrations` array in `apps/api/wrangler.jsonc` after the `0033` entry.

### Task B — Core compatibility contract (`packages/core/src/kanban.ts`)

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { Seed, Branch } from './types.js'

/** Branch types that can form a discrete, finite set of columns (KB §2). */
export type KanbanAxisBranchType = 'text' | 'tags' | 'boolean'

/** A branch eligible to be the kanban axis. */
export interface KanbanAxisCandidate {
  /** Stable branch id (br_XX) — persisted as the axis key. Never the alias. */
  branchId: string
  alias: string
  label: string
  type: KanbanAxisBranchType
}

/** A single column on the board, in deterministic display order (Q2). */
export interface KanbanColumnDescriptor {
  /** The discrete axis value. `null` ⇒ the always-last "Senza valore" column. */
  value: string | null
  label: string
}

/** Per-seed, dashboard-side kanban view preferences. Persisted in
 *  seed_layouts.view_config (KB-S02). NOT part of FormLayout. */
export interface KanbanConfig {
  /** Chosen axis branch id, or null when the user has not configured one (KB-U02). */
  axisBranchId: string | null
  /** Card sort inside columns. null ⇒ manual order via kanban_positions (KB-U22b). */
  sort: { branchId: string; dir: 'ASC' | 'DESC' } | null
  /** Axis values the user chose to hide when columns exceed the cap (KB-U06c). */
  hiddenColumnValues?: string[]
}

export type KanbanIncompatibleReason = 'drafts-enabled' | 'no-candidate-branch'

export interface KanbanCompatibility {
  compatible: boolean
  reason?: KanbanIncompatibleReason
  candidates: KanbanAxisCandidate[]
}

/** Branch types that are explicitly never an axis (KB §2). */
const NON_AXIS_TYPES = new Set<Branch['type']>([
  'richtext', 'file', 'number', 'date', 'json', 'relation', 'repeater',
])

function isAxisCandidate(b: Branch): KanbanAxisBranchType | null {
  if (b.alias === 'status') return null            // system status excluded (KB §2)
  if (NON_AXIS_TYPES.has(b.type)) return null
  if (b.type === 'text') return (b.options && b.options.length > 0) ? 'text' : null
  if (b.type === 'tags') return 'tags'
  if (b.type === 'boolean') return 'boolean'
  return null
}

/**
 * Determines whether a seed can be displayed as a Kanban board, and which
 * branches may serve as the column axis. Pure — no I/O. (KB-S01)
 *
 * Q3: seeds with `allowDrafts: true` are NOT kanban-compatible.
 */
export function resolveKanbanConfig(seed: Seed): KanbanCompatibility {
  if (seed.allowDrafts) {
    return { compatible: false, reason: 'drafts-enabled', candidates: [] }
  }
  const candidates: KanbanAxisCandidate[] = []
  for (const b of seed.branches) {
    const type = isAxisCandidate(b)
    if (type) candidates.push({ branchId: b.id, alias: b.alias, label: b.label, type })
  }
  if (candidates.length === 0) {
    return { compatible: false, reason: 'no-candidate-branch', candidates: [] }
  }
  return { compatible: true, candidates }
}

/**
 * Deterministic, stable column order for a chosen axis (Q2). The "Senza valore"
 * (value: null) column is always appended last. Values out of `options` are NOT
 * given their own column (KB-U25) — the board folds them into "Senza valore".
 *
 * @param distinctTagValues unique tag values observed in data (tags axis without options).
 */
export function resolveKanbanColumns(
  branch: Branch,
  distinctTagValues: string[] = [],
): KanbanColumnDescriptor[] {
  const cols: KanbanColumnDescriptor[] = []
  if (branch.type === 'boolean') {
    cols.push({ value: 'false', label: 'No' }, { value: 'true', label: 'Sì' }) // [false, true]
  } else if (branch.type === 'text' && branch.options?.length) {
    for (const o of branch.options) cols.push({ value: o, label: o })           // options order
  } else if (branch.type === 'tags') {
    const ordered = branch.options?.length
      ? branch.options
      : [...distinctTagValues].sort((a, b) => a.localeCompare(b))               // alphabetical
    for (const o of ordered) cols.push({ value: o, label: o })
  }
  cols.push({ value: null, label: `Senza ${branch.label}` })                    // always last
  return cols
}
```

### Task C — Position repository contract (`packages/core/src/kanban-position.repository.ts`)

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export interface KanbanPositionRecord {
  entryId: string
  position: string
}

/**
 * Persistence contract for card ordering. The ONLY gateway to `kanban_positions`.
 * Handlers and the dashboard never touch the table directly (Botanical invariant).
 */
export interface IKanbanPositionRepository {
  /** entryId → position for one column axis (entries without a row are omitted). */
  getColumn(seedSlug: string, axisBranchId: string): Promise<Map<string, string>>
  /** Single-row upsert — exactly one write per drag (KB-S04b). */
  setPosition(seedSlug: string, entryId: string, axisBranchId: string, position: string): Promise<void>
  /** Remove an entry's position row (e.g. entry deleted). */
  remove(seedSlug: string, entryId: string, axisBranchId: string): Promise<void>
  /** Async rebalance (KB-S04f): rewrite a whole column's positions in one batch. */
  rebalance(seedSlug: string, axisBranchId: string, ordered: KanbanPositionRecord[]): Promise<void>
}
```

### Task D — `SelectOptions` + `buildSelectQuery` kanban ordering (engine)

`SelectOptions` (`packages/core/src/types.ts`) gains one optional field — additive,
zero impact on existing callers:

```ts
export interface SelectOptions {
  filters?: FilterGroup[]
  orderBy?: { column: string; dir: 'ASC' | 'DESC' }
  pagination?: { limit: number; offset: number }
  status?: string | null
  search?: string
  fields?: string[]
  /** When set, LEFT JOIN kanban_positions and order by fractional index (KB-S04c/S05).
   *  Mutually exclusive with `orderBy`; if both present, `kanbanOrder` wins. */
  kanbanOrder?: { seedSlug: string; axisBranchId: string }
}
```

In `buildSelectQuery` (engine.ts L298), after the FTS join block and before the
final `ORDER BY` decision, add:

```ts
// Kanban ordering: external LEFT JOIN, nulls last (entries without a position row
// created before kanban activation sort to the bottom — KB-S04c).
let kanbanOrderClause = ''
if (options.kanbanOrder) {
  joinClause += ` LEFT JOIN kanban_positions kp` +
    ` ON kp.seed_slug = ? AND kp.entry_id = ${table}.id AND kp.axis_branch_id = ?`
  bindings.push(options.kanbanOrder.seedSlug, options.kanbanOrder.axisBranchId)
  // SQLite sorts NULLs first by default; `kp.position IS NULL` forces them last.
  kanbanOrderClause = ` ORDER BY (kp.position IS NULL) ASC, kp.position ASC`
}
```

…and make the `ORDER BY` selection prefer `kanbanOrderClause` over the existing
`orderBy` / `created_at DESC` fallback. The two bindings for the join are pushed in
join order (before WHERE/LIMIT bindings), matching the SQL text order.

> Constraint: `kanban_positions` is a fixed system table name — NOT validated by
> `isValidColumn`. The `axisBranchId` is bound as a parameter, never interpolated.

### Task E — Reorder endpoint (`PATCH /:slug/:id/kanban-position`)

Handler `kanbanPositionHandler` (`handlers/kanban-position.ts`), wired as the
**first** content route so its 3-segment path is matched before the generic
`PUT /:slug/:id` (distinct method anyway):

```ts
content.patch('/:slug/:id/kanban-position', kanbanPositionHandler)
```

Request body (validated): `{ position: string; axisBranchId: string }`.
- 400 on missing `slug`/`id`/`position`/`axisBranchId` (use `publicProblem`).
- 404 via `getSeed(slug)` miss; resolve the axis branch by id against `seed.branches`
  (reject if `axisBranchId` is not a kanban candidate of this seed).
- Verify entry existence through `repository.findById(seed, id)` (→ 404 maps to the
  KB-S15b "entry deleted" path the UI will consume).
- Write through `context.get('kanbanPositionRepository').setPosition(slug, id, axisBranchId, position)`.
- Return `{ success: true }`.

> This endpoint ONLY writes `kanban_positions`. Changing the axis VALUE on
> cross-column drag is the existing `PUT /:slug/:id` path (already `allowNull: true`,
> so KB-U24 `null` axis is accepted). The single-transaction coupling of the two
> writes (KB-S04e) and the tags atomic patch (Q1) are **downstream** concerns — out
> of scope here.

`D1KanbanPositionRepository` (`shared/kanban-position.repository.d1.ts`):

```ts
async setPosition(seedSlug: string, entryId: string, axisBranchId: string, position: string) {
  await this.db.prepare(`
    INSERT INTO kanban_positions (seed_slug, entry_id, axis_branch_id, position, updated_at)
    VALUES (?, ?, ?, ?, unixepoch())
    ON CONFLICT(seed_slug, entry_id, axis_branch_id)
      DO UPDATE SET position = excluded.position, updated_at = excluded.updated_at
  `).bind(seedSlug, entryId, axisBranchId, position).run()
}
```

`getColumn` → `SELECT entry_id, position FROM kanban_positions WHERE seed_slug = ?
AND axis_branch_id = ?` folded into a `Map`. `rebalance` → `this.db.batch([...])`
of single-row updates.

### Task F — DI wiring

- `apps/api/src/types.ts` `Variables`: add
  `kanbanPositionRepository: IKanbanPositionRepository`.
- `apps/api/src/middleware/repository.middleware.ts`: construct
  `new D1KanbanPositionRepository(env.DB)` and `context.set('kanbanPositionRepository', …)`
  alongside the existing repositories.
- `packages/core/src/index.ts`: `export * from './kanban.js'` and
  `export * from './kanban-position.repository.js'`.

### Task G — Dashboard slice scaffold + view registration (NO board)

`content-kanban/types.ts`:

```ts
import type { Seed } from '@beechcms/core'
import type { ContentEntry } from '@/lib/dynamic-columns'

/** Pure render model for a card — computed once at fetch (KB-S18). */
export interface KanbanCardDisplayModel {
  entryId: string
  title: string
  statusBadge?: string
  imageUrl?: string
  axisValue: string | null
  position: string | null
}

export interface KanbanColumnModel {
  value: string | null          // null ⇒ "Senza valore" column
  label: string
  total: number
  cards: KanbanCardDisplayModel[]
}

export interface ContentKanbanProps {
  seed: Seed
  data: ContentEntry[]
  isLoading?: boolean
  onEdit: (id: string) => void
}
```

`content-kanban/constants.ts` (UI tunables — KB-U06c/U07/S04f/S10/S14b):

```ts
export const KANBAN_MAX_COLUMNS = 20
export const KANBAN_COLUMN_PAGE_SIZE = 20
export const KANBAN_CARD_HEIGHT_PX = 96
export const KANBAN_COLUMN_WIDTH_PX = 280
export const KANBAN_SETTLE_MS = 350
export const KANBAN_POSITION_REBALANCE_THRESHOLD = 50
```

`content-kanban/content-kanban.tsx` — **stub only**: when `resolveKanbanConfig(seed)`
has no chosen axis, render the KB-U02 configuration prompt; otherwise render a
neutral "board in arrivo" placeholder. No dnd-kit import, no virtualization.

`content-api.ts` wrapper:

```ts
export async function updateKanbanPosition(
  slug: string, id: string, body: { position: string; axisBranchId: string }
): Promise<{ success: boolean }> {
  const res = await api.patch<{ success: boolean }>(`/content/${slug}/${id}/kanban-position`, body)
  return res.data
}
```

`content-list.tsx` — extend the `views` initializer with a `kanban` entry, but only
when compatible, and add the conditional render mirroring gallery:

```ts
const kanbanCompat = React.useMemo(() => seed ? resolveKanbanConfig(seed) : null, [seed])
// …push { id:'kanban', label:'kanban', type:'kanban', enabledTools:['filter','sort','search','create'], conditionalFormats:[] }
//    into `views` ONLY when kanbanCompat?.compatible (KB-S26)
// …add VIEW_LABELS.kanban = t('content.list.kanban')
{!error && activeViewId === 'kanban' && (
  <ContentKanban seed={seed} data={data} isLoading={isLoading} onEdit={handleEdit} />
)}
```

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run from the monorepo root unless noted (commands per `_config/commands.md`):

```bash
# Tier 3 — core contracts compile + unit tests (resolveKanbanConfig, column order, engine join)
pnpm --filter @beechcms/core run build
pnpm --filter @beechcms/core run test

# Tier 2 — api typechecks + repo/handler tests
pnpm --filter @beechcms/api exec tsc --noEmit
pnpm --filter @beechcms/api run test

# D1 migration applies cleanly from scratch (includes 0034)
pnpm run db:reset:local

# Tier 1 — dashboard typechecks (slice + view registration) and build
pnpm --filter @beechcms/dashboard exec tsc --noEmit
pnpm --filter @beechcms/dashboard run build

# Whole-repo gate
pnpm run build
pnpm run lint
```

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `0034_kanban_foundation.sql` creates `kanban_positions` (+ index) and adds the
      nullable `seed_layouts.view_config` column; it is registered in `wrangler.jsonc`
      and `pnpm run db:reset:local` succeeds from a clean state.
- [ ] No `content_{slug}` table is altered by this sprint (Botanical invariant).
- [ ] `resolveKanbanConfig(seed)` returns `compatible: false` for `allowDrafts: true`
      seeds and for seeds with no candidate branch; returns `text`-with-options,
      `tags`, and `boolean` branches (never `status`/`richtext`/`file`/`number`/
      `date`/`json`/`relation`/`repeater`) as candidates — covered by unit tests.
- [ ] `resolveKanbanColumns` yields the Q2 deterministic order with the `null`
      "Senza valore" column always last — covered by unit tests.
- [ ] `axis_branch_id` is keyed by `Branch.id` (`br_XX`) end-to-end; no code path
      persists an alias as the axis key.
- [ ] `buildSelectQuery` with `kanbanOrder` emits the `LEFT JOIN kanban_positions`
      with parameterized `seed_slug`/`axis_branch_id` bindings and a nulls-last
      `ORDER BY`; existing callers (no `kanbanOrder`) produce byte-identical SQL to
      before — covered by an engine test.
- [ ] `IKanbanPositionRepository` is the only access path to `kanban_positions`; the
      handler does no raw SQL. `D1KanbanPositionRepository.setPosition` performs exactly
      one upsert (KB-S04b).
- [ ] `PATCH /:slug/:id/kanban-position` validates body, 404s on unknown seed/entry,
      rejects an `axisBranchId` that is not a candidate of the seed, writes only the
      position row, and returns `{ success: true }`.
- [ ] `kanbanPositionRepository` is typed on `AppEnv.Variables` and injected in
      `repository.middleware.ts`.
- [ ] The `kanban` view tab appears in `content-list.tsx` ONLY when
      `resolveKanbanConfig(seed).compatible` (KB-S26); selecting it renders the
      `content-kanban` stub without errors.
- [ ] No cross-feature import: `content-kanban` imports only `@beechcms/core`,
      shared libs, and `@/components/ui/*` — not `content-gallery`/`content-toolbar`.
- [ ] All commands in Section 5 pass.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executing agent MUST NOT build the following in this sprint (they are downstream
sprints that consume the contracts frozen here):

- The interactive board: `@dnd-kit/core` + `@dnd-kit/sortable`, `DragOverlay`,
  `closestCenter`, sensors/`TouchSensor` (KB-S11–S14, S30–S31).
- The drag state machine: `useReducer` snapshot, `DRAG_ROLLBACK`/`DRAG_REMOVE`,
  `isPending` flag, optimistic update (KB-S15–S16, S21–S23, U12–U13b).
- The settle timer / ref-only `onDragMove` / committed position / auto-scroll
  (KB-S14b–S14e, U11b).
- `@tanstack/react-virtual` per-column virtualization (KB-S08–S10).
- Per-column `useInfiniteQuery` fetching, parallel mount, "Carica altri", per-column
  totals (KB-U05/U07/U08, S05–S07).
- Client-side `fractional-indexing` math, the async rebalance scheduler, and the
  single-transaction coupling of axis-value + position PATCH (KB-S04d–S04f, S04e).
- The tags atomic `{ oldAxisValue, newAxisValue }` server patch (Q1).
- Column collapse/cap UI, keyboard drag + `aria-live`, skeletons/empty states,
  reading/writing `seed_layouts.view_config` from the dashboard (KB-U06/U06b/U06c,
  U14, S24–S29) — the column exists now; its read/write client lands with the board.
- Any change to `content_{slug}` DDL or the Botanical Engine beyond the additive
  `kanbanOrder` join.
