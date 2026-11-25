# Verdict
PASS

# Findings
No blocking findings. Non-blocking notes (none is a correctness bug or invariant violation):

1. `apps/dashboard/src/features/content-management/hooks/use-content-trash.ts:26,34` — Task 10 says to remove the `enabled` option if it becomes unused everywhere. No production caller passes it any more (`content-trash.tsx:39` dropped it); only `use-content-trash.test.ts:86` exercises it. The executor kept it on purpose and logged why. Remove it in a follow-up.
2. `apps/api/src/features/content/test/integration/soft-delete.integration.test.ts:10` — the file docblock has a run-on sentence ("Media/R2 cleanup itself stays out of scope — the ledger write …"). Cosmetic.
3. `soft-delete.integration.test.ts:224` — the hooks case runs three acts in one `it()` (testing_conventions Rule 2.1). The structure was already like this before the sprint and the sprint only extended it. Split it when the file is next touched.
4. `apps/api/test/mocks/static-content.repository.ts` — `softDelete` stamps from `Date.now()`, not an `IClock`. This is a unit-tier mock and the plan did not require a clock, so it is acceptable.
5. `apps/api/test/helpers/d1-test-database.ts` — the helper strips the `content_products|reviews|tasks` lines when applying `0038`, because the unit helper skips `0030`. Not in the plan's SECTION 3, but forced by the new migration and logged by the executor. It works, but it is a regex-on-SQL hack.

# Verification Evidence
Diff basis: the executor did not commit, so `git diff devs...HEAD` is empty. I reviewed `git diff devs` (working tree, 58 files) plus the untracked `apps/api/migrations/0038_content_deleted_at.sql`.

Commands I ran myself (SECTION 5):
- `pnpm --filter @beechcms/core run build` → exit 0.
- `pnpm --filter @beechcms/core test` → 65 files, 1264 tests passed.
- `pnpm beech db:reset` → `0038_content_deleted_at.sql` applied, "10 applied", reset completed.
- `npx tsc --noEmit` in `apps/api` → 69 errors, all in test files:
  - They are `Env.MEDIA_BUCKET`/`SEARCH_R2`, `Buffer` and `isValid` typing errors in files this sprint did not touch.
  - One is in `import-chunk.worker.test.ts`: a fake repository that lacks other methods. The sprint's 3-line change there only removes a stub, so it cannot cause that error.
  - No error mentions `softDelete`, `delete`, `purge` or `PurgeOptions`. This matches the executor's baseline of 69.
  - I did not rebuild `devs` to diff the error set; I judged it from the error text.
- `pnpm --filter ./apps/api test` → unit+flow 185 files / 2118 tests passed; workers integration 83 files / 516 tests passed. This includes all 22 cases of `soft-delete.integration.test.ts` against real D1. (The executor logged 2110 for the first set. I got 2118; the difference does not affect the verdict.)
- `npx tsc --noEmit` in `apps/dashboard` → exit 0.
- `pnpm --filter ./apps/dashboard test` → 181 files / 1305 tests passed.
- `pnpm lint` → 19/19 tasks successful.
- `pnpm beech test --diff` → exit 0. Changed-line coverage PASS on all listed files, including `slug-utils.ts`, `ddl.ts`, `query.ts`, `active-clause.ts`, `seed-definition-diff.ts`.
- `node scripts/check-test-placement.mjs` → OK.
- `node scripts/docs-fact-check.mjs` → PASSED.
- Residual rg #1 (flag reads) → 0 matches.
- Residual rg #2 (`content-soft-delete-disabled|SOFT_DELETE_DISABLED|content.trash.disabled`, excluding `docs/api` and `docs/Sprints`) → hits only in `packages/mcp/resources/**` and `apps/api/assets/**`. `git check-ignore` confirms both are gitignored build output.
- Extra greps:
  - `softDelete` in non-test source remains only in the seed lifecycle (`seeds.handler.ts`), the `softDelete()` repository method, the deprecated `types.ts` field, and the `_deprecated` destructure in `seed-definition-diff.ts`.
  - There is no `DELETE FROM content_` and no `.delete(seed` caller left in production.
  - Docs grep for "opt-in", "irreversible on other seeds" and "SEED_FLAGS" is clean in the Task 11 files.

Code review (my own read of the full diff):
- **Core:** the `slug-utils` helpers match the building blocks verbatim. `ddl`, `generateIndexes`, `getExpectedColumns`, `generateEnableSoftDelete`, `isValidColumn`, `planExtendSeed`, `activeCondition`, `buildSelectQuery`, Fatal 16 removal, `SEED_DEFINITION_FLAGS` and the `PurgeOptions` contract all match the plan.
- **D1 repository:**
  - `delete()` is gone.
  - `softDelete` does one `UPDATE` with `deleted_at` from `this.clock` and the `toTrashedSlug` slug.
  - `restore` restores `fromTrashedSlug` and falls back to `<stripped>-restored-<id8>`.
  - `purge` defaults to `'trashed'`, and the ledger-before-delete order is untouched.
  - `findParentIdsByRelation` uses `activeClause`.
- **Handlers:** `delete.ts` has no `useSoftDelete`; R2 cleanup runs only on `forcePurge`; `softDeleted: !forcePurge`. The 409 block and `SOFT_DELETE_DISABLED` are removed. Only `reconcilePurgesHandler` passes `'any'`.
- **Widgets and backrefs:** every widget method (`aggregate`, `growth` both statements, `leaderboard`, `list`, `timeseries`, `distribution` both branches) gets the active predicate via core `activeClause`/`activeCondition`. Backrefs use the core helpers, including the joined count form.
- **Migration:** `0038` is byte-identical to the plan.

Invariant audit:
- No D1 access bypasses core; every predicate and DDL statement comes from core helpers.
- No hardcoded branch field names were added.
- No cross-slice imports. The dashboard imports `fromTrashedSlug` from `@beechcms/core`.
- Nothing in SECTION 7 was touched: no retention sweep or setting, no undo toast, no new route, no `docs/api` edits, and `factory.ts` and the permission table are unchanged.

Test audit (§8): the SPDX header, tier, naming and four-zone structure are respected in the new and changed cases.
- Status is asserted first, bodies are typed, and no `any`, fake timers, `.skip` or `.only` appear in added lines.
- The integration tier uses `FixedClock` through `harness.clock`.
- Every write asserts persisted state, and every rejection asserts that nothing changed (row still live, no ledger object, row still trashed).
- Every required case from Task 12 is present. The only deviation is the read-only role fixture, which follows the `backrefs-permissions` pattern because `asUser({ role })` does not exist; the executor logged this.

Plan conformance:
- Building blocks, decisions and SECTION 4 behaviour hold.
- The deliverables beyond SECTION 3 are the executor's logged deviations, each forced by the new contract: the `d1-test-database.ts` helper, `import-chunk.worker.test.ts`, `flow-media-assets.test.ts`, `content-repeater.integration.test.ts`, `seeds.test.ts` and the dialog tests.

Acceptance criteria (SECTION 6): all 17 items verified independently against the evidence above.

Runtime verification: I did not start `pnpm beech dev` or a browser session, so the dashboard UI is covered only by `tsc` and the unit tests (trash button on every seed, `trash` default mode, original slug in the Trash column).
- API behaviour was exercised at runtime through the workers integration tier (real D1, full Hono middleware chain, R2 ledger): soft delete, the `_old_` slug, restore and its conflict rename, purge from the Trash only, bulk-purge, the read-only and no-grant 403s, search and reconcile.
- The human may want a quick manual look at the Trash page on a seed that never declared `softDelete`.

# Sprint Documentation
- Shipped: universal soft delete (sprint 1 of 3 of Universal Soft Delete & Trash Retention). Every seed has a Trash, `DELETE` always soft-deletes, and the trashed slug becomes `<slug>_old_<ms>` (core `toTrashedSlug`/`fromTrashedSlug`).
- The `softDelete` seed flag is deprecated and read nowhere. It stays optional in the type, Fatal 16 is removed, and toggling it is not a definition change.
- `deleted_at` is stamped from `IClock`. Restore brings back the original slug, or `<original>-restored-<id8>` on conflict. Trashed rows from before this feature keep their slug.
- Purge acts only on a trashed row (`PurgeOptions.trashed`, default `'trashed'`). Only ledger reconciliation passes `'any'`. `ContentRepository.delete` and the 409 `content-soft-delete-disabled` are removed.
- Migration `0038` adds `deleted_at` and its indexes to `content_products|reviews|tasks|import_jobs`. A local DB that ran `beech schema apply` on one of these seeds before `0038` hits "duplicate column"; fix with `pnpm beech db:reset`.
- Widgets, backrefs, search and relation subqueries now exclude trashed rows on every seed.
- The dashboard shows the Trash on every seed, defaults the delete dialog to `trash`, and shows the original slug in the Trash.
- Deviations: a few test/helper files outside SECTION 3 changed because of the new contract; `useContentTrash` still has an unused-in-production `enabled` option.
- Known limitations (deferred): the retention sweep and global retention setting (sprint 2); the instant-delete + undo toast and bulk-modal UX (sprint 3); writes that reference a trashed relation target are still accepted; legacy tables keep their inline slug `UNIQUE`.
