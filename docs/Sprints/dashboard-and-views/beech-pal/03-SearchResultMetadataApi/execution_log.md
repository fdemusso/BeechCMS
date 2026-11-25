# Execution Log — SearchResultMetadataApi

## SECTION 6 — ACCEPTANCE CRITERIA

- [x] `SearchResultRow.updatedAt`, `ContentLastWriter`, `IActivityLogRepository.lastContentWriters`, `SearchResultItem.updated_at`/`author_name`, `authorDisplayName`, new `mapSearchResultRow` signature match SECTION 4.
- [x] Core changes are type-only.
- [x] `0043_activity_entity_index.sql` holds the one `CREATE INDEX IF NOT EXISTS` plus banner. No `wrangler.jsonc` edit.
- [x] Every `GET /api/search` item carries `updated_at` and `author_name`.
- [x] `author_name` = last `create`/`update`/`publish` writer; name, else e-mail, else `null`; `trash` does not change it.
- [x] Lookup keys on `entity_id` only, one statement, `json_each` binds, page ids only, skipped on an empty page.
- [x] A failing writer lookup degrades to `author_name: null`, search answers 200.
- [x] RBAC projection, 400 / empty-perimeter paths, cursor, `total`, route-table row unchanged.
- [x] No SQL outside `apps/api/src/shared/db/repositories/`. No cross-slice import.
- [x] `mapFtsRow` and the slice-local `FtsRow` removed; `#610` tests run against `mapSearchResultRow`.
- [x] No file under `apps/dashboard` modified; dashboard `tsc` passes.
- [x] All SECTION 5 commands pass. Step 9 unit-tier "FAIL" is test selection only (type-only core files), no assertion failed.

## REWORK (review finding 1)

- `apps/api/test/flow/flow-rbac-projections.test.ts`: added `updated_at INTEGER NOT NULL DEFAULT (unixepoch())` to the hand-built `content_posts`. Nothing else touched.
- `vitest run --project flow test/flow/flow-rbac-projections.test.ts`: PASS (1) FAIL (0).
- `graphify update . --force`: done.

## SECTION 5 — VALIDATION

1. `pnpm run build` (packages/core): pass.
2. `npx tsc --noEmit` (apps/api): No errors.
3. `npx tsc --noEmit -p apps/dashboard/tsconfig.app.json`: No errors.
4. `pnpm beech lint`: 19/19 tasks successful.
5. API unit run (search, d1-search, d1-activity-log, settings): PASS (158) FAIL (0).
6. `vitest.workers.config.ts src/features/search src/features/stats`: PASS (39) FAIL (0).
7. `--project flow test/flow/flow-rbac-projections.test.ts`: PASS (1) FAIL (0) after rework (was FAIL: fixture lacked `updated_at`).
8. `pnpm beech db:reset` + `db:migrate`: `0043` applied; `PRAGMA index_list('activity_logs')` lists `idx_activity_entity`.
9. `pnpm beech test --diff`: integration tier PASS (748/748), changed-line coverage PASS (100%). Unit tier reports FAIL only for the two type-only `packages/core` files ("no tests were run for the changed files"). Failure is test selection, not an assertion.
10. `grep -rn "mapFtsRow\b" apps/api/src`: no matches (stale doc reference in `d1-search.repository.ts:26` retargeted to `mapFtsRowToResultRow`).
11. `graphify update . --force`; `graphify affected "mapSearchResultRow()" --depth 2`: only files in `apps/api/src/features/search`.
