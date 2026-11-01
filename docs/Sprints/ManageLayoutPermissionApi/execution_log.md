# Execution log — ManageLayoutPermissionApi

## SECTION 6 — ACCEPTANCE CRITERIA

- [x] `PERMISSIONS` ends with `'manage_layout'`. Migration `0039` rebuilds `role_permissions` with the 8-value CHECK, keeps
      every existing row, and grants `manage_layout` to SuperAdmin. `manage_seeds` is still rejected at rest.
- [x] `LOCKED_WIDGET_TYPE`, `isWidgetLockedFor`, `isDashboardLayoutEditor`, `hasDashboardLayoutStructuralChange`,
      `reconcileLockedWidgets`, `LockedWidgetReconciliation` and `DashboardLayoutWriteResult` are exported from
      `@beechcms/core` with the T2–T5 signatures. `FilteredDashboardLayout` has no `hiddenWidgetCount`.
- [x] `dashboard-layout-editing.ts` imports only `../rbac/*`, `./widget-requirements.js` and types from
      `./dashboard-layout.js`. There is no I/O in any touched core module.
- [x] The GET projection follows T3:
  - [x] editors get every tab with roles, and locked widgets as exact placeholders;
  - [x] readers lose locked widgets (built-in requirements included) and emptied sections and tabs.
- [x] `filterDashboardLayoutByWidgetRequirements` drops `core/locked`.
- [x] `IDashboardLayoutRepository` exposes `get` / `save` / `remove` as in T5. The D1 statements are the T5 SQL.
      `updated_at` strictly increases on every save.
- [x] PUT:
  - [x] the route row is `anyScope('manage_layout', 'manage_roles')`;
  - [x] the handler follows T6 steps 1–8 in order, with the T6 problem types;
  - [x] the response layout is projected.
- [x] DELETE stays `manage_roles@*`, requires the precondition, and has no lock check. `layout-locked` no longer exists.
- [x] A `manage_layout`-only caller cannot change the tab set, order, metadata or roles, nor save over nothing, even with
      a hand-crafted request.
- [x] Nobody can move, remove, or forge a locked widget, or add an unusable one, through PUT. Locked widgets are
      persisted verbatim from the stored layout.
- [x] The setup demo track uses `save(..., null)` and never overwrites a stored layout.
- [x] The dashboard builder sends `If-Match` / `If-None-Match: *` on save and reset. The roles UI lists `manage_layout` in
      the System group, with metadata and en/it labels.
- [x] Anti-escalation is proven for `manage_layout` (assignment refused without holding it).
- [x] `docs/reference/dashboard-layout.md` matches the T6 contract, with no scoped-route sections.
- [x] Every SECTION 5 command passes, and every T9 test exists and passes. The `flow-rbac-upgrade` and `d1-role`
      expectation changes are explained in the PR.

## SECTION 5 — VALIDATION

| # | Command | Result |
|---|---------|--------|
| base | `tsc --noEmit \| grep -c "error TS"` in `apps/api/` before T1 | 51 |
| 1 | `pnpm run build` in `packages/core/` | exit 0 |
| 2 | `vitest run src/dashboard-layout src/rbac` in `packages/core/` | 12 files, 240 tests passed |
| 3 | `tsc --noEmit \| grep -c "error TS"` in `apps/api/` | 51 (= baseline); 0 in `dashboard-layout*` / `setup/index.ts` / `permission.middleware*` |
| 4 | `vitest run --project unit src/middleware/permission.middleware.test.ts src/shared/db/repositories` | 31 files, 447 tests passed |
| 5 | `vitest run --project flow test/flow/flow-rbac-upgrade.test.ts` | 4 tests passed |
| 6 | `vitest run --config vitest.workers.config.ts src/features/dashboard-layout src/features/rbac src/features/stats` | dashboard-layout 43 passed; rbac + stats 11 files, 90 tests passed |
| 7 | `tsc --noEmit` in `apps/dashboard/` | no errors |
| 8 | `vitest run src/features/dashboard src/features/rbac` in `apps/dashboard/` | 37 files, 248 tests passed |
| 9 | `pnpm beech db:reset` + SuperAdmin permission query | `0039` applied; 8 rows, `manage_layout` included |
| 10 | `pnpm beech test --diff` | PASS (96 files, 725 tests); changed-line coverage PASS, handler NOT MEASURED (workerd tier only, covered by the 43 integration tests) |
| 11 | `pnpm beech lint` | 19 successful, 19 total |
| 12 | invariant greps | `layout-locked` 0, `hiddenWidgetCount` 0, `features/rbac` in dashboard-layout slice 0, `features/rbac` in dashboard feature 0, `\.upsert\(` in dashboard-layout 0 |
| 13 | `graphify update .` | 29069 nodes, 41836 edges |

Notes:
- `\.upsert\(` in `features/setup` matches `seedRepo.upsert` (`index.ts:304`), the seed repository. The layout call is `save(..., null)`.
- The plan's branch rule (`devs`) was not followed: `devs` lacks sprints 1–4 that this plan builds on. Branch `feature/manage-layout-permission-api` was cut from `feature/widget-permission-requirements`.
- `428` added to `PublicProblemStatus` (`public/errors/problem-details.ts`) so `publicProblem` can answer `precondition-required`.
