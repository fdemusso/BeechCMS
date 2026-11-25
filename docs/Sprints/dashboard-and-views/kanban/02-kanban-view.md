# Sprint Plan — Kanban View (Sprint 02 / Static Board: Axis Config, Per-Column Fetch & Virtualized Render)

> Feature Brief: `stages/00_ideation/output/feature_brief.md` (Kanban View v1.0)
> Predecessor: Sprint 01 (`docs/Sprints/kanban/01-kanban-view.md`) — **Foundation & Contracts, already implemented**
> (core `resolveKanbanConfig`/`resolveKanbanColumns`/`IKanbanPositionRepository`, engine `kanbanOrder`
> join, `0034_kanban_foundation.sql`, `PATCH /:slug/:id/kanban-position`, `D1KanbanPositionRepository`,
> and the `content-kanban` no-op stub slice + view registration).
>
> Scope of THIS sprint: turn the stub into a **read-only, fetch-complete board** — axis configuration
> + persistence, per-column independent fetching/pagination, virtualized column rendering, card display
> model, headers/counts, collapse, column cap, skeleton/empty states, and click-to-edit. The interactive
> **drag-and-drop**, the optimistic reducer/rollback, the settle timer, fractional-index math, and the
> server-side cross-column transaction are explicitly a **downstream sprint** (Sprint 03 — see Section 7).

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Sprint 01 froze the data contracts; it deliberately shipped a no-op stub for the UI so the board would
never invent its own persistence shape. Sprint 03's drag machinery (the `useReducer` snapshot, optimistic
move, `DRAG_ROLLBACK`/`DRAG_REMOVE`, the settle timer, `closestCenter`, fractional-index interpolation —
KB-S11…S16, S21…S23, U09…U14) is **pure UI layered on top of a board that already renders, paginates,
and orders correctly**. You cannot stabilise a drag against columns that do not yet fetch independently,
virtualize at a fixed card height, or compute a card display model. Building drag before the render/fetch
substrate would force the drag code to also invent column fetching, axis resolution, and config
persistence — and every one of those would have to be reworked the moment the real board landed.

This sprint therefore builds **exactly the substrate the drag layer consumes, and nothing it doesn't**:

- **Botanical Engine invariant.** No new D1 access is introduced outside `@beechcms/core`. Column
  ordering still flows through the already-frozen `SelectOptions.kanbanOrder` → `buildSelectQuery` LEFT
  JOIN; this sprint only *wires the existing `listHandler` to populate `kanbanOrder`* from a query param.
  Per-seed kanban preferences (axis, sort, hidden/collapsed columns — KB-S02) persist in the **existing**
  `seed_layouts.view_config` column added by `0034`, reached **only** through an extension of the existing
  `ISeedLayoutRepository` contract (`getViewConfig`/`setViewConfig`) — no handler touches D1 directly, and
  no `content_{slug}` DDL changes. The axis is keyed by `Branch.id` (`br_XX`), never alias (KB §4.1).

- **Vertical Slice Architecture.** All board UI lands inside the isolated `content-kanban/` slice created
  in Sprint 01. It imports only from `@beechcms/core`, shared libs (`@/lib/*`), and `@/components/ui/*`.
  It does **not** cross-import from `content-gallery` or `content-toolbar`; where it needs the same
  compatibility/column logic it calls the core pure functions (`resolveKanbanConfig`,
  `resolveKanbanColumns`). The composing page `content-list.tsx` already mounts `<ContentKanban>` on
  `activeViewId === 'kanban'` (Sprint 01) — this sprint only enriches the props it passes.

- **YAGNI boundary.** Drag is the single largest risk surface in the whole feature (React re-render storms,
  phantom droppables, touch-vs-scroll, rollback races). Isolating it into its own sprint keeps *this* PR
  reviewable and lets the static board be validated (and even shipped behind the existing tab) before any
  of that complexity exists. Ship the render/fetch tier frozen; iterate drag against it.

==========================================================================
SECTION 2 — CURRENT STATE (verified via direct inspection of the Sprint 01 artifacts)
==========================================================================

> Verified by reading the on-disk Sprint 01 deliverables and the composition sites (grep/Read; the
> graphify graph predates these untracked files, so source was inspected directly per the graph-router
> fallback rule).

**Tier 3 — `@beechcms/core` (frozen, present)**
- `packages/core/src/kanban.ts` — `resolveKanbanConfig(seed): KanbanCompatibility` (drafts ⇒
  incompatible; candidates = `text`-with-options / `tags` / `boolean`, never `status`/non-axis types) and
  `resolveKanbanColumns(branch, distinctTagValues?): KanbanColumnDescriptor[]` (Q2 deterministic order,
  `{ value: null, label: 'Senza …' }` always last). Also exports `KanbanConfig` (`axisBranchId`, `sort`,
  `hiddenColumnValues?`), `KanbanAxisCandidate`, `KanbanColumnDescriptor`.
- `packages/core/src/kanban-position.repository.ts` — `IKanbanPositionRepository`
  (`getColumn`/`setPosition`/`remove`/`rebalance`) + `KanbanPositionRecord`. **Read path for this sprint:
  `getColumn(seedSlug, axisBranchId): Promise<Map<entryId, position>>`.**
- `packages/core/src/types.ts` — `SelectOptions.kanbanOrder?: { seedSlug; axisBranchId }` exists.
- `packages/core/src/engine.ts` — `buildSelectQuery` honours `kanbanOrder` (LEFT JOIN `kanban_positions`,
  nulls-last `ORDER BY (kp.position IS NULL) ASC, kp.position ASC`).
- `seed-layout` contract: `ISeedLayoutRepository` (`get`/`getAllAsMap`/`upsert`/`remove`) currently models
  only `FormLayout`. **It does NOT yet read/write `view_config`** — this sprint extends it.
- `packages/core/src/index.ts` — barrel; `./kanban.js` + `./kanban-position.repository.js` exported.

**Tier 2 — `apps/api` (foundation present, two seams to extend)**
- `apps/api/migrations/0034_kanban_foundation.sql` — `kanban_positions(seed_slug, entry_id,
  axis_branch_id, position, updated_at)` + `idx_kanban_positions_column`; **`seed_layouts.view_config TEXT`
  (nullable) already added**. Registered in `wrangler.jsonc`. Next free migration number: **`0035`**
  (none needed this sprint — schema is sufficient).
- `apps/api/src/features/content/handlers/list.ts` — `listHandler` reads
  `page/limit/search/sortBy/sortDir/filters`, builds `SelectOptions` **without `kanbanOrder`**, calls
  `repository.findMany`, returns `{ items, total, page, limit, relations }` (and a bare array when no
  query params). **SEAM A: add a `kanbanAxis` query param → `kanbanOrder`.**
- `apps/api/src/features/content/handlers/kanban-position.ts` — `kanbanPositionHandler`
  (`PATCH /:slug/:id/kanban-position`) writes only the position row. (Consumed by Sprint 03, untouched here.)
- `apps/api/src/shared/seed-layout.repository.d1.ts` — `D1SeedLayoutRepository` over
  `seed_layouts(slug, layout, updated_at, updated_by)`; **does not touch `view_config`. SEAM B.**
- `apps/api/src/features/dashboard-layout/` — a *separate* concern (role-scoped builder layouts via
  `dashboardLayoutRepository`); **not** the per-seed view config. Mirror its handler/route style, not its
  storage.
- `apps/api/src/types.ts` `Variables` — exposes `repository`, `getSeed`, `seedRegistry`,
  `seedLayoutRepository`, `kanbanPositionRepository`, `idGenerator`, `clock`, `jwtPayload`, …
- `apps/api/src/features/content/index.ts` — content router (kanban-position route already registered).

**Tier 1 — `apps/dashboard` (stub present, board to build)**
- `apps/dashboard/src/features/content-kanban/` — `index.ts`, `types.ts` (`KanbanCardDisplayModel`,
  `KanbanColumnModel`, `ContentKanbanProps = { seed; data; isLoading?; onEdit }`), `constants.ts`
  (`KANBAN_MAX_COLUMNS=20`, `KANBAN_COLUMN_PAGE_SIZE=20`, `KANBAN_CARD_HEIGHT_PX=96`,
  `KANBAN_COLUMN_WIDTH_PX=280`, `KANBAN_SETTLE_MS=350`, `KANBAN_POSITION_REBALANCE_THRESHOLD=50`),
  `content-kanban.tsx` (**no-op stub** rendering loading / incompatible / "in arrivo" placeholder).
- `apps/dashboard/src/pages/content-list.tsx` — `kanbanCompat = resolveKanbanConfig(seed)` (L223); kanban
  view pushed into `views` when compatible (L252–270, KB-S26); `VIEW_LABELS.kanban` (L275); renders
  `<ContentKanban seed data isLoading onEdit/>` on `activeViewId==='kanban'` (L954). Data comes from
  `useContentList(slug, params)` (`features/content-management/hooks/use-content-list.ts`).
- `apps/dashboard/src/lib/content-api.ts` — `fetchContentListServer(slug, params)` (L43, GET `/content/:slug`),
  `updateContent` (L88), `createContent` (L77), `deleteContent` (L103), `updateKanbanPosition` (L113,
  Sprint 01). **No `view-config` wrapper yet, no per-column fetch wrapper yet.**
- **Dependencies already installed:** `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`,
  `@tanstack/react-query`, `@tanstack/react-virtual`. **`fractional-indexing` is NOT installed** (correct —
  it is a Sprint 03 dependency; do not add it here).

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

**Tier 3 — `@beechcms/core` (view-config contract + a tiny pure helper)**
- `packages/core/src/seed-layout.ts` *(modified)* — add `KanbanViewConfig`/`SeedViewConfig` types and
  `seedViewConfigSchema` (zod); extend `ISeedLayoutRepository` with `getViewConfig(slug)` /
  `setViewConfig(slug, config, updatedBy)`.
- `packages/core/src/kanban.ts` *(modified)* — add pure helper `kanbanColumnFilter(branch, value)` →
  a `FilterCondition`/`FilterGroup` fragment selecting one column's entries (incl. the `null` / out-of-vocab
  "Senza valore" case, KB-U25). No I/O.
- `packages/core/src/kanban.test.ts` *(modified)* — cover `kanbanColumnFilter` (value, null, boolean coercion).
- `packages/core/src/seed-layout.test.ts` *(modified/new)* — cover `seedViewConfigSchema` parse + reject.
- `packages/core/src/index.ts` *(modified)* — export the new view-config types/schema and helper.

**Tier 2 — `apps/api` (wire `kanbanOrder` + view-config route — NO migration)**
- `apps/api/src/features/content/handlers/list.ts` *(modified)* — parse `kanbanAxis` (br_XX) query param;
  when present and a valid candidate of the seed, set `SelectOptions.kanbanOrder` (mutually exclusive with
  `orderBy`, per the Sprint 01 engine contract).
- `apps/api/src/shared/seed-layout.repository.d1.ts` *(modified)* — implement `getViewConfig` /
  `setViewConfig` over the existing `seed_layouts.view_config` column (JSON in TEXT; create-or-update row).
- `apps/api/src/features/content/handlers/view-config.ts` *(new)* — `getViewConfigHandler` /
  `putViewConfigHandler` for `GET|PUT /:slug/view-config` (zod-validated body via `seedViewConfigSchema`;
  404 on unknown seed; edit-permission gate on PUT).
- `apps/api/src/features/content/index.ts` *(modified)* — register `GET /:slug/view-config` and
  `PUT /:slug/view-config` **before** the generic `GET /:slug/:id` / `PUT /:slug/:id` (more specific path).
- `apps/api/src/shared/seed-layout.repository.d1.test.ts` *(modified)* — view-config round-trip test.
- `apps/api/src/features/content/__tests__/view-config.handler.test.ts` *(new)* — route tests.

**Tier 1 — `apps/dashboard` (the board — render & fetch only, NO drag)**
- `apps/dashboard/src/lib/content-api.ts` *(modified)* — `fetchKanbanColumn(slug, params)` (column fetch
  with axis filter + `kanbanAxis` order), `fetchSeedViewConfig(slug)`, `updateSeedViewConfig(slug, config)`.
- `content-kanban/types.ts` *(modified)* — add `KanbanColumnFetchState`, `KanbanBoardConfig`,
  `ContentKanbanProps` gains `seedSlug`/permission flag if needed (keep prop-compatible with the call site).
- `content-kanban/hooks/use-kanban-view-config.ts` *(new)* — load/persist `KanbanConfig` via the API
  wrappers (axis, sort, collapsed/hidden columns; KB-U01/U03/U23, S02).
- `content-kanban/hooks/use-kanban-columns.ts` *(new)* — derive `KanbanColumnDescriptor[]` from the chosen
  branch via `resolveKanbanColumns`, applying the `KANBAN_MAX_COLUMNS` cap + hidden set (KB-U06c).
- `content-kanban/hooks/use-kanban-column-query.ts` *(new)* — per-column `useInfiniteQuery`
  (KANBAN_COLUMN_PAGE_SIZE page, independent limit/offset, parallel mount; KB-S05/S06).
- `content-kanban/kanban-card-display.ts` *(new)* — pure `KanbanCardDisplayModel` builder, computed at
  fetch (KB-S18) — mirrors `gallery-card-display.ts` in spirit, no cross-import.
- `content-kanban/content-kanban.tsx` *(rewritten)* — orchestrator: axis-config prompt (KB-U02) ↔ board;
  CSS-Grid column layout (KB-S19), `KANBAN_COLUMN_WIDTH_PX`; horizontal scroll/carousel (KB-U04).
- `content-kanban/kanban-column.tsx` *(new)* — `React.memo` column (KB-S17): header (label, total, loaded
  count, unloaded indicator — KB-U05/S07), virtualized list, "Carica altri" (KB-U07), collapse (KB-U06),
  empty/skeleton states (KB-S24/S25), `role="region"` (KB-S28).
- `content-kanban/kanban-card.tsx` *(new)* — pure card from display model; fixed `KANBAN_CARD_HEIGHT_PX`;
  lazy fixed-size image (KB-S20); `role="article"` (KB-S27); click → `onEdit` (KB-U15).
- `content-kanban/kanban-column-virtualizer.tsx` *(new)* — `@tanstack/react-virtual` per-column scroller
  (KB-S08/S09/S10), fixed item height.
- `content-kanban/kanban-axis-config.tsx` *(new)* — "Raggruppa per" control listing
  `resolveKanbanConfig(seed).candidates` (KB-U01) + sort selector (KB-U22) + column-visibility selector
  when capped (KB-U06c); writes through `use-kanban-view-config`.
- `content-kanban/index.ts` *(modified)* — barrel exports.

**Explicitly excluded from this sprint:** any `@dnd-kit/*` import, `DragOverlay`, sensors, `closestCenter`,
the `useReducer` drag state machine, settle timer / `committedPositionRef` / auto-scroll,
`fractional-indexing`, the async rebalance, the cross-column server transaction (axis PATCH + position
PATCH), the tags atomic `{oldAxisValue,newAxisValue}` patch, keyboard drag + `aria-live`, and post-save
no-refetch card move (KB-U16). See Section 7.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### Task A — Core: view-config contract (`seed-layout.ts`)

`view_config` is a per-seed map keyed by view id; kanban occupies the `kanban` slot. Keep it open for
future views (table/gallery prefs) without a schema change.

```ts
// packages/core/src/seed-layout.ts  (additions)
import { z } from 'zod'

/** Per-seed kanban preferences (KB-S02). Mirrors KanbanConfig from kanban.ts. */
export const kanbanViewConfigSchema = z.object({
  axisBranchId: z.string().nullable(),
  sort: z.object({ branchId: z.string(), dir: z.enum(['ASC', 'DESC']) }).nullable(),
  hiddenColumnValues: z.array(z.string()).optional(),
  collapsedColumnValues: z.array(z.string()).optional(), // KB-U06 (session default, persisted opt-in)
})
export type KanbanViewConfig = z.infer<typeof kanbanViewConfigSchema>

/** Open per-view config blob persisted in seed_layouts.view_config. */
export const seedViewConfigSchema = z.object({
  kanban: kanbanViewConfigSchema.optional(),
}).passthrough()
export type SeedViewConfig = z.infer<typeof seedViewConfigSchema>

// Extend the existing interface:
export interface ISeedLayoutRepository {
  // …existing get / getAllAsMap / upsert / remove…
  getViewConfig(slug: string): Promise<SeedViewConfig | null>
  setViewConfig(slug: string, config: SeedViewConfig, updatedBy: string): Promise<void>
}
```

> `KanbanConfig` already exists in `kanban.ts`; `kanbanViewConfigSchema` is its zod validator (do not
> duplicate the type — `KanbanViewConfig` must be assignable to/from `KanbanConfig`). Export both via
> `index.ts`.

### Task B — Core: column → filter helper (`kanban.ts`)

```ts
import type { FilterGroup } from './types.js'

/**
 * Pure: the filter fragment selecting one kanban column's entries for a given axis branch.
 * `value: null` ⇒ the "Senza valore" column: entries whose axis field is NULL **or** holds a value
 * outside branch.options (KB-U25). The caller binds branch.alias as the column name (engine-validated).
 */
export function kanbanColumnFilter(branch: Branch, value: string | null): FilterGroup {
  // boolean axis: 'true'/'false' descriptor values map to the stored 0/1 (or true/false) representation.
  // text/tags: equality on the discrete value; null: IS NULL (+ NOT IN options for text-with-options).
  // Returns a FilterGroup consumable by buildSelectQuery via SelectOptions.filters.
}
```

> Implementation note for the executor: the exact `op` set (`eq`, `is_null`, `not_in`, `contains` for
> `tags`) must match the engine's `FilterCondition` operators already in `types.ts`; reuse them, invent
> nothing. The "Senza valore" out-of-vocab fold (KB-U25) is `IS NULL OR value NOT IN (options)` for
> `text`-with-options, plain `IS NULL` for `tags`/`boolean`.

### Task C — API SEAM A: `kanbanOrder` in `listHandler`

In `list.ts`, after `orderBy` is computed and before `repository.findMany`:

```ts
const kanbanAxis = cleanStr(query.kanbanAxis)            // a Branch.id (br_XX)
let kanbanOrder: { seedSlug: string; axisBranchId: string } | undefined
if (kanbanAxis) {
  const compat = resolveKanbanConfig(seed)              // import from '@beechcms/core'
  if (!compat.compatible || !compat.candidates.some(c => c.branchId === kanbanAxis)) {
    return publicProblem(context, { type: 'content-invalid-kanban-axis', title: 'Bad Request',
      status: 400, detail: 'kanbanAxis is not a valid candidate for this seed' })
  }
  kanbanOrder = { seedSlug: slug, axisBranchId: kanbanAxis }
}

const { items, total } = await repository.findMany(seed, {
  filters: engineFilters,
  orderBy: kanbanOrder ? undefined : orderBy,            // kanbanOrder wins (engine contract)
  search: search || undefined,
  pagination: { limit, offset },
  kanbanOrder,
})
```

> `kanbanAxis` presence counts as a query param, so the `{ items, total, page, limit, relations }` shape
> is returned (not the bare-array legacy path). No change to the response contract.

### Task D — API SEAM B: `view_config` persistence + route

`D1SeedLayoutRepository` (`seed-layout.repository.d1.ts`):

```ts
async getViewConfig(slug: string): Promise<SeedViewConfig | null> {
  const row = await this.db
    .prepare('SELECT view_config FROM seed_layouts WHERE slug = ?')
    .bind(slug).first<{ view_config: string | null }>()
  if (!row?.view_config) return null
  return seedViewConfigSchema.parse(JSON.parse(row.view_config))
}

async setViewConfig(slug: string, config: SeedViewConfig, updatedBy: string): Promise<void> {
  const json = JSON.stringify(config)
  // Upsert: a seed may have no FormLayout row yet, so INSERT … ON CONFLICT updates only view_config.
  await this.db.prepare(`
    INSERT INTO seed_layouts (slug, layout, view_config, updated_at, updated_by)
    VALUES (?, '{}', ?, unixepoch(), ?)
    ON CONFLICT(slug) DO UPDATE SET view_config = excluded.view_config,
      updated_at = excluded.updated_at, updated_by = excluded.updated_by
  `).bind(slug, json, updatedBy).run()
}
```

> Confirm the `layout` column's NOT NULL / default during implementation; if `layout` is NOT NULL with no
> default, the `'{}'` placeholder above satisfies it without clobbering an existing layout (the
> `DO UPDATE` set list omits `layout`).

Handler `view-config.ts` + routes in `content/index.ts` (register before `/:slug/:id`):

```ts
content.get('/:slug/view-config', getViewConfigHandler)
content.put('/:slug/view-config', putViewConfigHandler)
```

- `getViewConfigHandler`: `getSeed(slug)` miss ⇒ 404; return `await seedLayoutRepository.getViewConfig(slug) ?? {}`.
- `putViewConfigHandler`: edit-permission gate (mirror `kanban-position`/content write gate); body via
  `seedViewConfigSchema.safeParse` (422 on fail); `setViewConfig(slug, parsed.data, jwtPayload.sub)`;
  return `{ ok: true }`.

### Task E — Dashboard data wrappers (`content-api.ts`)

```ts
export interface KanbanColumnQueryParams {
  filters?: FilterGroup[]      // includes the column's axis filter (kanbanColumnFilter)
  kanbanAxis: string           // br_XX → server orders by kanban_positions
  limit: number
  offset: number
  search?: string
}
export async function fetchKanbanColumn(slug: string, params: KanbanColumnQueryParams) {
  const res = await api.get<ContentListWithMeta>(`/content/${slug}`, {
    params: { ...params, filters: params.filters ? JSON.stringify(params.filters) : undefined },
  })
  return res.data   // { items, total, page, limit, relations }
}
export async function fetchSeedViewConfig(slug: string) {
  return (await api.get<SeedViewConfig>(`/content/${slug}/view-config`)).data
}
export async function updateSeedViewConfig(slug: string, config: SeedViewConfig) {
  return (await api.put<{ ok: boolean }>(`/content/${slug}/view-config`, config)).data
}
```

### Task F — Per-column fetch hook (`use-kanban-column-query.ts`)

One `useInfiniteQuery` per visible column (KB-S05/S06), parallelised at mount; query key
`['kanban', slug, axisBranchId, columnValue, filters, search, sort]`; `pageParam` = offset stepping by
`KANBAN_COLUMN_PAGE_SIZE`; `getNextPageParam` derives from `total`. The column filter is
`kanbanColumnFilter(branch, columnValue)` merged with the toolbar's active filters (KB-U19) and the global
`sort` (KB-U22 → `sortBy`/`sortDir`; when `sort` is null, omit them and pass `kanbanAxis` for manual order
KB-U22b). Each page's items are mapped through `buildKanbanCardDisplayModel` **once** (KB-S18) and flattened.
`total` from the response drives the header count (KB-S07/U20).

### Task G — Board, column, card, virtualizer (UI)

- `content-kanban.tsx`: if `resolveKanbanConfig(seed)` incompatible → existing message; else if no
  `config.axisBranchId` → `<KanbanAxisConfig>` prompt (KB-U02); else render the CSS-Grid board
  (`grid-auto-flow: column`, `gridAutoColumns: KANBAN_COLUMN_WIDTH_PX`, horizontal overflow scroll — KB-S19,
  U04). Columns come from `use-kanban-columns` (cap + hidden applied — KB-U06c).
- `kanban-column.tsx` (`React.memo`, KB-S17, `role="region"` + count aria-label KB-S28): header shows
  `label`, `total`, loaded-vs-total + unloaded dot (KB-U05); collapse toggle (KB-U06, collapsed state from
  config/session — collapsed renders header only); body = virtualizer; footer "Carica altri" calling
  `fetchNextPage` when `hasNextPage` (KB-U07); empty state w/ "+ Nuova entry" (KB-S25); skeleton of 3–4
  fixed-height placeholders while `isLoading` (KB-S24).
- `kanban-column-virtualizer.tsx`: `useVirtualizer({ count, estimateSize: () => KANBAN_CARD_HEIGHT_PX,
  getScrollElement })` — independent scroller per column (KB-S08/S09/S10).
- `kanban-card.tsx`: pure, props = `KanbanCardDisplayModel`; fixed height; `loading="lazy"` fixed-dim image
  (KB-S20); `role="article"` + title aria-label (KB-S27); `onClick → onEdit(entryId)` (KB-U15). **No drag
  attributes.**
- `kanban-axis-config.tsx`: candidate picker (KB-U01), sort picker (KB-U22/U23), and — when descriptor
  count > `KANBAN_MAX_COLUMNS` — a visibility selector (KB-U06c); all writes go through
  `use-kanban-view-config` → `updateSeedViewConfig` (KB-S02, persisted per seed; KB-U03: changing axis keeps
  toolbar filters because filters live in the page, not in view_config).

### Task H — Create-from-column (KB-U18, minimal)

Reuse the existing create flow (`createContent` + the entry dialog already wired in `content-list.tsx`).
The column's "+ Nuova entry" calls the page's existing create handler pre-seeding the axis field with the
column value (empty for "Senza valore", KB-U24's *create* half). On success, invalidate **only** that
column's query key (no full board refetch — KB-S23 spirit). The drag/optimistic no-refetch insert is
Sprint 03.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run from the monorepo root unless noted (commands per `_config/commands.md`):

```bash
# Tier 3 — core: view-config schema + kanbanColumnFilter unit tests, build
pnpm --filter @beechcms/core run build
pnpm --filter @beechcms/core run test

# Tier 2 — api: list kanbanOrder wiring, view-config repo round-trip + route tests, typecheck
pnpm --filter @beechcms/api exec tsc --noEmit
pnpm --filter @beechcms/api run test

# D1 unchanged this sprint, but confirm a clean DB still boots (0034 already present)
pnpm run db:reset:local

# Tier 1 — dashboard: slice typechecks + build (no new prod dep added)
pnpm --filter @beechcms/dashboard exec tsc --noEmit
pnpm --filter @beechcms/dashboard run build

# Whole-repo gate
pnpm run build
pnpm run lint
```

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] **No migration and no `content_{slug}` DDL change** this sprint; `view_config` is read/written only
      through `ISeedLayoutRepository.getViewConfig/setViewConfig` (Botanical invariant). `pnpm run
      db:reset:local` still succeeds.
- [ ] `seedViewConfigSchema`/`kanbanViewConfigSchema` parse a valid config and reject malformed input;
      `KanbanViewConfig` is structurally compatible with `KanbanConfig` — covered by core unit tests.
- [ ] `kanbanColumnFilter(branch, value)` returns the correct fragment for `text`/`tags`/`boolean` and the
      `null` "Senza valore" case folds NULL **and** out-of-vocab values (KB-U25) — covered by unit tests.
- [ ] `listHandler` with `?kanbanAxis=br_XX` sets `SelectOptions.kanbanOrder` (mutually exclusive with
      `orderBy`), 400s on a non-candidate axis, and existing callers (no `kanbanAxis`) produce byte-identical
      behaviour — covered by api tests.
- [ ] `GET|PUT /:slug/view-config` round-trips a `KanbanViewConfig`; PUT is edit-gated and 422s on an
      invalid body; GET 404s on unknown seed and returns `{}` when nothing is stored.
- [ ] The `axisBranchId` persisted in `view_config` is a `Branch.id` (`br_XX`); no code path stores an alias
      as the axis key.
- [ ] Selecting the kanban tab on a compatible seed with no configured axis renders the KB-U02 prompt;
      choosing a candidate persists it and renders the board. Changing the axis (KB-U03) keeps active toolbar
      filters.
- [ ] Each column fetches independently via its own `useInfiniteQuery` (parallel at mount), shows the
      server `total` in its header (KB-U05/S07), paginates with "Carica altri" without affecting other
      columns (KB-U07/U08), and scrolls independently with per-column virtualization at fixed
      `KANBAN_CARD_HEIGHT_PX` (KB-S08/S09/S10).
- [ ] The "Senza valore" column is always rendered last; columns beyond `KANBAN_MAX_COLUMNS` are hidden
      behind the visibility selector and **not fetched** (KB-U06c).
- [ ] Columns are `React.memo`, lay out via CSS Grid at `KANBAN_COLUMN_WIDTH_PX` (KB-S17/S19); cards are
      pure functions of a `KanbanCardDisplayModel` computed once at fetch (KB-S18); skeleton (KB-S24) and
      empty-with-"+ Nuova entry" (KB-S25) states render; `role="region"`/`role="article"` a11y present
      (KB-S27/S28).
- [ ] Clicking a card opens the existing edit dialog (KB-U15); "+ Nuova entry" pre-seeds the column's axis
      value and invalidates only that column's query (KB-U18).
- [ ] **No `@dnd-kit/*` import and no `fractional-indexing` dependency** appear anywhere in this sprint's
      diff (those are Sprint 03).
- [ ] No cross-feature import: `content-kanban` imports only `@beechcms/core`, shared libs, and
      `@/components/ui/*` — not `content-gallery`/`content-toolbar`.
- [ ] All commands in Section 5 pass.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executing agent MUST NOT build the following in this sprint — they are **Sprint 03 (Interactive Drag &
Optimistic Persistence)**, which consumes the static board frozen here:

- The interactive board: `@dnd-kit/core` + `@dnd-kit/sortable`, `DragOverlay`, `closestCenter`,
  `PointerSensor`/`TouchSensor` activation constraints, `touch-action` toggling (KB-S11–S14, S30–S31,
  U09–U10).
- The drag state machine: `useReducer` pre-drag snapshot, `DRAG_ROLLBACK`/`DRAG_REMOVE`, `isPending`
  lock, optimistic move (KB-S15–S16, S21–S23, U11–U13b).
- The settle timer / ref-only `onDragMove` / `committedPositionRef` / `requestAnimationFrame` auto-scroll
  (KB-S14b–S14e, U11b).
- Client `fractional-indexing` math (**do not add the dependency**), the async rebalance scheduler
  (KB-S04b/S04d/S04f), the cross-column **single server transaction** coupling axis-value PATCH +
  `kanban-position` PATCH (KB-S04e), and the tags atomic `{ oldAxisValue, newAxisValue }` server patch (Q1).
- Keyboard-first drag + `aria-live` announcements (KB-U14, S29).
- Post-save no-refetch card move on axis change (KB-U16) and the optimistic single-card insert on create.
- Any new D1 migration, any `content_{slug}` DDL change, and any modification to `buildSelectQuery` beyond
  consuming the already-shipped `kanbanOrder`.
