# Verdict
PASS

# Findings
No blocking findings. Two non-blocking notes, neither requires rework:

1. `apps/api/src/features/content/test/integration/trash-retention.integration.test.ts` — `exposes the seed's own retentionDays over the global value` performs two GETs (`ret_override`, `ret_never`) in one `it()`. Strictly this is two ACTs (testing_conventions Rule 2.1). The plan's Task 10 specifies it as one case, and the two arrangements are identical, so I treat it as a Rule 1.6 matrix. Splitting it would be tidier.
2. `apps/api/src/shared/db/repositories/site-settings.repository.d1.ts` (`parseTrashRetentionDays`) — `Number(raw)` also accepts stored strings such as `'1e2'` or `'0x10'` as valid retention values. Only the API writes this key and it always stores a decimal string, so it is unreachable in practice.

# Verification Evidence

Scope note: the sprint-2 work is **uncommitted** on `feature/universal-soft-delete` (the execution log says so). `git diff devs...HEAD` therefore contains only sprint 1 and the planning commits (78 files), so I reviewed the working tree against HEAD (`git status`, 21 modified + 8 untracked files) plus the new files read in full.

Commands re-run by me (SECTION 5):
- `pnpm --filter @beechcms/core run build` → `tsc` clean.
- `pnpm --filter @beechcms/core test` → 66 files, 1270 tests passed.
- `npx tsc --noEmit` in `apps/api` → 69 errors, equal to the baseline count. I grouped them by file: all are in pre-existing test files (seed-media-purge, flow-rbac-upgrade, settings-storage, semantic-search, …). None are in a file touched by this sprint.
- `pnpm --filter ./apps/api test` → exit 0. Unit+flow 186 files / 2135 tests passed; workerd integration tier 85 files / 530 tests passed.
- `npx tsc --noEmit` in `apps/dashboard` → 0 errors.
- `pnpm --filter ./apps/dashboard test` → 181 files / 1305 tests passed.
- `pnpm lint` → "ESLint: No issues found".
- `pnpm beech test --diff` → exit 0. "all 18 changed file(s) meet the changed-line threshold" (`retention-sweep.ts` 34/34, `content.repository.d1.ts` 6/6, `site-settings.repository.d1.ts` 4/4). 2 files (`trash.ts`, `delete.ts`) are only measurable on the workerd tier; `trash.ts` is exercised by `trash-retention.integration.test.ts` (3 GET cases, passing).
- `node scripts/check-test-placement.mjs` → OK. `node scripts/docs-fact-check.mjs` → PASSED.
- `rg "No scheduler is wired|NOT wired to any scheduler|positive integer >= 1" …` → 0 matches.
- `graphify update . --force` was not re-run: it is a graph refresh, not a verification gate, and does not affect the verdict.

Code review and plan conformance (read directly):
- Building blocks match the plan verbatim: `DEFAULT_TRASH_RETENTION_DAYS=14`, `MAX_RETENTION_DAYS=36500`, `isValidRetentionDays`, `resolveRetentionDays` (`packages/core/src/content/retention.ts`); the `findExpiredByRetention(seed, retentionDays, now, limit)` signature in core, D1 and the static mock; the sweep's constants, interfaces and `isRetentionSweepTick`; error code `settings-invalid-trash-retention` with the planned problem shape.
- Sweep behaviour (`retention-sweep.ts`): settings read once and not caught, so a failure propagates and nothing is purged. Effective `0` skips with no repository call. The shared 25-attempt budget is passed as the next seed's limit. A query throw is recorded with `id: null`. `purge(seed, id)` is called with no options. `EntryNotFoundError` is skipped silently. R2 cleanup failures are warned and leave the id in `purged`. No hooks, automations or activity log.
- `index.ts` `scheduled()`: the sweep runs only on `isRetentionSweepTick`, inside its own `ctx.waitUntil` + try/catch, on a **new** `D1ContentRepository` built with `R2DeletionLedger(bucket)` and `SystemClock`. The ledger-less repository used for automations is not reused. Seed-media-purge and `runCronAutomations` are untouched.
- Settings: D1 reads an absent key, an empty/whitespace value or a malformed value as 14, and a stored `'0'` as 0. PUT validates before any write, rejects `null`, and persists numbers as decimal strings. GET exposes the key.
- Trash list: the settings read is inside the existing `try`, so a failure goes to `handleContentDatabaseError` with no default substituted.
- Invariants: no SQL in the sweep. The only SQL change is the parameter swap in the repository's `findExpiredByRetention`. No hardcoded field names (media keys go through `extractMediaKeysFromData`). No cross-slice import (grep on `jobs/retention-sweep.ts`, `trash.ts` and `settings.handler.ts` found none). The only dashboard hit for `findExpiredByRetention` is an existing comment.
- SECTION 7: `git status` shows no change under `apps/dashboard`, `apps/api/migrations`, `factory.ts` or `permission.middleware.ts`. There is no new ledger reason, route or migration. `docs/api/**` is not touched. The `ROADMAP.md` edit is a planning-stage status update, not code.
- Docs (`docs/features/trash.md`, `docs/build/schema-modeling.md`, `docs/build/schema-manifest.md`) describe the sweep, the global setting, the seed override, `0`, the failed-read behaviour and the `retentionDays` trash field. I read the trash.md Retention section in full.

Test audit (§8 checklist, every test file in the diff):
- Tier and placement: unit files sit next to the source (`retention.test.ts`, `retention-sweep.test.ts`). Integration files sit in their own slice's `test/integration/`. The sweep integration uses real D1, a real R2 binding and a real `R2DeletionLedger`, and fakes only `harness.clock`. Time is passed explicitly, so there are no fake timers.
- All new files carry the SPDX header; names follow §1; no `any`; no skips; no sleeps.
- Rule 5.5/5.6: writes assert persisted state (row count, `site_settings` value, ledger object with `actorId: null`). The malformed-value matrix asserts the count stays 0. The live-entry guard test and the 13-day / day-20 negative cases assert the row is untouched.
- Unit mocks sit only at the repository, settings and media boundaries, and pure functions are called, not mocked (Rule 3.10).
- No MUST violation found; see notes 1 above for the one borderline item.

Runtime verification: I did **not** run `pnpm beech dev` or trigger a real Cron Trigger. The HTTP paths (`GET /api/settings`, `PUT /api/settings`, `GET /api/content/:slug/trash`) are covered end to end by the workerd integration tier (real middleware chain, real D1), and the sweep by its integration act against real D1 + R2. The `scheduled()` wiring in `index.ts` has no unit seam (the plan says so), so its tick gating and dependency construction were verified by reading only.

# Sprint Documentation
- Shipped: retention is now enforced. A core `retention.ts` (`DEFAULT_TRASH_RETENTION_DAYS=14`, `MAX_RETENTION_DAYS=36500`, `isValidRetentionDays`, `resolveRetentionDays`) is the single definition. A seed's `retentionDays` overrides the new global `trashRetentionDays` site setting, and `0` at either level means never purge.
- `GET/PUT /api/settings` carry `trashRetentionDays` (PUT refuses malformed values, including `null`, with 400 `settings-invalid-trash-retention`). The trash list returns the effective `retentionDays` so sprint 3 can show a correct countdown. Seed validation (Fatal 13) now accepts `0`.
- `ContentRepository.findExpiredByRetention` now takes the effective retention as a parameter; the repository never reads settings. A bounded `runRetentionSweep` (content slice `jobs/`) runs from `scheduled()` every 5 minutes, at most 25 purge attempts per run, oldest first.
- Every sweep purge goes through the sprint-1 ledger-first `purge` on a repository built with `R2DeletionLedger`, with `actorId: null`. R2 media cleanup is non-blocking. No hooks, automations or activity log run from the sweep. A failed settings read purges nothing.
- No deviation from the plan. The executor added one small hardening: an empty or whitespace stored value reads as the default, not as `0` (never purge).
- Limits: with no storage configured every purge fails closed and rows stay trashed. Orphaned R2 files are possible after a cleanup failure. There is no fairness rotation across seeds (a backlog drains in hours at 25 per 5 minutes). The dashboard countdown still reads `seed.retentionDays` until sprint 3.
- The `scheduled()` wiring has no automated test; it was verified by code reading only.
