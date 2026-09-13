# Sprint 4 — `e2e-playwright`

Feature: Test Harness & Test Suite Redesign (issue #108). Roadmap entry:
`stages/01_sprint_planning/output/backlog/ROADMAP.md` § Sprint 4.

Previous sprints (archived, shipped): `docs/Sprints/S1_Harness_Foundation/`,
`docs/Sprints/S2_Slice_Test_Layout/`, `docs/Sprints/S3_CI_Test_Tiering/`.

---

### Pre-Computation Analysis

**a) God Nodes identified via the CLI**

| Node | Degree | Source | Why it matters here |
|---|---|---|---|
| `createBeechApp()` | 56 | `apps/api/src/factory.ts:116` | The single composition root of the API. Every tier reaches the API through it. The e2e tier is the only tier that does **not** import it — it reaches it over HTTP through `wrangler dev`. |
| `test-coverage-diff.mjs` | 31 | `scripts/test-coverage-diff.mjs:1` | The `--diff` selector. Sole consumer of `scripts/lib/test-tiers.mjs` (`WORKSPACES`, `parseTiers`, `isNeverSelected`, `NEVER_SELECTED_PREFIXES` all show exactly one inbound edge, all from this file). |
| `Orchestrator` | 26 | `scripts/dev-cli/orchestrator.ts:249` | Owns the only existing "boot API + dashboard + D1" sequence (`startBootstrap`, `startDevServers`, `DEV_SERVERS`, ports 8789 / 5173). The e2e runner needs the same sequence on different ports and must not reuse this class: it is a TUI orchestrator with Docker, tunnel and log-store coupling. |
| `test-runner.mjs` | 17 | `scripts/test-runner.mjs:1` | Fingerprint cache + PID lock + hardware concurrency profile. Drives `turbo run test` / `test:coverage` only. |
| `useAuth()` | 19 | `apps/dashboard/src/lib/auth-context.tsx:96` | Dashboard session root. Restores the session from the refresh cookie on mount (`useEffect` → `refreshToken()`), which is what makes a Playwright `storageState` (cookies only) sufficient — the access token is deliberately in-memory (`apps/dashboard/src/lib/api.ts:33`). |

**b) Architectural boundaries affected**

- `@beechcms/core` — **untouched**. No source, no schema, no migration. The e2e workspace consumes it only transitively, through `@beechcms/testing`'s canonical data.
- `@beechcms/testing` — **untouched (source)**. Sprint 4 *consumes* it: `CANONICAL_SEEDS`, `CANONICAL_USERS`, `CANONICAL_ENTRIES`, `UUID_V4_PATTERN` are already exported from `packages/testing/src/index.ts` and are pure, D1-free data. Reusing them is what keeps the e2e fixture identity equal to the integration tier's — the whole point of the canonical-seed rule (brief §2, Rule 3.5).
- `apps/api` — **one config seam**, no `src/**`: `apps/api/scripts/bootstrap-d1.mjs` gains an optional `BEECH_D1_PERSIST_DIR` override so a migration bootstrap can target a persist directory other than `apps/api/.wrangler/state`. Zero production code.
- `apps/dashboard` — **one config seam**, no `src/**`: `apps/dashboard/vite.config.ts` reads its dev-proxy target from `BEECH_DEV_API_TARGET`, defaulting to today's hardcoded `http://127.0.0.1:8789`. Needed because the e2e API runs on a dedicated port; without it the e2e dashboard would proxy into a developer's running `pnpm beech dev` API.
- Root tooling — `scripts/lib/test-tiers.mjs` (e2e becomes runnable but stays `--diff`-forbidden), `packages/cli/src/commands/test.ts` (+ its mirror test), `bin/cli.mjs` help text, `turbo.json` (`test:e2e`), `pnpm-workspace.yaml` (registers `e2e`), `scripts/check-test-placement.mjs` (e2e placement rules), `.github/workflows/e2e.yml` (new file), docs.
- New top-level workspace `e2e/` — **outside the slice tree by construction**. An e2e flow drives dashboard slice → HTTP → API slice; placing it inside either slice would manufacture the cross-slice coupling VSA forbids (conventions §0, §1.1).

**c) `graphify affected` impact analysis (breaking-change proof)**

```
$ graphify affected "NEVER_SELECTED_PREFIXES" --depth 2
- test-coverage-diff.mjs [imports] scripts/test-coverage-diff.mjs:L27

$ graphify affected "WORKSPACES" --depth 2
- test-coverage-diff.mjs [imports] scripts/test-coverage-diff.mjs:L27

$ graphify affected "isNeverSelected" --depth 2
- main() [calls] scripts/test-coverage-diff.mjs:L380
- test-coverage-diff.mjs [imports] scripts/test-coverage-diff.mjs:L27

$ graphify affected "RUNNABLE_TIERS" --depth 2
No unique node match for RUNNABLE_TIERS
```

Reading: the whole tier module has exactly **one** consumer, `scripts/test-coverage-diff.mjs`. Changing
`parseTiers`/`RUNNABLE_TIERS` cannot break a third party. The *ambiguous* `RUNNABLE_TIERS` match is itself
the evidence that the mirror exists in two places — `scripts/lib/test-tiers.mjs:11` and
`packages/cli/src/commands/test.ts:10` — which is precisely the pair
`packages/cli/src/test/test.test.ts:94` asserts equal. Both must change in the same commit or that test fails.

```
$ graphify explain "createBeechApp"    → Degree 56; inbound from apps/api/src/index.ts and the flow suites
$ graphify path "ContentListPage" "createBeechApp"
No directed path found between 'ContentListPage' and 'createBeechApp'.
$ graphify path "useAuth" "authApp"
No directed path found between 'useAuth' and 'authApp'.
```

This is the sprint's architectural justification, stated by the graph itself: **there is no static edge
between the dashboard and the API.** The contract between them exists only as HTTP request/response
shapes, so no amount of AST analysis, type-checking or unit/integration coverage can observe it. The
shipped ID-format defect lived exactly in that gap. The e2e tier is the only instrument that closes it.

---

### VETO Audit

Evaluated against `_config/ponytail_arch.md`.

**1. RUTHLESS VETO / YAGNI.** The sprint ships a runner plus the minimum number of specs that prove the
runner *and* guard the defect class that motivated issue #108 — two spec files, not a suite. Three
temptations were rejected here, before drafting:

- *A page-object model / fixture framework for the dashboard.* VETOED. Two specs do not need an
  abstraction layer. Selectors are resolved against real accessible names (`FieldLabel htmlFor="email"`,
  `FieldLabel htmlFor="password"`, the `Login` submit button — all verified in
  `apps/dashboard/src/features/auth/components/login-form/login-form.tsx`).
- *Adding `data-testid` attributes to dashboard components.* VETOED. It is production-source churn to
  serve a test, and this sprint's zero-`src/**`-diff invariant is what makes it reviewable. Role/label
  selectors only.
- *An e2e concurrency cap inside `scripts/test-runner.mjs`* (as the roadmap one-liner guessed). VETOED as
  dead code: `test-runner.mjs` drives `turbo run test` / `test:coverage`, and the e2e workspace
  deliberately declares **no `test` script** — only `test:e2e`. The e2e tier never enters that task graph,
  so a cap there would never execute. The cap that does execute is Playwright's own `workers`, set in
  `e2e/playwright.config.ts`. Deviation from the roadmap line is deliberate and recorded in SECTION 7.

**2. THE BOTANICAL INVARIANT.** Respected, and more strictly than any other tier. The e2e suite holds no
D1 binding at all — it has no process-level access to the database. Every row it creates is created by
`POST /api/seeds` and `POST /api/content/:slug`, i.e. through `@beechcms/core`'s engine inside the real
worker. No `CREATE TABLE content_*` is written by this sprint; the content tables for the canonical
`posts`/`authors` seeds are produced by `validateAndApplySeedDef` from the `Seed` definitions exported by
`@beechcms/testing`, which are built with `defineSeed()` and address fields by Branch ID (`br_01`…`br_08`),
never by physical column name. No hardcoded field name appears in the e2e specs: assertions read the
`displayNameAlias` value the seed itself declares.

**3. VSA ENFORCEMENT.** Respected. `e2e/` sits outside `apps/api/src/features/` and
`apps/dashboard/src/features/`, so it cannot produce a cross-slice import — the rule it would otherwise
violate by nature. Shared test material (canonical users, seeds, entries, `UUID_V4_PATTERN`) is imported
from `@beechcms/testing`, the designated shared lib, exactly as conventions §1.1 mandates; it is never
copied into `e2e/` and never reached for across a slice. Task 9 makes the boundary *enforceable* rather
than conventional: `scripts/check-test-placement.mjs` gains R6/R7 so an `*.e2e.ts` outside `e2e/`, or a
`*.test.ts` inside it, fails `pnpm beech lint`.

**4. CLOUDFLARE PURITY.** Respected. The e2e API is the real edge runtime — `wrangler dev` on workerd with
the real miniflare D1, the real migrations, the real rate-limiter and queue bindings. No second DB engine,
no `better-sqlite3`, no ORM, no stateful background job. The one non-edge process is the browser, which is
the tier's entire purpose. Schema changes go through `apps/api/migrations/**` and are applied by the
existing `bootstrap-d1.mjs` in file order — the strict migration workflow, unchanged.

**5. MINIMALIST BLUEPRINT.** Node count across the three tiers: `core` 0 files, `api` 1 file (a script
env-override), `dashboard` 1 file (a proxy env-override). Everything else is new, isolated, and deletable
in one `rm -rf e2e/`.

One boundary was adjusted by this audit before drafting: the first shape of Task 3 had the e2e workspace
open the miniflare SQLite file directly (via `node:sqlite`) to seed users, mirroring what
`packages/testing/src/seeds/provision.ts` does with its D1 binding. That bypasses `@beechcms/core` and
violates invariant 2. It was replaced with the `POST /auth/setup` → `POST /auth/login` → `POST /api/seeds`
HTTP path, which is also strictly more faithful: it is the sequence a real operator performs.

VERDICT: APPROVED. HANDOFF -> caveman_coder.

---

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

This sprint exists now, and not earlier, because of a hard dependency chain that the previous three
sprints discharged in order: the harness had to exist before a tier convention meant anything (S1), the
folder layout had to exist before CI could select by tier (S2), and the tier mechanism had to exist before
a tier could be *excluded* from `--diff` by construction rather than by accident (S3). Business rule 5 of
the brief — "e2e must never run on every push" — is only enforceable because
`scripts/lib/test-tiers.mjs` already declares `NEVER_SELECTED_PREFIXES = ['e2e/']` and
`DEFAULT_DIFF_TIERS = ['unit', 'integration']`. Sprint 4 fills a slot that was cut to shape for it; it
does not carve a new one.

It exists *at all* because of what the graph cannot see. `graphify path "ContentListPage"
"createBeechApp"` and `graphify path "useAuth" "authApp"` both return **no directed path**: the dashboard
and the API share Zod schemas from `@beechcms/core`, but nothing in the static graph connects a rendered
page to a route handler. That gap is not a modelling artifact — it is the real architecture. The dashboard
talks to the API over HTTP and nothing else. Every tier BeechCMS has today lives on one side of that gap:
unit tests mock the boundary, and integration tests (real D1, real middleware, `createTestHarness`) enter
the API through `app.request()` — they are the API's own client, and they can only send what a test author
believed the dashboard sends. That is the precise mechanism by which the fruit-ID-format defect shipped
green.

**VSA adherence.** Conventions §0 already assigns the e2e tier to a top-level `e2e/`, and the reason is
architectural, not organisational: an e2e flow spans the dashboard's `auth` and `content-management`
slices and the API's `setup`, `seeds` and `content` slices simultaneously. There is no slice that owns it.
Placing it inside any of them would create exactly the cross-slice import rule 3 of `ponytail_arch.md`
forbids and `check-test-placement.mjs` R3 already fails the build on. Living outside the slice tree is the
only VSA-legal placement, and Task 9 makes that placement machine-checked instead of documented.

**Botanical Engine adherence.** The e2e workspace is the only test tier in the repo with *no* D1 handle.
It cannot bypass `@beechcms/core` because it has nothing to bypass it with: every table it needs is
created by `POST /api/seeds` running `validateAndApplySeedDef` inside the worker, and every row by
`POST /api/content/:slug` running `apiToDb` and minting its id with the real `IIdGenerator`. Conventions
Rule 0.3 keeps `IIdGenerator` real in the integration tier precisely to protect the ID-shape contract; the
e2e tier keeps *everything* real, which is what finally lets an assertion say "the id the API minted is an
id the dashboard can navigate to" — a sentence no other tier in this repo can express.

**Why the fixtures are shared, not new.** Brief §2 makes canonical seed data the single source of truth,
and `@beechcms/testing` already exports it in a D1-free form (`CANONICAL_SEEDS` built via `defineSeed`,
`CANONICAL_USERS` with plaintext passwords, `CANONICAL_ENTRIES`, `UUID_V4_PATTERN`). The e2e tier consumes
those exports rather than inventing an e2e-specific admin or an e2e-specific content type. If e2e invented
its own fixtures it would reintroduce, at the outermost tier, the exact divergence-between-what-tests-send-
and-what-production-sends failure this whole feature exists to kill.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Tier machinery (S3, shipped).** `scripts/lib/test-tiers.mjs` is the single source of truth and has
exactly one consumer (`graphify affected` proof above):

```
TIERS                   = ['unit', 'flow', 'integration', 'e2e']
RUNNABLE_TIERS          = ['unit', 'flow', 'integration']          ← e2e absent: no runner
DEFAULT_DIFF_TIERS      = ['unit', 'integration']
NEVER_SELECTED_PREFIXES = ['e2e/']
WORKSPACES              = 8 entries; apps/api owns 3 tiers, every other workspace owns `unit`
parseTiers(value)       → refuses 'e2e' with "…no runner yet… (see ROADMAP Sprint 4)"
isNeverSelected(file)   → true for anything under e2e/
```

The name list is **mirrored** in `packages/cli/src/commands/test.ts:10` (`RUNNABLE_TIERS`), and
`packages/cli/src/test/test.test.ts:94` reads the `.mjs` with a regex and asserts the two arrays are
`toEqual`. Two tests in that file — `'rejects the e2e tier, which has no runner yet'` (L79) and the
`turbo run test:<tier>` mapping tests — encode today's refusal and must move with the code.

**CLI surface.** `bin/cli.mjs:274` parses `--tier <list>` and forwards `{ coverage, diff, tier }` to
`test()` from `@beechcms/cli`. Its help text (L105) reads
`--tier <list>   Run one or more tiers: unit, flow, integration (comma-separated)`.
`packages/cli/src/commands/test.ts` maps `--tier a,b` → `turbo run test:a test:b`, `--diff --tier a`
→ `node scripts/test-coverage-diff.mjs --tier a`, and exits 1 on an unknown tier with a yellow
"see ROADMAP Sprint 4" hint for `e2e`.

**Turbo tasks.** `turbo.json` declares `test`, `test:unit`, `test:flow`, `test:integration`,
`test:coverage`, each `"cache": false, "dependsOn": ["^build"]`. There is no `test:e2e`.

**Root runner.** `scripts/test-runner.mjs` (`pnpm test`) computes a whole-repo SHA256 fingerprint, holds a
PID lock, profiles hardware (`totalMemGb <= 8 → TURBO_CONCURRENCY=2, VITEST_MAX_THREADS=2`) and runs
`turbo run test` or `test:coverage`. It selects tasks by **name**, so a workspace that declares no `test`
script is invisible to it.

**Workspace registration.** `pnpm-workspace.yaml` globs are `apps/*`, `packages/*`, `docs/examples/*`.
A top-level `e2e/` directory is **not** a pnpm workspace today and would not resolve `workspace:*` deps.

**Dev-server boot sequence** (`scripts/dev-cli/orchestrator.ts`, degree 26 — the only existing one):
`allocatePorts()` → `startDocker()` → `startTunnel()` → `startBootstrap()` (spawns
`node apps/api/scripts/bootstrap-d1.mjs`) → `startDevServers()`, which spawns
`pnpm --filter <ws> run dev` for `@beechcms/core` (tsc -w), `@beechcms/api` (probe port **8789**) and
`@beechcms/dashboard` (probe port **5173**). It is TUI/Docker/tunnel-coupled and is not reusable headless.

**D1 bootstrap** (`apps/api/scripts/bootstrap-d1.mjs`): idempotent; resolves the miniflare SQLite file at
the hardcoded `apps/api/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite`; applies
`apps/api/migrations/0000_v040_base.sql` and `0030_test_seeds.sql` in filename order via `node:sqlite`,
falling back to `npx wrangler d1 execute beech-db --local --file=…`. Skips entirely when a `users` table
already exists. It has **no** persist-directory override.

**API runtime** (`apps/api/wrangler.jsonc`): `main src/index.ts`, compat date `2026-02-13`,
`nodejs_compat`; assets binding served from `../dashboard/dist`; D1 binding `DB`; six `ratelimits`; a
`beech-jobs` queue producer+consumer; a `* * * * *` cron trigger. Dev `vars` carry `ENV=development`
(which disables the rate limiters), `CORS_ORIGINS` listing `http://localhost:5173`,
`EMAIL_PROVIDER=smtp` → Mailpit on `localhost:8025`, `WEBHOOK_TESTER_URL=http://localhost:8084`.
`JWT_SECRET` and the `R2_*` keys live in `apps/api/.dev.vars`, **which is gitignored and therefore absent
in CI**. `apps/api/package.json` `dev` script is `wrangler dev --port 8789`.

**Dashboard runtime** (`apps/dashboard/vite.config.ts`): `base: '/admin/'`, dev-server proxy for `/api`,
`/auth` and `/oauth` all hardcoded to `http://127.0.0.1:8789`. Router (`apps/dashboard/src/App.tsx:128`,
`basename: '/admin'`): `/login`, `/setup` (wrapped in `SetupRoute`), `/forgot-password`,
`/reset-password`, `/accept-invite`, and `ProtectedRoute`-wrapped `/`, `/drafts`,
`/content/create-new`, `/content/:slug`, `/content/:slug/create`, `/content/:slug/:id`, `/settings`, …

**Auth wiring.** `apps/dashboard/src/lib/api.ts:33` keeps the access token **in memory only — never
localStorage**. `apps/dashboard/src/lib/auth-context.tsx:58` restores the session on mount by calling
`refreshToken()` against the HttpOnly refresh cookie. Consequence for this sprint: a Playwright
`storageState` capturing **cookies** is sufficient to resume an authenticated session; capturing
localStorage is not and would silently yield a logged-out page.

**Login form markup** (`apps/dashboard/src/features/auth/components/login-form/login-form.tsx`):
`FieldLabel htmlFor="email"`, `FieldLabel htmlFor="password"`, submit `<Button>` whose label is the
untranslated literal `Login` (L154). Stable accessible selectors exist; no testids are needed.

**API surface used by this sprint** (`apps/api/src/factory.ts:229-291`):
`app.route('/', setupApp)` → `GET /auth/setup` returns `{ needsSetup }`; `POST /auth/setup` creates the
first administrator, validating `email`, `password` (8–128 chars, ≤72 bytes UTF-8) and a `settings`
object requiring `language ∈ {it,en}`, non-empty `timezone` and `currency`; `track: 'normal'` additionally
requires `company.name`/`company.website`; `track: 'developer'` + `loadDemoData: true` provisions
`DEMO_SEED_DEFINITIONS` (`clienti`, `abbonamenti`, `ticket`, `changelog`, `articoli`). The handler sends
no email — verified by inspection — so the setup path is Docker-free.
`app.route('/', authApp)` → `POST /auth/login` (`apps/api/src/auth/auth.app.ts:121`).
`apiProtected.route('/seeds', seedsApp)` → `POST /api/seeds` accepts a `Seed` object verbatim, assigns
missing branch ids, runs `validateAndApplySeedDef(…, 'create')`, returns `201 { slug }`, `409` on an
active duplicate. `apiProtected.route('/content', contentFeature)` → `POST /api/content/:slug`.

**Shared fixtures already available** (`packages/testing/src/index.ts`, D1-free, pure data):
`CANONICAL_SEEDS` — `authors` (`br_01` = `name`) and `posts` (`br_01` title … `br_08` author_id,
`displayNameAlias: 'title'`); `CANONICAL_SEED_SLUGS`; `CANONICAL_USERS.admin` =
`admin@beech.test` / `password123`; `CANONICAL_ENTRIES` (first entry: seed `posts`, title
`Canonical Post`, slug `canonical-post`, status `published`); `UUID_V4_PATTERN`.

**Placement checker** (`scripts/check-test-placement.mjs`): `trackedFiles()` filters `git ls-files` by
`/\.test\.tsx?$/`, so `*.e2e.ts` files are invisible to every rule today. Rules R1–R5 enforce
`__tests__/` bans, `*.integration.test.ts` ↔ `test/integration/` symmetry, cross-slice imports, the
dashboard `src/test/` shape and the `apps/api/test/flow-*.test.ts` relocation.

**CI.** `.github/workflows/test.yml` fires on push+PR to `master`/`devs` and holds exactly three jobs —
`unit`, `integration`, `flow` — only the last of which starts containers. That three-job shape is an
explicit S3 acceptance criterion, so Sprint 4 does not touch this file.

**Docs.** `docs/testing.md` already tabulates the e2e tier as *"top-level `e2e/` (Sprint 4, not built
yet)"* in two tables and a third ("Running one tier") with an em-dash for its command.
`docs/build/cli-workflows.md:43` documents `--tier <unit|flow|integration>`.
`pnpm run docs:check` (`scripts/docs-fact-check.mjs:173`) fact-checks the CLI command matrix in
`bin/cli.mjs` against `docs/build/cli-workflows.md` and fails the build on divergence.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

**New — the `e2e` workspace** (feature code excluded; this is test infrastructure only)

1. `e2e/package.json` — `@beechcms/e2e`, private. **Declares `test:e2e`, `lint`, `type-check`. Declares NO
   `test` script** (this is what keeps `pnpm test` and `turbo run test` browser-free).
2. `e2e/tsconfig.json`
3. `e2e/eslint.config.js` — one-line re-export of the root config, mirroring `packages/testing/eslint.config.js`.
4. `e2e/playwright.config.ts` — ports, `workers: 1`, the two-project (`setup` → `chromium`) graph, and the
   two `webServer` entries that boot the real API and the real dashboard.
5. `e2e/scripts/reset-db.mjs` — wipes `e2e/.wrangler-e2e/` and re-applies migrations into it.
6. `e2e/tests/global.setup.ts` — HTTP provisioning (admin, canonical seeds, one canonical entry) + browser
   login, saving `e2e/.auth/admin.json` and `e2e/.auth/fixture.json`.
7. `e2e/tests/auth.e2e.ts` — spec 1.
8. `e2e/tests/content-id-contract.e2e.ts` — spec 2.
9. `e2e/README.md` — how to run it, what it boots, what it deliberately does not cover.

**Modified — root tooling**

10. `pnpm-workspace.yaml` — register `e2e`.
11. `turbo.json` — add the `test:e2e` task.
12. `scripts/lib/test-tiers.mjs` — `e2e` joins `RUNNABLE_TIERS`; new `DIFF_SELECTABLE_TIERS`; `parseTiers`
    refuses `e2e` with a new reason. `WORKSPACES` and `DEFAULT_DIFF_TIERS` are **unchanged**.
13. `packages/cli/src/commands/test.ts` — mirror gains `e2e`; the "not built yet" hint is replaced by the
    `--diff`-incompatibility message.
14. `packages/cli/src/test/test.test.ts` — the e2e-refusal test is rewritten; a `--diff --tier e2e` test is added.
15. `bin/cli.mjs` — help text lists four tiers and notes e2e is excluded from `--diff`.
16. `scripts/check-test-placement.mjs` — R6/R7 for e2e placement.

**Modified — two config seams (no `src/**` anywhere)**

17. `apps/api/scripts/bootstrap-d1.mjs` — optional `BEECH_D1_PERSIST_DIR`.
18. `apps/dashboard/vite.config.ts` — proxy target from `BEECH_DEV_API_TARGET`, default unchanged.

**New / modified — CI, ignores, docs**

19. `.github/workflows/e2e.yml` — **new file**. PR→`master` + nightly schedule + `workflow_dispatch`.
    `.github/workflows/test.yml` is NOT touched (its exact three-job shape is an S3 acceptance criterion).
20. `.gitignore` — `e2e/.wrangler-e2e/`, `e2e/.auth/`, `e2e/test-results/`, `e2e/playwright-report/`,
    `e2e/blob-report/`, `e2e/.playwright/`.
21. `docs/testing.md` — the three "Sprint 4, not built yet" placeholders become real rows; a short
    "Running the e2e tier" subsection.
22. `docs/build/cli-workflows.md` — `--tier <unit|flow|integration|e2e>`.

**Excluded from this sprint by construction:** no file under `packages/core/**`, `packages/testing/**`,
`apps/api/src/**`, `apps/api/migrations/**`, `apps/dashboard/src/**`, `scripts/test-runner.mjs`,
`scripts/test-coverage-diff.mjs` or `.github/workflows/test.yml` is created, modified or deleted.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

**No D1 migration is authored by this sprint.** The e2e database is produced by applying the existing
`apps/api/migrations/*.sql` unchanged, in filename order, into a throwaway persist directory. Any `CREATE
TABLE content_*` the run needs is emitted by the Botanical Engine at runtime from `CANONICAL_SEEDS`.

---

### Task 1 — Register the workspace

`pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "docs/examples/*"
  - "e2e"
```

Leave `allowBuilds` and `overrides` byte-identical. After this edit run `pnpm install` once so the new
workspace links; expect `@playwright/test` to appear under `allowBuilds` pressure — if pnpm prompts about
a build script for `@playwright/test`, add `playwright: true` to `allowBuilds` (and nothing else).

---

### Task 2 — The `e2e` workspace skeleton

`e2e/package.json`:

```json
{
  "name": "@beechcms/e2e",
  "version": "0.8.0",
  "private": true,
  "type": "module",
  "scripts": {
    "lint": "eslint .",
    "type-check": "tsc -p tsconfig.json --noEmit",
    "test:e2e": "playwright test"
  },
  "devDependencies": {
    "@beechcms/api": "workspace:*",
    "@beechcms/core": "workspace:^0.8.0",
    "@beechcms/dashboard": "workspace:*",
    "@beechcms/testing": "workspace:*",
    "@playwright/test": "^1.50.0",
    "@types/node": "^24.10.1",
    "typescript": "^5.9.3"
  },
  "license": "BUSL-1.1"
}
```

Rules that are not negotiable here:

- **No `test` script.** `scripts/test-runner.mjs` and `turbo run test` select by task name; a `test`
  script would pull a browser into `pnpm test` and into the fingerprint-cached root run. This is the
  single mechanism that satisfies brief rule 5.
- `@beechcms/api` and `@beechcms/dashboard` are real dependencies even though no TypeScript import
  references them: they make `turbo`'s `dependsOn: ["^build"]` build the dashboard before the e2e task,
  which is what guarantees `apps/dashboard/dist` exists for `wrangler.jsonc`'s `assets.directory`
  (`../dashboard/dist`). Record that reason as a comment in `e2e/README.md`, not in the JSON.
- Install Playwright with `pnpm --filter @beechcms/e2e add -D @playwright/test@latest` and write the
  resolved caret range into the file; `^1.50.0` above is a floor, not a pin.

`e2e/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noEmit": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true
  },
  "include": ["tests/**/*.ts", "playwright.config.ts"]
}
```

`e2e/eslint.config.js`:

```js
export { default } from '../eslint.config.js'
```

---

### Task 3 — `apps/api/scripts/bootstrap-d1.mjs`: persist-directory override

Three surgical edits. Do not restructure the file.

**3a.** Extend the path import and derive the persist root:

```js
import { join, dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const API_DIR = join(__dirname, '..')

// Non-default persist root (the e2e tier points this at a throwaway directory so a run never
// touches a developer's local dev database). Absent → today's wrangler default, unchanged.
const PERSIST_ROOT = process.env.BEECH_D1_PERSIST_DIR
  ? resolve(process.env.BEECH_D1_PERSIST_DIR)
  : join(API_DIR, '.wrangler/state')
const PERSIST_FLAG = process.env.BEECH_D1_PERSIST_DIR ? ` --persist-to "${PERSIST_ROOT}"` : ''

const D1_DIR = join(PERSIST_ROOT, 'v3/d1/miniflare-D1DatabaseObject')
const MIGRATIONS_DIR = join(API_DIR, 'migrations')
```

**3b.** Append `${PERSIST_FLAG}` to every one of the three `npx wrangler d1 execute` command strings in
the file (in `ensureWranglerD1Initialized()`, in `hasBaseSchema()`, and in the CLI fallback loop of
`applyMigrationsInOrder()`). Example:

```js
execSync(
  `npx wrangler d1 execute beech-db --local --command "SELECT 1"${PERSIST_FLAG}`,
  { cwd: API_DIR, stdio: ['ignore', 'ignore', 'ignore'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } }
)
```

**3c.** No other behaviour changes. With the variable unset the file must produce byte-identical commands
and the identical `D1_DIR` it produces today — verify by running `pnpm beech db:migrate` on an untouched
local state and confirming the `DB already initialized — skipping.` short-circuit still fires.

---

### Task 4 — `apps/dashboard/vite.config.ts`: configurable dev-proxy target

Add above `defineConfig`:

```ts
// The dev proxy target is configurable so a second dashboard instance (the e2e tier, on its own
// ports) can proxy to its own wrangler process instead of a developer's running `pnpm beech dev`.
const DEV_API_TARGET = process.env.BEECH_DEV_API_TARGET ?? 'http://127.0.0.1:8789'
```

and replace the three hardcoded targets:

```ts
  server: {
    proxy: {
      '/api':   { target: DEV_API_TARGET, changeOrigin: true },
      '/auth':  { target: DEV_API_TARGET, changeOrigin: true },
      '/oauth': { target: DEV_API_TARGET, changeOrigin: true },
    },
  },
```

Nothing else in the file changes — `base`, `build.outDir`, the plugin list (including the `as any` on
`visualizer`) and the `@` alias stay byte-identical. With the variable unset the resolved config is
unchanged, so `pnpm beech dev` is unaffected.

---

### Task 5 — `e2e/scripts/reset-db.mjs`

```js
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

// Recreates the e2e database from scratch: the suite asserts on an exact row set, so a run that
// inherited rows from the previous run would pass or fail for reasons no spec states.

import { rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const E2E_DIR = resolve(SCRIPT_DIR, '..')
const ROOT = resolve(E2E_DIR, '..')
const PERSIST_DIR = join(E2E_DIR, '.wrangler-e2e')

rmSync(PERSIST_DIR, { recursive: true, force: true })
rmSync(join(E2E_DIR, '.auth'), { recursive: true, force: true })

execFileSync('node', [join(ROOT, 'apps/api/scripts/bootstrap-d1.mjs')], {
  cwd: join(ROOT, 'apps/api'),
  stdio: 'inherit',
  env: { ...process.env, BEECH_D1_PERSIST_DIR: PERSIST_DIR },
})

console.log(`[e2e] database reset at ${PERSIST_DIR}`)
```

---

### Task 6 — `e2e/playwright.config.ts`

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { defineConfig, devices } from '@playwright/test'

// Dedicated ports: 8789/5173 belong to `pnpm beech dev`, and an e2e run must never adopt — or be
// adopted by — a developer's live stack.
export const API_PORT = 8799
export const DASHBOARD_PORT = 5273
export const BASE_URL = `http://localhost:${DASHBOARD_PORT}`
export const ADMIN_STATE = './.auth/admin.json'
export const FIXTURE_FILE = './.auth/fixture.json'

// Passed with --var so a run is hermetic: apps/api/.dev.vars is gitignored and absent in CI.
const API_VARS = [
  '--var', 'ENV:development',
  '--var', 'JWT_SECRET:e2e-secret-at-least-32-bytes-long-for-hono-jwt',
  '--var', `CORS_ORIGINS:${BASE_URL}`,
  '--var', `APP_URL:${BASE_URL}`,
  '--var', `MEDIA_BASE_URL:${BASE_URL}`,
].join(' ')

export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.e2e\.ts$/,

  // One live D1 shared by every spec. Parallel workers would race on the same rows, and the
  // browser process is far heavier than a Vitest worker on the 8GB fanless target machine.
  workers: 1,
  fullyParallel: false,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    // A setup *project*, not globalSetup: a setup project is guaranteed to run after webServer
    // readiness, so provisioning over HTTP can never race the servers it talks to.
    { name: 'setup', testMatch: /global\.setup\.ts$/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: ADMIN_STATE },
      dependencies: ['setup'],
    },
  ],

  webServer: [
    {
      command: `node ./scripts/reset-db.mjs && pnpm --filter @beechcms/api exec wrangler dev --port ${API_PORT} --persist-to ../../e2e/.wrangler-e2e ${API_VARS}`,
      url: `http://127.0.0.1:${API_PORT}/auth/setup`,
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: `pnpm --filter @beechcms/dashboard exec vite --port ${DASHBOARD_PORT} --strictPort`,
      url: `${BASE_URL}/admin/login`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { BEECH_DEV_API_TARGET: `http://127.0.0.1:${API_PORT}` },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
})
```

Notes for the executing agent:

- `reuseExistingServer: false` is deliberate on both entries. A reused server would be pointing at the
  wrong database and would make a green run meaningless.
- The API readiness URL is `GET /auth/setup` because it is the only unauthenticated `200` endpoint on a
  freshly migrated database (`{ needsSetup: true }` plus environment flags).
- `EMAIL_PROVIDER`, `SMTP_*`, `WEBHOOK_TESTER_URL` and the `R2_*` keys are intentionally **not** passed.
  The e2e flow sends no mail, fires no webhook and uploads no file, so the Docker stack is not required.
  If a future spec needs any of them, that spec belongs to the flow tier, not here.
- If `wrangler dev` refuses to start because `../dashboard/dist` is missing, the cause is a skipped
  `^build`; run `pnpm --filter @beechcms/dashboard build` once and re-run — do not edit `wrangler.jsonc`.

---

### Task 7 — `e2e/tests/global.setup.ts`

Provisions the world over HTTP only — no D1 handle, no SQL — then captures an authenticated browser
state. Every fixture value comes from `@beechcms/testing`; nothing is invented locally.

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * e2e tier — provisioning.
 * Creates the first administrator, the canonical seeds and one canonical entry through the real
 * HTTP surface, then stores an authenticated browser state for the specs.
 * It holds no D1 handle by design: every table and row it produces is produced by the Botanical
 * Engine inside the worker, exactly as a real operator would produce them.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { test as setup, expect } from '@playwright/test'
import { CANONICAL_SEEDS, CANONICAL_USERS, CANONICAL_ENTRIES } from '@beechcms/testing'
import { API_PORT, ADMIN_STATE, FIXTURE_FILE } from '../playwright.config'

const API = `http://127.0.0.1:${API_PORT}`
const admin = CANONICAL_USERS.admin

export interface E2eFixture {
  readonly seedSlug: string
  readonly entryId: string
  readonly entryTitle: string
}

setup('provisions the canonical world and stores an authenticated state', async ({ page, request }) => {
  const status = await request.get(`${API}/auth/setup`)
  expect(status.status()).toBe(200)
  const { needsSetup } = await status.json() as { needsSetup: boolean }
  expect(needsSetup).toBe(true)

  // track 'developer' without demo data: the suite asserts on the canonical seeds only, and the
  // five DEMO_SEED_DEFINITIONS would add content types no spec accounts for.
  const created = await request.post(`${API}/auth/setup`, {
    data: {
      email: admin.email,
      password: admin.password,
      name: admin.name,
      surname: 'E2E',
      track: 'developer',
      loadDemoData: false,
      settings: { language: 'en', timezone: 'UTC', currency: 'EUR' },
    },
  })
  expect(created.status()).toBe(201)

  const login = await request.post(`${API}/auth/login`, {
    data: { email: admin.email, password: admin.password },
  })
  expect(login.status()).toBe(200)
  const { accessToken } = await login.json() as { accessToken: string }
  const authed = { Authorization: `Bearer ${accessToken}` }

  // Seeds are posted in declaration order: 'posts' carries a relation branch targeting 'authors'
  // (br_08), which must already exist when the engine validates it.
  for (const seed of CANONICAL_SEEDS) {
    const response = await request.post(`${API}/api/seeds`, { headers: authed, data: seed })
    expect(response.status()).toBe(201)
  }

  const canonicalEntry = CANONICAL_ENTRIES[0]
  if (!canonicalEntry) throw new Error('CANONICAL_ENTRIES is empty')

  const entry = await request.post(`${API}/api/content/${canonicalEntry.seedSlug}`, {
    headers: authed,
    data: canonicalEntry.data,
  })
  expect(entry.status()).toBe(201)
  const { id } = await entry.json() as { id: string }

  const seedForEntry = CANONICAL_SEEDS.find((s) => s.slug === canonicalEntry.seedSlug)
  if (!seedForEntry) throw new Error(`no canonical seed for ${canonicalEntry.seedSlug}`)
  const titleAlias = seedForEntry.displayNameAlias
  const fixture: E2eFixture = {
    seedSlug: canonicalEntry.seedSlug,
    entryId: id,
    entryTitle: String(canonicalEntry.data[titleAlias]),
  }
  mkdirSync(dirname(FIXTURE_FILE), { recursive: true })
  writeFileSync(FIXTURE_FILE, JSON.stringify(fixture, null, 2), 'utf8')

  await page.goto('/admin/login')
  await page.getByLabel('Email').fill(admin.email)
  await page.getByLabel('Password').fill(admin.password)
  await page.getByRole('button', { name: 'Login' }).click()
  await page.waitForURL('**/admin/')

  // The dashboard keeps the access token in memory and re-derives the session from the HttpOnly
  // refresh cookie on mount (lib/auth-context.tsx). Cookies are therefore the whole state; a
  // localStorage-only snapshot would resume logged out.
  await page.context().storageState({ path: ADMIN_STATE })
})
```

Executing-agent obligations for this task:

- Verify the real response body key of `POST /auth/login` in `apps/api/src/auth/auth.app.ts:121` before
  writing `accessToken`, and the real key of `POST /api/content/:slug`'s 201 body before writing `id`.
  Adjust the destructuring to what the routes actually return; **never** adjust a route to match this file.
- Verify the post-login landing URL by running the flow once, and adjust `waitForURL` to the real value.
- `displayNameAlias` is read off the seed, not hardcoded: the value asserted in the browser must be the
  one the engine itself uses as the display name. Do not substitute the literal `'title'`.

---

### Task 8 — The two specs

`e2e/tests/auth.e2e.ts`:

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * e2e tier — authenticated session.
 * Proves the browser → vite proxy → wrangler → D1 chain end to end, including the refresh-cookie
 * session restore. Credential validation itself is covered by the API integration tier.
 */

import { expect, test } from '@playwright/test'
import { CANONICAL_USERS } from '@beechcms/testing'

test.describe('authenticated dashboard session', () => {
  test('a restored session lands on the dashboard instead of the login route', async ({ page }) => {
    const response = await page.goto('/admin/')

    expect(response?.status()).toBe(200)
    await expect(page).toHaveURL(/\/admin\/?$/)
    await expect(page.getByRole('button', { name: 'Login' })).toHaveCount(0)
  })

  test('signing out returns the browser to the login route', async ({ page }) => {
    await page.goto('/admin/')

    await page.context().clearCookies()
    await page.reload()

    await expect(page).toHaveURL(/\/admin\/login/)
    await expect(page.getByLabel('Email')).toBeVisible()
  })
})

// CANONICAL_USERS is imported so a future assertion on the displayed account uses the shared
// identity rather than a literal; remove the import if this file never grows such an assertion.
void CANONICAL_USERS
```

> The executing agent must delete the trailing `void CANONICAL_USERS` line and the import with it if it
> does not add an assertion that uses the identity. An unused import that survives review is a finding,
> and `_config/testing_conventions.md` §6.3 forbids dead scaffolding.

`e2e/tests/content-id-contract.e2e.ts` — the regression guard this whole feature exists for:

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * e2e tier — entry-id contract across the dashboard/API boundary.
 * Guards the defect class behind issue #108: an id minted by the API must be an id the dashboard
 * can address. No static analysis can observe this — graphify finds no path from ContentListPage
 * to createBeechApp, because the only edge between them is HTTP.
 */

import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { UUID_V4_PATTERN } from '@beechcms/testing'
import { FIXTURE_FILE } from '../playwright.config'
import type { E2eFixture } from './global.setup'

const fixture = JSON.parse(readFileSync(FIXTURE_FILE, 'utf8')) as E2eFixture

test.describe('content entry id contract', () => {
  test('the API mints the entry id in the production format', () => {
    expect(fixture.entryId).toMatch(UUID_V4_PATTERN)
  })

  test('the list view renders an entry created through the real API', async ({ page }) => {
    const response = await page.goto(`/admin/content/${fixture.seedSlug}`)

    expect(response?.status()).toBe(200)
    await expect(page.getByText(fixture.entryTitle)).toBeVisible()
  })

  test('the detail route resolves an API-minted id without a client-side rewrite', async ({ page }) => {
    const response = await page.goto(`/admin/content/${fixture.seedSlug}/${fixture.entryId}`)

    expect(response?.status()).toBe(200)
    await expect(page).toHaveURL(`/admin/content/${fixture.seedSlug}/${fixture.entryId}`)
    await expect(page.getByText(fixture.entryTitle)).toBeVisible()
  })
})
```

Binding constraints on both specs:

- Selectors are accessible names and text only. **Adding a `data-testid` to any file under
  `apps/dashboard/src/**` is out of scope** (SECTION 7). If a flow proves unreachable without one, stop
  and report it in the execution log rather than editing dashboard source.
- `_config/testing_conventions.md` applies in full: SPDX header (§1.2), `<flow>.e2e.ts` filename (§1.3),
  `describe` names the subject (§1.4), `it`/`test` states behaviour + outcome with no "should" (§1.5),
  one action per test with the result named (§2.1–2.2), status asserted before content (§5.1), no `any`
  (§7.1), no sleeps — use `expect`'s auto-retry and `waitForURL` (§7.2), no conditional assertions
  (§7.4), no `.only`/`.skip` (§7.6), no response snapshots (§7.9).
- Do not add a third spec. Broader coverage arrives per-flow under the Boy Scout Rule, not as a Sprint 4
  deliverable.

---

### Task 9 — `scripts/check-test-placement.mjs`: make e2e placement enforceable

Three edits.

**9a.** Widen the tracked-file filter and add the e2e matcher:

```js
const TEST_FILE = /\.test\.tsx?$/
const E2E_FILE = /\.e2e\.tsx?$/

function trackedFiles() {
  return execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .split('\n')
    .filter((file) => TEST_FILE.test(file) || E2E_FILE.test(file))
}
```

**9b.** Inside the `for (const file of trackedFiles())` loop, before the `for (const app of …)` block,
add the two rules:

```js
    // R6 — an e2e flow crosses slices by nature; inside the slice tree it would manufacture the
    // cross-slice coupling R3 rejects.
    if (E2E_FILE.test(file) && !file.startsWith('e2e/')) {
      found.push(`${file}: R6 — *.e2e.ts belongs to the top-level e2e/ workspace, never inside a slice.`)
    }

    // R7 — e2e/ is a Playwright project; a *.test.ts there is invisible to it and to every vitest tier.
    if (file.startsWith('e2e/') && TEST_FILE.test(file)) {
      found.push(`${file}: R7 — e2e/ holds *.e2e.ts specs only. A vitest suite belongs to its owning slice.`)
    }
```

**9c.** `readFileSync(file, 'utf8')` now also reads e2e specs; that is harmless (R1–R5 are all gated on a
slice path prefix or a `test/integration/` path that no `e2e/` file matches). Confirm by running
`pnpm run lint:tests` and seeing `test placement — OK` with the new files committed.

---

### Task 10 — `scripts/lib/test-tiers.mjs`: e2e becomes runnable, stays `--diff`-forbidden

Replace the two tier declarations and `parseTiers`. `TIERS`, `WORKSPACES`, `DEFAULT_DIFF_TIERS`,
`NEVER_SELECTED_PREFIXES` and `isNeverSelected` are **unchanged** — in particular, no `e2e` workspace
entry is added to `WORKSPACES`, because `--diff` must have nothing to select even in principle.

```js
/** Every tier that exists. */
export const TIERS = ['unit', 'flow', 'integration', 'e2e']

/** Tiers with a runner today. `e2e` runs via `pnpm beech test --tier e2e` (Playwright, e2e/). */
export const RUNNABLE_TIERS = ['unit', 'flow', 'integration', 'e2e']

/** Tiers `--diff` may select. `e2e` is excluded by policy: pre-merge/nightly only. */
export const DIFF_SELECTABLE_TIERS = ['unit', 'flow', 'integration']

/** What `--diff` selects when no --tier is given. `flow` (Docker) and `e2e` are never implicit. */
export const DEFAULT_DIFF_TIERS = ['unit', 'integration']
```

```js
export function parseTiers(value) {
  if (!value) return { tiers: [...DEFAULT_DIFF_TIERS], error: null }

  const requested = value.split(',').map((t) => t.trim()).filter(Boolean)
  if (requested.length === 0) return { tiers: [], error: `--tier needs at least one of: ${DIFF_SELECTABLE_TIERS.join(', ')}` }

  for (const tier of requested) {
    if (tier === 'e2e') {
      return { tiers: [], error: `tier 'e2e' is never selected by --diff (pre-merge/nightly only). Run it with: pnpm beech test --tier e2e` }
    }
    if (!DIFF_SELECTABLE_TIERS.includes(tier)) {
      return { tiers: [], error: `unknown tier '${tier}'. Valid tiers: ${DIFF_SELECTABLE_TIERS.join(', ')}` }
    }
  }
  return { tiers: [...new Set(requested)], error: null }
}
```

`scripts/test-coverage-diff.mjs` is **not edited**: it imports `parseTiers` and prints whatever error it
returns, so `--tier e2e` still exits 1 — with a more accurate reason.

---

### Task 11 — `turbo.json`

Add one task after `test:integration`, keeping the existing shape:

```json
    "test:e2e": {
      "cache": false,
      "dependsOn": ["^build"]
    },
```

`cache: false` because the run depends on live server state; `^build` because the API worker serves
`apps/dashboard/dist` and `@beechcms/testing` resolves `@beechcms/core` types.

---

### Task 12 — `packages/cli/src/commands/test.ts`

Mirror the tier names and replace the refusal branch:

```ts
/**
 * Tiers with a runner. Mirrors RUNNABLE_TIERS in scripts/lib/test-tiers.mjs, which this
 * bundled package cannot import; packages/cli/src/test/test.test.ts asserts the two agree.
 */
export const RUNNABLE_TIERS = ['unit', 'flow', 'integration', 'e2e'] as const
export type TestTier = (typeof RUNNABLE_TIERS)[number]
```

```ts
  const tiers = (args.tier ?? '').split(',').map((t) => t.trim()).filter(Boolean)
  const invalid = tiers.filter((t) => !RUNNABLE_TIERS.includes(t as TestTier))
  if (invalid.length > 0) {
    console.log(pc.red(`  ✗ Unknown tier(s): ${invalid.join(', ')}. Valid tiers: ${RUNNABLE_TIERS.join(', ')}.`))
    process.exit(1)
    return
  }

  if (args.diff && tiers.includes('e2e')) {
    console.log(pc.red('  ✗ The e2e tier is never selected by --diff (pre-merge/nightly only).'))
    console.log(pc.yellow('    Run it on its own: pnpm beech test --tier e2e'))
    process.exit(1)
    return
  }
```

The rest of the function — the `--diff` script-existence check, the `turbo run test:<tier>` mapping, the
`--coverage` fallback and the `spawnSync` call — is unchanged. `--tier e2e` therefore resolves to
`turbo run test:e2e`, which reaches the only workspace declaring that task.

---

### Task 13 — `packages/cli/src/test/test.test.ts`

Replace the test at L79 (`'rejects the e2e tier, which has no runner yet'`) with the two that now describe
the behaviour. Everything else in the file, including the `SpawnSyncReturns<string>` cast and the
above-imports `vi.mock()` placement fixed during the S3 rework, stays as is.

```ts
  it('maps --tier e2e to turbo run test:e2e', async () => {
    await test({ tier: 'e2e' })

    expect(spawnSync).toHaveBeenCalledWith(
      'turbo',
      ['run', 'test:e2e'],
      expect.objectContaining({ stdio: 'inherit', shell: true })
    )
  })

  it('refuses --diff combined with the e2e tier and spawns nothing', async () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called')
    })

    try {
      await expect(test({ diff: true, tier: 'e2e' })).rejects.toThrow('process.exit called')

      expect(mockExit).toHaveBeenCalledWith(1)
      expect(spawnSync).not.toHaveBeenCalled()
    } finally {
      mockExit.mockRestore()
    }
  })
```

The mirror test at L94 needs no edit — it reads `RUNNABLE_TIERS` out of the `.mjs` by regex and compares
to the TS constant, so it fails loudly if Task 10 and Task 12 disagree. That is the intended tripwire; do
not weaken it.

---

### Task 14 — `bin/cli.mjs` help text

```js
    ${pc.cyan('test')}            Run the test suite via Turborepo / Vitest
      --coverage      Run with coverage reporting
      --diff          Run test coverage only for files modified on the branch
      --tier <list>   Run one or more tiers: unit, flow, integration, e2e (comma-separated)
                      e2e is Playwright-driven and is never selected by --diff
```

Keep the surrounding lines and the `--tier` parsing at L274 untouched. `pnpm run docs:check` fact-checks
the command matrix against `docs/build/cli-workflows.md`, so Task 17 must land in the same commit.

---

### Task 15 — `.github/workflows/e2e.yml` (new file)

`.github/workflows/test.yml` is deliberately not touched: its "exactly three jobs" shape is an S3
acceptance criterion, and adding a `schedule` trigger there would make the unit, integration and flow
tiers run nightly too.

```yaml
name: E2E

on:
  pull_request:
    branches: [master]
  schedule:
    # Nightly, 03:00 UTC. The e2e tier is too slow for push-triggered runs (brief rule 5).
    - cron: '0 3 * * *'
  workflow_dispatch:

jobs:
  e2e:
    name: E2E Tier (Playwright)
    runs-on: ubuntu-latest
    timeout-minutes: 30
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
      - name: Install Playwright browser
        run: pnpm --filter @beechcms/e2e exec playwright install --with-deps chromium
      # No Docker: the e2e tier uses wrangler dev + miniflare D1 and touches no MinIO, Mailpit or
      # webhook-tester. It is not the flow tier.
      - name: Run e2e tier
        run: pnpm beech test --tier e2e
      - name: Upload Playwright report
        if: ${{ !cancelled() }}
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: e2e/playwright-report/
          retention-days: 7
```

---

### Task 16 — `.gitignore`

Append one block:

```gitignore
# E2E (Playwright)
e2e/.wrangler-e2e/
e2e/.auth/
e2e/test-results/
e2e/playwright-report/
e2e/blob-report/
e2e/.playwright/
```

This also keeps `scripts/test-runner.mjs`'s repo fingerprint stable: it drops gitignored paths via
`git check-ignore`, so an e2e run cannot invalidate the root test cache.

---

### Task 17 — Docs

`docs/testing.md` — three edits, no new rules (the page is a map, not a second source of truth):

1. In the "Where a test file lives" table, replace
   `| e2e (browser) | top-level `e2e/` (Sprint 4, not built yet) | ← same |` with
   `| e2e (browser) | top-level `e2e/` — `<flow>.e2e.ts` | ← same |`.
2. In the "Running one tier" table, replace the e2e row with
   `| e2e | `pnpm beech test --tier e2e` | `e2e` (PR→master + nightly) | no (wrangler dev + miniflare D1) |`.
3. Under that table, replace the sentence "and the e2e tier is refused outright" with a statement that
   `--diff` still refuses `--tier e2e` and why, and add a short subsection:

```markdown
## Running the e2e tier

`pnpm beech test --tier e2e` boots a throwaway database (`e2e/.wrangler-e2e/`, recreated on every run),
a `wrangler dev` API on port 8799 and a Vite dashboard on port 5273, then drives Chromium against them.
It needs no Docker stack — the flow tier owns MinIO, Mailpit and the webhook tester.

Specs live in `e2e/tests/` as `<flow>.e2e.ts` and are provisioned by `e2e/tests/global.setup.ts`, which
creates the administrator, the canonical seeds and one canonical entry over HTTP using the fixtures
exported by `@beechcms/testing`. `scripts/check-test-placement.mjs` rules R6/R7 keep `*.e2e.ts` out of
the slice tree and `*.test.ts` out of `e2e/`.

The tier never runs from `--diff` and never on a push: CI runs it on pull requests targeting `master`
and nightly (`.github/workflows/e2e.yml`).
```

`docs/build/cli-workflows.md:43` — change the flags cell to
`` `--coverage`, `--diff`, `--tier <unit\|flow\|integration\|e2e>` ``.

`e2e/README.md` — new, short: the command, the ports, the two config seams it relies on
(`BEECH_D1_PERSIST_DIR`, `BEECH_DEV_API_TARGET`), why `@beechcms/api`/`@beechcms/dashboard` are
dependencies (to force `^build` so `apps/dashboard/dist` exists for `wrangler.jsonc`'s assets binding),
why there is no `test` script, and what the tier deliberately does not cover (uploads, email, webhooks —
all flow tier).

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run in order from the repository root. Every command must be run with the Docker stack **stopped**, which
is itself part of the proof that the e2e tier is Docker-free.

```bash
# 0. Link the new workspace and install Playwright's browser
pnpm install
pnpm --filter @beechcms/e2e exec playwright install chromium

# 1. Build + typecheck + lint (includes scripts/check-test-placement.mjs)
pnpm run build
pnpm run type-check
pnpm beech lint
pnpm run lint:tests

# 2. The three pre-existing tiers are unaffected (Docker stopped for unit + integration)
pnpm beech test --tier unit
pnpm beech test --tier integration
pnpm --filter @beechcms/cli test
pnpm --filter @beechcms/api test:coverage
pnpm --filter @beechcms/dashboard test:coverage

# 3. The flow tier still passes (Docker stack required for this one only)
pnpm beech dev          # start the stack, then in a second shell:
pnpm beech test --tier flow

# 4. The new tier (Docker stopped again)
pnpm beech test --tier e2e

# 5. --diff behaviour: e2e refused, defaults unchanged
node scripts/test-coverage-diff.mjs --tier e2e          # expect exit 1, no vitest spawned
pnpm beech test --diff --tier e2e                       # expect exit 1, no turbo/vitest spawned
node scripts/test-coverage-diff.mjs                     # expect unit + integration only
pnpm beech test --diff

# 6. The root runner is still browser-free and still caches
pnpm test
pnpm test                                               # second run must replay from cache

# 7. The two config seams are no-ops when their variables are unset
pnpm beech db:migrate                                   # expect the "already initialized" short-circuit
pnpm beech dev                                          # API 8789, dashboard 5173, proxy unchanged

# 8. Docs parity
pnpm run docs:check

# 9. Graph sync
graphify update . --force
```

Diff audit — these must all report zero changes:

```bash
git diff devs --stat -- packages/core packages/testing apps/api/src apps/api/migrations \
  apps/dashboard/src scripts/test-runner.mjs scripts/test-coverage-diff.mjs .github/workflows/test.yml
```

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `pnpm-workspace.yaml` lists `e2e`; `pnpm install` links `@beechcms/e2e` and resolves its four
      `workspace:` dependencies.
- [ ] `e2e/package.json` declares `test:e2e`, `lint` and `type-check`, and declares **no** `test` script.
- [ ] `pnpm test` (root, fingerprint-cached) launches **no browser process** and its task list contains no
      `@beechcms/e2e` entry; a second consecutive `pnpm test` replays from cache.
- [ ] `pnpm beech test --tier e2e` passes with the Docker stack **stopped** — no MinIO, Mailpit or
      webhook-tester connection is attempted.
- [ ] The e2e run recreates `e2e/.wrangler-e2e/` from scratch: running it twice in a row passes twice, and
      the second run's `GET /auth/setup` still reports `needsSetup: true` before provisioning.
- [ ] An e2e run leaves `apps/api/.wrangler/state/` byte-identical — a developer's local dev database is
      never read or written by the tier.
- [ ] `e2e/tests/content-id-contract.e2e.ts` asserts the API-minted entry id against `UUID_V4_PATTERN`
      imported from `@beechcms/testing`, and navigates to `/admin/content/<slug>/<that id>` successfully.
      No literal id, no literal seed slug, and no literal field alias appears in the spec.
- [ ] Every fixture value (admin identity, seeds, entry payload, id pattern) is imported from
      `@beechcms/testing`. `grep -rn "admin@\|password123\|br_0" e2e/tests/` returns nothing.
- [ ] `e2e/` contains no D1 handle, no `node:sqlite` import, no raw SQL, and no `CREATE TABLE`.
- [ ] `scripts/lib/test-tiers.mjs` exports `RUNNABLE_TIERS` with four tiers and a new
      `DIFF_SELECTABLE_TIERS` with three; `WORKSPACES`, `DEFAULT_DIFF_TIERS`, `NEVER_SELECTED_PREFIXES`
      and `isNeverSelected` are byte-identical to `HEAD`.
- [ ] `node scripts/test-coverage-diff.mjs --tier e2e` exits **1** without spawning vitest, with a message
      naming `pnpm beech test --tier e2e` as the alternative.
- [ ] `pnpm beech test --diff --tier e2e` exits **1** without spawning turbo or vitest.
- [ ] `node scripts/test-coverage-diff.mjs` with no `--tier` still runs unit + integration only, and a
      staged file under `e2e/` is reported as skipped under a never-selected prefix, never as "outside
      tracked workspaces".
- [ ] `packages/cli/src/test/test.test.ts` passes, including the unedited mirror test at L94; the file
      complies with `_config/testing_conventions.md` §1–§3 and §7 (no `as any`, `vi.mock()` above imports).
- [ ] `turbo.json` declares `test:e2e` with `"cache": false` and `"dependsOn": ["^build"]`.
- [ ] `bin/cli.mjs` help lists four tiers and states the `--diff` exclusion; `pnpm run docs:check` passes
      all four checks.
- [ ] `scripts/check-test-placement.mjs` R6 fails an `*.e2e.ts` placed inside a slice and R7 fails a
      `*.test.ts` placed under `e2e/` — both proved with a temporary file, then reverted; `pnpm run
      lint:tests` prints `test placement — OK` on the real tree.
- [ ] Both spec files and `global.setup.ts` carry the SPDX header, use `<flow>.e2e.ts` naming, contain no
      `any`, no `.only`/`.skip`, no `setTimeout` sleep and no conditional assertion.
- [ ] `apps/api/scripts/bootstrap-d1.mjs` with `BEECH_D1_PERSIST_DIR` unset produces the same `D1_DIR` and
      the same wrangler command strings as `HEAD`; `pnpm beech db:migrate` still short-circuits on an
      initialized DB.
- [ ] `apps/dashboard/vite.config.ts` with `BEECH_DEV_API_TARGET` unset proxies to
      `http://127.0.0.1:8789`; `pnpm beech dev` starts API 8789 / dashboard 5173 unchanged.
- [ ] `.github/workflows/e2e.yml` exists with `pull_request: branches: [master]`, a `schedule` cron and
      `workflow_dispatch`; it starts no container. `.github/workflows/test.yml` still has exactly three
      jobs and shows **zero diff**.
- [ ] `git diff devs --stat` shows zero changes under `packages/core/`, `packages/testing/`,
      `apps/api/src/`, `apps/api/migrations/`, `apps/dashboard/src/`, `scripts/test-runner.mjs`,
      `scripts/test-coverage-diff.mjs` and `.github/workflows/test.yml`.
- [ ] `pnpm run build`, `pnpm run type-check` and `pnpm beech lint` are green; API (80/70/80/80) and
      dashboard (30/25/30/30) coverage thresholds still hold with unchanged file/test counts.
- [ ] `docs/testing.md` and `docs/build/cli-workflows.md` no longer say "Sprint 4, not built yet";
      `e2e/README.md` exists.
- [ ] `graphify update . --force` completes and the e2e workspace appears in the graph.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executing agent MUST NOT do any of the following.

1. **Write or modify any file under `apps/api/src/**`, `apps/api/migrations/**`,
   `apps/dashboard/src/**`, `packages/core/**` or `packages/testing/**.** Not a `data-testid`, not an
   `aria-label`, not a migration. If a spec cannot be written without touching one of these, stop and
   report it — the sprint's reviewability rests on a zero-production-diff claim.
2. **Modify `scripts/test-runner.mjs`.** The roadmap's Sprint 4 line proposed "its own concurrency cap in
   `scripts/test-runner.mjs`". That was VETOED during this plan's audit: the runner selects by task name
   and the e2e workspace declares no `test` script, so the cap would be unreachable code. The executing
   cap is Playwright's `workers: 1` in `e2e/playwright.config.ts`. See the ROADMAP Sprint 4 scope note.
3. **Modify `scripts/test-coverage-diff.mjs` or `.github/workflows/test.yml`.** The diff runner needs no
   edit (it prints whatever `parseTiers` returns), and the test workflow's three-job shape is an S3
   acceptance criterion.
4. **Add an `e2e` entry to `WORKSPACES` in `scripts/lib/test-tiers.mjs`,** or otherwise make `--diff`
   capable of selecting the tier. `--diff` must have nothing to select even in principle.
5. **Add a `test` script to `e2e/package.json`,** or add `test:e2e` to any other workspace.
6. **Write a third spec file, a page-object layer, a fixture factory, or a custom Playwright fixture
   file.** Two specs prove the runner and the defect class. Broader coverage is per-flow Boy Scout work at
   the moment a flow is touched, owned by no sprint.
7. **Convert, relocate or rewrite any existing vitest suite.** The Boy Scout Rule stands (brief §2 rule 6);
   the 41 flow suites and the 107 unit suites stay exactly where S2 and S3 left them.
8. **Cover uploads, email, webhooks, OAuth consent, RBAC matrices, drafts, kanban, search or the setup
   wizard UI** in an e2e spec. The first three need the Docker stack and belong to the flow tier; the rest
   are already covered at the unit/integration tiers and would buy browser cost for no new signal.
9. **Build the scale/perf tier, a scale seed generator, or any pagination/query-cost assertion.** That is
   ROADMAP Sprint 5 (`scale-perf-tier`), which depends on this sprint's tier machinery being settled.
10. **Add Firefox, WebKit, mobile emulation, visual-regression snapshots or Playwright sharding.**
    Chromium, one worker, no shards.
11. **Add a `schedule` trigger to `.github/workflows/test.yml`,** which would run the unit, integration and
    flow tiers nightly as a side effect.
12. **Reuse `scripts/dev-cli/orchestrator.ts`** or extract a shared boot module from it. It is TUI-,
    Docker- and tunnel-coupled; Playwright's `webServer` already owns process lifecycle, and a shared
    abstraction over two callers is speculative generality.
13. **Commit.** Per the stage contract, the execution agent leaves the branch uncommitted for review.
