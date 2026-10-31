# Execution log — DashboardTabAudienceApi

Branch: `feature/dashboard-tab-audience-api` (from `feature/dashboard-data-scope-closure`, not `devs`: sprint 1 `30473871` is not on `devs` and the plan's pointers assume it). No commit made.

## SECTION 6 — ACCEPTANCE CRITERIA

- [x] `DashboardPageLayout.roles?: string[]`, `MAX_ROLES_PER_PAGE = 32`, `DashboardLayoutContext.roleIds?` and the T2 exports (`DashboardLayoutViewer`, `FilteredDashboardLayout`, `filterDashboardLayoutForViewer`) exist in `@beechcms/core` with the exact T1/T2 shapes. Core gains no dependency.
- [x] `dashboard-scopes.ts` is deleted. `DEFAULT_DASHBOARD_SCOPE` is still exported. `listScopes` exists nowhere. The `rg` in SECTION 5 prints nothing outside `docs/` and `dist/` (only gitignored `apps/api/assets/**` build output matched before exclusion).
- [x] `filterDashboardLayoutForViewer` decides every case through core `hasPermission`. The API contains no copy of the audience or seed rule.
- [x] `GET /api/dashboard-layout` reads only the `default` row, serves `{ layout }` filtered for the caller with `Cache-Control: no-store`, and never includes a tab outside the audience (unless `manage_roles@*`), a widget on an unreadable seed, or a reader-facing `roles` key.
- [x] An unknown role id at save is a 422 `invalid-layout`, and nothing is persisted. Orphan ids in storage confer nothing.
- [x] `PUT`/`DELETE /api/dashboard-layout` and `GET /api/dashboard-layout/roles` are gated by `perm('manage_roles','global')` in the route table only. The slice reads neither `jwtPayload.role` nor `canEditDashboard`.
- [x] PUT/DELETE answer 409 `layout-locked`, writing nothing, when the stored layout holds widgets the caller cannot read.
- [x] `GET /api/dashboard-layout/roles` returns exactly `{ id, name, icon }` per role, ordered by name.
- [x] Every former per-scope URL answers 403 `route_not_registered`.
- [x] `dashboard-layout.handler.ts` imports nothing from another `features/*` slice. The new test file imports nothing from another slice or test file.
- [x] Dashboard: builder has no scope selector and calls only `GET`/`PUT`/`DELETE /api/dashboard-layout`; `useDashboardLayout` has no `scope`; the renderer survives `pages: []`; `dashboard.builder.scope` keys are gone from both locales.
- [x] Every new or edited test follows `testing_conventions.md` (SPDX, four zones, status first, typed bodies, no `any`, no `Date.now()`, no `it.only`/`skip`, §6.2 comments). `dashboard-layout.handler.test.ts` deleted; contracts re-covered in 7c.
- [x] `pnpm run build` (core), `npx tsc --noEmit` (dashboard; api: no new error), `pnpm beech test` and `pnpm beech lint` pass.

## SECTION 5 — VALIDATION OUTPUT

```
cd packages/core && pnpm run build            → tsc, exit 0
cd apps/dashboard && npx tsc --noEmit         → TypeScript: No errors found
cd apps/api && npx tsc --noEmit               → 51 errors, same as baseline; 0 in touched files
packages/core vitest src/dashboard-layout     → 8 files, 180 tests passed
apps/api vitest (unit)                        → 199 files, 2398 tests passed
apps/api vitest.workers (integration)         → 96 files, 706 tests passed (dashboard-layout: 26 passed)
apps/dashboard vitest                         → 205/206 files on full run; the one failure,
                                                pie-chart-widget "+N more" (5000ms timeout under load),
                                                passes in isolation together with the 3 edited dashboard test files (14 tests)
pnpm beech lint                               → 19/19 tasks successful
rg (scope machinery, excl. dist/node_modules/gitignored assets) → no matches
graphify update . --force                     → code graph updated
```
