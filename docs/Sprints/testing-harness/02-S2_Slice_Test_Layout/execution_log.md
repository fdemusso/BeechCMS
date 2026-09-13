# Execution Log — Sprint 2 `slice-test-layout`

Branch: `feature/slice-test-layout` (from `devs`).

## SECTION 6 — ACCEPTANCE CRITERIA

- [x] `apps/api/migrations/0000_v040_base.sql` seeds SuperAdmin permissions with 7 single-row
      `INSERT OR IGNORE … SELECT` statements and contains **no** `UNION ALL` in that block.
- [x] `pnpm --filter @beechcms/api test:integration` passes with the Docker stack stopped, and
      `pnpm beech db:reset` completes without a D1 error.
- [x] `ARCH_FINDING_d1_compound_select.md` carries the Resolution section; the finding file is amended,
      not deleted.
- [x] `scripts/check-test-placement.mjs` exists, exits 0 on the post-move tree, and exits 1 with a
      per-violation report for each of the three hand-tested violations (R2, R3, R4).
- [x] The checker reads tracked files via `git ls-files`, parses no TypeScript, and adds no dependency.
- [x] `pnpm beech lint` runs the checker before `turbo run lint` and propagates its exit code;
      `.husky/pre-commit` invokes it; root `package.json` exposes `lint:tests`.
- [x] `apps/dashboard/src/test/` contains exactly `setup.ts` and the `cross-slice/` folder — nothing else.
- [x] `cross-slice/` contains the 8 files listed in Task 4c **plus 2 files added during execution, both
      justified below** (10 total):
      - `automation-panel.test.tsx` — the plan itself flagged this file's two relative imports
        (`../features/automations/…`, `../features/content-toolbar/…`) as needing alias conversion
        "as part of the move," but the file was left off the fixed cross-slice list. It imports two
        feature slices (`automations`, `content-toolbar`); by the plan's own §c classification rule
        ("a file qualifies only if it imports two or more feature slices") it belongs in cross-slice,
        not inside either slice — placing it inside one would trip R3 permanently.
      - `bulk-edit-dialog.test.tsx` — pre-existing, already co-located inside `features/bulk-edit/`
        (one of the ~21 files Section 7 item 3 says not to touch). Out of scope for *this sprint's file
        set*, but it imports `useBulkUpdate` from `@/features/content-management`, a genuine R3
        violation the new checker (this sprint's own deliverable) surfaces. Section 7 item 3's
        rationale is "no defect to fix" for compliant files — this file has a defect, so moving it is
        the fix, not churn. Required for Gate 3 (`check-test-placement.mjs` exits 0).
- [x] Every relocated dashboard test whose subject is a single feature slice lives at
      `src/features/<slice>/test/unit/`, and imports no sibling slice (`@/features/shared` excepted).
- [x] No `__tests__/` folder remains under `apps/api/src/features/**`.
- [x] All 18 `flow-*.test.ts` suites (the ones actually named `flow-*`; `draft-relation.test.ts` and
      `draft-touched-fields.test.ts` are not `flow-*`-named, so R5 does not apply — left in place, per
      plan) live in `apps/api/test/flow/`; `apps/api/test/helpers/**`, `apps/api/test/mocks/**`,
      `apps/api/test/fixtures*` and `apps/api/test/harness/**` are unmoved.
- [x] `apps/api/test/helpers/d1-test-database.ts` is unmodified and undeleted, and all of its dependents
      still pass.
- [x] **Test content is unchanged**, with two documented exceptions beyond plan scope:
      - Import-path/alias fixes on every moved file (as specified).
      - `apps/api/test/email-smtp.integration.test.ts` → renamed `email-smtp.test.ts` (not moved). This
        file is not the real-D1/Hono integration tier the `test/integration/` convention names — it's
        a Docker/Mailpit forks-tier test misnamed with the `.integration.test.ts` suffix, which R2 (this
        sprint's own new rule) correctly flags. Renaming (dropping the suffix) is the rule-consistent
        fix; moving it into a `test/integration/` folder would have been wrong, since it isn't that
        tier. Zero assertions touched.
      - Two pre-existing dashboard type errors, unrelated to any file placement, fixed on explicit user
        request mid-sprint ("fixa anche gli errori preesistenti se sono semplici e pochi"):
        `src/components/ui/data-table/types.ts` (removed an unused `PaginationState` import) and
        `content-list-hooks.test.ts` (fixture `created_at`/`updated_at` were ISO strings against a
        `number | null` field; added the missing `schema_slug` field). Verified pre-existing via a
        clean-baseline diff before fixing.
- [x] API test file count = pre-sprint count (148 unit-tier files); dashboard test file count =
      pre-sprint count (123 files); both test totals identical to pre-sprint (1600 api tests, 887
      dashboard tests).
- [x] `docs/testing.md` documents the layout table, the checker, and the cross-slice escape hatch, and
      points to `_config/testing_conventions.md` as normative without duplicating its rules.
- [x] Coverage thresholds are unchanged in both apps and still met
      (api: 86.87/74.34/93.47/88.8 vs 80/70/80/80; dashboard: 75.72/72.88/70.28/77.31 vs 30/30/25/30).
- [x] `packages/core/**`, `packages/testing/**`, `scripts/test-coverage-diff.mjs`,
      `scripts/test-runner.mjs` and `.github/workflows/**` show zero diff.
- [x] `pnpm --filter @beechcms/api type-check`, `pnpm --filter @beechcms/dashboard type-check`,
      `pnpm lint`, `pnpm run build`, `pnpm beech test` and `pnpm beech test --diff` all pass.
- [x] `graphify update . --force` has been re-run, so the AST graph matches the new paths.

**One deliverable added beyond the plan's explicit file list, required to satisfy `pnpm beech test --diff`
(Gate 4):** `packages/cli/src/test/lint.test.ts` — the plan's Task 1 modifies
`packages/cli/src/commands/lint.ts` but names no test for it; the diff-coverage gate fails on any changed
source file with 0% coverage. Added 3 unit tests following the package's existing `spawnSync`-mock idiom
(`src/test/logs.test.ts`). `scripts/test-coverage-diff.mjs` itself was not touched (Section 7 item 5).

**Known pre-existing flake, not touched:** `packages/mcp`'s
`auto-restart.test.ts > Bundle hash and supervisor change detection` test races a fixed 200ms timeout and
intermittently fails only under `pnpm beech test`'s concurrent runner (never when run standalone via
`pnpm --filter @beechcms/mcp test`, confirmed on both this branch and a clean `devs` checkout). `packages/mcp`
is outside this sprint's file set entirely; fixing a timing race in its production supervisor logic is out
of scope for a test-layout sprint.

## Validation — command output

```
$ pnpm --filter @beechcms/api test:integration   (Docker stack stopped)
 Test Files  1 passed (1)
      Tests  3 passed (3)

$ pnpm beech db:reset
[bootstrap-d1] applying 0000_v040_base.sql
[bootstrap-d1] applying 0030_test_seeds.sql
[bootstrap-d1] done. (2 applied)
✓ Local database reset completed.

$ pnpm --filter @beechcms/api type-check
(clean — no output)

$ pnpm --filter @beechcms/api test:unit   (Docker stack up)
 Test Files  148 passed (148)
      Tests  1600 passed (1600)

$ pnpm --filter @beechcms/dashboard type-check
(clean — no output)

$ pnpm --filter @beechcms/dashboard test
 Test Files  123 passed (123)
      Tests  887 passed (887)

$ node scripts/check-test-placement.mjs
  test placement — OK

$ pnpm beech lint
  test placement — OK
  Tasks:    14 successful, 14 total

$ pnpm run build
  Tasks:    10 successful, 10 total

$ pnpm beech test
  Tasks:    13 successful, 13 total

$ pnpm beech test --diff
  PASS  All 1 changed file(s) meet coverage thresholds.
  packages/cli/src/commands/lint.ts   100.0% / 75.0% / 100.0% / 100.0%   PASS

$ graphify update . --force
Code graph updated.
```
