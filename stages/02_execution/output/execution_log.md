# Execution Log — `ClientRelationSubqueries`

## SECTION 6 — ACCEPTANCE CRITERIA

- [x] `ContentRepository` (core) declares `findParentIdsByRelation`; `D1ContentRepository` and `StaticContentRepository` both implement it; `npx tsc --noEmit` passes in `packages/core`, `packages/client` and `apps/api`.
- [x] No file under `apps/api/src/public/` contains `prepare(`, `jTable(`, `rel_` or any SQL string in production code — verified by grep; all three `graphify path` guards still report no directed path.
- [x] A subquery on a single relation (`category_id`) and on a multi relation (`related_posts`) both return exactly the matching parent entries against real D1.
- [x] A subquery matching nothing returns `200` with `data: []` and `meta.total: 0` — never the unfiltered collection.
- [x] Under `logic: 'OR'`, an empty subquery drops only its own disjunct; all-empty returns an empty page.
- [x] A subquery over a relation `?include=` would refuse (`author_id`) returns `400` with `type: 'invalid-subquery'`; a non-filterable inner field returns `400 invalid-filter`.
- [x] `not_in` on a relation, a nested subquery, more than 2 subqueries, more than 5 inner conditions, and an over-broad result set each return `400`, and the over-broad case is refused, not truncated.
- [x] `X-Schema-Revision` is still emitted on every public response; `?include=` composes with a subquery filter in the same request.
- [x] `relation-include.test.ts` and `public-relation-expansion.integration.test.ts` pass unmodified (the extraction changed no message and no behaviour).
- [x] `.whereRelation()` is typed to the row's own keys, encodes into the existing `filter` parameter, and composes with `.where()/.include()/.select()/.first()/.list()`; `QueryExecutor` and both client factories are unchanged.
- [x] `@beechcms/client` gains no runtime dependency.
- [x] No `any` in production code or tests; new tests follow `_config/testing_conventions.md` (tier, placement, four zones, canonical fixtures, named ACT result).
- [~] `pnpm beech test --diff` passes including coverage thresholds on every changed file — **one pre-existing exception, see Validation Note below.**
- [x] `docs/reference/public-api.md` and `docs/reference/client-sdk.md` document the contract and its limits.

## Validation Note — `content.repository.d1.ts` branch coverage

`pnpm beech test --diff` reports `content.repository.d1.ts` LOW: `branch 64.2%<70%`. Confirmed via `git stash` that this file is **already below the 70% branch gate on `devs`** (63.47%, pre-existing, unrelated to this sprint) — the file is large and several legacy methods (`updateWithKanbanPosition`, edge branches of `findPendingDrafts`, etc.) have no unit coverage. This sprint's own addition, `findParentIdsByRelation`, has full dedicated coverage: 3 unit cases (happy path, empty-targetIds short circuit, non-multi-relation rejection) plus exercise through all 7 new integration tests against real D1. Backfilling the legacy branches to clear the file-wide gate is out of this sprint's scope (SECTION 7) and was not attempted per Rule 2 (Out of Scope Veto) / YAGNI.

## SECTION 5 — VALIDATION (commands and outcomes)

```
$ cd packages/core && npx tsc --noEmit && pnpm run build
✓ clean, `tsc` (build) succeeded

$ cd packages/client && npx tsc --noEmit && pnpm run build
✓ clean, `tsc` (build) succeeded

$ cd apps/api && npx tsc --noEmit && pnpm run build
✓ clean, esbuild + tsc succeeded (dist/index.js 540.1kb)

$ cd apps/api && npx vitest run -c vitest.workers.config.ts src/public/test/integration/public-relation-subquery.integration.test.ts
✓ 7 passed (7)

$ cd apps/api && npx vitest run src/public/relation-include.test.ts src/public/test/integration/public-relation-expansion.integration.test.ts
✓ relation-include.test.ts: 12 passed (12), unchanged
✓ public-relation-expansion.integration.test.ts: 9 passed (9), unchanged

$ pnpm beech test --diff
packages/client: 3 test files / 48 tests passed, coverage PASS
apps/api [unit]: 18 test files / 248 tests passed
  - public-read.ts, query-builder.ts, read-list.ts, relation-include.ts: PASS
  - content.repository.d1.ts: LOW branch 64.2%<70% (pre-existing, see Validation Note)
apps/api [integration]: 4 test files / 28 tests passed, PASS
Overall: FAIL 1/7 file(s) below threshold (pre-existing debt, not introduced by this sprint)

$ graphify update . --force
✓ 13522 nodes, 24135 edges, 1161 communities

$ graphify path "publicReadHandler" "D1ContentRepository"
No directed path found.

$ graphify path "publicReadHandler" "queryD1"
No directed path found.

$ graphify path "readListEntries" "D1BackrefRepository"
No directed path found.
```
