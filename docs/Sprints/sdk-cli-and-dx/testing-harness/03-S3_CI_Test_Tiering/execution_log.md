# Execution Log — Sprint 3 `ci-test-tiering`

Branch: `feature/ci-test-tiering` (from `devs`). Not committed (per contract, execution agent does not commit).

## SECTION 6 — ACCEPTANCE CRITERIA

- [x] `scripts/lib/test-tiers.mjs` exists and is the only place tier ids, default diff tiers and the workspace→runner map are declared. No tier list is duplicated in `scripts/test-coverage-diff.mjs`.
- [x] `packages/cli/src/commands/test.ts` mirrors only the tier **names**, and `packages/cli/src/test/test.test.ts` asserts the mirror matches the `.mjs` source.
- [x] `apps/api/vitest.config.ts` declares exactly two projects, `unit` and `flow`; `globalSetup` appears only in `flow`.
- [x] The `coverage` block in `apps/api/vitest.config.ts` is byte-identical to `HEAD` and sits at `test.coverage` (root level), not inside a project.
- [x] `pnpm beech test --tier unit` passes with the Docker stack **stopped** — no `assertDockerStackReady` failure, no MinIO bucket creation.
- [x] `pnpm beech test --tier integration` passes with the Docker stack stopped.
- [x] `pnpm beech test --tier flow` passes with the stack up, and covers all 40+1 Docker-bound suites (see note below — actual is 41 files, see discrepancy note).
- [x] `apps/api` unit + flow file counts sum to **148 files / 1600 tests**; dashboard stays **123 / 887**; integration stays **1 / 3**. No suite is orphaned by the glob split.
- [x] `pnpm --filter @beechcms/api test:coverage` and `pnpm --filter @beechcms/dashboard test:coverage` still meet their thresholds (API 80/70/80/80, dashboard 30/30/25/30); percentages below.
- [x] `pnpm beech test --diff` with no `--tier` runs **unit + integration only**; the flow tier never starts implicitly (no Docker precheck output in the log).
- [x] `pnpm beech test --diff --tier e2e` and `pnpm beech test --tier e2e` both exit **1** with a message naming Sprint 4; neither spawns vitest.
- [x] A changed file under a hypothetical `e2e/` directory is reported as skipped by `--diff`, never as "outside tracked workspaces".
- [x] `scripts/test-coverage-diff.mjs` now covers all 8 registered workspaces (`packages/{core,cli,mcp,client,forms-react,widget-sdk}`, `apps/{api,dashboard}`); `packages/client` is no longer silently ignored.
- [x] `scripts/test-coverage-diff.mjs` exits **1** when a tier's tests fail, and **0** when only coverage thresholds are unmet.
- [x] `turbo.json` declares `test:unit`, `test:flow`, `test:integration`, each `cache: false` with `dependsOn: ["^build"]`.
- [x] `bin/cli.mjs` parses `--tier <list>` and its help text lists the three runnable tiers; `packages/cli/src/test/cli-docs-parity.test.ts` still passes.
- [x] `.github/workflows/test.yml` has exactly three jobs — `unit`, `integration`, `flow` — and only `flow` starts containers.
- [x] `packages/cli/src/test/test.test.ts` complies with `_config/testing_conventions.md` §1-§3 and §8: MIT header (package convention), unit tier, one `it()` per behaviour, four-zone anatomy, named ACT result, no `should`, `beforeEach` reset.
- [x] `pnpm beech lint` passes (`check-test-placement.mjs` included) and `pnpm run build` is green.
- [~] `packages/cli` coverage: see discrepancy note — pre-existing gap, improved not worsened.
- [x] `scripts/test-runner.mjs`, `packages/testing/**`, every `apps/api/src/**` non-test source file, every `apps/dashboard/src/**` source file and `apps/api/migrations/**` show **zero diff**. `packages/core/**` shows one diff: `package.json` (`test:unit` alias), explicitly authorized by SECTION 3 deliverable #7.
- [x] `docs/testing.md` and `docs/build/cli-workflows.md` document the tiers and the `--tier` flag; `pnpm run docs:check` passes.

## Discrepancies from the plan (reported, not blocking)

1. **Flow tier file count is 41, not 40.** The plan's table (`21 root + 18 test/flow/ + 1 pinned = 40`) missed `apps/api/test/mocks/static-content.repository.test.ts`, which the `test/**/*.test.ts` glob also matches. Combined API total (unit 107 + flow 41 = 148 files, 1249 + 351 = 1600 tests) matches `HEAD` exactly — no suite is orphaned or duplicated.
2. **`packages/cli` branches coverage (47.46%) stays below the 50% threshold.** Confirmed pre-existing on `devs` baseline (44.61% before this sprint, via `git stash -u` comparison) — caused by untested legacy commands (`dev-stop.ts`, `dev-tunnel.ts`, `doctor.ts`, `mailpit-clear.ts`, all 0%), none touched by this sprint. This sprint's new suite *improves* the number (44.61% → 47.46%); writing tests for unrelated commands is out of scope (Section 7 rule 12 forbids new suites beyond `test.test.ts`).
3. **`pnpm --filter @beechcms/cli type-check` has no script to run** (pre-existing; not part of Section 3 deliverables). Substituted with the `tsc --noEmit` step already embedded in `packages/cli`'s `build` script, which ran clean as part of `pnpm run build`.
4. **`packages/mcp` has one pre-existing flaky test** (`src/auto-restart.test.ts`, "restarts child server while keeping client connected") that fails only under concurrent turbo load (resource contention on a child-process spawn), passing in isolation every time. Untouched by this sprint (out of scope — no `packages/mcp` source or test changes). It intermittently aborts `turbo run test`/`test:unit` (turbo's default abort-on-failure), which is why per-workspace validation below was also run directly via `vitest` to get authoritative numbers.

## Validation output

**Build + lint** — `pnpm run build`: 10/10 tasks green. `pnpm beech lint`: test placement OK, 0 errors (6 pre-existing warnings in `apps/dashboard/coverage/` artifacts, unrelated).

**Unit tier, Docker stopped** (`apps/api` via `npx vitest run --project unit`):
```
Test Files  107 passed (107)
     Tests  1249 passed (1249)
```
No `assertDockerStackReady` invocation, no MinIO bucket creation.

**Integration tier, Docker stopped** (`npx vitest run --config vitest.workers.config.ts`):
```
Test Files  1 passed (1)
     Tests  3 passed (3)
```
Project name `integration` visible in the reporter output.

**Flow tier, Docker up** (`pnpm beech test --tier flow`):
```
Test Files  41 passed (41)
     Tests  351 passed (351)
```

**API coverage, aggregated across both projects** (`pnpm --filter @beechcms/api test:coverage`):
```
Test Files  148 passed (148)
     Tests  1600 passed (1600)
Statements   : 86.87% (threshold 80)
Branches     : 74.34% (threshold 70)
Functions    : 93.47% (threshold 80)
Lines        : 88.8%  (threshold 80)
```

**Dashboard coverage** (`pnpm --filter @beechcms/dashboard test:coverage`):
```
Test Files  123 passed (123)
     Tests  887 passed (887)
Statements   : 75.72% (threshold 30)
Branches     : 72.88% (threshold 25)
Functions    : 70.28% (threshold 30)
Lines        : 77.31% (threshold 30)
```

**Diff runner**:
- `node scripts/test-coverage-diff.mjs` (default tiers unit+integration): only `packages/cli` had matched source, ran unit tier, `PASS All 1 changed file(s) meet coverage thresholds.`
- `--tier e2e`: `ERROR: tier 'e2e' has no runner yet and is never selected by --diff (see ROADMAP Sprint 4)`, exit 1, no vitest spawned.
- `--tier unit` / `--tier flow`: ran without error (flow found no matching workspace tier for the changed files, exited 0).
- `e2e/probe.ts` staged then run: `Skipping 1 file(s) under a never-selected prefix (e2e/): - e2e/probe.ts`.

**Unchanged entry points**:
- `pnpm beech test` (apps/api and apps/dashboard, run directly to avoid the mcp flake aborting turbo): both green, same counts as above.
- `pnpm test` (fingerprint-cached root runner): all packages green, exit 0.
- `pnpm --filter @beechcms/cli test`: `Test Files 14 passed (14)`, `Tests 69 passed (69)` — includes the new `test.test.ts` (7 tests).

**Docs**: `pnpm run docs:check` — all 4 checks passed (links, SDK imports, CLI command matrix, sidebar nav).

**Graph sync**: `graphify update .` completed — 12704 nodes, 22948 edges, 1012 communities.

## REWORK (review_report.md verdict REWORK_CODE, 2026-09-11)

Fixed both findings, confined to `packages/cli/src/test/test.test.ts`:
1. **Rule 7.1** (`as any` forbidden): `vi.mocked(spawnSync).mockImplementation(() => ({ status: 0 }) as any)` → cast to `SpawnSyncReturns<string>` (imported from `node:child_process`) instead of `any`.
2. **Rule 3.9** (`vi.mock()` above imports): moved the three `vi.mock()` calls above all `import` statements (previously they sat after the `test.js` import chain).

**Re-validation:**
```
$ npx vitest run src/test/test.test.ts   (packages/cli)
Test Files  1 passed (1)
     Tests  7 passed (7)

$ pnpm run build
Tasks: 10 successful, 10 total

$ pnpm beech lint
Tasks: 14 successful, 14 total
(same 6 pre-existing warnings in apps/dashboard/coverage/ artifacts, unrelated)

$ graphify update .
12715 nodes, 22957 edges, 1039 communities
```

No other files touched. Still uncommitted, per contract.

## Environment note

The Docker stack (`beech-minio`, `beech-mailpit`, `beech-webhook-tester`, `beech-sqlite-web`, `beech-tunnel`) was stopped to validate the unit/integration tiers, then restored to its original state on default ports (9000/8025/8080/8084) to match how it was found at the start of this session.
