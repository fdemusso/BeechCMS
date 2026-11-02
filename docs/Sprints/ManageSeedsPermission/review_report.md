# Verdict
PASS

# Findings
None blocking. The previous report's finding 1 (duplicate `canGlobally('manage_seeds')` test with `as any`) is resolved. Two items remain for the human gate, neither blocking:
- `packages/mcp/README.md:72` still says the seeds routes sit behind "`requireAdmin`" and that read tools "need the same `admin` role". Both statements are false now. The file is outside SECTION 3, so it was correctly left alone. Fix it in ROADMAP entry 9 (docs) or with a one-line edit you approve.
- `seeds.handler.ts` (`GET /:slug` JSDoc): the reworded line exceeds the surrounding wrap width. Cosmetic.

# Verification Evidence

Review target: the uncommitted working tree on `feature/manage-seeds-permission` against `HEAD`. The branch is stacked on `feature/manage-layout-permission-ui`, because `devs` lacks migration `0039`. Every command below was re-run by me after the rework, not copied from `execution_log.md`.

| # | Command | Observed |
|---|---------|----------|
| 1 | `packages/core`: `pnpm run build` | exit 0 |
| 2 | `packages/core`: `vitest run src/rbac src/oauth` | JSON report: 5 files, 36/36 passed |
| 3 | `apps/api`: `npx tsc --noEmit \| grep -c "error TS"` | 51, equal to the executor's baseline (51). I did not re-measure the baseline on a clean tree. Filtering the output for `seeds.`, `settings.handler` and `permission.middleware`: 0 hits |
| 4 | `apps/api`: `vitest run --project unit` on permission.middleware, seeds.test, settings, repositories | 34 files, 661/661 passed |
| 5 | `apps/api`: `vitest run --project flow` on the 5 plan files | 5 files, 18/18 passed, including `flow-rbac-projections` (red before the sprint) |
| 6 | `apps/api`: `vitest run --config vitest.workers.config.ts src/features/seeds src/features/rbac` | 25 files, 160/160 passed, including `seed-access.integration.test.ts` |
| 7 | `apps/dashboard`: `npx tsc --noEmit` | "No errors found" |
| 8 | `apps/dashboard`: `vitest run src/features/settings src/features/shared src/features/rbac` | JSON report: 17 files, 88/88 passed (89 before the duplicate was removed) |
| 9 | `pnpm beech db:reset`, then wrangler `SELECT … SuperAdmin` | 9 rows: content:create/delete/read/update, manage_layout, manage_roles, manage_seeds, manage_users, view_analytics |
| 10 | `pnpm beech test --diff` | PASS. All 20 changed files meet the changed-line threshold. `dashboard-layout.handler.ts` is NOT MEASURED (workerd tier). It is outside this sprint's scope |
| 11 | `pnpm beech lint` | 19/19 tasks successful (18 from turbo cache, inputs unchanged) |
| 12 | Greps (`rg`, excluding dist, assets, node_modules, resources, migrations) | `requireAdmin`: only `packages/mcp/README.md:72`, plus the generated `graphify-out` files. `isDeveloper` in settings/shared: only the two negative assertions at `settings.handler.test.ts:306,319`. `features/rbac` in the seeds slice: 0. `must never` / `deliberately absent`, seeds-related: 0 (the only hit is the unrelated `seed-ddl.test.ts:222`) |

Rework verification (previous finding 1):
- `use-permissions.test.ts` has one `manage_seeds` test, at L85, inside `describe("usePermissions")`. The copy in `describe("hydrateEffectivePermissions")` is gone.
- The kept test builds its mock as `Partial<ReturnType<typeof useMe>>` with a typed cast, with no `as any`. The only `as any` casts left (L62, L78, L102) predate the sprint.

Plan conformance:
- `0040` body, minus comments, is identical to plan T1's verbatim SQL (diff against the plan text: no differences). `git diff master` over `0032*`/`0039*` shows only `0039` added, so `0032` and `0039` are unmodified relative to master.
- `permission.middleware.ts` diff: five `/api/seeds` rows are `perm('manage_seeds', 'global')`. The two layout rows still use `LEGACY_ADMIN`. There is no new requirement kind. The three comments were rewritten as T3 specifies.
- The earlier line-by-line walk of T1-T6 still holds. The rework touched only one test file.
- No SECTION 7 file was touched. The diff has no `users.role`, `legacy-admin` kind, `canEditLayout` or `OAUTH_SCOPE_ROUTES` change, and no new cross-slice import.

Acceptance criteria (SECTION 6): all 14 hold. The `requireAdmin` criterion reads "in source", and the one remaining hit is documentation, so it holds.

**Runtime verification gap (stated, not claimed):** I did NOT run the plan's manual `pnpm beech dev` browser check, and neither did the executor. The real-D1 integration tier proves the API path:
- 200 and 201 for a `manage_seeds@*` editor;
- 403 for a seed-scoped holder, a non-holder and a `users.role='admin'` account without the grant;
- 403 before the body is parsed.

The flow tests cover the `/me` payload. The dashboard Data Models gate is covered only by unit tests (`settings-dialog.test.tsx`). Three steps remain unproven in a browser:
- SuperAdmin sees Data Models → Content Types.
- The roles UI lists "Manage content types" in the System group.
- Assigning a `manage_seeds`-only role to a fresh editor, then removing it and reloading.

# Sprint Documentation

ManageSeedsPermission (ROADMAP entry 7) adds `manage_seeds` as the 9th permission, appended last to the closed vocabulary.
- Migration `0040` rebuilds the `role_permissions` CHECK with the nine values and grants SuperAdmin the new permission. It deliberately revokes the exclusion that migrations `0032` and `0039` recorded (brief rule 29).
- `/api/seeds/*` is now gated in the shared `permissionMiddleware` by `perm('manage_seeds','global')`. The in-slice `requireAdmin` guard is deleted, so the seeds slice performs no authorization and the refusal happens before the body is read.
- The two `/api/schema/:slug/layout` rows keep `legacy-admin` (entry-editor gate, brief §5).
- `PermissionRoleGuard` (OAuth delegation) now requires `manage_seeds` at `'*'`; `manage_users@*` alone is denied.
- `isDeveloper` is removed from `GET /api/settings/me` and from `usePermissions()`. The dashboard Data Models group renders iff `canGlobally('manage_seeds')`. The roles UI gains the permission in the System group with en/it labels.
- Deviations: none from the plan's building blocks or decisions. Plan-scope gap: `packages/mcp/README.md:72` still documents `requireAdmin` (to ROADMAP entry 9). The browser check was not run.
- Known limitations: seed-scoped `manage_seeds` grants are accepted but confer nothing, as for `manage_layout`. The legacy axis (`users.role`, JWT `role` claim, `legacy-admin` kind) is removed in ROADMAP entry 8. The branch is stacked on `feature/manage-layout-permission-ui` because `devs` lacks migration `0039`.
