# Execution Log — ManageSeedsPermission

Branch: `feature/manage-seeds-permission` (stacked on `feature/manage-layout-permission-ui`: `devs` lacks migration 0039).

## SECTION 6 — ACCEPTANCE CRITERIA

- [x] `PERMISSIONS` has 9 entries, `manage_seeds` last; vocabulary JSDoc states the rule-29 decision.
- [x] `0040_manage_seeds_permission.sql` widens the CHECK to 9 values and grants SuperAdmin; `0032`/`0039` untouched.
- [x] Five `/api/seeds` rows are `perm('manage_seeds', 'global')`; two `/api/schema/:slug/layout` rows still `LEGACY_ADMIN`; no new kind.
- [~] `requireAdmin` gone from source. One doc hit remains: `packages/mcp/README.md:72` (outside the plan's file list, not edited).
- [x] `manage_seeds@*` + `users.role='editor'` reads/creates seeds; seed-scoped, non-holder and `admin` without grant get 403 `forbidden`, nothing written.
- [x] Non-holder's non-JSON body gets 403, not 400.
- [x] `PermissionRoleGuard` grants iff `manage_seeds@*`; `manage_users@*` alone denied.
- [x] `/api/settings/me` has no `isDeveloper`; `usePermissions()` has no `isDeveloper`.
- [x] Data Models group renders iff `canGlobally('manage_seeds')`.
- [x] Roles UI: `manage_seeds` in System group, en/it labels; `PERMISSION_METADATA` type-checks.
- [x] Anti-escalation proven (`escalation-refused`, count 0).
- [x] `flow-rbac-projections.test.ts` green.
- [x] No new cross-slice import; core gains no dependency.
- [x] API `tsc` errors 51 = baseline 51; dashboard `tsc` clean; `beech test --diff` and `beech lint` pass.

## SECTION 5 — VALIDATION

1. `packages/core` `pnpm run build`: exit 0.
2. `packages/core` `vitest run src/rbac src/oauth`: 5 files, 36 tests passed.
3. `apps/api` `tsc --noEmit`: 51 errors (baseline 51); 0 in `seeds.*`, `settings.handler*`, `permission.middleware*`.
4. `apps/api` unit: 34 files, 661 tests passed.
5. `apps/api` flow (5 files): 18 tests passed.
6. `apps/api` workers `src/features/seeds src/features/rbac`: PASS 160, FAIL 0.
7. `apps/dashboard` `tsc --noEmit`: no errors.
8. `apps/dashboard` `vitest run src/features/settings src/features/shared src/features/rbac`: 89 passed, 0 failed.
9. `pnpm beech db:reset` + wrangler query: 9 SuperAdmin rows, `manage_seeds` included.
10. `pnpm beech test --diff`: PASS; changed-line coverage met (`dashboard-layout.handler.ts` not measurable, workerd tier).
11. `pnpm beech lint`: 19/19 tasks successful.
12. Greps: `requireAdmin` 1 hit (`packages/mcp/README.md:72`); `isDeveloper` in settings/shared: only the two negative assertions in `settings.handler.test.ts`; `features/rbac` in seeds slice: 0. The `must never` pattern matches 27 unrelated comments; no seeds/`manage_seeds` hit.
13. `graphify update . --force`: done.

Manual check (`pnpm beech dev`) not run.

## REWORK (review finding 1)

- [x] Duplicate `canGlobally('manage_seeds')` test removed from `describe("hydrateEffectivePermissions")`; one copy kept in `describe("usePermissions")`.
- [x] `as any` removed from the kept test (`Partial<ReturnType<typeof useMe>>` + typed cast).
- `apps/dashboard` `tsc --noEmit`: no errors.
- `apps/dashboard` `vitest run src/features/shared src/features/settings src/features/rbac`: 88 passed, 0 failed (was 89; duplicate gone).
- `graphify update . --force`: done.
- Not touched: findings 2 (`packages/mcp/README.md:72`, outside SECTION 3, needs approval) and 3 (cosmetic JSDoc wrap).
