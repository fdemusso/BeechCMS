# Execution Log — Click-to-Filter (`applyFilter`) on Cell Values

## SECTION 6 — ACCEPTANCE CRITERIA

- [x] Single click on a filterable cell value adds an `eq` condition (`contains` for `tags`) for that column into `toolbarFilters`, triggering the existing `useContentList` refetch.
- [x] Double-click on a row still opens the entry editor and does **not** also apply a filter (click/dbl-click disambiguation via 200ms timer cancel in `onDoubleClick`).
- [x] Clicks on interactive cell content (selection checkbox, actions menu, truncation reveal, links/buttons) do **not** apply a filter (`closest()` guard + excluded columns `select`, `actions`).
- [x] Re-clicking the same value does not create a duplicate condition (idempotency check passes).
- [x] `status` cell click filters by status; numeric/date/boolean/tags cells produce a correctly typed `value` (number/`YYYY-MM-DD`/boolean/first tag name).
- [x] `buildFilterableColumns` is the single derivation source; `useToolbarFilters` consumes it and its existing tests pass **unchanged** (proves the extraction is a behavioral no-op).
- [x] `DataTable.onCellActivate` is generic over `TData` and feature-agnostic (no import of filter types into `data-table.tsx`).
- [x] Zero changes under `packages/core/`, `apps/api/`, or any `migrations/` path.
- [x] `tsc --noEmit`, lint, test, and build all pass with no new `any` and no `eslint-disable` added for this feature.

## SECTION 5 — VALIDATION OUTPUT

```
# 1. tsc --noEmit
(no output — clean)

# 2. lint
✖ 300 problems (0 errors, 300 warnings)  ← all pre-existing warnings, 0 errors

# 3. test
Test Files  85 passed (85)
Tests  649 passed (649)

# 4. build
✓ built in 3.18s
```
