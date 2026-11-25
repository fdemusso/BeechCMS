# Sprint 3 — `ci-test-tiering`

Roadmap entry: `output/backlog/ROADMAP.md` § Sprint 3. Source brief: `stages/00_ideation/output/feature_brief.md` (issue #108).
Predecessors: Sprint 1 `harness-foundation` (archived `docs/Sprints/S1_Harness_Foundation/`), Sprint 2 `slice-test-layout` (archived `docs/Sprints/S2_Slice_Test_Layout/`).

---

### Pre-Computation Analysis

**a) God Nodes identified via the CLI**

| Node (graphify id) | Degree | Why it matters here |
|---|---|---|
| `packages_cli_src_index` (`cli/src/index.ts`) | **65** | The only god node in this sprint's blast radius. Sole aggregation point of every `beech` command; `test.ts` is re-exported from it at `packages/cli/src/index.ts:L38`. Adding a flag to `test()` touches this node's contract, nothing else. |
| `scripts_test_runner` (`scripts/test-runner.mjs`) | 17 | Local god node of the fingerprint/lock system — degree is entirely `contains` edges to its own internals (`acquireLock`, `readCache`, `computeRepoFingerprint`). **Zero inbound edges**: nothing imports it. This sprint does not modify it. |
| `packages_cli_src_commands_test` (`test.ts`) | 3 | `<-- cli/src/index.ts [re_exports]`, `--> test()`, `--> TestOptions`. The entire dependency surface of the command being extended. |

**b) Architectural boundaries affected**

| Boundary | Touched? | Detail |
|---|---|---|
| `@beechcms/core` | **NO** | Zero files. `graphify affected` on the touched nodes reaches nothing in `packages/core`. |
| `apps/api` (`src/**`) | **NO production code.** Build-config only | `apps/api/vitest.config.ts`, `apps/api/vitest.workers.config.ts`, `apps/api/package.json`. No slice, no handler, no middleware, no repository, no migration. |
| `apps/dashboard` | **NO production code.** `package.json` script only | One added `test:unit` script alias. |
| `packages/cli` | **YES** | `src/commands/test.ts` (+ its unit suite). Command layer only, no D1, no Botanical Engine. |
| Root tooling | **YES** | `scripts/lib/test-tiers.mjs` (new), `scripts/test-coverage-diff.mjs`, `turbo.json`, `bin/cli.mjs`, `.github/workflows/test.yml`, `docs/`. |

**c) `graphify affected` impact analysis (breaking-change proof)**

```
$ graphify affected "packages_cli_src_commands_test_test" --depth 2
Affected nodes for test()
- cli/src/index.ts [re_exports] packages/cli/src/index.ts:L38
```
→ The only consumer of `test()` is the barrel. `TestOptions` is additive (new optional `tier?: string`), so no existing caller breaks. `bin/cli.mjs` calls it through a dynamic `import('@beechcms/cli')` and is edited in the same sprint.

```
$ graphify affected "apps/api/vitest.config.ts" --depth 2
No affected nodes found.

$ graphify affected "turbo_tasks_test" --depth 2
No affected nodes found.

$ graphify affected "test-coverage-diff" --depth 2
- pad() [calls] scripts/test-coverage-diff.mjs:L324      (internal self-edge only)

$ graphify explain "apps/api/vitest.workers.config.ts"
Degree: 1  →  dirname [contains]                          (no inbound edges)
```
→ Every test-infrastructure file in this sprint is a **graph leaf with zero inbound module edges**. They are invoked by process spawn (`turbo run`, `spawnSync`, `npx vitest`), never imported. Changing them cannot break a production module by construction; the only contracts at risk are the *spawn contracts* (package script names, turbo task names, CLI flags), which Section 4 pins exactly and Section 6 gates with tests.

---

### VETO Audit

Evaluated against `_config/ponytail_arch.md`.

**1. Botanical Invariant (no D1 access bypassing `@beechcms/core`)** — RESPECTED, vacuously and by inspection. This sprint writes zero SQL, adds zero migrations, and touches zero repository. The only D1 that appears anywhere is the workerd-bound `DB` binding already declared in `apps/api/vitest.workers.config.ts` by Sprint 1, which is not modified except to gain a project `name`. No hardcoded content field names are introduced (the tier registry keys on workspace directories and vitest project names, never on Seed/branch identifiers).

**2. VSA (zero cross-feature imports)** — RESPECTED, and *strengthened*. The new `apps/api` `projects` split enforces the slice boundary mechanically: the `unit` project may only see `src/**`, the `integration` project only `src/features/**/test/integration/**` (Sprint 1), the `flow` project only `test/**` — the location Sprint 2 designated for cross-slice suites. No new import crosses a slice; `scripts/check-test-placement.mjs` (Sprint 2) stays the enforcement mechanism, unmodified.

**3. YAGNI / over-engineering** — three proposals were cut during this audit:
- *A tier abstraction layer inside `@beechcms/testing`* — REJECTED. Tiers are a CI selection concern, not a runtime one; the registry is 40 lines of plain data in `scripts/lib/`.
- *A generic plugin-style tier registry allowing arbitrary user tiers* — REJECTED. Four fixed tiers exist (`unit`, `flow`, `integration`, `e2e`), three of them runnable. A closed union is testable; an open one is not.
- *Merging `vitest.workers.config.ts` into the `projects` array* — REJECTED. The workerd pool needs its own plugin + migration preload and has no v8 coverage; merging buys one less `--config` flag and risks the coverage run the whole repo gates on.

**4. Cloudflare purity** — RESPECTED. The integration tier stays on `@cloudflare/vitest-pool-workers` (real D1/workerd). No second DB engine, no `better-sqlite3`, no stateful background job.

**5. Scope-gate adjustment made during this audit.** A docker-free `unit` tier initially required relocating `apps/api/src/features/automations/executors/action-executors.test.ts` (the only `src/**` suite that talks to Mailpit + webhook-tester — verified by grep over all 109 `src/**/*.test.ts`). A file move would have removed its coverage from the `apps/api` coverage run and broken the 80/70/80/80 thresholds. **Adjusted plan:** the file stays where it is; it is pinned into the `flow` *project* by path while root-level coverage keeps aggregating both projects. Zero test content changes, coverage unchanged, `unit` becomes genuinely Docker-free.

No violation found. Plan proceeds.

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Sprint 1 built the real-D1 harness; Sprint 2 gave every test a VSA-mirrored address and made that address enforceable (`scripts/check-test-placement.mjs`). What neither sprint did is make the *runner* aware that those addresses mean different costs. Today `apps/api`'s single forks config globs `test/**` and `src/**` into one undifferentiated run guarded by a Docker precheck, and `scripts/test-coverage-diff.mjs` drives it with `vitest related` alone across 5 hardcoded workspaces. The brief's explicit risk (§4, "`vitest related` over-inclusion") is therefore live: a one-line change to a slice's source file can pull a Docker-bound HTTP flow suite into what a developer believes is a fast unit run.

This sprint must land before Sprint 4 (`e2e-playwright`) because e2e exclusion cannot be *by construction* until there is a construction to exclude it from. Adding a top-level `e2e/` directory to the current runner would either be silently ignored (it is not in `WORKSPACES`) or silently swept in the day someone adds it — both failure modes the brief calls out by name (§4, "E2E has no CI awareness today"). The tier registry introduced here reserves `e2e` as a known-but-never-selected tier, so Sprint 4 adds a runner to an existing slot instead of retrofitting a concept.

**VSA adherence:** the sprint adds no import anywhere in either slice tree. It makes the slice boundary *executable*: each tier is a vitest project whose `include` glob is exactly one of the three locations `docs/testing.md` documents. A suite in the wrong place is now not merely a lint violation — it is unrunnable in its tier.

**Botanical Engine adherence:** no DB interaction of any kind is added. The integration tier continues to reach D1 only through the API's own request path, which goes through `@beechcms/core`; this sprint only decides *when* that tier runs.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Test topology on `HEAD` (`80e4082`)**

| Location | Files | Runner today | Needs Docker |
|---|---|---|---|
| `apps/api/src/**/*.test.ts` | 109 | `vitest.config.ts` (forks) | only `src/features/automations/executors/action-executors.test.ts` |
| `apps/api/test/*.test.ts` | 21 | same config | yes (`email-smtp.test.ts` directly; whole run via `globalSetup`) |
| `apps/api/test/flow/flow-*.test.ts` | 18 | same config | yes |
| `apps/api/src/features/**/test/integration/*.integration.test.ts` | 1 | `vitest.workers.config.ts` (workerd, real D1) | no |
| `apps/dashboard/src/**/*.test.{ts,tsx}` | 123 | `vitest.config.ts` (happy-dom) | no |
| `packages/{core,cli,mcp,client,forms-react,widget-sdk}` | — | each own `vitest.config.ts` | no |
| top-level `e2e/` | — | **does not exist** (Sprint 4) | — |

Counts corroborated by `docs/Sprints/S2_Slice_Test_Layout/review_report.md`: API unit run 148 files / 1600 tests, dashboard 123 files / 887 tests, integration 1 file / 3 tests — all green on `HEAD`.

**`apps/api/vitest.config.ts` (current, `apps/api/vitest.config.ts:7-20`)**
- `pool: 'forks'`
- `globalSetup: ['./test/docker-precheck.runner.ts', './test/global-setup.ts']` — applies to **every** suite in the config, unit ones included. `assertDockerStackReady()` (`apps/api/test/docker-precheck.ts:26`) pings MinIO `/minio/health/live`, Mailpit `/livez`, webhook-tester `/api/version` and aborts the whole run if any is down; `global-setup.ts` then creates/empties the `beech-media-test` MinIO bucket.
- `include: ['test/**/*.test.ts', 'src/**/*.test.ts']`
- `exclude: [..., 'src/features/**/test/integration/**']` — the only tier isolation that exists today.
- `coverage.include: ['src/**/*.ts']`, thresholds `statements 80 / branches 70 / functions 80 / lines 80`, plus a long curated exclude list.

**`apps/api/vitest.workers.config.ts` (current)** — `include: ['src/features/**/test/integration/**/*.test.ts']`, `setupFiles: ['./test/harness/apply-migrations.ts']`, `cloudflareTest({ miniflare: { compatibilityDate: '2026-02-13', compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'], bindings: { TEST_MIGRATIONS: migrations } } })`. No coverage block (workerd pool has no v8 coverage provider). No project `name`.

**`scripts/test-coverage-diff.mjs` (current, 566 lines)**
- `WORKSPACES` hardcoded at L69-75: `packages/core`, `packages/cli`, `packages/mcp`, `apps/api`, `apps/dashboard` — `packages/client`, `packages/forms-react`, `packages/widget-sdk` are silently unreachable despite having `"test": "vitest run"` and their own `vitest.config.ts`.
- `detectBase()` (L87) → upstream branch, else `devs|origin/devs|main|master|…`, else `HEAD~1`.
- `getChangedFiles()` (L119) → union of `base...HEAD`, staged, unstaged.
- `parseVitestConfig()` (L139) → regex extraction of `coverage.include/exclude/thresholds`, deliberately no TS import (the repo's TS 7.0 `noopParser` constraint).
- `runVitestCoverage()` (L235) → `npx vitest related --run --coverage …` per workspace. **No `--config`, no `--project`, no tier concept.** Files outside `WORKSPACES` are listed as "Ignoring N file(s) outside tracked workspaces".
- `main()` never sets a non-zero exit code for failed tests; only an uncaught throw exits 1 (L563).

**`packages/cli/src/commands/test.ts` (current, 42 lines)** — `TestOptions { coverage?, diff? }`; `--diff` → `node scripts/test-coverage-diff.mjs`; `--coverage` → `turbo run test:coverage`; default → `turbo run test`. Exits with the child status.

**`bin/cli.mjs`** — `cmdTest(args)` at L270-275 reads `--coverage` / `--diff` only; help block at L102-104. `packages/cli/src/test/cli-docs-parity.test.ts` asserts every key of the `COMMANDS` dictionary appears in `docs/build/cli-workflows.md`.

**`turbo.json`** — tasks: `dev`, `build`, `type-check`, `lint`, `deploy`, `@beechcms/api#deploy`, `test` (`cache:false`, `dependsOn:["^build"]`), `test:coverage` (same). No tier tasks.

**`.github/workflows/test.yml`** — two jobs. `test-api` starts Mailpit + webhook-tester as `services:` and MinIO via `docker run`, builds `@beechcms/core` + `@beechcms/search-client`, then runs `pnpm --filter @beechcms/api test` (which is `vitest run && vitest run --config vitest.workers.config.ts` — unit, flow and integration in one opaque job). `test-dashboard` builds core + widget-sdk and runs `pnpm --filter @beechcms/dashboard test`.

**`scripts/test-runner.mjs`** — whole-repo SHA256 fingerprint cache, single-run PID lock, hardware-aware concurrency (`TURBO_CONCURRENCY`/`VITEST_MAX_THREADS` = 2 on ≤8GB). Invoked only by root `pnpm test` / `pnpm test:coverage`. `beech test` already bypasses it (spawns `turbo` directly) for `--coverage` and `--diff`. **Not modified in this sprint.**

**Versions pinned on `HEAD`:** `vitest 4.1.11` (root + both apps), `@vitest/coverage-v8 ^4.1.11`, `@cloudflare/vitest-pool-workers 0.22.0` (peer `vitest ^4.1.0`). Vitest 4 supports `test.projects` with per-project `include`/`globalSetup` and a single root-level `coverage` block aggregating across projects — this is the mechanism Section 4 relies on.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

**New files**
1. `scripts/lib/test-tiers.mjs` — the single source of truth: tier ids, default `--diff` tiers, never-selected path prefixes, the workspace→tier runner registry, `parseTiers()`.
2. `packages/cli/src/test/test.test.ts` — unit suite for the extended `test()` command (tier 8 rules of `_config/testing_conventions.md`, unit tier, mocks `node:child_process` at the boundary only).

**Modified files**
3. `scripts/test-coverage-diff.mjs` — consumes the registry; `--tier` flag; per-tier vitest invocation (`--project` / `--config`); explicit `e2e/` refusal; non-zero exit on *failed tests* (coverage shortfalls keep warn-only behaviour).
4. `apps/api/vitest.config.ts` — split into `projects: [unit, flow]`; `globalSetup` (Docker precheck + MinIO bucket) moves to the `flow` project only; root-level `coverage` block unchanged and now aggregating both projects.
5. `apps/api/vitest.workers.config.ts` — add `name: 'integration'` (identification only; include/plugins untouched).
6. `apps/api/package.json` — `test:unit` → `--project unit`; new `test:flow`; `test` runs all three tiers; `test:integration`, `test:coverage` unchanged in behaviour.
7. `apps/dashboard/package.json` + `packages/{core,cli,mcp,client,forms-react,widget-sdk,search-client}/package.json` — one-line `"test:unit": "vitest run"` alias each, so `turbo run test:unit` selects the whole unit tier.
8. `turbo.json` — `test:unit`, `test:flow`, `test:integration` tasks (`cache:false`, `dependsOn:["^build"]`).
9. `packages/cli/src/commands/test.ts` — `TestOptions.tier`; validation against the runnable-tier union; `--diff` passthrough; non-diff mapping to `turbo run test:<tier>`.
10. `bin/cli.mjs` — `cmdTest` parses `--tier <list>`; help text lists the flag and the tiers.
11. `.github/workflows/test.yml` — replaced by three tier jobs: `unit` (no Docker), `flow` (full Docker stack, today's service block verbatim), `integration` (no Docker, workerd).
12. `docs/build/cli-workflows.md` — `beech test` row gains `--tier`; required by `cli-docs-parity.test.ts`'s sibling expectations and by `scripts/docs-fact-check.mjs`.
13. `docs/testing.md` — a "Running one tier" section mapping tier → command → CI job.

**Explicitly not feature code.** No route, handler, middleware, repository, migration, React component or Seed is added or modified in this sprint.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### Task 1 — `scripts/lib/test-tiers.mjs` (new)

```js
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

// Single source of truth for test tiers. Consumed by scripts/test-coverage-diff.mjs and
// mirrored (names only) by packages/cli/src/commands/test.ts, which cannot import a root
// .mjs from its bundled build. packages/cli/src/test/test.test.ts asserts the two agree.

/** Every tier that exists. `e2e` is declared so it can be refused, not run (Sprint 4 builds it). */
export const TIERS = ['unit', 'flow', 'integration', 'e2e']

/** Tiers with a runner today. */
export const RUNNABLE_TIERS = ['unit', 'flow', 'integration']

/** What `--diff` selects when no --tier is given. `flow` (Docker) and `e2e` are never implicit. */
export const DEFAULT_DIFF_TIERS = ['unit', 'integration']

/** Repo-relative prefixes `--diff` must never select, whatever changed under them. */
export const NEVER_SELECTED_PREFIXES = ['e2e/']

/**
 * @typedef {object} TierRunner
 * @property {'related'|'all'} mode     'related' = `vitest related <changed files>`; 'all' = whole tier.
 * @property {string|null}     project  value for `--project`, or null when the config has no projects.
 * @property {string|null}     config   value for `--config`, or null for the workspace default config.
 * @property {boolean}         coverage false = run without coverage (workerd pool has no v8 provider).
 */

/** @type {TierRunner} */
const UNIT_DEFAULT = { mode: 'related', project: null, config: null, coverage: true }

/**
 * @typedef {object} Workspace
 * @property {string} name
 * @property {string} dir
 * @property {string} config                        vitest config parsed for coverage exclusions
 * @property {Record<string, TierRunner>} tiers
 */

/** @type {Workspace[]} */
export const WORKSPACES = [
  { name: 'packages/core',         dir: 'packages/core',         config: 'vitest.config.ts', tiers: { unit: UNIT_DEFAULT } },
  { name: 'packages/cli',          dir: 'packages/cli',          config: 'vitest.config.ts', tiers: { unit: UNIT_DEFAULT } },
  { name: 'packages/mcp',          dir: 'packages/mcp',          config: 'vitest.config.ts', tiers: { unit: UNIT_DEFAULT } },
  { name: 'packages/client',       dir: 'packages/client',       config: 'vitest.config.ts', tiers: { unit: UNIT_DEFAULT } },
  { name: 'packages/forms-react',  dir: 'packages/forms-react',  config: 'vitest.config.ts', tiers: { unit: UNIT_DEFAULT } },
  { name: 'packages/widget-sdk',   dir: 'packages/widget-sdk',   config: 'vitest.config.ts', tiers: { unit: UNIT_DEFAULT } },
  { name: 'apps/dashboard',        dir: 'apps/dashboard',        config: 'vitest.config.ts', tiers: { unit: UNIT_DEFAULT } },
  {
    name: 'apps/api',
    dir: 'apps/api',
    config: 'vitest.config.ts',
    tiers: {
      unit:  { mode: 'related', project: 'unit', config: null, coverage: true },
      flow:  { mode: 'related', project: 'flow', config: null, coverage: true },
      // One suite, workerd pool, no v8 coverage: selection is all-or-nothing by design.
      integration: { mode: 'all', project: null, config: 'vitest.workers.config.ts', coverage: false },
    },
  },
]

/**
 * @param {string|null} value comma-separated tier list, or null for the default set
 * @returns {{ tiers: string[], error: string|null }}
 */
export function parseTiers(value) {
  if (!value) return { tiers: [...DEFAULT_DIFF_TIERS], error: null }

  const requested = value.split(',').map((t) => t.trim()).filter(Boolean)
  if (requested.length === 0) return { tiers: [], error: `--tier needs at least one of: ${RUNNABLE_TIERS.join(', ')}` }

  for (const tier of requested) {
    if (tier === 'e2e') {
      return { tiers: [], error: `tier 'e2e' has no runner yet and is never selected by --diff (see ROADMAP Sprint 4)` }
    }
    if (!RUNNABLE_TIERS.includes(tier)) {
      return { tiers: [], error: `unknown tier '${tier}'. Valid tiers: ${RUNNABLE_TIERS.join(', ')}` }
    }
  }
  return { tiers: [...new Set(requested)], error: null }
}

/** @param {string} file repo-relative path @returns {boolean} */
export function isNeverSelected(file) {
  return NEVER_SELECTED_PREFIXES.some((prefix) => file === prefix.replace(/\/$/, '') || file.startsWith(prefix))
}
```

### Task 2 — `apps/api/vitest.config.ts` (rewrite)

Keep the entire existing `coverage` block **byte-identical** (include, the full exclude list, thresholds 80/70/80/80). Only the structure above it changes:

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { defineConfig } from 'vitest/config'

// Slice-local suites that cross an I/O boundary (real Mailpit + webhook-tester) and therefore
// belong to the Docker-bound flow tier, wherever they live on disk. Pinning them by path keeps
// the unit tier Docker-free without moving a file out of its owning slice (VSA) and without
// losing its coverage: the root-level coverage block below aggregates both projects.
const DOCKER_BOUND_SUITES = ['src/features/automations/executors/action-executors.test.ts']

const SHARED_EXCLUDE = ['**/node_modules/**', '**/dist/**']

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          pool: 'forks',
          include: ['src/**/*.test.ts'],
          // Integration tier is owned by vitest.workers.config.ts (real D1 via workerd).
          exclude: [...SHARED_EXCLUDE, 'src/features/**/test/integration/**', ...DOCKER_BOUND_SUITES],
          silent: 'passed-only',
          reporters: ['verbose'],
        },
      },
      {
        test: {
          name: 'flow',
          pool: 'forks',
          // test/ = cross-slice HTTP flow suites + Docker-backed suites (Sprint 2 layout).
          include: ['test/**/*.test.ts', ...DOCKER_BOUND_SUITES],
          exclude: [...SHARED_EXCLUDE],
          globalSetup: ['./test/docker-precheck.runner.ts', './test/global-setup.ts'],
          silent: 'passed-only',
          reporters: ['verbose'],
        },
      },
    ],
    coverage: {
      /* ── UNCHANGED: copy the existing block verbatim from HEAD ──
         provider 'v8', reporter ['text','lcov','html'], include ['src/**/*.ts'],
         the full exclude list (src/types.ts … 'src/**/index.ts'),
         thresholds { statements: 80, branches: 70, functions: 80, lines: 80 } */
    },
  },
})
```

Invariants the executing agent must hold:
- `globalSetup` appears **only** in the `flow` project. A Docker precheck in the unit project defeats the sprint.
- The `coverage` block stays at `test.coverage` (root), never inside a project — Vitest 4 aggregates project results into one report there; moving it would halve the measured coverage and trip the thresholds.
- `vitest run --coverage` with no `--project` must keep running both projects, so `test:coverage` output stays identical to `HEAD`.

### Task 3 — `apps/api/vitest.workers.config.ts` (one line)

Inside `test: { … }`, above `include`:

```ts
    name: 'integration',
```

Nothing else changes (plugins, `readD1Migrations`, `setupFiles`, `compatibilityDate: '2026-02-13'`, `nodejs_compat`, `d1Databases: ['DB']`, `TEST_MIGRATIONS` binding all stay as Sprint 1 left them).

### Task 4 — package scripts

`apps/api/package.json`:
```json
    "test": "vitest run && vitest run --config vitest.workers.config.ts",
    "test:unit": "vitest run --project unit",
    "test:flow": "vitest run --project flow",
    "test:integration": "vitest run --config vitest.workers.config.ts",
    "test:coverage": "vitest run --coverage"
```

`apps/dashboard/package.json` and each of `packages/{core,cli,mcp,client,forms-react,widget-sdk,search-client}/package.json` — add next to the existing `"test"`:
```json
    "test:unit": "vitest run",
```

### Task 5 — `turbo.json`

Add after the existing `"test"` task, same shape:

```json
    "test:unit": {
      "cache": false,
      "dependsOn": ["^build"]
    },
    "test:flow": {
      "cache": false,
      "dependsOn": ["^build"]
    },
    "test:integration": {
      "cache": false,
      "dependsOn": ["^build"]
    },
```

Turbo skips workspaces that do not declare the script, so `test:flow` / `test:integration` resolve to `apps/api` alone.

### Task 6 — `scripts/test-coverage-diff.mjs`

Surgical changes only; the ANSI helpers, `detectBase()`, `getChangedFiles()`, `parseVitestConfig()`, `isExcluded()`, `parseCoverageSummary()`, `renderTable()` and the summary footer stay as they are.

**6a — imports and flag (replace the `WORKSPACES` const at L69-75):**
```js
import { WORKSPACES, parseTiers, isNeverSelected, NEVER_SELECTED_PREFIXES } from './lib/test-tiers.mjs'
```
and next to `runAllMode` / `baseOverride`:
```js
const tierArg = getFlag('--tier')
const { tiers: selectedTiers, error: tierError } = parseTiers(tierArg)
if (tierError) {
  console.error(red(`ERROR: ${tierError}`))
  process.exit(1)
}
```
Update the usage header comment with `--tier unit,integration` and `--tier flow`.

**6b — never-selected paths (inside the grouping loop at L395, before the workspace match):**
```js
  for (const file of changedFiles) {
    if (isNeverSelected(file)) { neverSelected.push(file); continue }
    …existing matching…
  }
```
and after the `unmatched` block:
```js
  if (neverSelected.length > 0) {
    console.log(dim(`   Skipping ${neverSelected.length} file(s) under a never-selected prefix (${NEVER_SELECTED_PREFIXES.join(', ')}):`))
    for (const f of neverSelected) console.log(dim(`     - ${f}`))
    console.log(dim('   The e2e tier runs only pre-merge/nightly — never from --diff.'))
    console.log()
  }
```

**6c — tier-aware invocation (replace `runVitestCoverage` at L235-284):**
```js
function runVitestTier(workspace, runner, sourceFiles) {
  const workspaceDir = path.join(ROOT, workspace.dir)
  const relFiles = sourceFiles.map(f => path.relative(workspaceDir, f).replace(/\\/g, '/'))

  const configFlags  = runner.config  ? ['--config', runner.config]  : []
  const projectFlags = runner.project ? [`--project=${runner.project}`] : []

  const coverageFlags = runner.coverage
    ? [
        '--coverage',
        '--coverage.reporter=json-summary',
        '--coverage.reporter=text',
        ...relFiles.map(f => `--coverage.include=${f}`),
        '--coverage.thresholds.lines=0',
        '--coverage.thresholds.functions=0',
        '--coverage.thresholds.branches=0',
        '--coverage.thresholds.statements=0',
      ]
    : []

  // 'related' narrows to the changed files; 'all' runs the whole tier (workerd integration:
  // one suite, no v8 coverage, and `related` cannot see through the harness import chain).
  const selection = runner.mode === 'related' && !runAllMode
    ? ['related', '--run', ...coverageFlags, ...relFiles]
    : ['run', ...coverageFlags]

  const result = spawnSync('npx', ['vitest', ...selection, ...configFlags, ...projectFlags], {
    cwd: workspaceDir, encoding: 'utf8', stdio: 'pipe', shell: true,
  })

  return { stdout: result.stdout || '', stderr: result.stderr || '', status: result.status }
}
```

**6d — main loop (inside `for (const { workspace, files } of workspaceGroups.values())`, after the `sourceFiles` classification):** wrap the existing run + coverage-table block in a per-tier loop:
```js
    for (const tier of selectedTiers) {
      const runner = workspace.tiers[tier]
      if (!runner) continue                      // workspace does not own this tier

      anyWorkspaceRan = true
      console.log(`   ${dim(`[${tier}] vitest (${runner.mode === 'related' && !runAllMode ? 'related' : 'full'}) — ${sourceFiles.length} source file(s)…`)}`)

      const { stdout, stderr, status } = runVitestTier(workspace, runner, sourceFiles)
      …existing compact output printing…

      if (status !== 0) anyTierFailed = true

      if (!runner.coverage) {
        // No coverage provider in this tier: pass/fail is the whole signal.
        console.log(status === 0 ? green(`   [${tier}] PASS`) : red(`   [${tier}] FAIL`))
        console.log()
        continue
      }

      …existing per-file coverage table for this tier, with `[${tier}] ` prefixed to the header…
    }
```
Declare `let anyTierFailed = false` beside `anyWorkspaceRan`.

**6e — exit code.** At the very end of `main()`, after the summary footer:
```js
  // A failing test run now fails the command. Coverage shortfalls stay warn-only:
  // they are a review signal, not a gate, and that behaviour predates this sprint.
  if (anyTierFailed) process.exitCode = 1
```

### Task 7 — `packages/cli/src/commands/test.ts` (full file after edit)

```ts
import pc from 'picocolors'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Tiers with a runner. Mirrors RUNNABLE_TIERS in scripts/lib/test-tiers.mjs, which this
 * bundled package cannot import; packages/cli/src/test/test.test.ts asserts the two agree.
 */
export const RUNNABLE_TIERS = ['unit', 'flow', 'integration'] as const
export type TestTier = (typeof RUNNABLE_TIERS)[number]

export interface TestOptions {
  coverage?: boolean
  diff?: boolean
  /** Comma-separated tier list, e.g. "unit" or "unit,integration". */
  tier?: string
}

export async function test(args: TestOptions): Promise<void> {
  console.log(pc.cyan('\n  beech test — run test suite\n'))

  const cwd = process.cwd()

  const tiers = (args.tier ?? '').split(',').map((t) => t.trim()).filter(Boolean)
  const invalid = tiers.filter((t) => !RUNNABLE_TIERS.includes(t as TestTier))
  if (invalid.length > 0) {
    console.log(pc.red(`  ✗ Unknown tier(s): ${invalid.join(', ')}. Valid tiers: ${RUNNABLE_TIERS.join(', ')}.`))
    if (invalid.includes('e2e')) {
      console.log(pc.yellow('    The e2e tier is not built yet (see ROADMAP Sprint 4).'))
    }
    process.exit(1)
    return
  }

  let command = 'turbo'
  let commandArgs = ['run', 'test']

  if (args.diff) {
    const diffScript = resolve(cwd, 'scripts', 'test-coverage-diff.mjs')
    if (!existsSync(diffScript)) {
      console.log(pc.red('  ✗ Coverage diff script not found (scripts/test-coverage-diff.mjs).'))
      process.exit(1)
      return
    }
    command = 'node'
    commandArgs = ['scripts/test-coverage-diff.mjs']
    if (tiers.length > 0) commandArgs.push('--tier', tiers.join(','))
  } else if (tiers.length > 0) {
    // --tier wins over --coverage: a tier run is a selection, coverage is a reporting mode.
    commandArgs = ['run', ...tiers.map((t) => `test:${t}`)]
  } else if (args.coverage) {
    commandArgs = ['run', 'test:coverage']
  }

  const result = spawnSync(command, commandArgs, {
    stdio: 'inherit',
    cwd,
    shell: true,
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
    return
  }
}
```

### Task 8 — `bin/cli.mjs`

Replace `cmdTest` (L270-275):
```js
async function cmdTest(args) {
  const coverage = args.includes('--coverage')
  const diff     = args.includes('--diff')
  const tierIdx  = args.indexOf('--tier')
  const tier     = tierIdx !== -1 && args[tierIdx + 1] && !args[tierIdx + 1].startsWith('--')
    ? args[tierIdx + 1]
    : undefined
  const { test } = await import('@beechcms/cli')
  await test({ coverage, diff, tier })
}
```

Help block (L102-104) becomes:
```js
    ${pc.cyan('test')}            Run the test suite via Turborepo / Vitest
      --coverage      Generate coverage reports
      --diff          Run test coverage only for files modified on the branch
      --tier <list>   Run one or more tiers: unit, flow, integration (comma-separated)
```

### Task 9 — `packages/cli/src/test/test.test.ts` (new)

Unit tier. Header is MIT, matching every other file in `packages/cli/src/test/` (package convention, verified in Sprint 2's review). Follow the `lint.test.ts` idiom exactly.

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { test, RUNNABLE_TIERS } from '../commands/test.js'

vi.mock('node:child_process', () => ({ spawnSync: vi.fn(() => ({ status: 0 })) }))
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, existsSync: vi.fn(() => true) }
})
vi.mock('picocolors', () => ({ default: { cyan: (s: string) => s, red: (s: string) => s, yellow: (s: string) => s } }))

describe('test command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(spawnSync).mockImplementation(() => ({ status: 0 }) as any)
  })

  it('runs turbo run test when no flag is given', async () => { … })

  it('maps --tier integration to turbo run test:integration', async () => { … })

  it('runs one turbo task per tier for a comma-separated list', async () => {
    // expects ['run', 'test:unit', 'test:integration']
  })

  it('forwards the tier list to the diff runner when --diff is combined with --tier', async () => {
    // expects 'node', ['scripts/test-coverage-diff.mjs', '--tier', 'unit,integration']
  })

  it('rejects an unknown tier with exit code 1 and spawns nothing', async () => { … })

  it('rejects the e2e tier, which has no runner yet', async () => { … })

  it('exposes the same runnable tiers as scripts/lib/test-tiers.mjs', () => {
    const source = readFileSync(resolve(__dirname, '../../../../scripts/lib/test-tiers.mjs'), 'utf8')
    const declared = source.match(/export const RUNNABLE_TIERS = \[([^\]]+)\]/)?.[1] ?? ''
    const names = [...declared.matchAll(/'([^']+)'/g)].map((m) => m[1])

    expect(names).toEqual([...RUNNABLE_TIERS])
  })
})
```

Conventions that bind here: one `it()` per behaviour (§1.6), `it()` names state behaviour + outcome without "should" (§1.5), four-zone anatomy with one ACT per test (§2.1), the ACT result named (§2.2), no `// ARRANGE` comments (§2.3), `beforeEach` not `beforeAll` for the mock reset (§3.2).

### Task 10 — `.github/workflows/test.yml` (rewrite)

```yaml
name: Test

on:
  push:
    branches: [master, devs]
  pull_request:
    branches: [master, devs]

jobs:
  unit:
    name: Unit Tier
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - name: Setup pnpm
        uses: pnpm/action-setup@v6
      - name: Setup Node.js
        uses: actions/setup-node@v7
        with:
          node-version: '22'
          cache: 'pnpm'
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      # No Docker: the unit tier is Docker-free by construction (vitest project 'unit').
      - name: Run unit tier
        run: pnpm beech test --tier unit

  integration:
    name: Integration Tier (real D1)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - name: Setup pnpm
        uses: pnpm/action-setup@v6
      - name: Setup Node.js
        uses: actions/setup-node@v7
        with:
          node-version: '22'
          cache: 'pnpm'
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      # workerd + miniflare D1 only — no Docker stack.
      - name: Run integration tier
        run: pnpm beech test --tier integration

  flow:
    name: Flow Tier (Docker stack)
    runs-on: ubuntu-latest

    # Mailpit and webhook-tester via services (their default entrypoints are correct).
    # MinIO requires a custom command so it is started via docker run in a step below.
    services:
      mailpit:
        image: axllent/mailpit:latest
        ports:
          - 1025:1025
          - 8025:8025
        env:
          MP_MAX_MESSAGES: 500
          MP_SMTP_AUTH_ACCEPT_ANY: 1
          MP_SMTP_AUTH_ALLOW_INSECURE: 1
        options: >-
          --health-cmd "wget --spider -q http://localhost:8025/livez || exit 1"
          --health-interval 5s
          --health-timeout 3s
          --health-retries 10

      webhook-tester:
        image: tarampampam/webhook-tester:latest
        ports:
          - 8084:8080
        options: >-
          --health-interval 5s
          --health-timeout 3s
          --health-retries 10

    steps:
      - uses: actions/checkout@v7
      - name: Setup pnpm
        uses: pnpm/action-setup@v6
      - name: Setup Node.js
        uses: actions/setup-node@v7
        with:
          node-version: '22'
          cache: 'pnpm'

      - name: Start MinIO
        run: |
          docker run -d --name beech-minio \
            -p 9000:9000 -p 9001:9001 \
            -e MINIO_ROOT_USER=beechdev \
            -e MINIO_ROOT_PASSWORD=beechdevsecret \
            minio/minio:latest server /data --console-address ":9001"
          for i in {1..20}; do
            curl -sf http://localhost:9000/minio/health/live && break
            sleep 1
          done

      - name: Create test bucket
        run: |
          docker run --rm --network host --entrypoint sh minio/mc:latest -c "
            until mc alias set local http://localhost:9000 beechdev beechdevsecret; do sleep 1; done
            mc mb -p local/beech-media-test-ci || true
          "

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Verify Docker stack reachable
        run: |
          curl -sf http://localhost:9000/minio/health/live
          curl -sf http://localhost:8025/livez
          curl -sf http://localhost:8084/ready

      - name: Run flow tier
        env:
          BEECH_TEST_BUCKET: beech-media-test-ci
          R2_ENDPOINT: http://localhost:9000
          R2_ACCESS_KEY_ID: beechdev
          R2_SECRET_ACCESS_KEY: beechdevsecret
          R2_BUCKET_NAME: beech-media-test-ci
          EMAIL_PROVIDER: smtp
          SMTP_HOST: localhost
          SMTP_PORT: '8025'
          WEBHOOK_TESTER_URL: http://localhost:8084
        run: pnpm beech test --tier flow
```

Notes for the executing agent:
- The explicit `pnpm --filter @beechcms/core build` steps are gone on purpose: every tier task declares `dependsOn: ["^build"]`, so Turbo builds `@beechcms/core`, `@beechcms/search-client` and `@beechcms/widget-sdk` as dependencies. If a tier job fails on a missing `dist/`, restore the explicit build step for that job rather than changing the turbo task.
- No `e2e` job. Sprint 4 adds one with its own trigger (`pull_request` → master + nightly `schedule`).

### Task 11 — docs

`docs/build/cli-workflows.md`, the `beech test` row:
```md
| `npx beech test` | Monorepo | Executes Turborepo test runner. | `--coverage`, `--diff`, `--tier <unit\|flow\|integration>` |
```

`docs/testing.md`, appended after the existing "Where a test file lives" table:
```md
## Running one tier

| Tier | Command | CI job | Needs Docker |
|------|---------|--------|--------------|
| unit | `pnpm beech test --tier unit` | `unit` | no |
| flow | `pnpm beech test --tier flow` | `flow` | yes (`pnpm beech dev` stack) |
| integration | `pnpm beech test --tier integration` | `integration` | no (workerd + miniflare D1) |
| e2e | — | — | Sprint 4, not built yet |

`pnpm beech test --diff` runs the **unit and integration** tiers for the workspaces whose files
changed on the branch. The flow tier is never implicit — it costs the whole Docker stack — and the
e2e tier is refused outright. Add `--tier flow` to include it.

Tiers are declared once in `scripts/lib/test-tiers.mjs`; the vitest projects in
`apps/api/vitest.config.ts` and the CI jobs in `.github/workflows/test.yml` are its two consumers.
```

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run from the repo root, in this order. The Docker stack must be up for step 4 only (`pnpm beech dev`, or the containers from a previous session).

```bash
# 1. Build + types (tier configs must not break the build graph)
pnpm run build
pnpm --filter @beechcms/api type-check
pnpm --filter @beechcms/cli type-check

# 2. Placement + lint unchanged from Sprint 2
pnpm beech lint

# 3. Unit tier — must pass with the Docker stack STOPPED (this is the sprint's core claim)
pnpm beech dev:stop            # or: docker compose -f docker/docker-compose.yml stop
pnpm beech test --tier unit

# 4. Integration tier — must also pass with Docker stopped (workerd + miniflare D1 only)
pnpm beech test --tier integration

# 5. Flow tier — Docker stack required
pnpm beech dev                 # in a second terminal, then:
pnpm beech test --tier flow

# 6. Coverage parity: the aggregated run must still cover both projects
pnpm --filter @beechcms/api test:coverage
pnpm --filter @beechcms/dashboard test:coverage

# 7. Diff runner, default tiers (unit + integration), then explicit selections
pnpm beech test --diff
pnpm beech test --diff --tier unit
pnpm beech test --diff --tier flow
pnpm beech test --diff --tier e2e        # MUST exit 1 with the "no runner yet" message

# 8. Full suite, unchanged entry points
pnpm beech test
pnpm test                                 # fingerprint-cached runner, must behave as before

# 9. New CLI suite
pnpm --filter @beechcms/cli test
```

Expected counts, unchanged from `HEAD` (`80e4082`):

| Run | Files | Tests |
|---|---|---|
| `--tier unit` (apps/api alone) | 129 (109 `src/**` − 1 Docker-bound + the rest of the unit project) | see note |
| `--tier flow` (apps/api alone) | 40 (21 root + 18 `test/flow/` + 1 pinned) | — |
| `--tier integration` | 1 | 3 |
| api unit + flow combined | **148** | **1600** |
| dashboard | **123** | **887** |

Note: the unit/flow split is new, so only the *combined* API totals (148 / 1600) are comparable to `HEAD`. The executing agent must report both halves and prove they sum to 148 files / 1600 tests. A sum below that means a suite fell out of both projects' globs — the single most likely defect in this sprint.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `scripts/lib/test-tiers.mjs` exists and is the only place tier ids, default diff tiers and the workspace→runner map are declared. No tier list is duplicated in `scripts/test-coverage-diff.mjs`.
- [ ] `packages/cli/src/commands/test.ts` mirrors only the tier **names**, and `packages/cli/src/test/test.test.ts` asserts the mirror matches the `.mjs` source.
- [ ] `apps/api/vitest.config.ts` declares exactly two projects, `unit` and `flow`; `globalSetup` appears only in `flow`.
- [ ] The `coverage` block in `apps/api/vitest.config.ts` is byte-identical to `HEAD` and sits at `test.coverage` (root level), not inside a project.
- [ ] `pnpm beech test --tier unit` passes with the Docker stack **stopped** — no `assertDockerStackReady` failure, no MinIO bucket creation.
- [ ] `pnpm beech test --tier integration` passes with the Docker stack stopped.
- [ ] `pnpm beech test --tier flow` passes with the stack up, and covers all 40 Docker-bound suites (21 root + 18 `test/flow/` + `action-executors.test.ts`).
- [ ] `apps/api` unit + flow file counts sum to **148 files / 1600 tests**; dashboard stays **123 / 887**; integration stays **1 / 3**. No suite is orphaned by the glob split.
- [ ] `pnpm --filter @beechcms/api test:coverage` and `pnpm --filter @beechcms/dashboard test:coverage` still meet their thresholds (API 80/70/80/80, dashboard 30/30/25/30); report the exact percentages against `HEAD`'s.
- [ ] `pnpm beech test --diff` with no `--tier` runs **unit + integration only**; the flow tier never starts implicitly (prove it: no Docker precheck output in the log).
- [ ] `pnpm beech test --diff --tier e2e` and `pnpm beech test --tier e2e` both exit **1** with a message naming Sprint 4; neither spawns vitest.
- [ ] A changed file under a hypothetical `e2e/` directory is reported as skipped by `--diff`, never as "outside tracked workspaces" (verify by creating `e2e/probe.ts`, running `--diff`, then deleting it).
- [ ] `scripts/test-coverage-diff.mjs` now covers all 8 registered workspaces (`packages/{core,cli,mcp,client,forms-react,widget-sdk}`, `apps/{api,dashboard}`); a change in `packages/client` is no longer silently ignored.
- [ ] `scripts/test-coverage-diff.mjs` exits **1** when a tier's tests fail, and **0** when only coverage thresholds are unmet (behaviour split stated in the code comment).
- [ ] `turbo.json` declares `test:unit`, `test:flow`, `test:integration`, each `cache: false` with `dependsOn: ["^build"]`.
- [ ] `bin/cli.mjs` parses `--tier <list>` and its help text lists the three runnable tiers; `packages/cli/src/test/cli-docs-parity.test.ts` still passes.
- [ ] `.github/workflows/test.yml` has exactly three jobs — `unit`, `integration`, `flow` — and only `flow` starts containers.
- [ ] `packages/cli/src/test/test.test.ts` complies with `_config/testing_conventions.md` §1-§3 and §8: MIT header (package convention), unit tier, one `it()` per behaviour, four-zone anatomy, named ACT result, no `should`, `beforeEach` reset.
- [ ] `pnpm beech lint` passes (`check-test-placement.mjs` included) and `pnpm run build` is green.
- [ ] `packages/cli` coverage stays at or above its 50/50/50/50 thresholds with the new command code measured.
- [ ] `scripts/test-runner.mjs`, `packages/testing/**`, `packages/core/**`, every `apps/api/src/**` non-test source file, every `apps/dashboard/src/**` source file and `apps/api/migrations/**` show **zero diff**.
- [ ] `docs/testing.md` and `docs/build/cli-workflows.md` document the tiers and the `--tier` flag; `pnpm run docs:check` passes.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executing agent MUST NOT, in this sprint:

1. **Add Playwright, a top-level `e2e/` directory, or any e2e runner.** The `e2e` tier exists here only as a refused value. → ROADMAP Sprint 4 `e2e-playwright`.
2. **Add an e2e concurrency cap or touch `scripts/test-runner.mjs`** (fingerprint cache, PID lock, `TURBO_CONCURRENCY`/`VITEST_MAX_THREADS` profiling). → ROADMAP Sprint 4.
3. **Add a scale/perf tier, a scale seed generator, or pagination-cost assertions.** → ROADMAP Sprint 5 `scale-perf-tier`.
4. **Convert any `apps/api/test/flow/*.test.ts` suite to the real-D1 harness.** Sprint 2 fixed this as per-suite Boy Scout work at the moment an endpoint is touched; it belongs to no sprint's deliverables. This sprint relocates those suites into a *project*, never rewrites them.
5. **Modify any test file's content.** Only test *configuration* moves. The one exception is the new `packages/cli/src/test/test.test.ts`. `action-executors.test.ts` is pinned into the flow project by path — its bytes do not change and it does not move on disk.
6. **Add an integration tier to `apps/dashboard`.** The dashboard has no real-D1 harness; a dashboard-to-API contract test is the e2e tier's job.
7. **Merge `vitest.workers.config.ts` into the `projects` array**, add a coverage provider to the workerd pool, or attempt cross-tier coverage merging (`--merge-reports`). VETO-audited as over-engineering.
8. **Make per-package fingerprinting, or change the whole-repo hash granularity.** Brief §4 declares it pre-existing and out of scope.
9. **Extend `scripts/check-test-placement.mjs`** with new rules. Sprint 2 owns that file; a tier is selected by glob here, not by a new lint rule.
10. **Change the `--diff` coverage-threshold behaviour into a gate.** Only actual test *failures* newly set a non-zero exit code; `LOW:` / `!! Untested` rows stay advisory.
11. **Build a public/third-party testing API on `@beechcms/testing`.** Permanently out of scope per brief §5.
12. **Write a unit suite for `scripts/lib/test-tiers.mjs` or `scripts/test-coverage-diff.mjs`.** No root-level vitest project covers `scripts/` today (only `scripts/dev-cli/` via the non-Turbo `test:dev-cli` script), and creating one is its own piece of work. The registry is guarded instead by the parity assertion in `packages/cli/src/test/test.test.ts` plus the Section 5 command matrix.
