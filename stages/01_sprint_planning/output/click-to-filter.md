# Sprint Plan — Click-to-Filter (`applyFilter`) on Cell Values

> Feature: wiring a single click on a Data Table cell value to push an equality/contains
> condition into the existing toolbar filter state. The filter DSL and the server round-trip
> already exist; this sprint wires the **interaction**, nothing else.

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

This sprint is **dashboard-only by construction**. The filter pipeline is already complete and
proven end to end:

- `ToolbarFiltersState` (a `Record<columnId, ToolbarFilterGroup>`) is the single source of truth
  for active filters, owned by `ContentListPage` (`apps/dashboard/src/pages/content-list.tsx`).
- That state is already serialized into the server query by `useContentList(slug, { filters })`
  (`apps/dashboard/src/features/content-management`). Therefore **mutating `toolbarFilters` is the
  one and only lever needed** — a cell click that adds a condition triggers the existing TanStack
  Query refetch automatically. No new data path is created.
- The DSL (`apps/dashboard/src/lib/filter-dsl.ts`) already defines `FilterOperator`,
  `ToolbarFilterGroup`, and matching semantics. We reuse `op: "eq"` (and `op: "contains"` for
  `text`/`tags`), exactly matching the defaults `useToolbarFilters.addConditionToColumn` already
  uses.

**Adherence to the Botanical Invariant:** zero database interaction is introduced. Cell clicks
feed the *same* `filters` object that `useContentList` already transports to `@beechcms/core` via
`apps/api`. No hardcoded field names: column identity flows from `branch.alias` (Branch IDs),
never from literal column strings.

**Adherence to VSA:** the new behavior is split across exactly two boundaries that already exist:
1. The **shared UI primitive** `DataTable` gains one optional, feature-agnostic callback prop
   (`onCellActivate`) — it knows nothing about filters, only "a cell was activated".
2. The **page orchestrator** `ContentListPage` owns the filter semantics and translates a cell
   activation into a `ToolbarFiltersState` mutation.
No cross-feature import is added. The single piece of duplicated logic (deriving a column's
`FilterGroupType` + label from the seed) is **extracted once** into the toolbar's own shared module
(`content-toolbar/shared.ts`) and consumed by both `useToolbarFilters` and the page — keeping the
derivation in one place rather than copy-pasting it into the page.

This must exist before any "saved views" or "filter-from-context-menu" work because it establishes
the canonical, side-effect-free `applyCellFilter` reducer that future entry points will call.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

Verified via `graphify update . --force` + `graphify query`/file inspection.

**Filter state ownership — `apps/dashboard/src/pages/content-list.tsx`:**
- `const [toolbarFilters, setToolbarFilters] = React.useState<ToolbarFiltersState>(...)` (L114).
- Consumed by `useContentList(slug, { ..., filters: toolbarFilters })` (L150-161) → server refetch.
- Passed to `<ContentToolbar filters={toolbarFilters} onFiltersChange={setToolbarFilters} />`
  (L739-740).
- Derived into TanStack `columnFilters` via the `isConditionEffective` memo (L534-604) and handed
  to `<DataTable columnFilters={columnFilters} manualFiltering />` (L843, L836).
- Helper already present: `getEntryValueForColumn(entry, columnId)` (L241-249) returns the raw cell
  value for `id` / `slug` / `status` / `data[columnId]`. **Reuse this for value extraction.**
- Pagination already resets on filter change: `useEffect(... [slug, debouncedSearch, sorting,
  toolbarFilters, pageSize])` (L179-181). No new reset wiring needed.

**Filter DSL — `apps/dashboard/src/lib/filter-dsl.ts`:**
- `FilterOperator = "eq" | "gt" | "gte" | "lt" | "lte" | "contains" | "is_empty" | "is_not_empty"`.
- `ToolbarFilterGroup = { columnId, label, type, conditions: {id,op,value}[], selectOptions? }`.

**Filter group shape + ID generation — `apps/dashboard/src/features/content-toolbar/shared.ts`:**
- `ToolbarFiltersState = Record<string, ToolbarFilterGroup>` (L63).
- `ToolbarFilterCondition { id, op, value }` (L49-53).
- `generateConditionId()` (L113-115) — reuse, do not invent a new ID scheme.
- `FilterGroupType = "text"|"number"|"date"|"boolean"|"tags"|"select"|"system"` (L30-38).

**Column-type derivation (the logic to extract) — `content-toolbar/toolbar-hooks/use-toolbar-filters.ts`:**
- `filterableColumns` memo (L45-73) maps `seed.branches` + synthetic `slug`/`status` columns to
  `{ columnId, label, type, selectOptions? }`, gated by `resolvePolicies(branch).filter`.
- `addConditionToColumn` (L80-111) defines the **canonical default operator**: `tags → "contains"`,
  else `"eq"`, and the **canonical group-creation/merge shape** (append condition if the group
  already exists, else create the group). Click-to-filter must mirror this shape exactly so the two
  entry points produce identical state.

**Data Table render — `apps/dashboard/src/components/ui/data-table.tsx`:**
- Row render (L523-573): `<TableRow onDoubleClick={() => onRowDoubleClick?.(row.original)}>` (L533)
  — **double-click row routing is preserved and must not be hijacked**.
- Cell render loop `row.getVisibleCells().map((cell) => ...)` (L535-571); each cell is a
  `<TableCell>` optionally wrapped in `<ContextMenu>` (L561-569).
- `excludedContextMenuColumnIds` already exists as the pattern for opting columns out of
  cell-level interaction wrapping (used at L551). Click-to-filter reuses the same exclusion concept.
- Columns `id: "select"` (checkbox) and `id: "actions"` (row menu) are interactive and must be
  excluded from cell activation (`apps/dashboard/src/lib/dynamic-columns.tsx` L292, L487).

**Conclusion:** the only state lever is `setToolbarFilters`; the only UI seam is the cell `onClick`
inside `DataTable`. Everything else (DSL, server transport, pagination reset) is already in place.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

Exact files produced/modified. **All in `apps/dashboard`. Zero changes to `@beechcms/core`,
`apps/api`, or D1.**

**Modified — production:**
1. `apps/dashboard/src/features/content-toolbar/shared.ts`
   - Add exported pure helper `buildFilterableColumns(seed, availableStatusOptions)` returning
     `FilterableColumn[]` (the derivation currently inlined in `useToolbarFilters`).
   - Add exported pure helper `buildCellFilterCondition(type)` returning the default
     `FilterOperator` (`tags → "contains"`, else `"eq"`).
2. `apps/dashboard/src/features/content-toolbar/toolbar-hooks/use-toolbar-filters.ts`
   - Replace the inline `filterableColumns` memo body with a call to `buildFilterableColumns(...)`
     (behavioral no-op; removes the duplication the page would otherwise introduce).
3. `apps/dashboard/src/features/content-toolbar/index.ts`
   - Re-export `buildFilterableColumns`, `buildCellFilterCondition`, and the `FilterableColumn`
     type from the feature's public surface (so the page imports them from `@/features/content-toolbar`,
     never via a deep path).
4. `apps/dashboard/src/components/ui/data-table.tsx`
   - Add optional prop `onCellActivate?: (columnId: string, row: TData) => void`.
   - Add optional prop `cellActivateExcludedColumnIds?: string[]` (defaults applied by the page).
   - Wire a single-click handler on each `<TableCell>` that disambiguates against double-click and
     interactive targets, then calls `onCellActivate`.
5. `apps/dashboard/src/pages/content-list.tsx`
   - Add `applyCellFilter(columnId, rawValue)` callback that builds/merges a `ToolbarFilterGroup`
     and calls `setToolbarFilters`.
   - Pass `onCellActivate` + `cellActivateExcludedColumnIds={["select", "actions"]}` to `<DataTable>`.

**New — test:**
6. `apps/dashboard/src/test/pages/content-list-click-to-filter.test.tsx` (or co-located per existing
   test convention) — covers the `applyCellFilter` reducer semantics and double-click non-interference.

**No new runtime dependencies. No new feature slice.**

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

No D1 migration (dashboard-only). The following are the exact TypeScript contracts and stubs.

### 4.1 — `content-toolbar/shared.ts` (extract derivation, single source of truth)

```ts
import { resolvePolicies } from "@beechcms/core"
import type { Seed } from "@beechcms/core"

export interface FilterableColumn {
  columnId: string
  label: string
  type: FilterGroupType
  selectOptions?: string[]
}

/**
 * Canonical mapping seed.branches (+ synthetic slug/status) -> filterable columns.
 * Extracted verbatim from useToolbarFilters; single source of truth for both the
 * toolbar hook and the click-to-filter page handler.
 */
export function buildFilterableColumns(
  seed: Seed,
  availableStatusOptions: string[] = []
): FilterableColumn[] {
  const columns: FilterableColumn[] = [
    { columnId: "slug", label: "Slug", type: "system" },
    { columnId: "status", label: "Stato", type: "select", selectOptions: availableStatusOptions },
  ]
  for (const branch of seed.branches) {
    if (!resolvePolicies(branch).filter) continue
    const alias = branch.alias
    if (branch.type === "number") columns.push({ columnId: alias, label: branch.label, type: "number" })
    else if (branch.type === "date") columns.push({ columnId: alias, label: branch.label, type: "date" })
    else if (branch.type === "boolean") columns.push({ columnId: alias, label: branch.label, type: "boolean" })
    else if (branch.type === "json" && alias.toLowerCase().includes("tag"))
      columns.push({ columnId: alias, label: branch.label, type: "tags" })
    else columns.push({ columnId: alias, label: branch.label, type: "text" })
  }
  return columns
}

/** Canonical default operator for a freshly-added condition (mirrors addConditionToColumn). */
export function defaultOperatorForType(type: FilterGroupType): FilterOperator {
  return type === "tags" ? "contains" : "eq"
}
```

> `useToolbarFilters.filterableColumns` must be refactored to
> `React.useMemo(() => buildFilterableColumns(seed, availableStatusOptions), [seed, availableStatusOptions])`.
> This is a behavioral no-op — verify the existing toolbar filter tests still pass unchanged.

### 4.2 — `data-table.tsx` (the only UI seam)

Add to `DataTableProps<TData, TValue>`:

```ts
  /** Single-click activation of a cell value (e.g. click-to-filter). Feature-agnostic. */
  onCellActivate?: (columnId: string, row: TData) => void
  /** Column ids that must NOT trigger onCellActivate (interactive columns). */
  cellActivateExcludedColumnIds?: string[]
```

Inside the cell `.map((cell) => ...)` block (data-table.tsx L535-571), compute once per row a
`Set` from `cellActivateExcludedColumnIds`, then attach an `onClick` to the `<TableCell>`:

```tsx
const canActivateCell =
  !!onCellActivate && !cellActivateExcludedColumnIdSet.has(cell.column.id)

// click/dbl-click disambiguation: a single click fires the first click of a double-click.
// Defer activation by one frame-ish window and cancel it if a dblclick lands.
const handleCellClick = (e: React.MouseEvent<HTMLTableCellElement>) => {
  if (!canActivateCell) return
  // ignore clicks that originate from interactive content (checkbox, buttons, links, reveal)
  if ((e.target as HTMLElement).closest("button, a, input, [role='button'], [data-no-cell-filter]"))
    return
  if (cellClickTimerRef.current) window.clearTimeout(cellClickTimerRef.current)
  cellClickTimerRef.current = window.setTimeout(() => {
    onCellActivate?.(cell.column.id, row.original)
  }, CELL_CLICK_DELAY_MS) // 200
}
```

- Add a module constant `const CELL_CLICK_DELAY_MS = 200`.
- Add `const cellClickTimerRef = React.useRef<number | null>(null)` at component scope and clear it
  in the existing row's `onDoubleClick` so a genuine double-click cancels the pending filter:
  ```tsx
  onDoubleClick={() => {
    if (cellClickTimerRef.current) window.clearTimeout(cellClickTimerRef.current)
    onRowDoubleClick?.(row.original)
  }}
  ```
- Apply `onClick={handleCellClick}` to **both** `<TableCell>` branches (plain L555 and
  context-menu-wrapped L564). Add `className={cn(cellClassName, canActivateCell && "cursor-pointer")}`.
- Strict typing: no `any`; cast event target via `HTMLElement` as shown. `onCellActivate` stays
  generic over `TData`.

### 4.3 — `content-list.tsx` (filter semantics owner)

Add the reducer callback (place near `getEntryValueForColumn`, L241):

```ts
import {
  buildFilterableColumns,
  defaultOperatorForType,
  generateConditionId,
} from "@/features/content-toolbar"

const filterableColumns = React.useMemo(
  () => buildFilterableColumns(seed, effectiveStatusOptions),
  [seed, effectiveStatusOptions]
)

const applyCellFilter = React.useCallback(
  (columnId: string, entry: ContentEntry) => {
    const col = filterableColumns.find((c) => c.columnId === columnId)
    if (!col) return // column not filterable (system/unsupported) -> no-op
    const rawValue = getEntryValueForColumn(entry, columnId)

    // Normalize the cell value into the FilterCondition value union.
    const value = normalizeCellFilterValue(col.type, rawValue)
    if (value === null && col.type !== "boolean") return // nothing meaningful to filter on

    const op = defaultOperatorForType(col.type)
    const nextCondition: ToolbarFilterCondition = { id: generateConditionId(), op, value }

    setToolbarFilters((prev) => {
      const existing = prev[columnId]
      // Idempotency: do not add a duplicate (same op + same value) condition.
      if (existing?.conditions.some((c) => c.op === op && c.value === value)) return prev
      return {
        ...prev,
        [columnId]: existing
          ? { ...existing, conditions: [...existing.conditions, nextCondition] }
          : {
              columnId,
              label: col.label,
              type: col.type,
              selectOptions: col.selectOptions,
              conditions: [nextCondition],
            },
      }
    })
  },
  [filterableColumns, getEntryValueForColumn]
)
```

Add the value-normalizer helper (module scope in `content-list.tsx`, or `lib/filter-dsl.ts` if a
test wants it isolated):

```ts
function normalizeCellFilterValue(
  type: FilterGroupType,
  raw: unknown
): string | number | boolean | null {
  switch (type) {
    case "number":
      return typeof raw === "number" ? raw : (raw != null && raw !== "" && !Number.isNaN(Number(raw)) ? Number(raw) : null)
    case "boolean":
      return typeof raw === "boolean" ? raw : null
    case "tags": {
      const names = extractTagNames(raw) // already imported in content-list.tsx
      return names.length > 0 ? names[0] : null
    }
    case "date":
      return normalizeDateToYmd(raw) // from @/lib/filter-dsl
    case "select":
    case "text":
    case "system":
    default: {
      const s = raw == null ? "" : String(raw).trim()
      return s.length > 0 ? s : null
    }
  }
}
```

Wire it into the existing `<DataTable>` (L772-859):

```tsx
  onCellActivate={(columnId, entry) => applyCellFilter(columnId, entry)}
  cellActivateExcludedColumnIds={["select", "actions"]}
```

> Note: `slug`/`id`/`created_at` are hidden by default and `id`/`slug` are not user-meaningful to
> click-filter; they are already not rendered, so no extra exclusion is required beyond `select`
> and `actions`. `status` IS filterable and SHOULD activate.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run from repo root unless noted.

```bash
# 1. Type-check the dashboard (strict, no emit)
pnpm --filter @beechcms/dashboard exec tsc --noEmit

# 2. Lint the touched files
pnpm --filter @beechcms/dashboard lint

# 3. Unit/component tests (toolbar-filters regression + new click-to-filter test)
pnpm --filter @beechcms/dashboard test

# 4. Full build to confirm no bundling/type regressions
pnpm --filter @beechcms/dashboard build
```

> If exact script names differ, consult `_config/commands.md` (Layer 3) — do not invent flags.
> NO `@beechcms/core` build and NO `db:reset:local` are required: this sprint touches neither the
> engine nor any migration.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] Single click on a filterable cell value adds an `eq` condition (`contains` for `text`/`tags`)
      for that column into `toolbarFilters`, triggering the existing `useContentList` refetch.
- [ ] Double-click on a row still opens the entry editor and does **not** also apply a filter
      (click/dbl-click disambiguation verified by test).
- [ ] Clicks on interactive cell content (selection checkbox, actions menu, truncation reveal,
      links/buttons) do **not** apply a filter (`closest()` guard + excluded columns `select`,
      `actions`).
- [ ] Re-clicking the same value does not create a duplicate condition (idempotency check passes).
- [ ] `status` cell click filters by status; numeric/date/boolean/tags cells produce a correctly
      typed `value` (number/`YYYY-MM-DD`/boolean/first tag name).
- [ ] `buildFilterableColumns` is the single derivation source; `useToolbarFilters` consumes it and
      its existing tests pass **unchanged** (proves the extraction is a behavioral no-op).
- [ ] `DataTable.onCellActivate` is generic over `TData` and feature-agnostic (no import of filter
      types into `data-table.tsx`).
- [ ] Zero changes under `packages/core/`, `apps/api/`, or any `migrations/` path
      (`git diff --stat` shows only `apps/dashboard/**`).
- [ ] `tsc --noEmit`, lint, test, and build all pass with no new `any` and no `eslint-disable`
      added for this feature.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executing agent MUST NOT:

- Touch `@beechcms/core`, `apps/api`, D1 schema, or any migration — **escalate and STOP** if a
  server change appears necessary (it does not; `useContentList` already transports `filters`).
- Add server-side timestamp sorting or any new query parameter to `useContentList`.
- Introduce a filter-pill / "active filter" UI redesign — the existing `filter-pills-bar.tsx`
  already renders active conditions; clicked filters appear there for free. Do not restyle it.
- Add operator pickers, range UI, or "filter by >, <" affordances on cells. Click = `eq`/`contains`
  only. Range operators stay in the toolbar advanced filter.
- Add modifier-key variants (ctrl+click = exclude, etc.), multi-cell selection, or "filter to this
  value AND remove others". One click appends one condition. YAGNI.
- Wire click-to-filter into the **gallery** view, kanban, grid, or chart views. Table view only.
- Refactor `dynamic-columns.tsx` cell renderers, the `filterFn` implementations, or the
  `columnFilters` effectiveness memo in `content-list.tsx`.
- Reimplement already-shipped behaviors (column resize, density, sort, group-by, bulk actions,
  search, advanced filters) — see `feature_brief.md`.
- Persist filters to URL/localStorage or to a saved-view system — no preferences backend exists yet.
- Change the `dialog.tsx` primitive or the entry-editor mount lifecycle.

HANDOFF -> caveman_coder.
