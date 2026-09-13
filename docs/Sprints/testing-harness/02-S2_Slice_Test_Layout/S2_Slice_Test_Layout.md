# Sprint 2 — `slice-test-layout`

Feature: Test Harness & Test Suite Redesign (issue #108)
Brief: `stages/00_ideation/output/feature_brief.md`
Roadmap: `backlog/ROADMAP.md` (5 sprints; this is sprint 2 of 5)
Previous sprint (shipped): `docs/Sprints/S1_Harness_Foundation/`
Test rules: `_config/testing_conventions.md` — **binding on every test file whose CONTENT this sprint changes**

---

### Pre-Computation Analysis

**a) God Nodes identified via the Graphify CLI** (`graphify explain`, degree = edges in the AST graph,
graph re-synced at the end of Sprint 1's rework)

| Node | Source | Degree | Relevance to this sprint |
|------|--------|--------|--------------------------|
| `createBeechApp()` | `apps/api/src/factory.ts:116` | **56** | Imported by ~40 test files via relative paths. Every API test file that moves changes its relative depth to this node. |
| `D1TestDatabase` | `apps/api/test/helpers/d1-test-database.ts:19` | **41** | The `node:sqlite` shim. Still the foundation of the `forks` tier. 21 of its dependents are `apps/api/test/flow-*.test.ts`; 9 are co-located slice tests. Untouched in content; only import paths change where a dependent moves. |
| `AppEnv` | `apps/api/src/types.ts:250` | **39** | Same relative-depth consideration (`../../types` → `../../../../types`). |
| `TestClient` | `packages/testing/src/client/test-client.ts:7` | **13** | Sprint 1's client. Consumed via the package name `@beechcms/testing`, so it is depth-invariant — moving a file never breaks it. |
| `createTestHarness()` | `packages/testing/src/harness.ts:60` | 9 | Same: package-name import, depth-invariant. |

The decisive structural fact: **every import that survives a file move unharmed is a package-name import
(`@beechcms/testing`, `@beechcms/core`, `@/…` in the dashboard); every import that breaks is a relative
one (`../../factory`, `../../types`, `./api`).** This is what makes the dashboard relocation cheap (it
is `@/`-aliased almost end-to-end: 102 files, exactly **2** relative imports across them) and the API
relocation the expensive half (relative depth changes on ~40 files). The plan below is ordered by that
asymmetry.

**b) Architectural boundaries affected**

- `@beechcms/core` — **untouched.** No source file read or written.
- `@beechcms/testing` — **untouched this sprint.** No new harness API is needed to move a file. (The
  scale-seed generator is Sprint 5; nothing here extends the package.)
- `apps/api` — test-tree only, plus **one migration file** (Task 0, see below). `src/**` production code
  is untouched: `src/features/<slice>/**/*.test.ts` moves are test files only, and no production module
  imports a test file (verified: `graphify affected "D1TestDatabase"` returns test files exclusively).
- `apps/dashboard` — **the main boundary this sprint.** `src/test/**` (102 files) is a central test
  folder that structurally violates VSA Rule 1.1; it is dissolved into the owning slices, with the
  genuinely cross-slice files kept outside the slice tree.
- Root `scripts/` — **one new file** (`scripts/check-test-placement.mjs`) and two one-line wirings
  (`package.json` script, `packages/cli/src/commands/lint.ts`). `scripts/test-coverage-diff.mjs` and
  `scripts/test-runner.mjs` are **not** modified — tier-aware selection is Sprint 3.
- `.github/workflows/` — **untouched.** Sprint 3 owns CI job shape. The placement check is reachable
  through `pnpm beech lint` and the pre-commit hook; wiring it into CI is Sprint 3's job when it splits
  the workflow anyway.

**c) `graphify affected` impact analysis (breaking-change proof)**

```
$ graphify affected "createTestHarness" --depth 2
- apps/api/src/features/content/test/integration/content-management.integration.test.ts [imports]
- packages/testing/src/index.ts [re_exports]
- apps/api/src/auth/providers/jwt-token.service.test.ts [imports_from]
- apps/api/src/shared/db/repositories/d1-{analytics,notification,oauth-authorization-code,oauth-token,session}.repository.test.ts [imports_from]
- apps/api/src/shared/services/activity-log/d1-activity-logger.test.ts [imports_from]
→ 9 dependents, all test files, all importing by PACKAGE NAME (@beechcms/testing) → zero break from any move.

$ graphify explain "D1TestDatabase"
Degree 41. Dependents: 21 × apps/api/test/flow-*.test.ts, 9 × apps/api/src/**/*.test.ts,
apps/api/test/helpers/seed-fixtures.ts.
→ Only files that MOVE need an import-path edit. The flow-* files move as a block into
   apps/api/test/flow/ (depth +1 → '../helpers/d1-test-database' becomes '../../test/helpers/...'
   — see Task 3 for the exact rewrite). d1-test-database.ts itself is not modified, not deleted.

$ graphify explain "createBeechApp"   → Degree 56, exactly one production dependent (apps/api/src/index.ts).
$ graphify explain "AppEnv"           → Degree 39.
→ Both are relative-import targets for moving test files. Neither node is modified; only the
   importing side's path depth changes. No signature, no export, no production file touched.
```

**Breaking-change verdict:** this sprint changes **zero** public symbols. Every risk is a broken
relative import path, which `tsc --noEmit` and a full test run catch deterministically. There is no
class of failure here that can survive green typecheck + green suite.

---

### VETO Audit

Evaluated against `_config/ponytail_arch.md`.

**1. Botanical Invariant — no D1 access bypasses `@beechcms/core`.** PASS.
Nothing in this sprint writes SQL against content tables. The single SQL edit (Task 0) is a
**structural** RBAC seed inside the existing migration file `apps/api/migrations/0000_v040_base.sql` —
inside the strict migration workflow, not ad-hoc DDL, and it touches `role_permissions`, a structural
table with no Botanical Engine representation. No `content_{slug}` statement is written by hand
anywhere in this sprint.

**2. VSA Enforcement — zero cross-feature imports.** PASS, and this is the sprint's entire product.
The current `apps/dashboard/src/test/**` folder is itself the violation: a test for slice `X` living
outside slice `X`. It is dissolved. The files that genuinely cross slices (a test importing
`@/features/content-management` *and* `@/features/schema` *and* `@/features/automations` — 8 of them,
enumerated in Task 4) are **not** forced into an arbitrary slice: they move to
`apps/dashboard/src/test/cross-slice/`, outside the slice tree, on the same principle that puts e2e in
a top-level `e2e/` (Sprint 4). Forcing a cross-slice test into one slice would manufacture exactly the
cross-slice import VSA forbids. `@/features/shared` is the dashboard's shared library, not a sibling
slice; importing it from inside a slice is `feature → shared lib`, the sanctioned direction, and the
placement checker treats it as such.

**3. Cloudflare Purity.** PASS. No dependency added. No ORM. No background job. The one schema-adjacent
change is a semantic no-op rewrite of a seed statement that **real D1 rejects today**.

**4. YAGNI — three things cut here before drafting:**
- **Converting `flow-*.test.ts` suites to the real-D1 harness was cut.** The roadmap entry lists it;
  the brief's Boy Scout Rule forbids it as a batch. 21 flow suites depend on `D1TestDatabase`, MinIO,
  Mailpit and the webhook tester; the workers tier binds none of those (Sprint 1 OUT OF SCOPE item 8,
  deliberately). Converting them is a per-suite job that happens when the underlying endpoint is
  touched, not a sprint deliverable. This sprint gives them a **home and a tier label**; conversion
  stays incremental. Recorded in SECTION 7.
- **An ESLint rule for placement was cut in favour of a standalone script.** `typescript-eslint` is
  bypassed repo-wide by a `noopParser` for `.ts`/`.tsx` (CLAUDE.md, TS 7.0 has no public JS compiler
  API), so an ESLint-based placement rule would not run on the files it is meant to police. A ~120-line
  node script that reads paths and import specifiers is the minimum thing that actually works.
- **A "test layout" abstraction/generator was cut.** No scaffolding command, no per-slice template
  generator, no codemod package. `git mv` plus a path fix is the whole operation.

**Adjustment made during this audit:** the first shape of this plan moved *all* API and dashboard test
files into `<slice>/test/unit/`, including ~40 API tests already co-located next to their source inside
their own slice. `_config/testing_conventions.md` §0 explicitly admits **two** compliant unit
placements — "next to the source file, **or** `<slice>/test/unit/`" — so those files are already
compliant and moving them would be pure churn on a file whose content nobody is reading. Rejected. The
strict `<slice>/test/unit/` form is required only where a test currently lives **outside** its owning
slice. The placement checker below enforces exactly the rule the conventions state, not a stricter one
invented here.

**Second adjustment:** Task 0 (the migration fix) was initially left out as "not layout work". Rejected:
this sprint's premise is that the integration tier is a place tests can be moved *to*, and on `HEAD`
that tier does not run at all — `applyD1Migrations` fails before the first test executes (reproduced
below). Shipping a layout that fans out onto a red tier would be shipping a lie. Fixing it is one
statement and it is the architect sign-off the Sprint 1 finding explicitly asked for.

No violation remains. Plan approved for drafting.

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Sprint 1 proved a real-D1 integration tier works and put one suite in it. It deliberately created
exactly one folder (`apps/api/src/features/content/test/integration/`) and left the other 344 test
files where they were. That leaves the repo in its least defensible state: **two conventions, one
enforced by nothing.** Sprint 3 (`ci-test-tiering`) selects tests by tier, and its selector is the
folder path — so until the path means something, there is nothing to select. Sprint 4 excludes `e2e/`
from that selection by construction, which presupposes the same. The ordering is forced.

The concrete architectural defect this sprint removes is in the dashboard. `apps/dashboard/src/test/`
holds 102 test files covering 14 different feature slices, plus `lib/`, `components/ui/`,
`components/fields/` and `pages/`. Under VSA, the test for slice `X` is part of slice `X` — deleting a
slice should delete its tests with it, and reading a slice should show you what it promises. Today
deleting `features/seed-builder/` leaves five orphaned test files in a folder three directories away,
and `src/test/` is a second, shadow source tree ordered by nothing. That is precisely the "spaghetti"
the brief names.

**VSA adherence.** Every file this sprint moves ends up either (a) inside the slice that owns it, or
(b) explicitly outside the slice tree because it crosses slices by nature. There is no third
destination, and the second category is never larger than it has to be: a file qualifies only if it
imports two or more feature slices (`@/features/shared` excepted — it is a shared library, not a
sibling). The checker introduced here is the first mechanism in the repo that makes (a) and (b)
enforceable rather than aspirational, and it is deliberately the narrowest mechanism that does so.

**Botanical Engine invariants.** Untouched. The one SQL statement rewritten (Task 0) is a structural
RBAC permission seed inside the existing migration file — same end state, same table, no compound
SELECT. No content table, no hardcoded field name, no `apiToDb`/`dbToApi` bypass. `@beechcms/core` is
not read or written this sprint.

**Why the migration fix rides along.** Sprint 1's review passed with a documented, human-gated finding:
`0000_v040_base.sql` seeds SuperAdmin permissions with a 7-way `UNION ALL` inside a `CROSS JOIN`, and
real D1 caps compound SELECTs below that (`SQLITE_LIMIT_COMPOUND_SELECT`). The `node:sqlite` shim does
not enforce the cap, which is why it shipped. Reproduced on `HEAD` while planning this sprint:

```
$ pnpm --filter @beechcms/api test:integration
 ❯ test/harness/apply-migrations.ts:8:1
Caused by: Error: too many terms in compound SELECT: SQLITE_ERROR
 Test Files  1 failed (1)
      Tests  no tests
```

The open question the finding raised — edit the base migration, or ship a forward migration — is
answered here, by the architect, in Task 0: **edit `0000_v040_base.sql` in place.** A forward migration
cannot help, because `applyD1Migrations` (and `wrangler d1 execute` in local bootstrap) applies `0000`
first and dies there; a later migration is never reached. The base migration has never run against a
production D1 instance (the statement would have failed if it had), so there is no deployed state to
diverge from.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Test inventory (counted on `HEAD`, not estimated):** 272 test files across the two apps — 149 in
`apps/api` (42 co-located under `src/features/**`, 65 elsewhere under `src/`, 42 in `apps/api/test/`)
and 123 in `apps/dashboard` (102 under `src/test/**`, 21 co-located inside slices).

**`apps/api` — three placements coexist today:**
1. Co-located in-slice, flat: `src/features/rbac/roles.test.ts`, `src/features/content/handlers/list.test.ts`,
   `src/features/oauth/{authorize,authorization-request,consents,revoke,token}.test.ts`,
   `src/features/automations/**` (13 files), `src/features/search/**` (6), `src/features/seeds/seeds.test.ts`,
   `src/features/widget/widget.test.ts`, `src/features/webhooks/index.test.ts`,
   `src/features/password-reset/request.test.ts`. **Compliant** per conventions §0 ("next to the source
   file"); not moved by this sprint.
2. Co-located in-slice, under `__tests__/`: `src/features/backrefs/__tests__/backrefs.handler.test.ts`,
   `src/features/dashboard-layout/__tests__/dashboard-layout.handler.test.ts`,
   `src/features/settings/__tests__/settings.handler.test.ts`. Same tier, third spelling.
3. Slice `test/integration/`: `src/features/content/test/integration/content-management.integration.test.ts`
   (Sprint 1's pilot, the only one).

Outside slices: `src/middleware/*.test.ts` (8), `src/shared/**` (≈38), `src/auth/**` (3),
`src/public/*.test.ts` (5), `src/rate-limit/*.test.ts` (3), `src/factory.*.test.ts` (3). None of these
are slices, so co-location is their correct and final placement.

**`apps/api/test/` (42 files):** 21 `flow-*.test.ts` cross-slice HTTP flow suites; 20 other
`*.test.ts`; plus infrastructure — `fixtures.ts`, `fixtures/file-samples.ts`, `global-setup.ts`,
`docker-precheck.{ts,runner.ts}`, `helpers/{d1-test-database,seed-fixtures,mailpit-client,minio-test-bucket,webhook-tester-client}.ts`,
`mocks/static-*.repository.ts`, `harness/{apply-migrations.ts,env.d.ts}`.

**`apps/dashboard/src/test/` (102 test files + `setup.ts`):** grouped in ad-hoc sub-folders
(`dashboard/` 20, `fields/` 15, `content-gallery/` 7, `lib/` 6, `ui/` 5, `seed-builder/` 5, `pages/` 5,
`features/` 5, `content-toolbar/` 4, `hooks/` 3, `content-management/` 3, plus 14 loose files at the
root of `src/test/`). Import style measured across all 102: **69 files import `@/features/…`,
exactly 2 files use a relative `../` import into the source tree** (`actions-menu`-adjacent:
`../features/content-toolbar/content-toolbar`, `../features/automations/components/automation-panel/automation-panel`).
`setup.ts` is the Vitest `setupFiles` entry and is not a test.

**Vitest configuration, both apps:**
- `apps/api/vitest.config.ts` — `pool: 'forks'`, `globalSetup: ['./test/docker-precheck.runner.ts','./test/global-setup.ts']`,
  `include: ['test/**/*.test.ts','src/**/*.test.ts']`,
  `exclude: ['**/node_modules/**','**/dist/**','src/features/**/test/integration/**']`,
  v8 coverage thresholds 80/70/80/80 with a long `exclude` list.
- `apps/api/vitest.workers.config.ts` — `include: ['src/features/**/test/integration/**/*.test.ts']`,
  `setupFiles: ['./test/harness/apply-migrations.ts']`, `cloudflareTest({ miniflare: { compatibilityDate: '2026-02-13',
  compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'], bindings: { TEST_MIGRATIONS } } })`.
  Note: the installed `@cloudflare/vitest-pool-workers@0.22.0` exposes `cloudflareTest` as a **plugin**,
  not `defineWorkersConfig` (Sprint 1's documented API deviation).
- `apps/dashboard/vitest.config.ts` — `environment: 'happy-dom'`, `globals: true`,
  `include: ['src/**/*.test.{ts,tsx}']`, `setupFiles: ['./src/test/setup.ts']`, `@` alias →
  `./src`, coverage thresholds 30/30/25/30 with a large `exclude` list that already contains
  `'src/test/**'` and `'src/**/*.test.{ts,tsx}'`.

**Scripts (`apps/api/package.json`):** `test` = `vitest run && vitest run --config vitest.workers.config.ts`;
`test:unit`, `test:integration`, `test:coverage`.

**Root:** `pnpm lint` = `turbo run lint`; `pnpm test` = `node scripts/test-runner.mjs` (fingerprint
cache + PID lock + concurrency caps); `pnpm test:diff` = `node scripts/test-coverage-diff.mjs`
(5 hardcoded workspaces, `vitest related`); `pnpm beech` = `node bin/cli.mjs`. `packages/cli/src/commands/lint.ts`
today does nothing but `spawnSync('turbo', ['run','lint'])`. `.husky/pre-commit` runs
`scripts/update-license.mjs` and `pnpm docs:generate`. `turbo.json` `build.inputs` already excludes
`**/*.test.ts`, `**/*.test.tsx` and `**/test/**`, so new `test/` folders inside slices never invalidate
a build cache entry.

**Blocking state on `HEAD`:** the integration tier is red. `apps/api/migrations/0000_v040_base.sql:535-553`
was restored to the 7-way `UNION ALL` `CROSS JOIN` form by commit `09217fc`, per Sprint 1 review
finding #1, and `applyD1Migrations` fails on it before any test runs (output quoted in Section 1).
`docs/Sprints/S1_Harness_Foundation/ARCH_FINDING_d1_compound_select.md` documents it and asks for the
architect decision that Task 0 now records.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

**A. Unblock the integration tier (1 file)**

| File | Change |
|------|--------|
| `apps/api/migrations/0000_v040_base.sql` | modified — SuperAdmin `role_permissions` seed rewritten as 7 single-row `INSERT OR IGNORE … SELECT` statements. Same end state, no compound SELECT. |
| `docs/Sprints/S1_Harness_Foundation/ARCH_FINDING_d1_compound_select.md` | modified — resolution note appended (decision, who decided, where it landed). The finding is closed, not deleted. |

**B. Placement enforcement (1 new file + 3 wirings)**

| File | Change |
|------|--------|
| `scripts/check-test-placement.mjs` | new — the placement checker. Exit 1 with a per-violation report. |
| `package.json` (root) | modified — `"lint:tests": "node scripts/check-test-placement.mjs"` |
| `packages/cli/src/commands/lint.ts` | modified — run the checker before `turbo run lint`; a failure short-circuits with the checker's exit code |
| `.husky/pre-commit` | modified — one line invoking the checker |

**C. `apps/dashboard` — dissolve the central test folder (102 file moves, 0 rewrites)**

| Destination | Count | Rule |
|-------------|-------|------|
| `src/features/<slice>/test/unit/<name>.test.tsx` | ~62 | file imports exactly one feature slice (`shared` excepted) |
| co-located next to source (`src/lib/`, `src/components/fields/`, `src/components/ui/`, `src/pages/`) | ~32 | subject is not a slice |
| `src/test/cross-slice/` | 8 | file imports two or more feature slices |
| `src/test/setup.ts` | 1 | unchanged — Vitest `setupFiles` entry, not a test |

Plus the 21 already-co-located slice tests, which stay exactly where they are (see VETO Audit
adjustment).

| File | Change |
|------|--------|
| `apps/dashboard/vitest.config.ts` | modified — coverage `exclude` entries that name `src/test/**` sub-paths are re-pointed; `include` unchanged (`src/**/*.test.{ts,tsx}` already covers every destination) |

**D. `apps/api` — tier-label the cross-slice flow suites (21 moves, 0 rewrites)**

| File | Change |
|------|--------|
| `apps/api/test/flow-*.test.ts` (21 files) | **moved** to `apps/api/test/flow/`, content unchanged except relative-import depth |
| `apps/api/src/features/{backrefs,dashboard-layout,settings}/__tests__/*.test.ts` | **moved** to the sibling flat co-located position (`<slice>/<name>.test.ts`), killing the third spelling |
| `apps/api/vitest.config.ts` | modified — comment only; `include: ['test/**/*.test.ts', …]` already matches `test/flow/**` |

**E. Documentation**

| File | Change |
|------|--------|
| `docs/testing.md` | modified — layout table (where each kind of test lives, per app), the checker and how to run it, the cross-slice escape hatch and why it exists. Points at `_config/testing_conventions.md` as normative; does not restate its rules. |

**Explicitly excluded from this sprint's file set:** `packages/core/**`, `packages/testing/**`,
`scripts/test-coverage-diff.mjs`, `scripts/test-runner.mjs`, `.github/workflows/**`,
`apps/api/test/helpers/d1-test-database.ts`, `apps/api/test/mocks/**`, and the **content** of every
test file (moves change import paths, nothing else).

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### Task 0 — Unblock the integration tier (do this first; nothing else is verifiable until it is green)

`apps/api/migrations/0000_v040_base.sql`, lines 535-553. Replace the single compound-SELECT statement:

```sql
-- DELETE this statement:
INSERT OR IGNORE INTO role_permissions (role_id, permission)
SELECT r.id, p.permission
FROM roles r
CROSS JOIN (
    SELECT 'content:read'   AS permission UNION ALL
    SELECT 'content:create' UNION ALL
    SELECT 'content:update' UNION ALL
    SELECT 'content:delete' UNION ALL
    SELECT 'manage_users'   UNION ALL
    SELECT 'manage_roles'   UNION ALL
    SELECT 'view_analytics'
) p
WHERE r.name = 'SuperAdmin';
```

with:

```sql
-- One INSERT OR IGNORE per permission, not a 7-way UNION ALL CROSS JOIN: D1's SQLite backend
-- caps compound SELECT terms (SQLITE_LIMIT_COMPOUND_SELECT) and rejects the 7-term form with
-- "too many terms in compound SELECT". Identical end state, no compound SELECT.
-- Decision: edited in the base migration rather than shipped as a forward migration, because
-- applyD1Migrations/wrangler apply 0000 first and fail there — a later migration is never reached.
-- 0000_v040_base.sql has never been applied to a production D1 (it could not have succeeded).
-- See docs/Sprints/S1_Harness_Foundation/ARCH_FINDING_d1_compound_select.md.
INSERT OR IGNORE INTO role_permissions (role_id, permission)
SELECT r.id, 'content:read' FROM roles r WHERE r.name = 'SuperAdmin';

INSERT OR IGNORE INTO role_permissions (role_id, permission)
SELECT r.id, 'content:create' FROM roles r WHERE r.name = 'SuperAdmin';

INSERT OR IGNORE INTO role_permissions (role_id, permission)
SELECT r.id, 'content:update' FROM roles r WHERE r.name = 'SuperAdmin';

INSERT OR IGNORE INTO role_permissions (role_id, permission)
SELECT r.id, 'content:delete' FROM roles r WHERE r.name = 'SuperAdmin';

INSERT OR IGNORE INTO role_permissions (role_id, permission)
SELECT r.id, 'manage_users' FROM roles r WHERE r.name = 'SuperAdmin';

INSERT OR IGNORE INTO role_permissions (role_id, permission)
SELECT r.id, 'manage_roles' FROM roles r WHERE r.name = 'SuperAdmin';

INSERT OR IGNORE INTO role_permissions (role_id, permission)
SELECT r.id, 'view_analytics' FROM roles r WHERE r.name = 'SuperAdmin';
```

Then append to `docs/Sprints/S1_Harness_Foundation/ARCH_FINDING_d1_compound_select.md`:

```markdown
## Resolution (Sprint 2 `slice-test-layout`, architect sign-off)

Applied: the base migration is edited in place, exactly as the "Recommended fix" section describes.

Rationale for editing `0000_v040_base.sql` rather than shipping a forward migration: both
`applyD1Migrations` (integration tier) and `wrangler d1 execute` (local bootstrap) replay migrations in
order and abort on `0000`, so a forward migration is never reached and cannot repair the failure. The
base migration has never been applied to a production D1 instance — the statement would have failed
there too. Existing local databases already carry the seeded rows and are unaffected (the ledger does
not re-apply `0000`); `pnpm beech db:reset` rebuilds from the corrected file.

Finding closed.
```

Verify before moving on — this must pass, and it must pass with the Docker stack **stopped**:

```bash
pnpm --filter @beechcms/api test:integration
```

If it still fails, **stop and report**. Every later task in this sprint assumes a green integration
tier, and no amount of file moving will fix a migration error.

### Task 1 — `scripts/check-test-placement.mjs`

The enforcement mechanism. It is a path-and-import-specifier checker, not a type-aware one: it reads
files as text, extracts `from '…'` / `import('…')` specifiers with a regex, and never parses TypeScript
(the repo's `noopParser` workaround makes an ESLint rule structurally unable to police these files —
see the VETO Audit).

Rules it enforces, in this order, each violation reported as `path: message`:

| # | Rule | Applies to |
|---|------|-----------|
| R1 | A test file under `apps/{api,dashboard}/src/features/<slice>/` is fine **either** co-located anywhere inside that slice **or** under `<slice>/test/{unit,integration}/`. It must not sit in a `__tests__/` folder. | both apps |
| R2 | A file named `*.integration.test.ts` must be under a `test/integration/` folder, and every file under `test/integration/` must be named `*.integration.test.ts`. | both apps |
| R3 | A test file inside slice `<A>` must not import another feature slice `<B>` (`@/features/<B>/…`, `../../<B>/…`, `features/<B>/…`). `<B> === 'shared'` is allowed — it is a shared library, not a sibling slice. | both apps |
| R4 | No test file may live directly under `apps/dashboard/src/test/`. The only permitted entries there are `setup.ts` and anything under `src/test/cross-slice/`. | dashboard |
| R5 | A file matching `flow-*.test.ts` under `apps/api/test/` must be under `apps/api/test/flow/`. | api |

```js
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

/** Slice-shaped shared libraries: importable from inside any slice (feature -> shared lib). */
const SHARED_SLICES = new Set(['shared'])

const TEST_FILE = /\.test\.tsx?$/
const IMPORT_SPECIFIER = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g

/** Tracked files only: an untracked scratch test must not fail a teammate's commit. */
function trackedFiles() {
  return execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .split('\n')
    .filter((file) => TEST_FILE.test(file))
}

/** Returns the slice name when `file` lives inside a feature slice of `app`, else null. */
function sliceOf(file, app) {
  const prefix = `apps/${app}/src/features/`
  if (!file.startsWith(prefix)) return null
  return file.slice(prefix.length).split('/')[0] ?? null
}

/** Feature slice a specifier points at, or null when it targets no slice. */
function importedSlice(specifier, file) {
  const aliased = specifier.match(/^@\/features\/([^/]+)/)
  if (aliased) return aliased[1]
  if (!specifier.startsWith('.')) return null
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier))
  const relative = resolved.match(/\/src\/features\/([^/]+)/)
  return relative ? relative[1] : null
}

function violations() {
  const found = []
  for (const file of trackedFiles()) {
    const source = readFileSync(file, 'utf8')
    const specifiers = [...source.matchAll(IMPORT_SPECIFIER)].map((match) => match[1])

    for (const app of ['api', 'dashboard']) {
      const slice = sliceOf(file, app)
      if (!slice) continue

      // R1
      if (file.includes('/__tests__/')) {
        found.push(`${file}: R1 — __tests__/ is not a placement in this repo. Co-locate it next to its source, or use ${app === 'api' ? `src/features/${slice}` : `src/features/${slice}`}/test/unit/.`)
      }
      // R3
      for (const specifier of specifiers) {
        const target = importedSlice(specifier, file)
        if (target && target !== slice && !SHARED_SLICES.has(target)) {
          found.push(`${file}: R3 — test inside slice '${slice}' imports sibling slice '${target}' ('${specifier}'). A cross-slice test belongs in ${app === 'api' ? 'apps/api/test/flow/' : 'apps/dashboard/src/test/cross-slice/'}.`)
        }
      }
    }

    // R2
    const inIntegrationDir = /\/test\/integration\//.test(file)
    const namedIntegration = /\.integration\.test\.tsx?$/.test(file)
    if (namedIntegration && !inIntegrationDir) {
      found.push(`${file}: R2 — *.integration.test.ts must live under a test/integration/ folder.`)
    }
    if (inIntegrationDir && !namedIntegration) {
      found.push(`${file}: R2 — a file under test/integration/ must be named *.integration.test.ts.`)
    }

    // R4
    if (file.startsWith('apps/dashboard/src/test/') && !file.startsWith('apps/dashboard/src/test/cross-slice/')) {
      found.push(`${file}: R4 — apps/dashboard/src/test/ holds setup.ts and cross-slice/ only. Move this test into the slice that owns it.`)
    }

    // R5
    if (/^apps\/api\/test\/flow-[^/]+\.test\.ts$/.test(file)) {
      found.push(`${file}: R5 — cross-slice flow suites live in apps/api/test/flow/.`)
    }
  }
  return found
}

const found = violations()
if (found.length > 0) {
  console.error(`\n  test placement — ${found.length} violation(s)\n`)
  for (const violation of found) console.error(`  ${violation}`)
  console.error(`\n  Rules: _config/testing_conventions.md §0-§1. Layout: docs/testing.md\n`)
  process.exit(1)
}
console.log('  test placement — OK')
```

Wiring, `package.json` (root), in `scripts`:

```json
    "lint:tests": "node scripts/check-test-placement.mjs",
```

`packages/cli/src/commands/lint.ts` — run the checker first, keep everything else as-is:

```ts
export async function lint(): Promise<void> {
  console.log(pc.cyan('\n  beech lint — check code style\n'))

  const placement = spawnSync('node', ['scripts/check-test-placement.mjs'], {
    stdio: 'inherit',
    cwd: process.cwd(),
  })

  if (placement.status !== 0) {
    process.exit(placement.status ?? 1)
  }

  const result = spawnSync('turbo', ['run', 'lint'], {
    stdio: 'inherit',
    cwd: process.cwd(),
    shell: true,
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}
```

`.husky/pre-commit` — append after the existing lines:

```sh
node scripts/check-test-placement.mjs
```

**Order of work:** write the checker, then do Tasks 2-4, then run it. It is expected to be red until the
moves are done; that is its acceptance evidence. Do not weaken a rule to make it green — if a rule is
wrong, say so in the PR and leave the rule out entirely rather than half-enforced.

### Task 2 — `apps/api`: kill the `__tests__/` spelling (3 moves)

```bash
git mv apps/api/src/features/backrefs/__tests__/backrefs.handler.test.ts \
       apps/api/src/features/backrefs/backrefs.handler.test.ts
git mv apps/api/src/features/dashboard-layout/__tests__/dashboard-layout.handler.test.ts \
       apps/api/src/features/dashboard-layout/dashboard-layout.handler.test.ts
git mv apps/api/src/features/settings/__tests__/settings.handler.test.ts \
       apps/api/src/features/settings/settings.handler.test.ts
rmdir apps/api/src/features/{backrefs,dashboard-layout,settings}/__tests__
```

Each file loses one directory level: every relative specifier in it goes from `../../x` to `../x`,
`../x` to `./x`. Fix them and nothing else. `tsc --noEmit` proves it.

### Task 3 — `apps/api`: move the 21 cross-slice flow suites into `apps/api/test/flow/` (21 moves)

```bash
mkdir -p apps/api/test/flow
git mv apps/api/test/flow-*.test.ts apps/api/test/flow/
```

The 21 files: `flow-admin-auth`, `flow-background-queues`, `flow-backrefs`, `flow-bulk-edit`,
`flow-draft-management`, `flow-guest-access`, `flow-media-assets`, `flow-oauth-authorization`,
`flow-oauth-connected-apps`, `flow-oauth-resource-server`, `flow-rbac-admin`, `flow-rbac-enforcement`,
`flow-rbac-invitations`, `flow-rbac-projections`, `flow-relations`, `flow-setup-race`, `flow-stats`,
`flow-system-schema`, plus `draft-relation`, `draft-touched-fields` **only if** they are
flow-shaped — they are not named `flow-*`, so R5 does not apply to them: **leave them where they are**.

Each moved file gains one directory level. The mechanical rewrite, applied to every moved file:

| Before | After |
|--------|-------|
| `'./fixtures'` | `'../fixtures'` |
| `'./helpers/d1-test-database'` | `'../helpers/d1-test-database'` |
| `'./helpers/seed-fixtures'` | `'../helpers/seed-fixtures'` |
| `'./helpers/minio-test-bucket'` | `'../helpers/minio-test-bucket'` |
| `'./helpers/mailpit-client'` | `'../helpers/mailpit-client'` |
| `'./helpers/webhook-tester-client'` | `'../helpers/webhook-tester-client'` |
| `'./mocks/static-content.repository'` | `'../mocks/static-content.repository'` |
| `'./fixtures/file-samples'` | `'../fixtures/file-samples'` |
| `'../src/…'` | `'../../src/…'` |

Do not rename any file, do not touch any assertion, do not convert anything to the harness.
`apps/api/vitest.config.ts` needs no glob change (`test/**/*.test.ts` already matches `test/flow/**`);
add the one-line comment recording what the folder means:

```ts
    // test/flow/ = cross-slice HTTP flow suites (forks tier). They cross slices by nature, so they
    // live outside the slice tree — same rationale as the top-level e2e/ suite.
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
```

### Task 4 — `apps/dashboard`: dissolve `src/test/` (102 moves)

The classification is mechanical and already computed. A file's destination is decided by the feature
slices it imports (`@/features/<X>`), ignoring `@/features/shared`:

**4a — exactly one slice → `src/features/<slice>/test/unit/<basename>`** (~62 files):

| Source group | Slice | Files |
|---|---|---|
| `src/test/dashboard/**` (incl. `builder/`, `widgets/`, `registry/`) | `dashboard` | 20 |
| `src/test/content-gallery/**` | `content-gallery` | 7 |
| `src/test/content-toolbar/**` + `src/test/hooks/use-conditional-formats.test.ts` + `src/test/hooks/use-toolbar-filters.test.ts` | `content-toolbar` | 6 |
| `src/test/seed-builder/**` minus `seed-builder-page.test.tsx` | `seed-builder` | 4 |
| `src/test/content-management/**` | `content-management` | 3 |
| `src/test/content-delete-dialog/**` | `content-delete-dialog` | 2 |
| `src/test/login-form/**` | `auth` | 2 |
| `src/test/notifications-popover/**` | `notifications` | 2 |
| `src/test/kanban-card.test.tsx`, `kanban-card-display.test.ts`, `use-kanban-column-query.test.ts`, `card-config-dialog.test.tsx` | `content-kanban` | 4 |
| `src/test/features/entry-editor/entry-json-form.test.ts`, `entry-layout-builder-components.test.tsx`, `src/test/hooks/use-layout-builder.test.ts` | `entry-editor` | 3 |
| `src/test/features/backrefs/referenced-by-panel.test.tsx` | `backrefs` | 1 |
| `src/test/command-palette.test.tsx` | `command-palette` | 1 |
| `src/test/ui/minimal-tiptap-editor-cycle.test.tsx`, `src/test/fields/edit-richtext.test.tsx` | `richtext-editor` | 2 |
| `src/test/actions-menu.test.tsx`, `automation-panel.test.tsx`, `dynamic-columns.test.tsx`, `lib/use-permissions.test.ts` | see 4b/4c — `shared`-only imports do **not** make a slice | — |

Rename nothing. `git mv src/test/dashboard/builder/builder-pane.test.tsx
src/features/dashboard/test/unit/builder-pane.test.tsx`, and so on.

**4b — subject is not a slice → co-locate next to the source** (~32 files):

| Source | Destination |
|---|---|
| `src/test/lib/{api-jwt-decode,icon-registry,password-strength,sanitize-html,status-tone}.test.ts` | `src/lib/<same name>` |
| `src/test/{conditional-format,content-api,filter-dsl,pending-draft,tags-utils}.test.ts` | `src/lib/<same name>` (each imports exactly its `@/lib/<module>`) |
| `src/test/fields/*.test.tsx|ts` (13 files, minus `edit-richtext` → 4a, minus `relation.test.tsx` → 4c) | `src/components/fields/` |
| `src/test/field-registry.test.ts` | `src/components/fields/` |
| `src/test/ui/{card-table-toggle,minimal-tiptap-shared,password-strength-indicator,relative-time}.test.tsx|ts` | `src/components/ui/` |
| `src/test/data-table-density.test.tsx` | `src/components/ui/` |
| `src/test/config/dashboard-menu.test.ts` | `src/config/` |
| `src/test/pages/{accept-invite,error-page,forgot-password}.test.tsx` | `src/pages/` |
| `src/test/actions-menu.test.tsx`, `src/test/automation-panel.test.tsx`, `src/test/dynamic-columns.test.tsx` | next to the module each one imports (`src/components/ui/`, `src/lib/`) — decide per file from its single non-`shared` import; if that import is `@/features/shared/…`, the destination is `src/features/shared/test/unit/` |
| `src/test/lib/use-permissions.test.ts` | `src/features/shared/test/unit/` (its only feature import is `shared`) |

**4c — two or more feature slices → `src/test/cross-slice/`** (8 files, verbatim list; do not add to it
without saying why in the PR):

```
src/test/app.test.tsx                                  → auth, command-palette, dashboard, navigation, settings
src/test/barrels.test.ts                               → auth, content-delete-dialog, content-toolbar, notifications
src/test/pages/content-list.test.tsx                   → automations, content-delete-dialog, content-management, content-toolbar, navigation, schema
src/test/pages/entry-editor.test.tsx                   → backrefs, content-management, entry-editor, navigation
src/test/features/content-list-relation.test.tsx       → content-management + @/components/fields
src/test/features/entry-editor/schema-form-shell.test.tsx → backrefs, entry-editor
src/test/fields/relation.test.tsx                      → content-management, schema
src/test/seed-builder/seed-builder-page.test.tsx       → schema, seed-builder
```

**Import fixes:** 100 of the 102 files import through the `@/` alias, which is path-independent — they
move with **zero** edits. The two exceptions use a relative import into the source tree
(`../features/content-toolbar/content-toolbar`, `../features/automations/components/automation-panel/automation-panel`);
convert both to the `@/features/…` alias form as part of the move.

**Config follow-up, `apps/dashboard/vitest.config.ts`:** `include` and `setupFiles` are unchanged
(`src/**/*.test.{ts,tsx}` covers every destination; `./src/test/setup.ts` stays put). In `coverage.exclude`,
`'src/test/**'` and `'src/**/*.test.{ts,tsx}'` both stay — the first now covers only `setup.ts` and
`cross-slice/`, the second covers every relocated file. No threshold change: coverage measures `src/**/*.{ts,tsx}`
minus tests, and moving a test file changes neither numerator nor denominator. **If the numbers move,
something other than a move happened — stop and find it.**

### Task 5 — `docs/testing.md`

Extend the page Sprint 1 created. Add one table and one paragraph; do not restate the rules from
`_config/testing_conventions.md`.

```markdown
## Where a test file lives

| Kind | apps/api | apps/dashboard |
|------|----------|----------------|
| unit, subject inside a feature slice | co-located in the slice, or `src/features/<slice>/test/unit/` | `src/features/<slice>/test/unit/` |
| unit, subject outside any slice (`lib/`, `components/`, `middleware/`, `shared/`) | next to the source file | next to the source file |
| integration (real D1, `@beechcms/testing`) | `src/features/<slice>/test/integration/<name>.integration.test.ts` | — |
| crosses two or more slices | `test/flow/` | `src/test/cross-slice/` |
| e2e (browser) | top-level `e2e/` (Sprint 4, not built yet) | ← same |

`pnpm beech lint` runs `scripts/check-test-placement.mjs`, which fails the build on a misplaced test
file or a cross-slice import from inside a slice. The rules it enforces are the normative ones in
`_config/testing_conventions.md` §0-§1; the script is their executable form, not a second source of
truth.

A test that needs two feature slices is not a slice test. It goes to the cross-slice location above —
never into one of the slices it spans, which would manufacture the cross-slice import VSA forbids.
```

### Task 6 — Re-sync the knowledge graph

Every path in the AST graph that this sprint moved is now stale.

```bash
graphify update . --force
```

`--force` is required: files were deleted from their old paths.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run from the repository root, in this order. Each gate must be green before the next task starts.

```bash
# --- Gate 0: the unblock (Task 0). Docker stack may be STOPPED for this one.
pnpm --filter @beechcms/api test:integration
#   must report 1 passed file and a nonzero test count. If it errors in apply-migrations.ts,
#   stop: no file move can fix a migration failure.

# Local bootstrap replays the same migration through wrangler — prove it too.
pnpm beech db:reset

# --- Gate 1: API moves (Tasks 2-3)
pnpm --filter @beechcms/api type-check
pnpm beech dev            # second shell, if the stack is not already up (forks tier needs MinIO/Mailpit)
pnpm --filter @beechcms/api test:unit
#   file count must be IDENTICAL to the pre-sprint count (148 files). A move that loses a file
#   shows up here as a smaller total, not as a failure.

# --- Gate 2: dashboard moves (Task 4)
pnpm --filter @beechcms/dashboard type-check
pnpm --filter @beechcms/dashboard test
#   123 files, same totals as before the sprint. Coverage thresholds unchanged and still met.

# --- Gate 3: enforcement (Task 1)
node scripts/check-test-placement.mjs        # must print "test placement — OK"
pnpm beech lint                              # runs the checker, then turbo lint

# Prove the checker actually bites (do this by hand, then revert):
#   1. git mv one slice test back to apps/dashboard/src/test/  -> expect R4 violation, exit 1
#   2. add `import '@/features/rbac/api'` to a test inside features/settings -> expect R3, exit 1
#   3. rename a file under test/integration/ to foo.test.ts    -> expect R2, exit 1

# --- Gate 4: whole repo
pnpm run build
pnpm beech test
pnpm beech test --diff
graphify update . --force
```

Assertions to make by hand while validating:
- The API and dashboard test **file counts and test counts** must be byte-identical to the pre-sprint
  run. This sprint moves files; a changed count means content changed somewhere it should not have.
- `pnpm --filter @beechcms/api test:integration` must still pass with the Docker stack **stopped**
  (Sprint 1 invariant — the workers tier must never reach MinIO/Mailpit).
- `git diff --stat` must show renames (`R`) almost exclusively. A large `+/-` count on a moved test
  file means it was rewritten, not moved — out of scope, back it out.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `apps/api/migrations/0000_v040_base.sql` seeds SuperAdmin permissions with 7 single-row
      `INSERT OR IGNORE … SELECT` statements and contains **no** `UNION ALL` in that block.
- [ ] `pnpm --filter @beechcms/api test:integration` passes with the Docker stack stopped, and
      `pnpm beech db:reset` completes without a D1 error.
- [ ] `ARCH_FINDING_d1_compound_select.md` carries the Resolution section; the finding file is amended,
      not deleted.
- [ ] `scripts/check-test-placement.mjs` exists, exits 0 on the post-move tree, and exits 1 with a
      per-violation report for each of the three hand-tested violations (R2, R3, R4).
- [ ] The checker reads tracked files via `git ls-files`, parses no TypeScript, and adds no dependency.
- [ ] `pnpm beech lint` runs the checker before `turbo run lint` and propagates its exit code;
      `.husky/pre-commit` invokes it; root `package.json` exposes `lint:tests`.
- [ ] `apps/dashboard/src/test/` contains exactly `setup.ts` and the `cross-slice/` folder — nothing else.
- [ ] `cross-slice/` contains exactly the 8 files listed in Task 4c. Any addition is justified in the PR
      description by naming the two or more slices the file imports.
- [ ] Every relocated dashboard test whose subject is a single feature slice lives at
      `src/features/<slice>/test/unit/`, and imports no sibling slice (`@/features/shared` excepted).
- [ ] No `__tests__/` folder remains under `apps/api/src/features/**`.
- [ ] All 21 `flow-*.test.ts` suites live in `apps/api/test/flow/`; `apps/api/test/helpers/**`,
      `apps/api/test/mocks/**`, `apps/api/test/fixtures*` and `apps/api/test/harness/**` are unmoved.
- [ ] `apps/api/test/helpers/d1-test-database.ts` is unmodified and undeleted, and all of its dependents
      still pass.
- [ ] **Test content is unchanged.** `git diff -M` shows renames; the only in-file edits are import
      specifiers (and the two dashboard relative → `@/` alias conversions). No assertion added, removed
      or rewritten; no suite converted to the harness.
- [ ] API test file count = pre-sprint count; dashboard test file count = pre-sprint count; both test
      totals identical to pre-sprint.
- [ ] `docs/testing.md` documents the layout table, the checker, and the cross-slice escape hatch, and
      points to `_config/testing_conventions.md` as normative without duplicating its rules.
- [ ] Coverage thresholds are unchanged in both apps and still met
      (api 80/70/80/80, dashboard 30/30/25/30).
- [ ] `packages/core/**`, `packages/testing/**`, `scripts/test-coverage-diff.mjs`,
      `scripts/test-runner.mjs` and `.github/workflows/**` show zero diff.
- [ ] `pnpm --filter @beechcms/api type-check`, `pnpm --filter @beechcms/dashboard type-check`,
      `pnpm lint`, `pnpm run build`, `pnpm beech test` and `pnpm beech test --diff` all pass.
- [ ] `graphify update . --force` has been re-run, so the AST graph matches the new paths.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executing agent MUST NOT, in this sprint:

1. **Convert any suite to the real-D1 harness.** The 21 flow suites get a folder, not a rewrite. They
   depend on `D1TestDatabase`, MinIO, Mailpit and the webhook tester, none of which the workers tier
   binds. Conversion is per-suite Boy Scout work at the moment its endpoint is touched — it is not a
   sprint deliverable, here or later. (Roadmap Sprint 2 lists "migration of the flow-* suites"; it is
   being honoured as *relocation + tier labelling*, and the reason is recorded in the VETO Audit.)
2. **Retrofit `_config/testing_conventions.md` onto relocated files.** A `git mv` is not a touch. The
   conventions bind files whose content this sprint changes, which — apart from import specifiers — is
   none of them. Reformatting 102 moved files would bury the rename diff and destroy reviewability.
3. **Move the ~42 API tests already co-located inside their own slice, or the 21 dashboard tests
   already co-located inside theirs.** Conventions §0 admits co-location as a compliant unit placement.
   Churn without a defect to fix.
4. **Touch `apps/api/test/helpers/d1-test-database.ts`, `apps/api/test/mocks/**`, or `apps/api/test/fixtures.ts`.**
   41 dependents. They decay under the Boy Scout Rule, as Sprint 1 established.
5. **Modify `scripts/test-coverage-diff.mjs`, `scripts/test-runner.mjs`, or `.github/workflows/**`.**
   No `--tier` flag, no workspace-list edit, no CI job split, no CI wiring of the placement checker.
   → Sprint 3 `ci-test-tiering`, which owns the workflow file and can add the check where it already
   edits.
6. **Add Playwright, an `e2e/` directory, or any browser dependency.** → Sprint 4 `e2e-playwright`.
7. **Build scale/perf seeding or extend `@beechcms/testing` in any way.** The package is read-only this
   sprint. → Sprint 5 `scale-perf-tier`.
8. **Add a fake, a mock, or a test double anywhere.** No new test infrastructure is required to move a
   file.
9. **Change coverage `include`/`exclude` semantics or thresholds** beyond re-pointing paths that a move
   invalidated. A threshold that "needs" lowering after a pure move is evidence of a lost file — find
   it instead.
10. **Widen the `cross-slice/` list to dodge a checker failure.** If a slice test trips R3, the fix is
    to look at why a slice test reaches into a sibling — that is a production-code smell worth
    reporting, not a placement to relabel.
11. **Weaken or disable a checker rule to get a green run.** If a rule is wrong, remove it entirely and
    say so in the PR. A half-enforced rule is worse than none: it teaches the next author that the
    check is negotiable.
12. **Change `packages/core` source or any migration other than the single statement in Task 0.** If
    something else in `migrations/` appears to need a fix, stop and report it as an architecture
    finding, exactly as Sprint 1 did.
