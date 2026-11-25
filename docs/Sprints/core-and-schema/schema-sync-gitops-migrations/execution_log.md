# Execution Log — Sprint 8: Schema Sync & GitOps Migrations

## Section 6 — Acceptance Criteria

- [x] `beech schema:diff` (no flags) prints per-seed drift and an additive SQL **preview**; exits without writing files.
- [x] `beech schema:diff --write` writes `apps/api/migrations/NNNN_<name>.sql` where `NNNN` is the existing max prefix + 1 (verified: next is `0034`), zero-padded to 4 digits.
- [x] Every emitted `ALTER TABLE … ADD COLUMN` / `CREATE INDEX` / `CREATE TABLE` statement is produced by a `@beechcms/core` generator (`generateAddColumn`, `generateIndexes`, `planCreateSeed`). **No `ALTER`/`CREATE` string is authored in the CLI.** (Botanical Invariant — zero literal `ALTER TABLE`/`CREATE TABLE` outside core imports in new files.)
- [x] Destructive drift (`extra`, `type_mismatch`, `fk_mismatch`) is **never** emitted as executable SQL — only as a commented `-- ⚠` block — and the slug is reported to the user.
- [x] When only destructive drift exists, `--write` writes nothing and instructs the user to author the migration by hand.
- [x] `schemaDiff` reuses `diffSeed` and `getExpectedColumns`; no second diff implementation is introduced. `renderSeedDiff` is shared by `seed:load --diff` and `schema:diff` (no duplicated rendering).
- [x] Seeds are processed in `sortSeedsByDependencies` order so FK targets precede referrers in the generated file.
- [x] New code lives only in `@beechcms/cli`; it imports core via the public barrel and `apps/api`/`apps/dashboard` are untouched (VSA).
- [x] `SchemaDiffOptions` is fully typed and exported; `tsc --noEmit` passes with no `any`/`@ts-ignore`.
- [x] `bin/cli.mjs` registers `schema:diff` and documents it in `help()`.
- [x] `pnpm run build`, CLI tests, and lint are all green.
- [x] CI template `docs/ci/github-actions-migrations.yml` and the expanded sprint doc are committed.

## Section 5 — Validation Output

```
pnpm --filter @beechcms/core build
→ $ tsc  (exit 0, no errors)

pnpm --filter @beechcms/cli exec tsc --noEmit
→ (exit 0, no output)

pnpm --filter @beechcms/cli test
→  Test Files  5 passed (5)
       Tests  47 passed (47)
    Duration  2.00s

pnpm --filter @beechcms/cli lint
→ ✖ 27 problems (0 errors, 27 warnings)  [all pre-existing warnings, 0 new errors]

pnpm run build
→  Tasks:    7 successful, 7 total
      Time:  7.43s
```
