# Execution log — DashboardTabAudienceUi

Branch: `feature/dashboard-tab-audience-ui`, created from `feature/dashboard-tab-audience-api`. `devs` lacks sprints 1–2; the user chose this base. No commit made.

## SECTION 6 — ACCEPTANCE CRITERIA

- [x] `canEditDashboard`, `ROLES_ALLOWED_TO_EDIT_DASHBOARD` and `dashboard-permissions.ts` exist nowhere in source. The SECTION 5 `rg` printed nothing. Core gains no export or dependency.
- [x] `DashboardPage` gates both the "Customize" button and the builder mount on `usePermissions().canGlobally("manage_roles")`. Nothing in `features/dashboard/` reads `user.role` (`rg "\.role\b"` printed nothing).
- [x] `useDashboardLayout` re-fetches on every mount (`staleTime: 0`) and still returns a stored `pages: []` layout. Both covered in `use-dashboard-layout.test.ts`.
- [x] `DashboardLayoutRenderer` renders the empty state (`dashboard.empty.*`) for `pages: []`, and keeps the `?page=` fallback to the first served tab.
- [x] `dashboardBuilderApi.getRoles`, `LayoutRole`, `LAYOUT_ROLES_QUERY_KEY`, `useLayoutRoles`, `setPageRoles` and `PageAudiencePickerProps` exist with the T5–T7 shapes. `LayoutRole` is inferred from the route.
- [x] The builder shows, for the active tab in edit mode:
  - [x] an audience picker listing roles by name and icon;
  - [x] "Everyone" when no role is targeted;
  - [x] a removable "Deleted role" chip for an id missing from a loaded list;
  - [x] no orphan marking while the list is loading or has failed.
- [x] Clearing the audience removes the `roles` key from the draft.
- [x] Saving a draft with an orphan id is refused client-side through core `validateDashboardLayout(…, { roleIds })`, with no PUT sent.
- [x] `features/dashboard/` imports nothing from `features/rbac` (`rg` printed nothing).
- [x] `en.json` and `it.json` gain the same `dashboard.empty` and `dashboard.builder.audience` keys.
- [x] Every new or edited test follows `testing_conventions.md`.
- [x] `pnpm run build` (core), `npx tsc --noEmit` (dashboard: zero errors; api: 51 errors, same as the baseline), `pnpm beech test` and `pnpm beech lint` pass.

## SECTION 5 — VALIDATION output

```
packages/core   pnpm run build        → tsc, no errors
apps/dashboard  npx tsc --noEmit      → No errors found
apps/api        npx tsc --noEmit      → 51 errors (baseline: 51)
pnpm beech test --diff                → PASS (integration: 96 files, 706 tests); coverage threshold met
pnpm beech test                       → exit 0; the api flow tier had 5 files time out at 5000ms under parallel load
                                        (flow-admin-auth, flow-oauth-connected-apps, flow-rbac-admin,
                                        flow-rbac-projections, flow-setup-race); re-run alone: 5 files, 29 tests, all passed
vitest features/dashboard             → 30 files, 196 tests passed
pnpm beech lint                       → 19/19 tasks successful
rg canEditDashboard|ROLES_ALLOWED_TO_EDIT_DASHBOARD  → no output
rg "\.role\b" features/dashboard                     → no output
rg features/rbac features/dashboard                  → no output
graphify update . --force             → done
```

Manual check (`pnpm beech dev`) not run.
