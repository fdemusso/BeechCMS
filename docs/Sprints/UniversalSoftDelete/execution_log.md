# Execution Log — UniversalSoftDelete

## SECTION 6 — ACCEPTANCE CRITERIA

- [x] No production file under `packages/core/src`, `apps/api/src` or `apps/dashboard/src` reads `softDelete` from a content seed. Residual `rg` prints nothing. `ISeedRepository.softDelete` untouched.
- [x] `Seed.softDelete` still in the type, optional, `@deprecated`. Existing seeds declaring it type-check and validate.
- [x] `generateCreateTable` / `generateIndexes` / `getExpectedColumns` byte-identical for `softDelete: true`, `false`, absent (`ddl.test.ts`).
- [x] `normalizeSeedDefinition` ignores `softDelete` (`seed-definition-diff.test.ts`).
- [x] `ContentRepository.delete` removed from core, D1 implementation and static mock.
- [x] `PurgeOptions` exported from `@beechcms/core`. `purge` defaults to `'trashed'`; only `reconcilePurgesHandler` passes `'any'`.
- [x] `DELETE /api/content/:slug/:id` soft-deletes on every seed, stamps `deleted_at` from `IClock`, stores `<slug>_old_<ms>`.
- [x] `DELETE …?purge=true` and `bulk-purge` never erase a live entry: 404 / per-id `not-found`, row intact, no ledger object.
- [x] Restore puts back the original slug; conflict lands on `<original>-restored-<id8>`; pre-feature trashed rows keep their slug.
- [x] Ledger still written before the row is deleted (existing guard unchanged, existing unit tests green).
- [x] R2 media untouched by soft delete, deleted only on purge, non-blocking.
- [x] Trash routes no longer answer 409. Permission table unchanged. Read-only and no-grant integration cases pass.
- [x] Widgets, backrefs, search, Public API and relation subqueries exclude trashed rows on seeds with no flag.
- [x] `0038_content_deleted_at.sql` applies cleanly on `pnpm beech db:reset` (10 applied).
- [x] Dashboard shows Trash button and Trash page on every seed; delete dialog defaults to `trash`; Trash slug column shows the original slug.
- [x] Hand-written docs describe the flag as deprecated and ignored. No doc mentions `content-soft-delete-disabled` (remaining hits: gitignored `packages/mcp/resources/**` and `apps/api/assets/**` build output, and historical `docs/Sprints/**` logs).
- [x] `core` build, `tsc --noEmit` (api, dashboard), `pnpm lint`, all test suites and `check-test-placement` green.

## SECTION 5 — VALIDATION

```
pnpm --filter @beechcms/core run build           -> tsc, OK
pnpm --filter @beechcms/core test                -> Test Files 65 passed, Tests 1264 passed
pnpm beech db:reset                              -> 0038_content_deleted_at.sql applied, reset completed
npx tsc --noEmit (apps/api)                      -> 69 errors, identical set to baseline (pre-existing, test files only)
apps/api vitest (unit + flow)                    -> Test Files 185 passed, Tests 2110 passed
apps/api vitest.workers.config.ts (integration)  -> Test Files 83 passed, Tests 516 passed
npx tsc --noEmit (apps/dashboard)                -> No errors found
apps/dashboard vitest                            -> Test Files 181 passed, Tests 1305 passed
pnpm lint                                        -> Tasks: 19 successful, 19 total
pnpm beech test --diff                           -> PASS Tests; PASS Coverage (15/15 changed files meet threshold)
node scripts/check-test-placement.mjs            -> test placement — OK
node scripts/docs-fact-check.mjs                 -> DOCUMENTATION FACT-CHECK PASSED
residual rg #1 (flag reads)                      -> no output
residual rg #2 (disabled-409 symbols)            -> only gitignored build output and docs/Sprints history
graphify update .                                -> 27982 nodes, 40439 edges, 2746 communities
```

## Deviations from the plan (files outside SECTION 3, each forced by the new contract)

- `apps/api/test/helpers/d1-test-database.ts`: the unit D1 helper skips `0030_test_seeds.sql`, so verbatim `0038` failed on the missing `content_products|reviews|tasks`. The helper now drops those lines when applying `0038` (`content_import_jobs` still gets the column).
- `apps/api/src/features/content/jobs/import-chunk.worker.test.ts`: removed the `delete()` stub (method no longer exists on `ContentRepository`).
- `apps/api/test/flow/flow-media-assets.test.ts`, `apps/api/src/features/content/test/integration/content-repeater.integration.test.ts`: asserted the old "plain DELETE purges" contract; now trash first, then `?purge=true`.
- `apps/api/src/features/seeds/seeds.test.ts`, `apps/dashboard/.../content-delete-dialog.test.tsx`, `content.repository.d1.test.ts` (bulkUpdate SQL), `packages/core` query/seed-ddl tests: expectations updated to the universal `deleted_at` predicate / `trash` default (`mode="purge"` made explicit in the dialog tests).
- `content.repository.d1.test.ts`: added unit cases for `softDelete`, `restore`, `purge` scope and `findExpiredByRetention`; the changed-line coverage gate of `pnpm beech test --diff` otherwise failed (those lines run only in the unmeasured workerd tier).
- Integration role fixtures use `harness.asUser('viewer')` with a seed-scoped `content:read` assignment (pattern of `backrefs-permissions.integration.test.ts`); `asUser({ role })` does not exist.
- `useContentTrash` keeps its `enabled` option: `use-content-trash.test.ts` still exercises it.
- Not committed (stage contract). Branch: `feature/universal-soft-delete`. PR note: a local DB that ran `beech schema apply` between the code update and `0038` fails with "duplicate column"; fix is `pnpm beech db:reset`. Tests asserting the old hard-delete / 409 behaviour were updated to the new contract (testing_conventions §7.10).
