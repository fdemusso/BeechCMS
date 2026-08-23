# Execution Log — Coverage Exclusion Repair & Config Re-Sync

Branch: `feature/coverage-exclusion-repair` (from `kanban-drag-stabilization`, NOT `devs` — see deviation note).

## Deviation from CONTEXT.md step 0
Contract says branch from `devs`. Rejected: the API reorg commit (`5035ec7 chore: riorganizzata la cartella src delle api`) that the sprint plan's 15 relocated paths depend on exists only on `kanban-drag-stabilization` (25 commits ahead of `devs`). Branching from `devs` made all 15 target paths report DEAD. Branched from `kanban-drag-stabilization` instead — matches the plan's own SECTION 1, which states the sprint fixes *that* branch's failing gate.

## SECTION 6 — ACCEPTANCE CRITERIA
- [x] All 15 drifted `apps/api/vitest.config.ts` exclude globs repaired to existing paths; dead `src/middleware.ts` glob removed.
- [x] Zero exclude glob in `apps/api/vitest.config.ts` points at a non-existent file (Validation step 1 passes).
- [x] `sonar-project.properties` `sonar.coverage.exclusions` fully rebuilt; every entry has a mirror in an `apps/{api,dashboard}/vitest.config.ts` exclude, and vice versa.
- [x] `content-kanban` presentational components + React hooks excluded in BOTH `apps/dashboard/vitest.config.ts` and sonar.
- [x] `utils/fractional.ts` and `utils/kanban-card-display.ts` are NOT excluded in either config (confirmed still measured in coverage report).
- [x] `scripts/test-coverage-diff.mjs` NOT modified.
- [x] No `.ts`/`.tsx` source file created or modified — diff limited to the three config files (verified via `git diff --stat`).
- [x] `pnpm beech test --diff` runs; relocated glue excluded and pure utils measured. Gate still reports 52/187 files below threshold — legitimate untested new-code logic, explicitly deferred to Sprint 2 (OUT OF SCOPE §7), not config drift.

## Known pre-existing drift found, NOT fixed (out of scope)
`apps/dashboard/vitest.config.ts` / sonar still list dead `src/features/fields/**` per-file globs — the `fields` module was promoted to `src/components/fields/` in an unrelated earlier refactor. Plan Task 2/3 did not include repairing this; flagging per the plan's own caveat in SECTION 4 Task 3.

## Validation Outputs

### 1. Dead-path check (15 repaired globs)
```
ALL_EXIST
```

### 2. API coverage — relocated glue excluded, not 0%
```
Statements   : 88.57% ( 3140/3545 )
Branches     : 76.73% ( 1834/2390 )
Functions    : 92.06% ( 545/592 )
Lines        : 90.44% ( 2839/3139 )
```
`fixed-clock.ts`, `widget.ts`, `search.ts`, `storage-utils.ts`, `fts-sync.ts`, `demo-data-sql.ts`, `sequential-id-generator.ts`, `in-memory-activity-logger.ts`, `seed-layout.repository.d1.ts`, `execution-context-scheduler.ts` — absent from the coverage table (excluded), confirmed via grep.

### 3. Dashboard coverage — kanban hooks excluded, pure utils measured
```
Statements   : 78.07% ( 1513/1938 )
Branches     : 70.29% ( 1112/1582 )
Functions    : 75.66% ( 398/526 )
Lines        : 80.28% ( 1376/1714 )
```
`fractional.ts` (0%, measured) and `kanban-card-display.ts` (55.8%, measured) present in report. `use-kanban-drag.ts`, `use-kanban-board.ts`, `use-kanban-autoscroll.ts`, `content-kanban/components/**`, `content-kanban/hooks/**` absent (excluded).

### 4/5. `pnpm beech test --diff`
135 files pass, 52 fail (pre-existing untested new-code logic, Sprint 2 scope). None of the newly-excluded kanban glue files appear among the 187 evaluated files.

### 6. `sonar-project.properties` sanity
Last line has no trailing continuation backslash, no orphan comma — valid.

## Graph Sync
`graphify update .` executed — 6125 nodes, 11876 edges, 695 communities.
