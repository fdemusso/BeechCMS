# Execution Log — `ContentExportStream`

Branch: `feature/content-export-stream` (from `devs`).

## SECTION 6 — ACCEPTANCE CRITERIA

**Contract & typing**

- [x] `PublicProblemInput['status']` includes `413`; nothing else in `problem-details.ts` changed.
- [x] `Env.EXPORT_MAX_ROWS` is optional (`?: string`); `resolveExportMaxRows` returns `DEFAULT_EXPORT_MAX_ROWS` for unset, empty, non-numeric or non-positive values and never throws.
- [x] `createContentExportStream` takes `Pick<ContentRepository, 'findMany'>`, never `D1Database`, never a Hono `Context`.
- [x] No `any` in either new module or either new test file. No non-null assertion (`!`) introduced.
- [x] `pnpm --filter @beechcms/api run type-check` passes.

**Botanical & VSA invariants**

- [x] `packages/core/` unchanged — `git diff devs -- packages/` is empty.
- [x] No new dependency — `apps/api/package.json` and `packages/core/package.json` unchanged.
- [x] Neither new file contains a SQL string, a `content_*` table name, or a `D1Database` reference (the only match is a comment stating the producer never sees one).
- [x] Every emitted column comes from `exportColumns(seed)`; the only literal column name is `'id'` (keyset cursor).
- [x] Neither new file imports from another slice under `apps/api/src/features/`.
- [x] Field filtering goes through the existing `applyVisibility`; no second field-filter written.

**Behaviour**

- [x] `format` omitted defaults to `ndjson`, never 400s.
- [x] `?format=csv` on a seed with `relation`/`repeater`/`tags`/`json` (or `file multiple:true`) returns `400 content-csv-requires-flat-seed` with one `errors[]` entry per offending branch.
- [x] Unknown format returns `400 content-invalid-export-format`.
- [x] Unknown seed returns `404 content-seed-not-found`.
- [x] Over-cap returns `413 content-export-too-large`, `Content-Type: application/problem+json`, zero exported rows.
- [x] Stream orders by `id ASC`, keyset-paged; no `offset > 0` ever passed to `findMany`.
- [x] Keyset filter is ANDed with the caller's groups, never replaces them.
- [x] CSV begins with the `exportColumns` header; NDJSON has no header.
- [x] Empty result set returns `200` (CSV header alone / empty NDJSON body).
- [x] Trashed entries never appear (engine default `trashed: 'active'` relied on).
- [x] Response headers correct: `Content-Type`, `Content-Disposition`, `Cache-Control: no-store`.
- [x] Route requires `content:read` on the seed; missing scope → `403`; unauthenticated → `401`.

**Tests**

- [x] `export-stream.test.ts` unit tier, colocated, SPDX header; `content-export.integration.test.ts` integration tier under `test/integration/`. `pnpm lint:tests` passes.
- [x] Integration suite builds its world through `createTestHarness`, seeds via `POST /api/content/:slug`, never writes `INSERT`/`CREATE TABLE content_*` directly (except the pre-existing resurrection-scenario precedent in the unrelated soft-delete suite).
- [x] Fixtures from `CANONICAL_SEEDS`/`CANONICAL_USERS`; hand-rolled seeds built with `defineSeed()`, valid `br_XX` ids, used only for shapes canonical set doesn't cover (masked branch, `softDelete: true`).
- [x] Stub entry ids in the unit suite carry UUIDv4 format.
- [x] Error-path tests assert status + problem `type` (+ `errors[].field` where relevant), never message text.
- [x] Keyset-paging test carries the regression-guard comment naming the LIMIT/OFFSET defect.
- [x] `EXPORT_MAX_ROWS: '2'` override carries an explanatory comment.
- [x] Every `it()` passes in isolation; no ordering dependency.
- [x] No `it.only`/`it.skip`/`describe.skip`. No `try/catch` around an act; stream-error case uses `rejects.toThrow`.

**Scope discipline**

- [x] Diff touches exactly the 8 sprint files: `export-stream.ts`, `handlers/export.ts` (new source), `export-stream.test.ts`, `test/integration/content-export.integration.test.ts` (new test), `index.ts`, `constants.ts`, `permission.middleware.ts`, `problem-details.ts`, `types.ts` (modified), plus `docs/reference/internal-content.md`.
- [x] Zero files under `packages/`, `apps/dashboard/`, `apps/api/migrations/`. Zero change to `apps/api/wrangler.jsonc`.
- [x] `OAUTH_SCOPE_ROUTES` unchanged.
- [x] Exactly one row added to `PROTECTED_ROUTES`, above the generic `GET /^\/api\/content\/([^/]+)\/[^/]+$/` rule.
- [x] Exactly one route added to `content/index.ts`, above `content.get('/:slug/:id', …)`.

## Validation output

```
$ pnpm --filter @beechcms/api run type-check
$ tsc -p tsconfig.build.json --noEmit
(clean, no output)

$ pnpm type-check
...
@beechcms/dashboard:type-check: src/test/setup.ts(5,1): error TS6133: 'vi' is declared but its value is never read.
@beechcms/dashboard:type-check: src/test/setup.ts(6,1): error TS6133: 'React' is declared but its value is never read.
 ERROR  @beechcms/dashboard#type-check: exited (2)
# Known pre-existing failure, not caused by this branch — confirmed via
# `git diff devs -- apps/dashboard/` = empty (0 lines). Every other package
# (@beechcms/core, @beechcms/api, @beechcms/client, etc.) passed.

$ pnpm build
(dashboard, core, api all built successfully as part of the above run)

$ pnpm --filter @beechcms/api run test
 Test Files  155 passed (155)
      Tests  1663 passed (1663)
 Test Files  7 passed (7)
      Tests  56 passed (56)
(includes export-stream.test.ts: 8/8, content-export.integration.test.ts: 12/12)

$ pnpm beech test --diff
[unit] Test Files 25 passed (25) / Tests 272 passed (272)
[integration] Test Files 7 passed (7) / Tests 56 passed (56)
Coverage gate: apps/api/src/public/problem-details.ts flagged LOW (pre-existing
file-wide coverage, unrelated to the one-line status-union widening — no new
branch was introduced). Exit code 0.

$ pnpm lint:tests
  test placement — OK

$ pnpm lint
 Tasks: 19 successful, 19 total
```

## Runtime verification (`pnpm beech dev`)

Verified against the local dev D1 (existing seeds, not the canonical test fixtures):

- `GET /api/content/clienti/export?format=csv` (flat seed) → `200`, `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="clienti.csv"`, `Cache-Control: no-store`, header row `id,slug,status,created_at,updated_at,name,email,company,tier,account_status,mrr` followed by data rows.
- `GET /api/content/changelog/export` (no `format`) → `200`, `Content-Type: application/x-ndjson...`, one JSON object per line.
- `GET /api/content/abbonamenti/export?format=csv` (has a `relation` branch) → `400 content-csv-requires-flat-seed`, `errors[].field = "customer_id"`.
- `GET /api/content/not-a-seed/export` → `404 content-seed-not-found`.
- `GET /api/content/changelog/export?format=xml` → `400 content-invalid-export-format`.
- No `Authorization` header → `401`.

**Pre-existing defect discovered, out of scope for S2.** `GET /api/content/changelog/export?format=csv` returns `200` with the `features` column rendered as the literal string `[object Object]`. Root cause: `changelog.features` is a `richtext` branch (a structured Tiptap document object at runtime), but `NON_FLAT_BRANCH_TYPES` in `packages/core/src/transfer/flat-seed.ts` (shipped and reviewed in S1) does not include `'richtext'`, so `checkFormatCompatibility` wrongly classifies it as CSV-flat, and `toCsvCells`'s `String(value)` then stringifies the object. This is a classification gap in S1's `packages/core` primitives, not in anything S2 wrote — S2's own producer and handler contain no branch-type logic beyond what `exportColumns`/`checkFormatCompatibility` already decide. Per SECTION 7 ("Any change to `packages/core/`... not a licence to edit core"), this was **not fixed here**. None of the canonical or sprint-required seeds exercise a `richtext` branch under CSV, so no acceptance criterion or test in this sprint is affected. Flagging for the roadmap: `NON_FLAT_BRANCH_TYPES` likely needs to add `'richtext'`.

No `pnpm beech db:migrate` or `pnpm beech db:reset` was run — S2 requires neither.
