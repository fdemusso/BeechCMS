# Execution Log — SoftDeleteBackend (Sprint 1/2)

Branch: `feature/soft-delete-backend` (from `devs`). Not committed — left for review.

## SECTION 6 — ACCEPTANCE CRITERIA

**Engine / contracts**
- [x] `Seed.softDelete?: boolean` and `SelectOptions.trashed?: TrashedMode` are optional; no existing literal needs editing to compile (`pnpm --filter @beechcms/core exec tsc --noEmit` clean).
- [x] For `softDelete !== true`, `generateCreateTable`/`generateIndexes`/`getExpectedColumns`/`buildSelectQuery` are byte-identical to before. Unit tests assert this explicitly (`ddl.test.ts`, `query.test.ts`).
- [x] `buildSelectQuery` defaults to `'active'`.
- [x] `deleted_at` is in `SYSTEM_COLUMNS`.
- [x] `@beechcms/core` has zero runtime deps: `IDeletionLedger` is an interface in `content/deletion-ledger.ts`; no `BeechBucket` import there. R2 impl lives in `apps/api`.
- [x] `packages/core` builds with `tsc` under strict; no `any` in a new signature.

**Repository**
- [x] `softDelete`/`restore`/`purge`/`bulkRestore`/`bulkPurge` all run `beforeDelete`/`afterDelete` — proven by `soft-delete.integration.test.ts`'s hooks test.
- [x] `D1ContentRepository` has no reference to `deleteR2Objects`/R2 media API.
- [x] `findById`, `findBySlug`, `existsSlug`, `getFacets`, `bulkUpdate`, `findParentIdsByRelation` exclude trashed rows for a soft-delete seed.
- [x] `purge` awaits the ledger append, never swallowed.
- [x] `findExpiredByRetention` performs no write, starts no job (no caller wired — verified by grep, only the interface + D1 impl exist).

**HTTP**
- [x] Soft delete leaves R2 untouched; only purge calls `deleteR2Objects`.
- [x] `/:slug/trash` before `/:slug/:id`; five new permission rules precede the generic `/:slug/:id` patterns.
- [x] Every new route has a permission rule (integration test: unmapped case not applicable — all five covered explicitly).
- [x] `DELETE` on a seed without `softDelete` behaves as before + a ledger event (integration test: `DELETE on a seed without softDelete still removes the row`).
- [x] Public API cannot observe a trashed record via list/single-read/include/subquery — four integration assertions in `public-trash-isolation.integration.test.ts`.

**Tooling**
- [x] `pnpm beech schema:diff` reports no drift after materializing a soft-delete seed's table (manually provisioned + verified locally, since the sandbox DB starts with zero active seeds — see Deviations).
- [~] `beech schema plan/apply` adding `deleted_at` to an existing table: verified at the unit level (`generateEnableSoftDelete`, `planExtendSeed` in `seed-ddl.test.ts`, and `migration-writer.ts`'s `deleted_at` branch) — not exercised end-to-end via a live `beech schema apply --manifest` run, since this repo has no `beech.schema.ts` manifest checked in.
- [x] `pnpm beech types check` stays green (verified after `beech types generate` against the same manually-provisioned seed).

**Tests**
- [x] Every new test file: one tier, correct location, byte-identical SPDX header.
- [x] Integration tests use `createTestHarness` with real D1 and real repositories; only `IClock`/`ITokenService` faked (the deletion ledger's R2 dependency is satisfied by a real, Miniflare-simulated `MEDIA_BUCKET` binding added to `vitest.workers.config.ts` — not a hand-rolled fake).
- [x] Fixtures: canonical seeds reused where they fit; new soft-delete-flagged seeds defined locally via `defineSeed` (the capability doesn't exist in the canonical set yet); ids asserted via `UUID_V4_PATTERN`.
- [x] Every write asserts persisted state; rejections leave row counts untouched.
- [x] No `any`, no fake timers, no sleep, no `.only`/`.skip`, no response snapshotting.

**Build**
- [x] `pnpm beech test` passes in full (17/17 tasks, 0 regressions).
- [x] `pnpm beech lint` clean.

## SECTION 5 — VALIDATION OUTPUT

```
$ pnpm --filter @beechcms/core run build        → clean (tsc, no errors)
$ pnpm --filter @beechcms/core exec tsc --noEmit → clean
$ pnpm --filter @beechcms/api  exec tsc --noEmit → clean
$ pnpm --filter @beechcms/cli  exec tsc --noEmit → clean
$ pnpm beech lint                                → 19/19 tasks, 0 errors (pre-existing dashboard coverage-dir warnings only)
$ pnpm beech db:reset && pnpm beech db:migrate   → local D1 rebuilt from scratch, migrations applied
$ pnpm beech test                                → 17/17 tasks passed
    @beechcms/api:test   → 6 test files, 42 tests (integration + unit projects), 0 failed
    @beechcms/dashboard:test → 123 files, 887 tests, 0 failed
$ pnpm --filter @beechcms/core test              → 45 files, 731 tests, 0 failed
$ pnpm --filter @beechcms/cli test               → 24 files, 120 tests, 0 failed
$ pnpm beech schema:diff                         → "✓ No drift." (soft-delete seed, manually provisioned — see Deviations)
$ pnpm beech types check                         → "✓ beech.generated.ts matches live D1." (after `beech types generate`)
```

Manual smoke curl checks from SECTION 5 were not run — no live `pnpm beech dev` stack in this session; covered instead by the integration test suite exercising the same paths through the full middleware chain.

## Deviations from the plan

1. **Fatal-issue numbering (T5).** `seed-validation.ts` already had "Fatal 13/14/15" for other checks; the new `softDelete` type check is Fatal 16, same `{slug, messages, fatal}` shape as the file's real (not the plan's assumed) issue objects.
2. **Deletion-ledger bucket in tests.** `D1ContentRepository.purge` now always awaits `deletionLedger.append`, which needs a working `BeechBucket`. The integration tier (`vitest.workers.config.ts`) had no R2 binding at all. Rather than hand-fake `BeechBucket` in the integration tier (forbidden by `_config/testing_conventions.md` Rule 0.3 — only `IClock`/`ITokenService` may be faked there), I added `r2Buckets: ['MEDIA_BUCKET']` to the Miniflare config — real, simulated Cloudflare infrastructure, the same category as the existing `d1Databases: ['DB']` line, not a test double.
3. **`repository.middleware.ts` ledger wiring.** Built the `R2DeletionLedger` directly via `createBucketProvider(context.env, baseUrl)` inside `repositoryMiddleware`, exactly as T9 specifies, rather than reading `context.get('bucket')` (unset at that point since `storageMiddleware` runs later — order intentionally unchanged per the OUT-OF-SCOPE veto).
4. **`schema:diff` / `types check` local-DB precondition.** The sandbox's local D1 starts with zero active seeds (a pre-existing environment gap, unrelated to this sprint — `master` would show the same "No active seeds found" error on a bare `db:reset`). I manually provisioned one soft-delete-flagged seed + its physical table (via the exact `planCreateSeed` output, matching what `POST /api/seeds` would emit) to exercise both commands, then removed the seed, its table, and the generated `beech.generated.ts` artifact afterward — the working tree is clean of that scratch state.
5. **Fixtures for the two new integration suites.** No canonical seed carries `softDelete: true` yet, so `soft-delete.integration.test.ts` and `public-trash-isolation.integration.test.ts` each define a small number of local seeds via `defineSeed` (Rule 3.5's exception: a capability the canonical set doesn't cover).

## Not verified

- Live `beech schema apply --manifest` flipping an existing table to `softDelete: true` end-to-end (no manifest file in this repo to drive it) — covered instead at the unit level.
- The SECTION 5 manual `curl` smoke sequence against a running `pnpm beech dev` stack.
