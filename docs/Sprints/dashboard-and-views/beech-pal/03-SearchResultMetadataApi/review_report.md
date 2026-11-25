# Verdict
PASS

# Findings

No blocking findings. The one blocking finding of the previous review round (`flow-rbac-projections.test.ts` missing `updated_at` in its hand-built `content_posts`) is fixed: `apps/api/test/flow/flow-rbac-projections.test.ts:43` now declares `updated_at INTEGER NOT NULL DEFAULT (unixepoch())`, and the flow test passes.

Non-blocking observations, no action required:
- `pnpm beech test --diff` exits non-zero, but only because the unit tier reports "no tests were run for the changed files". The changed `packages/core` files are type-only, so there is nothing to select. Every selected test passed and changed-line coverage is 100% on all six `apps/api` files.
- `full-text-search.test.ts:71` casts the `Pick<IActivityLogRepository, 'lastContentWriters'>` mock with `as unknown as IActivityLogRepository` to call `c.set`. The mock itself is typed as the plan asks and there is no `any`, so this is a narrow, acceptable cast.
- The working tree also carries uncommitted dashboard and `stages/` changes from the earlier BeechPal sprints (`command-palette/`, `App.tsx`, locales). `git diff devs...HEAD` is empty because nothing is committed, so I reviewed the working tree. No dashboard file this sprint's plan names (`search-results-view.tsx`) is modified.

# Verification Evidence

Commands run by me, from the repo root unless noted:
1. `pnpm run build` in `packages/core`: `TypeScript: No errors found`.
2. `npx tsc --noEmit` in `apps/api`: `No errors found`.
3. `npx tsc --noEmit -p apps/dashboard/tsconfig.app.json`: `No errors found`.
4. `pnpm beech lint`: `Tasks: 19 successful, 19 total`.
5. `npx vitest run src/features/search src/shared/db/repositories/d1-search.repository.test.ts src/shared/db/repositories/d1-activity-log.repository.test.ts src/features/settings/settings.handler.test.ts` (apps/api): `PASS (158) FAIL (0)`.
6. `npx vitest run --config vitest.workers.config.ts src/features/search src/features/stats` (apps/api, real D1): `PASS (39) FAIL (0)`.
7. `npx vitest run --project flow test/flow/flow-rbac-projections.test.ts`: `PASS (1) FAIL (0)`.
8. `pnpm beech db:reset`, then `pnpm beech db:migrate`: both succeeded. `wrangler d1 execute DB --local --command "PRAGMA index_list('activity_logs')"` lists `idx_activity_entity`, `idx_activity_created`, `idx_activity_user`.
9. `pnpm beech test --diff`: all selected tests pass, coverage gate `PASS` (all 6 changed files 100% changed-line coverage), overall exit 1 only from the unit-tier "no tests were run" notice for type-only core files (see Findings).
10. `grep -rn "mapFtsRow\b" apps/api/src`: no matches.
11. `graphify update . --force` (30141 nodes), then `graphify affected "mapSearchResultRow()" --depth 2`: `full-text-search.ts`, `search-utils.test.ts`, `full-text-search.test.ts`, `search.ts`, all under `apps/api/src/features/search`.

Code review of the diff (read in full):
- Building blocks match SECTION 4 verbatim: `SearchResultRow.updatedAt` (after `status`), `ContentLastWriter`, `IActivityLogRepository.lastContentWriters` with its JSDoc, `SearchResultItem.updated_at`/`author_name`, `authorDisplayName`, `mapSearchResultRow(row, authorName)`, the migration `CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_logs(entity_id, created_at)` plus banner.
- `d1-activity-log.repository.ts`: one statement, `ROW_NUMBER() OVER (PARTITION BY entity_id ORDER BY created_at DESC, rowid DESC)`, two `json_each(?)` binds, `entity_type = 'content'` literal, no `entity_slug` predicate, empty list returns `[]` before `prepare`.
- `d1-search.query.ts`: `ce.updated_at` follows `ce.status` in the per-seed SELECT, and `NULL as updated_at` sits in the same position in the empty sentinel, so `UNION ALL` stays aligned.
- `full-text-search.ts`: lookup runs after the empty-page early return, in `Promise.all` with `loadDisplayLocaleConfig`, on `pageRows` ids only (not the sentinel row). A rejection is caught, logged as `fullTextSearchHandler: could not load content writers`, and degrades to an empty map. RBAC projection, 400 and empty-perimeter paths, cursor and `total` are untouched.
- `mapFtsRow` and the slice-local `FtsRow` are deleted. Core diff is type-only (+18 lines, no runtime code, no dependency).

Invariant audit: no SQL outside `apps/api/src/shared/db/repositories/`; no cross-slice import (`activityLogRepository` comes through `AppEnv.Variables`); no hardcoded branch field names (`updated_at` is a system column); nothing from SECTION 7 touched (no dashboard file, route table, `search.schema.ts`, public search, or `content_event_log`).

Test audit (§8 checklist): new files carry the SPDX header; the integration test lives in `test/integration/`, uses `createTestHarness` with real D1 and no fake repository, builds entries through the real `POST /api/content/posts`, uses raw SQL only on the structural `activity_logs` table, asserts status before body, finds items by `id` not position, has no `any`, and carries the deliberate-omission comment for RBAC. The `authorDisplayName` matrix has a single cause (name presence). New unit fixture ids are UUIDv4 literals. The `#610` excerpt regression cases are ported to `mapSearchResultRow`. The previous review's `label` nit is resolved: `search-utils.test.ts` now reads `label` per row.

Runtime verification: this sprint changes the API response only (`updated_at` and `author_name` on `GET /api/search`). The real-D1 integration tier (step 6) exercises it end to end: creator name, later update by another account, ignored `trash`, e-mail fallback, and `null` when no authoring row exists. No dashboard behaviour changed, so no UI check applies. I did not start `pnpm beech dev` for a manual request.

Acceptance criteria (SECTION 6): all 12 items verified as above and pass.

# Sprint Documentation

- Shipped: `GET /api/search` items now carry `updated_at` (unix seconds of the live `content_{slug}` row) and `author_name` (display name of the last `create`/`update`/`publish` writer, e-mail when the name is blank, `null` when no such activity exists). This feeds the "status · author · date" description of palette rows in BeechPal sprint 4.
- Author source: `content_{slug}` has no author column, so the writer comes from `activity_logs` through the new `IActivityLogRepository.lastContentWriters`. It runs as one `json_each` statement over the page ids only, keyed on `entity_id` alone, because public-API writes store the entry slug in `entity_slug`.
- Migration `0043_activity_entity_index.sql` adds `idx_activity_entity ON activity_logs(entity_id, created_at)` so the per-page lookup never scans the append-only table. `wrangler.jsonc` needs no entry (`migrations_dir` discovery). The `ui_prefs` migration of sprint 8 moves to `0044`.
- Failure policy: a failing writer lookup logs and returns `author_name: null` with status 200, since author data is decorative.
- Deviation: the plan listed `flow-rbac-projections.test.ts` in validation step 7 but not in SECTION 3. Review round 1 found it red (its hand-built `content_posts` lacked `updated_at`), and the rework added that single column. Its hand-built `CREATE TABLE content_*` still pre-dates the Botanical Engine rule 3.7 and is left for a separate cleanup.
- Known limitations: a draft save logs `update`, so the "last writer" can be someone whose draft is not live yet. `bulk_update` logs the seed slug as `entity_id`, so it never moves the author. Dashboard rendering is deferred to sprint 4.
