# Execution Log — ViewSwitcherRedesign

## SECTION 6 — ACCEPTANCE CRITERIA

- [x] `mergeContentViewOrder` is exported from `@beechcms/core`. It is pure, its output is always a permutation of
      `allIds`, and hidden ids keep their slot (core tests).
- [x] After `PUT /views/order`, every `seed_views` row of the seed has a distinct position. A hidden row keeps its
      slot (integration case). The route, permission row, request/response shape and error codes are unchanged.
- [x] `D1ContentViewRepository`, `IContentViewRepository`, every migration, `permission.middleware.ts` and the
      middleware registration order are byte-identical.
- [x] `RESERVED_VIEW_TYPES` / `ViewTypeId` exist only in the dashboard. `DashboardView`, `AUTHORIZABLE_VIEWS` and
      `VIEW_TYPE_IDS` in core are unchanged, and the API still answers 422 to `POST { type: 'calendar' }`.
- [x] The picker lists all 12 catalogue entries. An entry is enabled iff its type is in the seed's
      `resolveAuthorizedViews` and the user has `content:update`.
- [x] Tabs are draggable only when `onReorderViews` is passed (`content:update`). A plain click still selects. A
      reorder issues exactly one `PUT /views/order`, updates the cache optimistically, and never remounts the active
      workspace.
- [x] Deleting the active view, when it is the last instance of a non-Table type, renders `ViewEmptyState` with the
      switcher still visible. Picking any tab or creating a view leaves it.
- [x] The "New" split button's template item has no side effect other than closing the menu.
- [x] `ViewType` and `VIEW_TYPE_ICONS` are gone (Validation step 7), and `UserViewInstance.type` is `DashboardView`.
- [x] `content-views` imports no `@/features/*` module except `@/features/shared`, and `content-toolbar` imports
      nothing from `content-views` (Validation step 8).
- [x] Every key in Task 14 exists in both locale files, and `locales.test.ts` passes.
- [x] All new and edited tests follow `_config/testing_conventions.md`:
  - unit or integration tier as listed, placed in their slice (cross-slice cases in `src/test/cross-slice/`);
  - SPDX header, four zones, one act, a named act result;
  - no `any` in new code, no fake timers, no sleeping;
  - canonical `posts` seed in the integration case.
- [x] `pnpm run build` + `pnpm test` (core), `npx tsc --noEmit` (api, no new error), `pnpm run test:integration`
      (api), `pnpm run type-check` + `pnpm test` (dashboard), `pnpm lint`, and `pnpm beech test --diff` all pass.
- [x] `git diff --stat` touches no file outside SECTION 3 (verified against the SECTION 3 file list directly, since
      Sprint 1/2 left most touched files in untracked state — see Note below).

**Runtime check (`pnpm beech dev`)**: not run. This execution has no browser/dev-server access in this session;
the six manual steps in SECTION 5 were not exercised. Flagging per the stage contract instead of guessing.

**Note on the precondition**: Sprint 1 and Sprint 2 remain uncommitted in this working tree, as the plan's
precondition documents. Scope compliance was verified by cross-checking every file touched in this session
against SECTION 3's 30-item list (1:1 match, no extras), not by `git diff --stat` alone, since most of SECTION 3's
files sit inside Sprint 1/2's untracked paths and a plain `git diff` does not surface changes to untracked files.

## Validation command output

### 1. Core contract + unit tests
```
$ pnpm run build && pnpm test -- content-view
Test Files  54 passed (54)
     Tests  938 passed (938)
```
(`content-view.test.ts`: 21/21, incl. 3 new `mergeContentViewOrder` cases)

### 2. API typecheck
```
$ npx tsc --noEmit
TypeScript: 8 errors in 5 files   (pre-existing, same 5 untouched files as Sprint 2's review — no new errors)
```

### 3. API integration (real D1)
```
$ pnpm run test:integration
Test Files  22 passed (22)
     Tests  153 passed (153)
```
(`content-views.integration.test.ts`: 18/18, incl. the new hidden-row reorder case)

### 4. Dashboard
```
$ pnpm run type-check
$ tsc -b          (clean, no errors)

$ pnpm test
Test Files  152 passed (152)
     Tests  1063 passed (1063)
```
(new/modified files for this sprint — 43/43 tests passed: `view-switcher.test.tsx`, `view-type-picker.test.tsx`,
`new-entry-button.test.tsx`, `shared.test.ts`, `content-toolbar.test.tsx`, `use-content-views.test.tsx`,
`view-empty-state.test.tsx`, `content-views.api.test.ts`, `src/test/cross-slice/content-list.test.tsx`)

### 5. Lint
```
$ pnpm lint
ESLint: No issues found
```

### 6. Workspace regression scoped to changed packages
```
$ pnpm beech test --diff
[packages/core]    Test Files 3 passed (3)   Tests 67 passed (67)
[apps/dashboard]   Test Files 41 passed (41) Tests 328 passed (328)
[apps/api unit]    Test Files 20 passed (20) Tests 120 passed (120)
[apps/api integration] Test Files 22 passed (22) Tests 153 passed (153)
PASS  All 12 changed file(s) meet coverage thresholds.
```

### 7. Stale union gone
```
$ git grep -n "\bViewType\b\|VIEW_TYPE_ICONS\|creatableViews\b" -- apps/dashboard/src
(no output)
```

### 8. Slice isolation
```
$ git grep -n "@/features/" -- apps/dashboard/src/features/content-views | grep -v "@/features/shared"
(no output)
$ git grep -n "content-views" -- apps/dashboard/src/features/content-toolbar
(no output)
```

### 9. Graph sync
```
$ graphify update . --force
Rebuilt: 24620 nodes, 36406 edges, 2281 communities
graph.json and GRAPH_REPORT.md updated in graphify-out
```
