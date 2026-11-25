# Execution Log — ContentImportJobs (Sprint 3/4)

## SECTION 6 — ACCEPTANCE CRITERIA

**Boundaries**

- [x] `git diff devs -- packages/` is empty. Zero changes to `@beechcms/core`.
- [x] `git diff devs -- apps/dashboard/` is empty.
- [x] `git diff devs -- apps/api/wrangler.jsonc` is empty.
- [x] No file under `apps/api/src/features/content/` imports from another `features/*` slice.
- [x] No new dependency in any `package.json`.

**Botanical invariant**

- [x] `grep -nE "D1Database|content_[a-z]+|SELECT |INSERT |UPDATE |CREATE TABLE"` over the four new source files returns hits only in the doc-comment/log strings and the single `(context.env)['DB'] as D1Database | undefined` cast.
- [x] Every content read/write goes through `ContentRepository`; every imported row passes `validateAndSanitizeSeedPayload` before `repository.create`.
- [x] Migration's `CREATE TABLE`/`CREATE INDEX` re-derived via `planCreateSeed(IMPORT_JOBS_SEED)` against `packages/core/dist` — byte-identical to `0031_import_jobs_seed.sql`.
- [x] `import_jobs` definition passes `SeedRegistry` construction — verified live: `db:reset:local` applied 0000 → 0030 → 0031 with no errors, seed row present with `status='active'`, `source='code'`.
- [x] No FTS artifact: `SELECT name FROM sqlite_master WHERE name LIKE '%import_jobs%'` lists exactly `content_import_jobs` + 5 named indexes (+2 sqlite autoindexes for the PK/UNIQUE) — no `fts_import_jobs`, no `content_import_jobs_drafts`.
- [x] Migration bumps `seed_meta.registry_version` — verified `1 → 2` after reset.

**Routing and authorization**

- [x] `PROTECTED_ROUTES` gains exactly two rows; `import-jobs` GET row sits above the `/^\/api\/content\/([^/]+)\/[^/]+$/` swallower.
- [x] `permission.middleware.test.ts` passes unmodified (part of the 1327 green unit tests).
- [x] `content.get('/import-jobs/:id', …)` registered above `content.get('/:slug/:id', …)`.
- [x] `OAUTH_SCOPE_ROUTES` untouched.
- [x] A caller neither creator nor holder of `content:create` on the target seed receives 403 — proven by integration test (job-status authorization matrix).

**Behaviour**

- [x] `POST /api/content/:slug/import` answers 202 + `{ jobId }` + `Location`, without reading the file body.
- [x] CSV against a non-flat seed → 400 `content-csv-requires-flat-seed`, no job row.
- [x] Object over `IMPORT_MAX_BYTES` → 413, no job row.
- [x] One `repository.update` after the row loop persists cursor/counts/error report and re-enqueues.
- [x] A re-delivered message for a terminal job is a no-op (unit test).
- [x] R2 object deleted on `completed` and `failed`, after the terminal state write.
- [x] Duplicate unique key → `failed_rows` with `duplicate_slug`, nothing overwritten.
- [x] `error_report` capped at `MAX_JOB_ERROR_SAMPLES`; `failed_rows` keeps counting past it.
- [x] `GET /api/content/import-jobs/:id` never returns `object_key` or `created_by`.

**Typing and tests**

- [x] `pnpm --filter @beechcms/api run type-check` is clean.
- [x] No `any` and no non-null assertion (`!.`) in any new source or test file (grep-verified).
- [x] Unit files beside their source; integration file under `features/content/test/integration/`; `pnpm lint:tests` passes.
- [x] Every new test file carries the BUSL-1.1 header; every `it()` states behaviour+outcome, no "should".
- [x] Four-zone anatomy, one ACT per test, ACT result named, status asserted before body, body typed at call site.
- [x] Every write asserts persisted state; every rejection asserts nothing persisted.
- [x] No sleep/fake timers/`.only`/`.skip`/snapshot of an API response.
- [x] Resume-from-offset test carries the regression-guard comment.
- [x] `pnpm beech test --diff` exits 0.

## Validation — success output

```
$ pnpm --filter @beechcms/api run type-check
$ tsc -p tsconfig.build.json --noEmit
(clean, no output)

$ pnpm type-check   (workspace-wide)
@beechcms/dashboard#type-check fails: pre-existing TS6133 'vi'/'React' unused in
src/test/setup.ts (docs/Sprints/ContentExportStream/review_report.md).
git diff devs -- apps/dashboard/ is empty — confirmed unrelated to this sprint.
Every other workspace package (api, core, testing, cli, mcp, e2e, widget) is clean.

$ pnpm build
Tasks: 11 successful, 11 total

$ pnpm --filter @beechcms/api run test:unit
Test Files  116 passed (116)
Tests  1327 passed (1327)

$ pnpm --filter @beechcms/api run test:integration
Test Files  8 passed (8)
Tests  65 passed (65)

$ pnpm beech test --diff
PASS  All 2 changed file(s) meet coverage thresholds.
[unit] 120 passed / [integration] 65 passed

$ pnpm lint
Tasks: 19 successful, 19 total

$ pnpm lint:tests
test placement — OK

$ pnpm beech db:reset && pnpm beech db:migrate   (apps/api db:reset:local)
[bootstrap-d1] applying 0000_v040_base.sql
[bootstrap-d1] applying 0030_test_seeds.sql
[bootstrap-d1] applying 0031_import_jobs_seed.sql
[bootstrap-d1] done. (3 applied)
Verified: content_import_jobs + 5 indexes, seed row (active/code), registry_version 1→2.

$ graphify update . --force
Code graph updated. 13982 nodes, 25075 edges, 1179 communities.
```
