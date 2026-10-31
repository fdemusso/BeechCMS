# Verdict
PASS

# Findings
No blocking findings. No correctness bug, invariant violation, plan deviation or test-convention `MUST` violation.

Non-blocking notes (for the human gate, none change the verdict):

1. **Work is uncommitted.** `git diff devs...HEAD` is empty: the branch has no commits beyond `devs`. The review was run against the working tree (`git diff HEAD` plus the untracked integration test). The change set must be committed before merge.
2. **SECTION 5 / acceptance criterion "`npx tsc --noEmit` (api) passes" is not literally met.** It reports 51 errors in 12 files, all `*.test.ts` files that are not in this diff (`Env.MEDIA_BUCKET` / `Env.SEARCH_R2` missing, `IIdGenerator.isValid`, `Branch.allowNull`, ...). None of the 12 is a touched file, and a grep for `stats|activity-log|permission.middleware|dashboard-menu` in the tsc output finds 0 hits. The core change is additive and optional, so it cannot cause these errors. They are pre-existing repo debt, not introduced here. I did not run a baseline `tsc` on a clean `devs` checkout.
3. `pnpm beech lint` was served from the Turbo cache (19/19 cache hit, FULL TURBO). The cache key hashes the inputs, so a hit on the current tree is a valid pass, but it is not a fresh execution.

# Verification Evidence

All commands re-run by me; `execution_log.md` was not trusted.

**Plan SECTION 5**
- `cd packages/core && pnpm run build` → `tsc`, 0 errors.
- `cd apps/dashboard && npx tsc --noEmit` → "No errors found".
- `cd apps/api && npx tsc --noEmit` → 51 errors in 12 untouched test files (note 2).
- `pnpm beech test` → exit 0. `@beechcms/api:test`: 95 files / 680 tests passed. Tasks 17/17 successful.
- `pnpm beech lint` → 19/19 successful (cached, note 3).

**Targeted runs**
- `npx vitest run src/middleware/permission.middleware.test.ts src/shared/db/repositories/d1-activity-log.repository.test.ts src/features/settings` → PASS 114, FAIL 0.
- `npx vitest run --config vitest.workers.config.ts src/features/stats` → PASS 27, FAIL 0. This includes the new `stats-scope-isolation` file (15 `it`s) and the unchanged `stats-media`, `stats-recent-activity` and `flow-stats` suites.

**Mutation check (do the new tests actually catch the leak?)**
Backed up `stats.handler.ts` and `permission.middleware.ts`, restored both to `HEAD` (original leaky code), ran `stats-scope-isolation.integration.test.ts`: **12 failed / 3 passed**. For example `media-library` returned 403 vs the expected 200 for a global reader, and `setup-checklist` returned 200 vs the expected 403. The 3 survivors are the "still works for the legitimate caller" cases (admin on setup-checklist, health/cloudflare). Both files were then restored from the backup; `git diff HEAD --stat` shows the same 71 / 14 line changes as before the experiment.

**Runtime verification**
The sprint changes API responses only (no dashboard behaviour). I did not start `pnpm beech dev` or exercise the dashboard by hand. Runtime evidence is the workers-pool integration tier: real D1, full Hono middleware chain (`authMiddleware` → `permissionMiddleware` → handler), real roles and assignments inserted into `user_role_assignments`. The mutation check above shows those tests observe the behaviour change at the HTTP boundary.

**Invariant audit**
- No D1 access outside `@beechcms/core`/repositories. The only SQL edited is `D1ActivityLogRepository` (`activity_logs`, a structural table). The handler still uses `widgetRepository.aggregate()` over `Seed` objects. No physical column names added.
- No cross-slice imports. `stats.handler.ts` adds only `../../shared/rbac/effective-permissions` and `../../shared/rbac/scoped-projection` (shared, legal). The test file imports `factory` and `shared/services/cache`, same as the §9.1 template.
- SECTION 7: `git status` shows nothing under `docs/`, no migration, no dashboard code change (only the one doc comment), no change to `widgetRepository`, `mediaRepository` or `setupChecklistRepository`. `activityVisibility` stays module-private in the stats handler.

**Test audit (§8 checklist, 3 test files)**
- `stats-scope-isolation.integration.test.ts` (new, integration): the SPDX header is byte-identical. The filename and `describe`/`it` names follow §1. Auth goes through `harness.asUser`, entries through `admin.post`, and structural tables (`roles`, `role_permissions`, `user_role_assignments`, `activity_logs`) through SQL (rule 3.8). Time comes from `harness.clock`, with no `Date.now()`, no `any`, no `skip`/`only`, no conditional assertions. Status is asserted first and bodies are typed. `expect(await response.json()).toEqual([])` is `unknown`, not `any`. Matrix `it`s are array-driven and share one cause (rule 1.6). The §6.2 comments are present: the decay-filter coupling, why 403 here vs 200 for `total`, the no-existence-oracle reason, and the LIMIT-15 regression guard. Read-only acts, so zone 4 does not apply.
- `d1-activity-log.repository.test.ts` (unit, mocked `prepare`/`bind`): all 7 plan cases are covered, including the SQL clause and the bind order, plus `countSince` and the `entitySlug` AND `visibility` combination.
- `permission.middleware.test.ts` (unit): one array-driven matrix `it` over the nine rows, using `resolveRouteRule`.

**Plan conformance**
- *Building blocks:* `ActivityLogVisibility` (T1) is verbatim and exported, with `visibility?` on both option interfaces and no runtime code in core. The seven T2 SQL fragments and bind shapes match the table exactly (`json_each(?)`, `1 = 0`, `IS NOT NULL`, parenthesised OR). The `activityVisibility` signature (T3) is verbatim. The nine route rows (T4) are verbatim, in place after the drafts row and ahead of the `:slug` rows, and no catch-all stats row remains.
- *Decisions:* deliverables 1–8 are present and nothing beyond them. The visibility clause is applied before `ORDER BY … LIMIT`. `total` uses `context.get('clock')`. `SystemClock` remains only in `health`/`cloudflare`, which are out of scope.
- *Behaviour:* an out-of-perimeter `?slug=` answers 200 `[]` with `Cache-Control: no-store`. No readable seed answers zeros or `[]` without querying. Null-slug rows need global `manage_users`. `total` forces `includeUnscoped: false`.

**SECTION 6 acceptance criteria**
All 12 items verified independently. Item 12 (`tsc` api) is the pre-existing exception in note 2. The other 11 pass.

# Sprint Documentation
- Closed the stats data-scope leak. `/api/content/stats/{total,breakdown,recent-activity}` now require only authentication; the handlers project the response to the seeds the caller can `content:read` (via `resolveEffectivePermissions` + `filterSeedsByPermission`).
- `media-library` and `unused-media` require global `content:read`, `setup-checklist` requires global `manage_users`, and `health`/`cloudflare`/`storage/sync` keep global `view_analytics`. The old single catch-all stats row is gone.
- New `ActivityLogVisibility` contract in `@beechcms/core`. `D1ActivityLogRepository` enforces it in SQL (`json_each(?)`, one bind for any list length), before `LIMIT`, so the 15-row feed fills from visible rows only. Activity rows tied to no seed (media, schema, security) need global `manage_users`.
- `?slug=` outside the caller's perimeter returns 200 `[]`, never 403, so an unreadable slug is not an existence oracle. `stats/total` now reads time from the injected `IClock`.
- No deviations from the plan. All nine response shapes are unchanged; the dashboard needed only a doc-comment edit.
- Known limitations: `media-library` and `setup-checklist` widgets now show their error state to callers who lack the global grants. Hiding them is ROADMAP entry 4 (`WidgetPermissionRequirements`). `activityVisibility` is private to the stats slice and moves to `shared/` only when a second slice needs it. `apps/api` `tsc` has 51 pre-existing errors in untouched test files.
