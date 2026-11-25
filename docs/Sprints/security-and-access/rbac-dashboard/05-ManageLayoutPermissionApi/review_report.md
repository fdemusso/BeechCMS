# Verdict
PASS

# Findings
No blocking findings. Non-blocking notes for the human gate:

1. `pnpm-lock.yaml` carries one unrelated line (`deprecated: … aws-sdk-js-v3/issues/8393` under `@smithy/…`). It is install churn, not a sprint deliverable (SECTION 3 does not list the lockfile). Drop it from the commit unless intended.
2. `pnpm beech lint` was served entirely from the Turbo cache (19/19 cached). The cache key covers the inputs, so the result is valid, but it is not a fresh run.
3. `dashboard-layout.handler.ts` shows "NOT MEASURED" in changed-line coverage (workerd tier has no V8 coverage). Verified by hand: the 43-test integration suite covers every T6 step and problem type (see Evidence).
4. The execution log records that the plan's base branch `devs` lacks sprints 1–4, so the branch was cut from `feature/widget-permission-requirements`. The work is uncommitted, so I reviewed `git diff HEAD` plus the three untracked files, not `git diff devs...HEAD`.

# Verification Evidence

Independent re-run of SECTION 5 (none taken from execution_log.md):

| # | Command | Observed |
|---|---------|----------|
| 1 | `pnpm run build` in `packages/core` | exit 0 |
| 2 | `vitest run src/dashboard-layout src/rbac` in `packages/core` | 12 files, 240 tests passed |
| 3 | `tsc --noEmit` in `apps/api`, count `error TS` | 51 (= plan baseline). Errors are in seeds/settings/search/rotate-field/invitations tests. Zero in `dashboard-layout*`, `setup/index.ts`, `permission.middleware*` |
| 4 | `vitest run --project unit src/middleware/permission.middleware.test.ts src/shared/db/repositories` | 31 files, 447 tests passed |
| 5 | `vitest run --project flow test/flow/flow-rbac-upgrade.test.ts` | 4 passed |
| 6 | `vitest run --config vitest.workers.config.ts src/features/dashboard-layout src/features/rbac src/features/stats` | 12 files, 133 tests passed |
| 7 | `tsc --noEmit` in `apps/dashboard` | no output (clean) |
| 8 | `vitest run src/features/dashboard src/features/rbac` in `apps/dashboard` | 248 passed |
| 9 | `pnpm beech db:reset`, then the SuperAdmin query | log shows `0039` applied; `COUNT(*)` = 8, `manage_layout` present |
| 10 | `pnpm beech test --diff` | 96 files, 725 tests passed. Coverage PASS (handler NOT MEASURED, see note 3) |
| 11 | `pnpm beech lint` | 19/19 successful (cached, see note 2) |
| 12 | Invariant greps | `layout-locked` 0, `hiddenWidgetCount` 0, `features/rbac` in the dashboard-layout API slice 0, in dashboard feature 0. `.upsert(` in the slice/setup: only `seedRepo.upsert` (`setup/index.ts:304`, the seed repository, not the layout) |

Runtime verification (`pnpm beech dev`, local stack, API on 8789):
- Bootstrapped an admin through `POST /auth/setup` with the developer demo track. This exercised the changed `save('default', …, 'system', null)` call and succeeded.
- Scripted flow as SuperAdmin:
  - GET with nothing stored returned `{layout:null,updatedAt:null}` with `no-store`.
  - PUT without a precondition returned 428 `precondition-required`.
  - PUT `If-None-Match: *` on an empty store returned 200.
  - The same PUT with a row present returned 409 `layout-conflict`.
  - Writer A saved with the current `If-Match` (200, `updatedAt` +1). Writer B with the stale version got 409 with the reload-and-retry `detail`.
  - After reloading, B saved with 200. Two saves in the same second produced strictly increasing versions (…880, …881, …882).
  - DELETE without a precondition returned 428, DELETE with a stale `If-Match` returned 409 and kept the row, DELETE with the current version returned 200, and a following GET returned `{layout:null,updatedAt:null}`.
  - DELETE `If-None-Match: *` with nothing stored returned 200.
- Browser: in Settings → Roles → Create role, "Manage dashboard layout" appears in the System group between "manage roles" and "view analytics".
- Not exercised at runtime: the `manage_layout`-only caller paths (structure gate, locked-widget reconciliation). They are proven against real D1 and the full middleware chain by the workerd integration suite (item 6). The builder 409 toast is covered by its unit test, not clicked through.

Code review and invariant audit:
- T1 migration SQL is verbatim, with the required header comment. `PERMISSIONS` ends with `manage_layout`.
- T2 `LOCKED_WIDGET_TYPE`/`isWidgetLockedFor` match the plan signature and rule order. `filterDashboardLayoutByWidgetRequirements` also drops `core/locked`.
- T3: `isDashboardLayoutEditor` and `FilteredDashboardLayout` (no `hiddenWidgetCount`). The editor projection yields an exact `{id,type:'core/locked',config:{}}` placeholder in place. Readers drop locked widgets, empty sections/pages and `roles`.
- T4: both functions follow the plan rules. Errors name widget ids only. The module imports only `../rbac/*` types, `./widget-requirements.js` and `./dashboard-layout.js` types. The structural diff covers every page field in the schema (`id`, `slug`, `label`, `icon`, `roles`), and widget id uniqueness is enforced earlier by `validateDashboardLayout`, so a placeholder cannot be duplicated.
- T5: the port and the four D1 statements match the plan verbatim. `MAX(now, updated_at+1)` is confirmed at runtime.
- T6: the route row is `anyScope('manage_layout','manage_roles')`. `putLayout` follows steps 1–8 in the specified order, and the five problem types are present. `layout-locked` is gone. The PUT response layout is projected. DELETE has no lock check. `428` was added to `PublicProblemStatus`, which `publicProblem` needs.
- T7/T8: builder API and dialog forward `updatedAt` with no other builder change (SECTION 7 respected). The roles UI metadata/group/en/it entries are present. The reference doc matches the T6 contract, and the scoped-route sections are removed.
- Botanical invariant: no SQL in the handler and no `content_*` or Branch ID involvement. The SQL lives in the migration and the D1 repository behind the core port. No cross-slice imports. Nothing from SECTION 7 was touched.

Test audit (§8 checklist, every test file in the diff):
- Placement, tier and the SPDX header (the repo's per-package variant, MIT in `packages/core`) are correct. Names state behaviour and outcome.
- Integration tests use the harness and real D1, with only the clock faked. Roles and assignments go in by SQL, which §3.8 permits for structural tables.
- One act per test, named results, and status asserted first. Bodies are typed (no `any`), and error identity is asserted by `type`, never by message text.
- Every rejection asserts the row is unchanged or the count is zero. Every write asserts persisted state.
- No `.only`/`.skip`, no timers, no conditional assertions.
- Every T9 behaviour listed in the plan has a matching test.
- No MUST violations.

Acceptance criteria (SECTION 6), checked independently:
- All 16 items hold per the evidence above.
- The flow-rbac-upgrade and d1-role expectation changes are caused by migration 0039. The plan requires them to be explained in the PR.

# Sprint Documentation
- Shipped: `manage_layout` joins the permission vocabulary (migration `0039` rebuilds `role_permissions` with an 8-value CHECK and grants it to SuperAdmin). `manage_layout@*` edits the content of all dashboard tabs. Structure (tabs, order, metadata, roles, first save) and reset stay with `manage_roles@*`.
- The server lock predicate `isWidgetLockedFor` and the pure `@beechcms/core` module `dashboard-layout-editing.ts` carry the rules. Editors receive opaque `core/locked` placeholders (id only). On save, locked widgets are re-injected verbatim from the stored layout, and moving, removing or forging one returns 422.
- Every write is a compare-and-swap. The repository port is now `get`/`save`/`remove` with `expectedUpdatedAt`. PUT and DELETE need `If-Match` or `If-None-Match: *` (428 otherwise, 409 `layout-conflict` on a stale write). `updated_at` strictly increases via `MAX(now, updated_at+1)`, so no `revision` column was added.
- Removed: the interim 409 `layout-locked`, `hiddenWidgetCount` and the unconditional `upsert`. New problem types: `layout-edit-forbidden`, `layout-structure-forbidden`, `layout-conflict`, `precondition-required` (428).
- The builder sends the precondition headers and shows the 409 `detail` as a toast. The reload-and-reapply flow and the builder UX for `manage_layout` editors are ROADMAP entry 6.
- Deviation: the branch was cut from `feature/widget-permission-requirements` rather than `devs`, because `devs` lacks sprints 1–4.
- Known limitations: the version is a timestamp, so a delete followed by a re-create in the same second under a frozen clock could reuse a version. This is accepted by the plan. Custom widget `requires` stays client-only, and a seed-scoped `manage_layout` grant confers nothing. `manage_seeds` is untouched (entry 7).
