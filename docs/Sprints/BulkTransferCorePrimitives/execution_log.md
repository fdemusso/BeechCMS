# Execution Log — BulkTransferCorePrimitives

Branch: `feature/bulk-transfer-core-primitives` (from `devs`). Not committed.

## Rework Pass (verdict: REWORK_CODE)

Fixed the single finding from `review_report.md`: deleted stray untracked `issue74_update.md` (repo root, unrelated to this sprint, no git history). No code touched. Re-ran full SECTION 5 validation chain below — all green, same as prior pass.

## SECTION 6 — ACCEPTANCE CRITERIA

**Contract & typing**

- [x] `JobContext.queue` is declared **required** (`queue: IQueueService`), not optional.
- [x] All six `JobContext` construction sites supply `queue`; `pnpm --filter @beechcms/api run type-check` passes.
- [x] `queue.middleware.ts` resolves the `InMemoryQueueService` self-reference by assignment after construction, with the comment explaining why, and does **not** make the field optional to avoid it.
- [x] `queue-consumer.ts` falls back to `NoOpQueueService` when `env.QUEUE` is absent — it never throws and never leaves `queue` undefined.
- [x] No `any` anywhere in the new module or its tests. No non-null assertion (`!`) introduced.
- [x] Every intra-core import carries the explicit `.js` extension; `pnpm --filter @beechcms/core run build` passes.

**Zero-dependency rule for core**

- [x] `packages/core/package.json` is **unchanged**.
- [x] `packages/core/src/transfer/**` imports only from `../engine/types.js` and its own siblings.
- [x] No file in `transfer/` references `D1Database`, builds a SQL string, or names a physical column not derived from `seed.branches[].alias` or `EXPORT_SYSTEM_COLUMNS`.

**Behaviour**

- [x] `checkFormatCompatibility` returns `compatible: true` for every seed when format is `ndjson`.
- [x] `checkFormatCompatibility(seed, 'csv')` is incompatible for `relation`/`repeater`/`tags`/`json`/`file multiple:true`, naming every offender.
- [x] CSV round-trip exact for a value containing a comma, a double quote, and an embedded newline.
- [x] `CsvRowReader` and `LineReader` produce identical output whether fed in one `push()` or split mid-quoted-field.
- [x] No decode path throws on malformed input; every failure surfaces as `{ ok: false, code }`.
- [x] `toImportPayload` never emits `id`, `created_at`, `updated_at`, `deleted_at` in `data`.

**Tests**

- [x] Four new suites at `packages/core/src/transfer/*.test.ts`, unit tier, SPDX header present, `pnpm lint:tests` passes.
- [x] Every `it()` passes in isolation.
- [x] Error-path tests assert `code`, never message text.
- [x] Hand-rolled `Seed` fixtures (built via `defineSeed`, valid `br_XX` ids) used only because `@beechcms/testing`'s canonical seeds are unreachable from `packages/core` without a circular dependency; `row-mapping.test.ts`'s fixture covers a shape not needed from canonical data.
- [x] The quoted-newline CSV case carries a regression-guard comment.
- [x] No `it.only` / `it.skip` / `describe.skip`.

**Scope discipline**

- [x] `git diff --stat devs` touches only: `packages/core/src/transfer/**`, `packages/core/src/queue/queue.interface.ts`, `packages/core/src/index.ts`, and the four `apps/api` files listed in SECTION 3.
- [x] Zero files under `apps/dashboard/`, `apps/api/migrations/`. Zero changes to `apps/api/wrangler.jsonc`. Zero new routes.

## Note — test-fix, not code-fix

`csv.test.ts`'s `hasUnterminatedQuote()` case initially failed because the test called `end()` (which resets `inQuotes` via `completeRow()`) before checking the flag. The plan's `CsvRowReader` source was implemented byte-for-byte as specified; the test's call order was wrong. Fixed by asserting `hasUnterminatedQuote()` right after `push()`, before `end()`.

## Note — pre-existing failures, out of scope

- `pnpm type-check` (whole workspace): `@beechcms/dashboard#type-check` fails on `src/test/setup.ts` (unused `vi`/`React`). Confirmed pre-existing on `devs` (reproduced with changes stashed). Dashboard is untouched in this sprint (S4).
- `pnpm beech test --diff`: coverage gate flags `apps/api/src/shared/jobs/queue-consumer.ts` as "Untested" under its unit-tier heuristic. The file has real behavioral coverage at the flow tier (`apps/api/test/flow/flow-background-queues.test.ts`, 8/8 passing, exercises `dispatchQueueBatch` including the new `queue` field). No test file for `queue-consumer.ts` was listed in SECTION 3 deliverables — compile-fix only, per plan.

## Validation output (SECTION 5)

```
$ pnpm --filter @beechcms/core run build
$ tsc
(clean)

$ pnpm --filter @beechcms/core run type-check
$ tsc --noEmit
(clean)

$ pnpm --filter @beechcms/api run type-check
$ tsc -p tsconfig.build.json --noEmit
(clean)

$ pnpm type-check
 Tasks:    17 successful, 18 total
Failed:    @beechcms/dashboard#type-check   (pre-existing on devs, unrelated — see note above)

$ pnpm build
 Tasks:    11 successful, 11 total

$ pnpm --filter @beechcms/core run test
 Test Files  49 passed (49)
      Tests  767 passed (767)

$ pnpm beech test --diff
[apps/api][unit]    Test Files  14 passed (14) / Tests  78 passed (78)
[apps/api][integration]  Test Files  6 passed (6) / Tests  44 passed (44)
Coverage gate: 1 file flagged "Untested" (queue-consumer.ts) — see note above;
covered instead at flow tier: test/flow/flow-background-queues.test.ts, 8/8 passed.

$ pnpm lint:tests
test placement — OK

$ pnpm lint
 Tasks:    19 successful, 19 total
```

## Graph Sync

`graphify update .` re-executed post-rework. 13809 nodes, 24720 edges, 1138 communities. graph.json/graph.html/GRAPH_REPORT.md updated.
