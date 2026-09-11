# ROADMAP — Test Harness & Test Suite Redesign (issue #108)

Source brief: `stages/00_ideation/output/feature_brief.md`.

The brief does NOT fit one sprint: it requires sequential merges (a new
`@beechcms/testing` package and a `BeechConfig` seam must land before any test
can be relocated; the relocation must land before CI can select tests by tier;
CI tiering must exist before an e2e tier can be excluded from it), and its
deliverables span independent boundaries (`packages/testing`, `apps/api`,
`apps/dashboard`, root `scripts/`, `.github/workflows/`) that must be validated
separately.

Detailed Task Details are written ONLY for the sprint currently being executed.
Future entries stay as one-liners until their turn: the graph and the codebase
will have moved by then, and stale SQL/interfaces are worse than no plan.

| # | Slug | Status |
|---|------|--------|
| 1 | `harness-foundation` | **SHIPPED — archived: `docs/Sprints/S1_Harness_Foundation/`** |
| 2 | `slice-test-layout` | **SHIPPED — archived: `docs/Sprints/S2_Slice_Test_Layout/`** |
| 3 | `ci-test-tiering` | **SHIPPED — archived: `docs/Sprints/S3_CI_Test_Tiering/`** |
| 4 | `e2e-playwright` | **PLANNED — detailed plan: `../S4_E2E_Playwright.md`** |
| 5 | `scale-perf-tier` | pending |

---

## Sprint 1 — `harness-foundation`

**Goal:** ship `@beechcms/testing` — a real-D1 (`@cloudflare/vitest-pool-workers`)
integration harness with `IClock`/`ITokenService` injection, an `.asUser({ role })`
client, and canonical seed data — and prove it on one migrated flow suite.

**Deliverables summary:** new `packages/testing` workspace; `BeechConfig.authProviders`
passthrough in `apps/api/src/factory.ts`; a second Vitest project in `apps/api`
(`vitest.workers.config.ts`, workerd pool) coexisting with the existing `forks`
project; canonical seeds + canonical entity IDs built from `@beechcms/core`
`defineSeed`; pilot migration of `flow-content-management.test.ts` to the harness;
dedicated real-JWT unit coverage (the blind spot created by faking `ITokenService`).

**Depends on:** nothing. It is the root of the chain — every later sprint imports
`@beechcms/testing` or selects on the folder layout it establishes.

---

## Sprint 2 — `slice-test-layout`

**Goal:** move tests to the VSA-mirrored layout — `apps/api/src/features/<slice>/test/{unit,integration}/`
and `apps/dashboard/src/features/<slice>/test/unit/` — and make placement enforceable.

**Deliverables summary:** per-slice `test/` folders for slices whose tests already
exist; updated `include`/`exclude` globs in both `vitest.config.ts` files plus the
workers project; a placement lint/check (test file outside its owning slice fails);
enforcement of `_config/testing_conventions.md` on every suite as it is migrated;
migration of the `apps/api/test/flow-*.test.ts` suites that Sprint 1 did not pilot,
under the Boy Scout Rule (touched code only — no big-bang rewrite of the 345
existing test files); short `docs/` page documenting the layout.

**Depends on:** Sprint 1 — the harness must exist before a suite can be relocated
*and* converted, and the integration-tier glob it introduces is what Sprint 2 fans
out across slices.

**Scope note (set at planning time, 2026-09-11):** "migration of the flow-* suites"
is honoured as *relocation + tier labelling* (`apps/api/test/flow/`), NOT as
conversion to the real-D1 harness. The 21 flow suites depend on `D1TestDatabase`,
MinIO, Mailpit and the webhook tester, which the workers tier deliberately does not
bind (Sprint 1 out-of-scope item 8). Conversion is per-suite Boy Scout work at the
moment an endpoint is touched, in no sprint's deliverables. Sprint 2 also carries the
Sprint 1 architect sign-off on `ARCH_FINDING_d1_compound_select.md` (the integration
tier is red on `HEAD` until that migration statement is fixed).

---

## Sprint 3 — `ci-test-tiering`

**Goal:** make the existing `--diff` selection tier-aware so unit/integration run
per-affected-workspace on every push, and slow tiers are never pulled in implicitly.

**Deliverables summary:** `--tier` support in `scripts/test-coverage-diff.mjs`
(currently 5 hardcoded workspaces, `vitest related` mode only) and in
`packages/cli/src/commands/test.ts`; explicit exclusion of any future `e2e/`
directory from the diff runner; tier-aware filtering that stops `vitest related`
from pulling a real-D1 integration suite into a fast unit run; `.github/workflows/test.yml`
split into per-tier jobs.

**Depends on:** Sprint 2 — tier selection needs the folder convention as its
selector; there is nothing to select by before the layout lands.

**Scope note (set at planning time, 2026-09-11):** four tiers are declared
(`unit`, `flow`, `integration`, `e2e`); three are runnable. `flow` is the name given
to the Docker-backed cross-slice suites in `apps/api/test/` — it is neither implicit in
`--diff` nor Docker-free, and `e2e` exists only to be refused until Sprint 4 builds its
runner. The `apps/api` forks config becomes a two-project config (`unit` Docker-free,
`flow` carrying the Docker `globalSetup`), with `action-executors.test.ts` pinned into
`flow` by path so the unit tier is Docker-free without moving a file out of its slice or
losing its coverage. Making `scripts/` itself testable (no root vitest project covers it)
stays unowned by any sprint.

---

## Sprint 4 — `e2e-playwright`

**Goal:** a top-level `e2e/` suite driving the real dashboard against the real API
and real D1, gated to pre-merge/nightly.

**Deliverables summary:** `e2e/` workspace (Playwright) outside the slice tree
(e2e crosses slices by nature; VSA forbids that inside it); its own concurrency cap
in `scripts/test-runner.mjs` (current defaults are tuned for Vitest workers on an
8GB fanless machine, not for browser processes); compatibility with the existing
fingerprint cache and single-run PID lock; PR→master + nightly workflow triggers;
explicit exclusion from push-triggered runs.

**Depends on:** Sprint 3 — e2e must be excluded from `--diff` by construction,
which requires the tier mechanism to exist first.

**Scope note (set at planning time, 2026-09-11):** the deliverable is the runner plus two specs, not a
suite — one authenticated-session flow and one entry-id contract flow, the defect class behind issue #108.
`e2e/` is a real pnpm workspace (`pnpm-workspace.yaml` gains it) driving Playwright against a `wrangler dev`
API on 8799 and a Vite dashboard on 5273, over a throwaway D1 persist directory recreated per run; it is
Docker-free, so MinIO/Mailpit/webhook-tester flows stay in the `flow` tier. Two deviations from this entry's
original one-liner, both deliberate: (1) **no concurrency cap is added to `scripts/test-runner.mjs`** — that
runner selects by task name and the e2e workspace deliberately declares no `test` script, so the cap would
be unreachable code; the executing cap is Playwright's own `workers: 1`. (2) CI gating lands in a **new**
`.github/workflows/e2e.yml` (PR→master + nightly) rather than in `test.yml`, whose exact three-job shape is
a Sprint 3 acceptance criterion. `e2e` joins `RUNNABLE_TIERS` but is kept out of a new
`DIFF_SELECTABLE_TIERS`, so `--diff --tier e2e` still exits 1. Two config seams are touched and nothing
else outside tooling: `BEECH_D1_PERSIST_DIR` in `apps/api/scripts/bootstrap-d1.mjs` and
`BEECH_DEV_API_TARGET` in `apps/dashboard/vite.config.ts`, both no-ops when unset. Adding `data-testid`
attributes to dashboard source is forbidden; selectors are accessible names only.

---

## Sprint 5 — `scale-perf-tier`

**Goal:** an opt-in scale tier seeded with low-thousands-of-rows-per-content-type
datasets to validate pagination and query behaviour at BeechCMS's real target scale.

**Deliverables summary:** scale seed generator in `@beechcms/testing` (distinct from
canonical seeds, never the default); opt-in tier flag; assertions on pagination and
query cost; explicitly excluded from push and PR runs.

**Depends on:** Sprint 4 — last in the chain; the tier machinery, the harness
seeding API, and the concurrency budget all need to be settled before a deliberately
heavy tier is added on top.

---

## Permanently out of scope (per brief §5)

- Public/third-party testing tool built on the internal harness.
- `better-sqlite3` as the harness DB engine.
- Production-scale/fuzzed datasets as the default integration seed.
- Running e2e on every push.
- Big-bang rewrite of all existing tests.
- Rebuilding the fingerprint cache / thermal lock / Turbo concurrency system.
