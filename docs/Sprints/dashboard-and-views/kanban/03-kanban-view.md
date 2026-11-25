# Sprint Plan — Kanban View (Sprint 03 / Interactive Drag & Optimistic Persistence)

> Feature Brief: `stages/00_ideation/output/feature_brief.md` (Kanban View v1.0)
> Predecessors (both **already implemented** on branch `kanban-drag-stabilization`):
> - Sprint 01 (`docs/Sprints/kanban/01-kanban-view.md`) — Foundation & Contracts: core `resolveKanbanConfig`/
>   `resolveKanbanColumns`/`kanbanColumnFilter`/`IKanbanPositionRepository`, engine `kanbanOrder` LEFT JOIN,
>   `0034_kanban_foundation.sql`, `PATCH /:slug/:id/kanban-position`, `D1KanbanPositionRepository`.
> - Sprint 02 (`docs/Sprints/kanban/02-kanban-view.md`) — Static Board: `view_config` contract +
>   `GET|PUT /:slug/view-config`, `listHandler` `kanbanAxis` wiring, per-column `useInfiniteQuery`,
>   `@tanstack/react-virtual` per-column scrollers, axis-config bar, collapse, skeleton/empty, click-to-edit.
>
> Scope of THIS sprint: layer the **interactive drag-and-drop and optimistic persistence** on top of the
> frozen static board. Pointer/touch/keyboard sensors, `DragOverlay`, `closestCenter`, the settle-timer
> ref machinery, the `useReducer` optimistic-overlay + rollback, client `fractional-indexing` math, the
> **single atomic server move endpoint** (axis-value PATCH + position upsert coupled in one D1 transaction),
> the tags atomic `{oldAxisValue,newAxisValue}` patch, and the async rebalance. No new view, no new
> migration, no `content_{slug}` DDL change.

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

This is the **terminal** sprint of the Kanban series: the static board frozen in Sprint 02 already renders,
paginates per column, virtualizes at a fixed card height, and exposes a pure `KanbanCardDisplayModel`. Drag
is pure UI + one persistence concern (the `position` write) layered on top of that substrate — exactly the
isolation Sprint 02 Section 7 promised. Building drag now (and not earlier) means the drag code inherits
column fetching, axis resolution, and config persistence rather than re-inventing them.

- **Botanical Engine invariant.** No drag code touches D1. Card ordering is still written **only** through
  `IKanbanPositionRepository.setPosition` (frozen Sprint 01). The new requirement — KB-S04e: cross-column
  drag must move the **axis branch value** *and* the `position` row **atomically** — is satisfied **inside
  the API tier**, by a single handler that composes the two already-existing repository gateways
  (`ContentRepository.update` for the branch value via `apiToDb`/`dbToApi`, `IKanbanPositionRepository.
  setPosition` for the position) under **one `env.DB.batch([...])`**. The axis value is addressed by
  `Branch.id` (`br_XX`) and written through the engine — never a hardcoded column name, never raw SQL in the
  handler. The tags case (Q1) is resolved server-side with `{oldAxisValue,newAxisValue}` so the client never
  serializes the tag array.

- **Architectural decision — ONE endpoint, not two (resolves the brief's internal conflict).** KB-S21 says
  "PATCH branch asse + PATCH kanban-position in parallel"; KB-S04e says "in a single server transaction."
  These contradict: two parallel HTTP requests cannot be one transaction, and a partial failure (value
  written, position not) corrupts the board. **This sprint mandates the KB-S04e reading:** a single
  `PATCH /:slug/:id/kanban-move` request carrying the optional axis change *and* the position, executed as
  one atomic D1 batch. The existing `PATCH /:slug/:id/kanban-position` (Sprint 01) is **retained** for the
  same-column reorder case (position only, no axis change). The client fires **one** request per drop.

- **Vertical Slice Architecture.** All drag UI lands inside the existing `content-kanban/` slice. It imports
  only `@beechcms/core`, shared libs (`@/lib/*`), `@/components/ui/*`, and the three already-installed
  `@dnd-kit/*` packages. It does **not** cross-import from `content-gallery`/`content-toolbar`. The fractional
  index math (`fractional-indexing`) is a **dashboard-only** dependency — it never appears in `@beechcms/core`
  or `apps/api` (the server stores the opaque `position` string; only the client interpolates it).

- **YAGNI boundary (Ponytail).** Drag is the single largest re-render risk in the feature. The settle-timer /
  ref-only `onDragMove` / `requestAnimationFrame` auto-scroll machinery (KB-S14b–S14e) exists **solely** to
  cap React to ≤1 state update per `KANBAN_SETTLE_MS` during a drag. The optimistic state is a thin
  **overlay** reducer over the existing React Query caches — NOT a re-architecture of Sprint 02's fetching.
  On rollback, no server state is touched and the overlay is dropped (cards revert for free); on success only
  the two affected column counts are patched (KB-S23) — no board refetch. Reusing the Sprint 02 query caches
  instead of lifting all column data into the reducer is the minimal-node blueprint.

==========================================================================
SECTION 2 — CURRENT STATE (verified via direct inspection of Sprint 01/02 artifacts)
==========================================================================

> The kanban files are untracked/new, so the graphify graph predates them (graph-router fallback rule):
> source was read directly. Verified facts below are quoted from the on-disk implementation.

**Tier 3 — `@beechcms/core` (frozen, present — no change needed except possibly a shared move-body type)**
- `packages/core/src/kanban.ts` — `resolveKanbanConfig`, `resolveKanbanColumns`, **`kanbanColumnFilter(branch,
  value)`** (returns `FilterGroup`; null ⇒ `is_empty`, boolean ⇒ `eq` coerced, tags ⇒ `has_tag`, text ⇒
  `select`/`eq`). Exports `KanbanConfig` (`axisBranchId`, `sort`, `hiddenColumnValues?`),
  `KanbanAxisCandidate`, `KanbanColumnDescriptor`, `KanbanCompatibility`.
- `packages/core/src/kanban-position.repository.ts` — `IKanbanPositionRepository`:
  `getColumn(seedSlug, axisBranchId): Promise<Map<entryId, position>>`, `setPosition(...)`, `remove(...)`,
  `rebalance(seedSlug, axisBranchId, ordered: KanbanPositionRecord[])`. **All four methods already exist;
  `rebalance` is unused until this sprint.**
- `packages/core/src/engine.ts` — `buildSelectQuery` honours `SelectOptions.kanbanOrder` (LEFT JOIN
  `kanban_positions kp`, nulls-last `ORDER BY (kp.position IS NULL) ASC, kp.position ASC`). Frozen.
- `packages/core/src/types.ts` — `SelectOptions.kanbanOrder`, `FilterGroup`/`FilterCondition` with op set
  including `eq`, `is_empty`, `has_tag`. `Branch` carries `id`/`alias`/`type`/`options?`.
- `packages/core/src/index.ts` — barrel re-exports `./kanban.js`, `./kanban-position.repository.js`,
  `./seed-layout.js`.

**Tier 2 — `apps/api` (one seam to extend: the atomic move endpoint)**
- `apps/api/src/features/content/index.ts` — route order (specific paths first):
  `PATCH /:slug/:id/kanban-position` → `GET /:slug/view-config` → `PUT /:slug/view-config` → `GET /:slug` →
  `GET /:slug/facets` → `GET /:schema_slug/by-slug/:entry_slug` → `GET /:slug/:id` → `POST /:slug` →
  `PATCH /:slug/bulk` → `PUT /:slug/:id` → `DELETE /:slug/:id`. **SEAM: register
  `PATCH /:slug/:id/kanban-move` BEFORE `PUT /:slug/:id` (3-segment specific path; distinct method anyway).**
- `apps/api/src/features/content/handlers/kanban-position.ts` — `kanbanPositionHandler`: validates
  `slug`/`id`, `getSeed` 404, JSON body `{ position: string; axisBranchId: string }`, `resolveKanbanConfig`
  candidate check, `repository.findById` 404, then `kanbanPositionRepository.setPosition(slug, id,
  axisBranchId, position)` → `{ success: true }`. **Position-only; no axis-value write. Reused as-is for
  same-column reorder.**
- `apps/api/src/features/content/handlers/update.ts` — `updateHandler` (`PUT /:slug/:id`): validates via
  `validateAndSanitizeSeedPayload` with `allowNull: true` (KB-U24 null axis already accepted), then
  `repository.update(seed, id, mergedData, status, { actor })`.
- `apps/api/src/shared/content.repository.d1.ts` — `D1ContentRepository.update` (≈L535) already batches a
  single main `UPDATE`. This is the engine-backed write path the move handler composes for the axis value.
- `apps/api/src/shared/kanban-position.repository.d1.ts` — `D1KanbanPositionRepository.setPosition` (single
  upsert), `getColumn`, `remove`, `rebalance` (`this.db.batch([...])`).
- `apps/api/src/types.ts` `Variables` — exposes `repository`, `getSeed`, `seedRegistry`,
  `seedLayoutRepository`, `kanbanPositionRepository`, `idGenerator`, `clock`, `jwtPayload`.
- Edit-permission gate pattern — mirror `kanbanPositionHandler` / the content write gate used by
  `updateHandler` (do not invent a new authz scheme).

**Tier 1 — `apps/dashboard` (static board present; drag to add)**
- `apps/dashboard/src/features/content-kanban/`:
  - `content-kanban.tsx` — orchestrator: compat/axis-prompt/board branches; renders a CSS-Grid
    (`gridAutoFlow: column`, `gridAutoColumns: KANBAN_COLUMN_WIDTH_PX`) of `<KanbanColumnConnected>` where each
    connected column calls `useKanbanColumnQuery` and renders `<KanbanColumn>`. **This is the mount point for
    `<DndContext>` + `<DragOverlay>`.**
  - `hooks/use-kanban-column-query.ts` — per-column `useInfiniteQuery`, key
    `['kanban', seedSlug, axisBranchId, col.value, allFilters, search, sort]`; flattens pages →
    `buildKanbanCardDisplayModel(item, axisBranch, col.value)`; `total` from `pages[0].total`. Exports
    `useInvalidateKanbanColumn(seedSlug, axisBranchId, colValue)`. **The reducer overlays this; success path
    patches these caches via `setQueryData`.**
  - `kanban-column.tsx` (`React.memo`) — header (label/total/loaded/unloaded dot), virtualizer body, "Carica
    altri", collapse, skeleton/empty, `role="region"`. **Becomes a `useDroppable` target.**
  - `kanban-card.tsx` — pure card from `KanbanCardDisplayModel`, fixed `KANBAN_CARD_HEIGHT_PX`,
    `role="article"`, `onClick → onEdit`. **Becomes a `useSortable` item; gains the ghost/locked states.**
  - `kanban-column-virtualizer.tsx` — `@tanstack/react-virtual` per-column scroller, fixed item height.
  - `kanban-card-display.ts` — `buildKanbanCardDisplayModel`; model carries `axisValue` + `position`.
  - `types.ts` — `KanbanCardDisplayModel` (incl. `position: string | null`), `KanbanColumnFetchState`,
    `KanbanBoardConfig`, `ContentKanbanProps`.
  - `constants.ts` — `KANBAN_MAX_COLUMNS=20`, `KANBAN_COLUMN_PAGE_SIZE=20`, `KANBAN_CARD_HEIGHT_PX=96`,
    `KANBAN_COLUMN_WIDTH_PX=280`, **`KANBAN_SETTLE_MS=350`**, **`KANBAN_POSITION_REBALANCE_THRESHOLD=50`**
    (both already declared in Sprint 02 — consumed for the first time here).
- `apps/dashboard/src/lib/content-api.ts` — `updateContent` (PUT), `updateKanbanPosition(slug, id, { position,
  axisBranchId })` (PATCH kanban-position), `fetchKanbanColumn`. **Add `moveKanbanCard` wrapper.**
- **Dependencies installed:** `@dnd-kit/core@^6.3.1`, `@dnd-kit/sortable@^10.0.0`,
  `@dnd-kit/utilities@^3.2.2`, `@tanstack/react-query`, `@tanstack/react-virtual`. **`fractional-indexing` is
  NOT installed — this sprint adds it to `apps/dashboard` only.**

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

**Tier 3 — `@beechcms/core` (one optional shared type; NO logic, NO I/O)**
- `packages/core/src/kanban.ts` *(modified)* — add the wire contract type `KanbanMoveBody` (the validated
  shape of the move request) so api + dashboard share one definition; export via `index.ts`. **No runtime
  logic, no fractional-index math in core.**
- `packages/core/src/index.ts` *(modified)* — export `KanbanMoveBody`.

**Tier 2 — `apps/api` (the atomic move endpoint — NO migration, NO DDL)**
- `apps/api/src/features/content/handlers/kanban-move.ts` *(new)* — `kanbanMoveHandler` for
  `PATCH /:slug/:id/kanban-move`: edit-gated; validates `KanbanMoveBody`; resolves axis branch by id;
  applies axis-value change (text/boolean direct; tags via `{oldAxisValue,newAxisValue}`) **and** the
  position upsert in **one atomic D1 batch**; 404 on unknown seed/entry (→ KB-S15b `DRAG_REMOVE`).
- `apps/api/src/shared/content.repository.d1.ts` *(modified)* — add
  `updateWithKanbanPosition(seed, id, patch, position, axisBranchId, { actor })` that composes the existing
  engine `UPDATE` statement(s) **and** the `kanban_positions` upsert into a single `this.db.batch([...])`.
  (This keeps both raw statements in the repository layer — Botanical invariant — while giving the handler
  one atomic call.) Position-only and value-only degenerate cases supported.
- `apps/api/src/shared/content.repository.ts` *(modified, if an interface exists)* — declare
  `updateWithKanbanPosition` on `ContentRepository`.
- `apps/api/src/features/content/index.ts` *(modified)* — register
  `content.patch('/:slug/:id/kanban-move', kanbanMoveHandler)` before `PUT /:slug/:id`.
- `apps/api/src/features/content/handlers/kanban-move.handler.test.ts` *(new)* — route tests: same-column
  reorder (position only), cross-column move (value + position atomic), tags atomic patch, null/"Senza
  valore" drop (KB-U24), 404 entry-deleted, non-candidate axis 400, permission gate.
- `apps/api/src/shared/content.repository.d1.test.ts` *(modified)* — `updateWithKanbanPosition` atomicity +
  rollback-on-error test (batch is all-or-nothing).

**Tier 1 — `apps/dashboard` (the drag layer — render substrate UNCHANGED, drag added on top)**
- `apps/dashboard/package.json` *(modified)* — add `"fractional-indexing"` (dashboard only).
- `apps/dashboard/src/lib/content-api.ts` *(modified)* — `moveKanbanCard(slug, id, body: KanbanMoveBody)`
  wrapper over `PATCH /:slug/:id/kanban-move`.
- `content-kanban/types.ts` *(modified)* — add `KanbanBoardState`, `KanbanBoardAction`, `DragSnapshot`,
  `KanbanDragMeta` (source col/index, isPending set); extend `KanbanCardDisplayModel` consumers with the
  `isPending`/`isGhost` view flags (computed, not fetched).
- `content-kanban/drag/use-kanban-board.ts` *(new)* — the `useReducer` board overlay: pre-drag snapshot,
  `DRAG_START`/`DRAG_COMMIT`/`DRAG_ROLLBACK`/`DRAG_REMOVE`/`DRAG_CLEAR`, `isPending` lock (KB-S15/S16/S21/S22/
  S23/S14f, U12/U13b). Holds **only** the optimistic delta + snapshot; reads cards from the Sprint 02 query
  caches.
- `content-kanban/drag/use-kanban-drag.ts` *(new)* — the dnd-kit orchestration hook: `sensors`
  (`PointerSensor` + `TouchSensor` `{delay:200,tolerance:8}` + `KeyboardSensor`), `onDragStart`/`onDragMove`/
  `onDragEnd`/`onDragCancel`, settle-timer refs, `committedPositionRef`, `closestCenter`, `over: null`
  silent-cancel (KB-U09b/S14d), the fractional-index computation, and the optimistic→API→reconcile/rollback
  pipeline (KB-S04b/S04e/S11/S14/S14b/S14c/S15/S15b/S21/S22).
- `content-kanban/drag/use-kanban-autoscroll.ts` *(new)* — `requestAnimationFrame` edge auto-scroll of the
  hovered column's scroll element, zero React state (KB-S14e).
- `content-kanban/drag/use-kanban-rebalance.ts` *(new)* — schedules the async column rebalance when a written
  `position` exceeds `KANBAN_POSITION_REBALANCE_THRESHOLD` chars; recomputes clean keys client-side and calls
  a single batch endpoint (KB-S04f). **Reuses `IKanbanPositionRepository.rebalance` via a new thin API
  wrapper/endpoint — see Task G.**
- `content-kanban/drag/fractional.ts` *(new)* — thin wrapper around `fractional-indexing`'s
  `generateKeyBetween` / `generateNKeysBetween` (single import boundary; keeps the dep behind one module).
- `content-kanban/kanban-card.tsx` *(modified)* — `useSortable`; ghost at source (KB-U10), `not-allowed`/
  locked while `isPending` (KB-U13b/S14f), `draggable=false` when sort-active in same column (KB-U22b) or no
  edit permission (KB-U13); keyboard grab affordances (KB-U14).
- `content-kanban/kanban-column.tsx` *(modified)* — `useDroppable` (collapsed column still a valid target,
  drop-to-top, no auto-expand — KB-U06b); `<SortableContext>` over its card ids; drop-zone highlight (KB-U10);
  `aria-live` region wiring for keyboard drag (KB-S29).
- `content-kanban/kanban-card-overlay.tsx` *(new)* — the simplified `DragOverlay` card (title + status badge
  only, no image/excerpt — KB-S13).
- `content-kanban/content-kanban.tsx` *(modified)* — wrap the board in `<DndContext>` (sensors,
  `collisionDetection={closestCenter}`, handlers from `use-kanban-drag`), mount `<DragOverlay>`; pass
  `canEdit` + per-card `isPending`/`isGhost`/`sortActive` down; `touch-action: none` on the board while a
  touch drag is active, `pan-y` otherwise (KB-S30/S31); toast on cross-column-hidden-by-filter (KB-U09c) and
  entry-deleted (KB-S15b).
- `content-kanban/index.ts` *(modified)* — barrel exports for the new drag modules (only what the page needs).

**Explicitly NOT in this sprint:** any new D1 migration, any `content_{slug}` DDL change, any change to
`buildSelectQuery`, column reordering, multi-card drag, aggregated/OR columns, relation-axis support,
swimlanes (all v1 out-of-scope per Brief §5).

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### Task A — Core: shared move wire-type (`kanban.ts`)

No logic — just the contract both tiers validate against. Tags carry the atomic pair (Q1); text/boolean
carry a single value; null ⇒ "Senza valore" (KB-U24).

```ts
// packages/core/src/kanban.ts  (additions — type only, exported via index.ts)

/** Body of PATCH /:slug/:id/kanban-move. The server applies the axis change (if any)
 *  AND the position upsert atomically (KB-S04e). */
export interface KanbanMoveBody {
  /** Axis branch id (br_XX). Identifies which kanban_positions row + which branch to patch. */
  axisBranchId: string
  /** New fractional-index key for this entry in the destination column (KB-S04b/d). */
  position: string
  /** Present only on a cross-column move (axis value changed). Omit for same-column reorder. */
  axis?:
    | { kind: 'scalar'; value: string | null }                 // text-with-options / boolean / null
    | { kind: 'tags'; oldValue: string | null; newValue: string | null } // Q1 atomic tag swap
}
```

> `value`/`newValue === null` ⇒ KB-U24 (set branch to NULL, not ""). Boolean values arrive as `'true'`/
> `'false'` strings (matching `resolveKanbanColumns`) and are coerced server-side. The position string is
> opaque to the server.

### Task B — API: atomic move repository method (`content.repository.d1.ts`)

The Botanical invariant requires both raw statements to live in the repository. Add one method that emits
**both** the engine `UPDATE` (reusing the existing `.update` statement builder via `apiToDb`/`dbToApi`) and
the `kanban_positions` upsert, then runs them as a single atomic `db.batch`:

```ts
// Pseudocode shape — executor wires it to the existing private statement builders.
async updateWithKanbanPosition(
  seed: Seed,
  id: string,
  patch: Record<string, unknown> | null,   // null ⇒ position-only (same-column reorder)
  position: string,
  axisBranchId: string,
  ctx: { actor: string },
): Promise<{ success: boolean }> {
  const statements: D1PreparedStatement[] = []
  if (patch) statements.push(...this.buildUpdateStatements(seed, id, patch, ctx))  // engine-built, br_XX
  statements.push(
    this.db.prepare(`
      INSERT INTO kanban_positions (seed_slug, entry_id, axis_branch_id, position, updated_at)
      VALUES (?, ?, ?, ?, unixepoch())
      ON CONFLICT(seed_slug, entry_id, axis_branch_id)
        DO UPDATE SET position = excluded.position, updated_at = excluded.updated_at
    `).bind(seed.slug, id, axisBranchId, position),
  )
  await this.db.batch(statements)   // atomic: all-or-nothing (KB-S04e)
  return { success: true }
}
```

> If the existing `.update` private builder is not reusable as a statement array, expose it minimally; do
> NOT duplicate `apiToDb` mapping. The position upsert SQL is byte-identical to
> `D1KanbanPositionRepository.setPosition` (do not diverge). Tags are handled in the handler before calling
> this method (it receives the already-resolved branch patch).

### Task C — API: move handler (`kanban-move.ts`)

```ts
// PATCH /:slug/:id/kanban-move
// 1. slug/id present → else 400 (publicProblem, reuse CONTENT_ERRORS).
// 2. getSeed(slug) → 404 on miss.
// 3. Edit-permission gate (mirror updateHandler's write gate).
// 4. Parse body as KanbanMoveBody; require position:string and axisBranchId:string.
// 5. resolveKanbanConfig(seed): axisBranchId must be a candidate → else 400.
// 6. repository.findById(seed, id) → 404 (KB-S15b DRAG_REMOVE signal for the client).
// 7. Build the branch patch (only when body.axis present):
//      - scalar: { [axisBranch.alias]: axis.value }              // null passes through (KB-U24)
//      - tags:   resolve current tags of the entry, remove oldValue, add newValue (Q1),
//                producing the full new array → { [axisBranch.alias]: nextTags }
//    Use the resolved Branch.alias from seed.branches.find(b => b.id === axisBranchId); NEVER hardcode.
// 8. repository.updateWithKanbanPosition(seed, id, patch ?? null, position, axisBranchId, { actor: jwtPayload.sub })
// 9. return { success: true }
```

> The tags read-modify-write happens server-side from the freshly-fetched entry (step 6), so the client
> never sends the whole array (Q1 race-free). Reuse `validateAndSanitizeSeedPayload({ allowNull: true })` on
> the constructed patch so KB-U24 `null` is accepted exactly as `updateHandler` already accepts it.

### Task D — Dashboard: data wrapper + fractional module

```ts
// content-api.ts
import type { KanbanMoveBody } from '@beechcms/core'
export async function moveKanbanCard(slug: string, id: string, body: KanbanMoveBody) {
  return (await api.patch<{ success: boolean }>(`/content/${slug}/${id}/kanban-move`, body)).data
}

// content-kanban/drag/fractional.ts — the ONLY import site of `fractional-indexing`.
import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing'
/** position for a card dropped between `before` and `after` in the destination column. */
export function positionBetween(before: string | null, after: string | null): string {
  return generateKeyBetween(before, after)   // null endpoints = column start/end
}
export function rebalanceKeys(count: number): string[] {
  return generateNKeysBetween(null, null, count)   // clean keys "a0","a1",… (KB-S04f)
}
```

### Task E — Dashboard: the optimistic-overlay reducer (`drag/use-kanban-board.ts`)

The reducer holds **only** the in-flight delta and the pre-drag snapshot. The actual card lists stay in the
Sprint 02 React Query caches; the board reads cards from the queries and **applies the overlay on top** when
rendering. This keeps KB-S16 (immutable snapshot) and KB-S23 (no refetch) with the fewest moving parts.

```ts
interface DragSnapshot {
  entryId: string
  sourceColValue: string | null
  sourcePosition: string | null
  sourceAxisValue: string | null
}
interface KanbanBoardState {
  /** entryId → optimistic placement while the API call is in flight. */
  pending: Map<string, { destColValue: string | null; position: string; axisValue: string | null }>
  /** entryId → snapshot to restore on rollback. */
  snapshots: Map<string, DragSnapshot>
}
type KanbanBoardAction =
  | { type: 'DRAG_START'; snapshot: DragSnapshot }
  | { type: 'DRAG_OPTIMISTIC'; entryId: string; destColValue: string | null; position: string; axisValue: string | null }
  | { type: 'DRAG_COMMIT'; entryId: string }      // API ok → drop snapshot, clear pending, caller patches caches
  | { type: 'DRAG_ROLLBACK'; entryId: string }    // API err → restore snapshot, clear pending (KB-S22)
  | { type: 'DRAG_REMOVE'; entryId: string }       // API 404 → drop card entirely (KB-S15b)
```

> `isPending(entryId)` = `state.pending.has(entryId)` (KB-U13b/S14f — that card is `draggable={false}` and
> locked). The connected column derives its rendered card list as: query cards minus cards whose `pending`
> moved them out, plus cards whose `pending` moved them in (with the optimistic `position`/`axisValue`),
> re-sorted by `position`. On `DRAG_COMMIT` the caller calls `setQueryData` on the source + dest column
> caches (remove/insert the card, ±1 on `total` — KB-S23) and then `DRAG_CLEAR`s the entry; no refetch.

### Task F — Dashboard: dnd-kit orchestration (`drag/use-kanban-drag.ts` + wiring)

- **Sensors (KB-S11/S30):** `useSensors(useSensor(PointerSensor), useSensor(TouchSensor, { activationConstraint:
  { delay: 200, tolerance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))`.
- **Collision:** `collisionDetection={closestCenter}` (KB-S14).
- **`onDragStart`:** record `DragSnapshot`; set `activeId`; render `<KanbanCardOverlay>` (KB-S12/S13).
- **`onDragMove` (KB-S14b — ZERO React state writes):** all intermediate values in refs. On entering a new
  droppable, start `settleTimerRef` (`KANBAN_SETTLE_MS`); clear it if the pointer leaves first. Only on
  settle, write `committedPositionRef` and do the single `setState` that shows the insertion indicator
  (≤1 update / `KANBAN_SETTLE_MS`). Trigger `use-kanban-autoscroll` near column edges (rAF, no state).
- **`onDragEnd`:**
  - `over == null` → silent cancel: clear timer + refs, no reducer mutation, no API (KB-U09b/S14d).
  - else compute destination column + neighbor cards via the `over` snapshot (immediate-release path: one
    `closestCenter` on that snapshot — KB-S14c; deliberate-hover path: use `committedPositionRef`).
  - `position = positionBetween(beforeCard?.position ?? null, afterCard?.position ?? null)`.
  - `DRAG_START`→`DRAG_OPTIMISTIC` (card moves now); fire `moveKanbanCard(slug, id, body)` where `body.axis`
    is present only on a cross-column move (scalar vs tags per branch type). One request (KB-S04e).
  - **success:** patch source+dest query caches (counts, card membership) → `DRAG_COMMIT`/`DRAG_CLEAR`
    (KB-S23). If the dest column value is excluded by an active toolbar filter, the card legitimately
    vanishes — toast "Entry spostata ma nascosta dal filtro attivo" and decrement only the source visible
    count (KB-U09c). If `len(position) > KANBAN_POSITION_REBALANCE_THRESHOLD`, schedule
    `use-kanban-rebalance` for the dest column (KB-S04f).
    - **404:** `DRAG_REMOVE` + toast "Questa entry non è più disponibile." (KB-S15b).
    - **other error:** `DRAG_ROLLBACK` + error toast (KB-S22).
- **`onDragCancel`:** clear timer/refs/active overlay; no mutation.
- **Disable rules:** `draggable=false` when `!canEdit` (KB-U13), when the card `isPending` (KB-S14f), or for
  **same-column reorder while a `sort` is active** (KB-U22b) — cross-column drag stays enabled regardless of
  sort.

### Task G — Dashboard: async rebalance (`drag/use-kanban-rebalance.ts`)

When scheduled for a `(seed, axisBranchId, colValue)`: read that column's current ordered card ids from the
query cache, compute `rebalanceKeys(n)`, and persist them in one batch. Reuse the existing
`IKanbanPositionRepository.rebalance` contract by exposing a minimal `PATCH /:slug/kanban-rebalance` endpoint
(body `{ axisBranchId, ordered: { entryId, position }[] }`, edit-gated) that calls
`kanbanPositionRepository.rebalance(...)`. **If the executor judges this endpoint out of YAGNI scope for v1,
gate the whole rebalance behind a flag and ship drag without it** — the board is correct without rebalance
(positions just grow). Decision deferred to the executor with Ponytail's bias toward NOT adding the endpoint
unless `fractional-indexing` keys actually collide in practice. (Acceptance criteria treat rebalance as
OPTIONAL — see Section 6.)

### Task H — Touch/scroll & a11y wiring (`content-kanban.tsx`, `kanban-column.tsx`, `kanban-card.tsx`)

- Board container: `touch-action: none` only while a touch drag is active; `pan-y` otherwise (KB-S31).
- Each column = `useDroppable` (id = `col:{value??'__null__'}`); collapsed columns remain valid targets and
  drop-to-top without expanding (KB-U06b). `<SortableContext items={cardIds}>` per column.
- Keyboard drag (KB-U14): Space grab → arrows move → Enter commit → Esc cancel, with an `aria-live="polite"`
  region announcing destination column + position (KB-S29). `role="region"`/`role="article"` already present
  (Sprint 02) — extend their `aria-label`s during an active grab.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run from the monorepo root unless noted (commands per `_config/commands.md`):

```bash
# Tier 3 — core: type-only addition compiles, existing tests still green
pnpm --filter @beechcms/core run build
pnpm --filter @beechcms/core run test

# Tier 2 — api: move handler + atomic repo method
pnpm --filter @beechcms/api exec tsc --noEmit
pnpm --filter @beechcms/api run test

# No new migration this sprint — confirm a clean DB still boots (0034 already present)
pnpm run db:reset:local

# Tier 1 — dashboard: drag slice typechecks + build (new dep: fractional-indexing in dashboard only)
pnpm --filter @beechcms/dashboard exec tsc --noEmit
pnpm --filter @beechcms/dashboard run build

# Whole-repo gate
pnpm run build
pnpm run lint
```

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] **No migration and no `content_{slug}` DDL change**; `pnpm run db:reset:local` still succeeds. No change
      to `buildSelectQuery`.
- [ ] The axis-value change and the `position` upsert on a cross-column drag are written in **one atomic D1
      batch** via `ContentRepository.updateWithKanbanPosition` (KB-S04e). A failure in either statement writes
      **neither** — covered by a repo test. The handler issues **no raw SQL**; both statements originate in
      the repository (Botanical invariant).
- [ ] The client fires exactly **one** request per drop (`PATCH /:slug/:id/kanban-move`); same-column reorder
      sends no `axis` field; the legacy `PATCH /:slug/:id/kanban-position` remains for position-only writes.
- [ ] Axis value is addressed by `Branch.id` (`br_XX`) resolved to `branch.alias` via the engine; no
      hardcoded column name and no alias persisted as the position key.
- [ ] Tags axis uses the server-side atomic `{oldValue,newValue}` swap (Q1); other tags on the entry are
      untouched — covered by a handler test. Dropping into "Senza valore" sets the branch to `null` (KB-U24).
- [ ] `position` is computed **client-side** with `fractional-indexing` (`generateKeyBetween`), produces a
      valid intermediate key for between/start/end drops, and yields **one** `UPDATE` per drag (KB-S04b/d).
- [ ] `fractional-indexing` appears **only** in `apps/dashboard` (behind `drag/fractional.ts`) — not in
      `@beechcms/core` or `apps/api`; the server treats `position` as opaque.
- [ ] During `onDragMove`, React receives **≤1 state update per `KANBAN_SETTLE_MS`**: intermediate values
      live in refs, the settle timer gates the single indicator `setState`, and immediate-release computes
      `closestCenter` once on the `over` snapshot (KB-S14b/c). Auto-scroll uses `requestAnimationFrame` with
      no React state (KB-S14e).
- [ ] Optimistic move is applied immediately via the overlay reducer; API success patches **only** the two
      affected column caches/counts with **no board refetch** (KB-S23); API error triggers `DRAG_ROLLBACK`
      restoring the pre-drag snapshot (KB-S22); API 404 triggers `DRAG_REMOVE` + toast (KB-S15b).
- [ ] A card with an in-flight call is `isPending`: `draggable={false}`, visually locked/`not-allowed`, until
      commit or rollback (KB-U13b/S14f). Drag is disabled entirely without edit permission (KB-U13).
- [ ] `over: null` (drop outside any column) cancels silently — no reducer mutation, no API call, no toast,
      timer/refs cleared (KB-U09b/S14d). Dropping into a filter-excluded column removes the card with the
      KB-U09c informative toast and a correct source-count decrement.
- [ ] Same-column manual reorder is disabled while a `sort` is active (cursor indicates it); cross-column drag
      stays enabled (KB-U22b). Collapsed columns remain valid drop targets (drop-to-top, no auto-expand —
      KB-U06b).
- [ ] `DragOverlay` renders the simplified card (title + status only, no image — KB-S13); the source shows a
      ghost (KB-U10). `TouchSensor` uses `{delay:200,tolerance:8}` and `touch-action` toggles `none`↔`pan-y`
      (KB-S30/S31). Keyboard drag (Space/arrows/Enter/Esc) works with `aria-live` announcements (KB-U14/S29).
- [ ] **(OPTIONAL — Ponytail-gated)** Async rebalance fires when a written `position` exceeds
      `KANBAN_POSITION_REBALANCE_THRESHOLD`, rewriting the column in one batch via
      `IKanbanPositionRepository.rebalance` without blocking the UI (KB-S04f). If omitted, the board is still
      correct and this item is explicitly waived in the PR description.
- [ ] No cross-feature import: `content-kanban` imports only `@beechcms/core`, shared libs, `@/components/ui/*`,
      and `@dnd-kit/*` — not `content-gallery`/`content-toolbar`.
- [ ] All commands in Section 5 pass.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executing agent MUST NOT build the following (Brief §5 v1 exclusions and downstream concerns):

- **Column reordering** (dragging columns themselves), **multi-card drag** / multi-select, **aggregated
  columns** (e.g. "In progress OR Review" → one column), **relation-axis** kanban, and **swimlanes**
  (secondary grouping axis). All v1 out-of-scope.
- Any **new D1 migration**, any **`content_{slug}` DDL** change, and any modification to `buildSelectQuery`
  beyond consuming the already-shipped `kanbanOrder`.
- Any change to Sprint 02's per-column fetching architecture (`useKanbanColumnQuery`, the virtualizer, the
  axis-config bar, view-config persistence) beyond making columns droppable and cards sortable. The reducer
  is an **overlay**, not a replacement, for the React Query caches.
- Putting `fractional-indexing` or any fractional-index math in `@beechcms/core` or `apps/api` (server
  `position` stays opaque).
- A new view, a new toolbar concept, or any change to `content-gallery`/`content-toolbar`.
- Server-side scheduled/stateful background jobs for rebalance (Cloudflare purity): rebalance, if built, is a
  client-scheduled single batch `PATCH`, not a cron/queue worker.
