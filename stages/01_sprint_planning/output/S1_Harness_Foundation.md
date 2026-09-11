# Sprint 1 — `harness-foundation`

Feature: Test Harness & Test Suite Redesign (issue #108)
Brief: `stages/00_ideation/output/feature_brief.md`
Roadmap: `backlog/ROADMAP.md` (5 sprints; this is sprint 1 of 5)
Test rules: `_config/testing_conventions.md` — **binding on every test file this sprint touches**

---

### Pre-Computation Analysis

**a) God Nodes identified via the Graphify CLI** (`graphify explain`, degree = edges in the AST graph)

| Node | ID | Source | Degree |
|------|----|--------|--------|
| `createBeechApp()` | `apps_api_src_factory_createbeechapp` | `apps/api/src/factory.ts:109` | **56** |
| `D1ContentRepository` | `apps_api_src_shared_db_repositories_content_repository_d1_d1contentrepository` | `apps/api/src/shared/db/repositories/content.repository.d1.ts:113` | **44** |
| `D1TestDatabase` | `apps_api_test_helpers_d1_test_database_d1testdatabase` | `apps/api/test/helpers/d1-test-database.ts:19` | **42** |
| `AppEnv` | `apps_api_src_types_appenv` | `apps/api/src/types.ts:250` | **39** |
| `ContentRepository` (interface) | `packages_core_src_content_content_repository_contentrepository` | `packages/core/src/content/content.repository.ts:118` | 25 |
| `authMiddleware()` | `apps_api_src_middleware_auth_middleware_authmiddleware` | `apps/api/src/middleware/auth.middleware.ts:80` | 11 |
| `IClock` | `packages_core_src_common_clock_iclock` | `packages/core/src/common/clock.ts:9` | 10 |
| `ITokenService` | `packages_core_src_auth_token_service_itokenservice` | `packages/core/src/auth/token-service.ts:18` | 3 |

The decisive finding: **`D1TestDatabase` is a god node of the test tree (degree 42) and it is a hand-rolled
`node:sqlite` shim** that merely *implements* the `D1Database` interface — it is not D1. Its own source
carries the proof of divergence (`toSqliteParams()` coerces integral JS numbers to `BigInt` because
`node:sqlite` binds `1` as SQLite REAL while real D1 binds it as INTEGER). This is precisely the
environment-mismatch class of false positive the brief was written against. The harness replaces it for
the integration tier.

**b) Architectural boundaries affected**

- `@beechcms/core` — **read-only this sprint.** `IClock`, `ITokenService`, `JwtClaims`, `Seed`,
  `defineSeed()`, `planCreateSeed()`, `GLOBAL_SCOPE`, `SUPER_ADMIN_ROLE_NAME` are consumed. No core
  source file is modified. Confirmed seam: `packages/core/src/engine/seed-ddl.ts:25`
  `planCreateSeed(seed: Seed): string[]` is the Botanical Engine's own DDL planner — the harness
  materializes `content_{slug}` tables through it, never with hand-written SQL.
- `packages/testing` — **new workspace**, the only new boundary. Depends on `@beechcms/core` only.
  It does **not** depend on `@beechcms/api`: the app factory is passed in by the caller
  (`createApp: (authProviders) => createBeechApp({...})`), which keeps the workspace graph acyclic.
- `apps/api` — one production-code line of surface: `BeechConfig` gains an optional `authProviders`
  passthrough so `authProvidersMiddleware(overrides)` (which already accepts `{ hashProvider,
  tokenService, clock }` at `apps/api/src/middleware/auth-providers.middleware.ts:12`) can be reached
  from a test. Everything else is test-tier configuration (a second Vitest project) and the pilot
  migration.
- `apps/dashboard` — **untouched this sprint.** Dashboard slice test folders are Sprint 2; e2e is Sprint 4.
- Root `scripts/` + `.github/workflows/` — **untouched this sprint** beyond nothing at all; tier-aware
  `--diff` selection is Sprint 3. The new integration project is reached through the existing
  `apps/api` `test` script, so `scripts/test-runner.mjs` (fingerprint cache, PID lock, concurrency
  capping) and `scripts/test-coverage-diff.mjs` keep working unmodified.

**c) `graphify affected` impact analysis (breaking-change proof)**

`graphify affected "D1TestDatabase" --depth 2` → **36 dependents**, all of them test files:
`apps/api/src/features/oauth/{authorize,consents,revoke,token}.test.ts`,
`apps/api/src/features/rbac/{assignments,invitations,roles,users}.test.ts`,
`apps/api/src/middleware/permission.middleware.test.ts`,
`apps/api/src/shared/db/repositories/d1-{invitation,role-assignment,role}.repository.test.ts`,
`apps/api/src/shared/rbac/effective-permissions.test.ts`,
`apps/api/test/{draft-relation,draft-touched-fields,flow-admin-auth,flow-background-queues,flow-backrefs,flow-bulk-edit,flow-content-management,flow-draft-management,flow-media-assets,flow-oauth-authorization,flow-oauth-connected-apps,flow-oauth-resource-server,flow-rbac-admin,flow-rbac-enforcement,flow-rbac-invitations,flow-rbac-projections,flow-relations,flow-setup-race,flow-stats,flow-system-schema}.test.ts`,
plus `apps/api/test/helpers/seed-fixtures.ts` and the `seedTestUsers()` / `seedRoleAuthorOnly()` call sites.

`graphify affected "createBeechApp" --depth 2` → **40+ dependents**, of which exactly one is production
code: `apps/api/src/index.ts:5`. Every other dependent is a test file.

**Consequence for this sprint (this is why the plan is shaped the way it is):** `D1TestDatabase` MUST
NOT be deleted or modified in Sprint 1 — 36 suites would break in one commit, which is exactly the
big-bang rewrite the brief rejects. It is left in place, serving the existing `forks` project, and
decays by attrition under the Boy Scout Rule. The `createBeechApp` signature change is additive-optional
(`authProviders?`), so none of its 40+ dependents — including the single production dependent
`apps/api/src/index.ts` — is affected.

---

### VETO Audit

Evaluated against `_config/ponytail_arch.md`.

**1. Botanical Invariant — no D1 access bypasses `@beechcms/core`.** PASS.
The harness never writes `CREATE TABLE content_*` by hand: it calls `planCreateSeed(seed)` from
`packages/core/src/engine/seed-ddl.ts` and executes the statements the engine returns. Structural
tables (`users`, `roles`, `seeds`, `user_role_assignments`, …) come from the real migration files in
`apps/api/migrations/` applied with `applyD1Migrations()`, i.e. the strict migration workflow, not
ad-hoc DDL. Fixture rows are inserted through the real `D1ContentRepository` / real HTTP routes
wherever a route exists; direct `INSERT` is confined to structural auth tables that have no engine
representation (mirroring what `apps/api/test/helpers/seed-fixtures.ts:22` already does today).
Field identity uses Branch IDs (`br_XX`) via `defineSeed`; the canonical seed module hardcodes no
physical column names.

**2. VSA Enforcement — zero cross-feature imports.** PASS.
`packages/testing` is a shared library, not a slice: a slice importing it is `feature → shared lib`,
the sanctioned direction, identical to how every slice already imports `@beechcms/core`. The pilot
suite lands at `apps/api/src/features/content/test/integration/` and imports only its own slice plus
`@beechcms/testing` and `@beechcms/core`. No slice-to-slice import is created. The e2e tier — which
*does* cross slices by nature — is deliberately deferred to Sprint 4 and will live outside the slice
tree in a top-level `e2e/`, never inside it.

**3. Cloudflare Purity.** PASS, and this is the point of the sprint. The integration tier runs on
`@cloudflare/vitest-pool-workers` → real `workerd` + real Miniflare D1, replacing a `node:sqlite`
emulation. No ORM is introduced. No stateful background job. No schema change outside `migrations/`.

**4. YAGNI.** Two things were cut here before drafting:
- A generic "TestHarness for any app" abstraction was rejected. The harness takes a caller-supplied
  factory callback (7 lines) instead of a plugin architecture.
- A third and fourth fake (`IHashProvider`, `IIdGenerator`) were rejected. `IIdGenerator` in particular
  must stay **real** in harness tests: `apps/api/src/features/content/handlers/create.ts:108` mints
  entry IDs via `context.get('idGenerator').uuid()`, and faking it with `SequentialIdGenerator` would
  reproduce the exact "test IDs are not the shape production sends" defect that motivated the feature.
- Duplication found and resolved rather than added: `FixedClock`
  (`apps/api/src/shared/services/clock/fixed-clock.ts`, 6 importers) and `StaticTokenService`
  (`apps/api/src/auth/__fixtures__/static-token-service.ts`, 1 importer) are **moved** into
  `@beechcms/testing`, not duplicated there. Two `IClock` fakes in one monorepo would be an
  instant VETO.

**Adjustment made during this audit:** the first shape of this plan had `@beechcms/testing` depend on
`@beechcms/api` to type `BeechConfig`. That creates a workspace cycle (`api → testing (dev)`,
`testing → api`). Rejected and replaced with the injected-factory callback described above, which
leaves `@beechcms/testing`'s only runtime dependency as `@beechcms/core`.

No violation remains. Plan approved for drafting.

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Every other sprint in the roadmap imports something this sprint creates. Sprint 2 (per-slice layout)
relocates suites that must first have something real to run against; Sprint 3 (CI tiering) selects on a
tier boundary that does not exist until an integration project exists; Sprint 4 (e2e) must be *excluded*
from a tier mechanism that Sprint 3 builds on top of this one; Sprint 5 (scale tier) reuses this
sprint's seeding API. Ordering is forced, not preferred.

The architectural reason to build the harness before touching any test layout: today the integration
tier's foundation is `D1TestDatabase`, a `node:sqlite` class that *implements* `D1Database` rather than
being it. Its own source documents a divergence it has to paper over — integral JS numbers bind as
SQLite REAL under `node:sqlite` and as INTEGER under real D1, so an integer-affinity comparison can
mismatch in tests and only in tests. Reorganising ~345 test files on top of that foundation would
produce a tidy suite that still lies. The engine parity must land first.

**VSA adherence.** `packages/testing` is a shared library consumed top-down by slices, exactly like
`@beechcms/core`. It introduces no slice-to-slice edge. The pilot test is co-located inside the slice
that owns it (`apps/api/src/features/content/test/integration/`), satisfying the "high cohesion inside
a slice" rule, and imports nothing from a sibling slice. The one test category that inherently violates
slice isolation — e2e, which drives dashboard → API → D1 across every slice at once — is explicitly not
built here; it is deferred to Sprint 4 and will live outside the slice tree.

**Botanical Engine invariants.** The harness provisions content storage exclusively through
`planCreateSeed()` from `@beechcms/core`, and structural storage exclusively through the real
`apps/api/migrations/*.sql` files. The default repository wiring is left untouched, which means a
harness request goes `Hono → repositoryMiddleware → D1ContentRepository → real D1`, with `apiToDb`/
`dbToApi` alias translation intact. Nothing in the harness knows a physical column name.

**Fake surface is deliberately two.** `IClock` and `ITokenService` are faked so time-travel and auth
expiry are deterministic. Everything else in the request path — repositories, all middleware, D1,
`IIdGenerator` — stays real. The blind spot this creates (real JWT signing/verification is never
exercised by harness tests) is closed inside this same sprint by dedicated unit coverage, so the sprint
does not ship a hole.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Workspaces** (`pnpm-workspace.yaml`): `apps/*`, `packages/*`, `docs/examples/*`.
Existing packages: `cli`, `client`, `core`, `forms-react`, `mcp`, `search-client`, `widget-sdk`.
Root `packageManager`: `pnpm@11.25.0`. Root `vitest`: `^4.1.11`.

**Test inventory (counted, not estimated):** 345 `*.test.ts(x)` files repo-wide — 149 in `apps/api`
(107 co-located under `src/`, 42 in `apps/api/test/`), 123 in `apps/dashboard` (102 under `src/test/`,
21 co-located in slices). The brief's "~70 existing tests" understates the real surface by ~5×; this
is the single strongest argument for the Boy Scout Rule over a rewrite, and the plan below rewrites
exactly one suite.

**Existing API test foundation:**
- `apps/api/vitest.config.ts` — `pool: 'forks'`, `globalSetup: ['./test/docker-precheck.runner.ts',
  './test/global-setup.ts']`, `include: ['test/**/*.test.ts', 'src/**/*.test.ts']`, v8 coverage with
  thresholds `statements 80 / branches 70 / functions 80 / lines 80` and a long `exclude` list.
- `apps/api/test/global-setup.ts` — creates/empties the MinIO bucket `beech-media-test` and asserts the
  Docker stack (MinIO, Mailpit, webhook-tester) is reachable.
- `apps/api/test/helpers/d1-test-database.ts` — the `node:sqlite` `D1Database` shim (god node, 42
  dependents) that reads and replays `apps/api/migrations/*.sql`, skipping data-only migrations.
- `apps/api/test/helpers/seed-fixtures.ts` — `seedTestUsers(db, users)`, inserting into `users` and
  resolving the `SuperAdmin` role id by name into `user_role_assignments`.
- `apps/api/test/fixtures.ts` — `TEST_JWT_SECRET`, `TEST_ENV` (the object every flow test spreads into
  `app.request(path, init, env)`), `TEST_SEEDS` built with `defineSeed()`, `TEST_USERS`.
- `apps/api/test/mocks/static-*.repository.ts` — the hand-rolled in-memory repositories the brief
  targets. The pilot suite currently uses `StaticContentRepository` + `StaticIdempotencyRepository`.
- Existing fakes already in the tree: `apps/api/src/shared/services/clock/fixed-clock.ts`
  (`FixedClock implements IClock`, 6 importers) and `apps/api/src/auth/__fixtures__/static-token-service.ts`
  (`StaticTokenService implements ITokenService`, prefix `test:`, **no TTL/expiry awareness**).

**Current test bootstrap shape** (`apps/api/test/flow-content-management.test.ts:35-52`): construct
`StaticContentRepository`, construct `D1TestDatabase`, `seedTestUsers`, `createBeechApp({ seeds, repository,
idempotencyRepository })`, `vi.spyOn(S3Client.prototype, 'send')`, then `POST /auth/login` to obtain a
real JWT, then pass `{ ...TEST_ENV, DB: db }` as the third argument of every `app.request()`.

**`AppEnv` (`apps/api/src/types.ts:250`)**: `export type AppEnv = { Bindings: Env; Variables: Variables }`.
`Variables` carries the injected services — `repository`, `idempotencyRepository`, `seedRepository`,
`mediaRepository`, `systemStatsRepository`, `analyticsRepository`, `hashProvider`, `tokenService`,
`roleGuard`, `roleRepository`, `roleAssignmentRepository`, `invitationRepository`,
`oauthTokenRepository`, `oauthConsentRepository`, `idGenerator`, and memoized `effectivePermissions?`.

**Exact middleware registration order** (`apps/api/src/factory.ts:109` → `createBeechApp`), root app:
1. `repositoryMiddleware({...})` on `*` — must be first; `seedRegistryMiddleware` depends on the
   `seedRepository` it sets. With no overrides it constructs the real `D1ContentRepository(env.DB, …)`
   (`repository.middleware.ts:107`) and the real `D1SeedRepository(env.DB)` (`:143`).
2. `seedRegistryMiddleware()` on `*` — D1-backed seed hydration, version-token cached per isolate.
3. `storageMiddleware({ bucket })` on `*`
4. `queueMiddleware(config.jobs ?? {})` on `*`
5. `authProvidersMiddleware()` on `*` — **called with no argument today**, though its signature is
   `authProvidersMiddleware(overrides?: { hashProvider?: IHashProvider; tokenService?: ITokenService;
   clock?: IClock })`. It sets `hashProvider` and `tokenService` into the context, defaulting to
   `BcryptHashProvider` and `JoseTokenService(env.JWT_SECRET, { issuer, audience }, SystemClock)`.
6. `rateLimiterMiddleware(...)` on `*`
7. `observabilityMiddleware()` on `*`
8. inline CORS middleware on `*`
9. inline security-headers middleware on `*` (skips `/admin`)
10. inline analytics middleware on `/api/*` (post-response, `waitUntil`)
11. `app.route('/', …)` for `authApp`, `setupApp`, `passwordResetApp`, `rbacPublicApp`, `oauthApp`
12. `apiProtected` sub-app: `authMiddleware({ acceptOAuth: true })` → `oauthScopeMiddleware()` →
    `permissionMiddleware()`, in that order and no other (the OAuth scope allowlist consumes the
    `oauthGrant` the auth middleware sets; RBAC runs last). Then routes `/settings`, `/schema`,
    `/dashboard-layout`, `/seeds`, `/rbac`, `/content` (notifications, stats, rotate-field, draft,
    backrefs, content), `/widget`, `/automations`, `/search`, `/` (upload).
13. `apiPublic` sub-app mounted at `/api/v1/public`: `publicRateLimitMiddleware()` → `apiKeyMiddleware()`
    → `publicRoutes`, registered **before** `app.route('/api', apiProtected)`.
14. `/api/webhooks`, `/api/media/:key{.+}`, optional `customRoutes`, then `/api` → `apiProtected`,
    then the `/admin/*` SPA asset routes.

**`BeechConfig` today** accepts `seeds`, `repository`, `idempotencyRepository`,
`timeTrapTokenRepository`, `bucket`, `mediaRepository`, `systemStatsRepository`, `seedRepository`,
`automationRepository`, `automationRunner`, `hooks`, `customRoutes`, `jobs`, `rateLimiterRegistry`,
`roleGuard`. **There is no seam for `IClock`/`ITokenService`** — that is the one production gap.

**Migrations:** `apps/api/migrations/` holds `0000_v040_base.sql` (594 lines, structural) and
`0030_test_seeds.sql` (125 lines, data), plus an ignored `_archive/` subdirectory. Content tables
(`content_{slug}`, `content_{slug}_drafts`, `rel_{slug}_{alias}`) are **not** in migrations — the
Botanical Engine creates them at runtime.

**CI (`.github/workflows/test.yml`):** two jobs, `test-api` and `test-dashboard`, on push and PR to
`master`/`devs`. `test-api` starts Mailpit + webhook-tester as services and MinIO via `docker run`,
builds `@beechcms/core` and `@beechcms/search-client`, then runs `pnpm --filter @beechcms/api test`.
No tiering of any kind. `scripts/test-coverage-diff.mjs` hardcodes 5 workspaces and runs
`vitest related`. `scripts/test-runner.mjs` holds the whole-repo SHA256 fingerprint cache, the
single-run PID lock, and the hardware-aware concurrency caps (`totalMemGb <= 8 → 2`).

**Not present in the repo:** `@cloudflare/vitest-pool-workers` (0 occurrences in `pnpm-lock.yaml`),
Playwright (0 occurrences), any `e2e/` directory. `@cloudflare/vitest-pool-workers@0.22.0` declares
`peerDependencies: { vitest: "^4.1.0", "@vitest/runner": "^4.1.0", "@vitest/snapshot": "^4.1.0" }` —
compatible with the repo's `vitest ^4.1.11`.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

**A. New workspace `packages/testing` (`@beechcms/testing`, private, TS-source exports, no build step)**

| File | Content |
|------|---------|
| `packages/testing/package.json` | new — private workspace, exports `./src/index.ts` |
| `packages/testing/tsconfig.json` | new |
| `packages/testing/eslint.config.js` | new — re-export of the root flat config |
| `packages/testing/src/index.ts` | new — public barrel |
| `packages/testing/src/harness.ts` | new — `createTestHarness()`, `TestHarness` |
| `packages/testing/src/client/test-client.ts` | new — `.asUser()` / `.anonymous()` request client |
| `packages/testing/src/services/fixed-clock.ts` | **moved** from `apps/api/src/shared/services/clock/fixed-clock.ts`, plus `advance()`/`set()` |
| `packages/testing/src/services/fake-token.service.ts` | **moved+extended** from `apps/api/src/auth/__fixtures__/static-token-service.ts` — now clock- and TTL-aware |
| `packages/testing/src/seeds/canonical.seeds.ts` | new — canonical `Seed[]` via `defineSeed()` |
| `packages/testing/src/seeds/canonical.data.ts` | new — canonical users + entries, real-format IDs |
| `packages/testing/src/seeds/provision.ts` | new — `provisionSeeds()` / `seedCanonicalData()` via `planCreateSeed()` |
| `packages/testing/src/env.ts` | new — `TEST_ENV` for the workers tier |

**B. `apps/api` — production code (one seam only)**

| File | Change |
|------|--------|
| `apps/api/src/factory.ts` | `BeechConfig.authProviders?: AuthProviderOverrides` + pass it to `authProvidersMiddleware(config.authProviders)` (step 5 of the order above). Additive-optional; the 40+ `createBeechApp` dependents are unaffected. |

**C. `apps/api` — test tier configuration**

| File | Change |
|------|--------|
| `apps/api/vitest.workers.config.ts` | new — second Vitest project, `defineWorkersConfig`, real D1 |
| `apps/api/test/harness/apply-migrations.ts` | new — `setupFiles` entry, applies `migrations/` to the Miniflare D1 |
| `apps/api/test/harness/env.d.ts` | new — `cloudflare:test` `ProvidedEnv` declaration |
| `apps/api/vitest.config.ts` | modified — `exclude` the integration glob so the `forks` project never picks it up; drop the now-moved `fixed-clock.ts` coverage-exclude line |
| `apps/api/package.json` | modified — `@cloudflare/vitest-pool-workers` + `@beechcms/testing` devDeps; `test` runs both projects; new `test:integration` script |
| `apps/api/tsconfig.json` | modified — include the new `test/harness/env.d.ts` |

**D. `apps/api` — pilot migration + moved-fake fallout**

| File | Change |
|------|--------|
| `apps/api/src/features/content/test/integration/content-management.integration.test.ts` | new — the pilot, harness-based, real D1 |
| `apps/api/test/flow-content-management.test.ts` | **deleted** after parity is demonstrated |
| `apps/api/src/shared/services/clock/fixed-clock.ts` | **deleted** (moved to `@beechcms/testing`) |
| `apps/api/src/auth/__fixtures__/static-token-service.ts` | **deleted** (moved to `@beechcms/testing`) |
| 6 importers of `FixedClock` + 1 importer of `StaticTokenService` | import path updated to `@beechcms/testing` (list in Section 4, task 9) |
| `apps/api/src/auth/providers/jwt-token.service.test.ts` | extended — payload-tamper and `alg: none` cases (the real gap; expiry, wrong-secret, issuer-mismatch and injected-clock cases already exist) |

**E. Convention doc (already authored — the executing agent consumes it, does not rewrite it)**

| File | Change |
|------|--------|
| `_config/testing_conventions.md` | exists — binding rules: tier choice, placement, SPDX header, `describe`/`it` naming, the four-zone anatomy, environment setup, act, response+state assertions, comment policy, forbidden patterns, §8 review checklist, §9 templates |
| `stages/{01,02,03}/CONTEXT.md` | already wired — the doc is a Layer 3 input for planning, execution and review |
| `docs/testing.md` | new — short public-facing page: the tier table, where a test file goes, and a pointer to `_config/testing_conventions.md` as the normative source. Do not restate the rules in two places. |

**Explicitly excluded from this sprint's file set:** `apps/dashboard/**`, `scripts/**`,
`.github/workflows/**`, `packages/core/src/**`, `apps/api/test/helpers/d1-test-database.ts` and its 36
dependents, and every `apps/api/test/flow-*.test.ts` other than the pilot.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### Task 1 — `packages/testing/package.json`

No `build` and no `test` script: the package is consumed as TypeScript source by Vite/Vitest only, so
it never enters Turbo's `build` graph and cannot create a cycle with `apps/api`.

```json
{
  "name": "@beechcms/testing",
  "version": "0.8.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "lint": "eslint .",
    "type-check": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@beechcms/core": "workspace:^0.8.0"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20260213.0",
    "@types/node": "^24.10.1",
    "hono": "^4.12.34",
    "typescript": "^5.9.3",
    "vitest": "^4.1.11"
  },
  "license": "BUSL-1.1"
}
```

`packages/testing/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noEmit": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true
  },
  "include": ["src/**/*.ts"]
}
```

### Task 2 — `packages/testing/src/services/fixed-clock.ts`

Move of `apps/api/src/shared/services/clock/fixed-clock.ts`. The existing two-method contract is kept
byte-for-byte so the 6 current importers need only an import-path change; `set()`/`advance()` are added
for token-expiry tests.

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { IClock } from '@beechcms/core'

const MILLISECONDS_PER_SECOND = 1000

/** Frozen-time {@link IClock}. Advances only when a test tells it to. */
export class FixedClock implements IClock {
  private currentMs: number

  constructor(fixedNowMs: number) {
    this.currentMs = fixedNowMs
  }

  now(): number {
    return this.currentMs
  }

  nowSeconds(): number {
    return Math.floor(this.currentMs / MILLISECONDS_PER_SECOND)
  }

  /** Jumps to an absolute epoch-millisecond value. */
  set(nowMs: number): void {
    this.currentMs = nowMs
  }

  /** Moves time forward (or backward, with a negative delta) by `deltaMs`. */
  advance(deltaMs: number): void {
    this.currentMs += deltaMs
  }
}
```

### Task 3 — `packages/testing/src/services/fake-token.service.ts`

Move of `StaticTokenService`, extended to honour TTL against the injected clock — the current double
ignores expiry entirely, which is why auth-expiry logic is untestable through it today. The `test:`
prefix is preserved so the existing behavioural tests in `jwt-token.service.test.ts` keep passing.

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { IClock, ITokenService, IssueTokenOptions, JwtClaims } from '@beechcms/core'

export const TEST_TOKEN_PREFIX = 'test:'

const DEFAULT_TOKEN_TTL_SECONDS = 900

interface IssuedToken {
  readonly claims: JwtClaims
  readonly expiresAtSeconds: number
}

/**
 * Non-cryptographic {@link ITokenService} for the integration tier. Tokens are opaque
 * handles into an in-memory map, never signed — so this class can never be used to assert
 * anything about real JWT signing. That surface is covered by
 * `apps/api/src/auth/providers/jwt-token.service.test.ts` instead.
 */
export class FakeTokenService implements ITokenService {
  private readonly issued = new Map<string, IssuedToken>()
  private counter = 0

  constructor(private readonly clock: IClock) {}

  async issue(claims: JwtClaims, options?: IssueTokenOptions): Promise<string> {
    const ttlSeconds = options?.ttlSeconds ?? DEFAULT_TOKEN_TTL_SECONDS
    // The counter keeps two tokens for the same subject distinguishable (refresh/rotation cases).
    const token = `${TEST_TOKEN_PREFIX}${claims.sub}:${this.counter++}`
    this.issued.set(token, {
      claims,
      expiresAtSeconds: this.clock.nowSeconds() + ttlSeconds,
    })
    return token
  }

  async verify(token: string): Promise<JwtClaims | null> {
    if (!token.startsWith(TEST_TOKEN_PREFIX)) return null
    const entry = this.issued.get(token)
    if (!entry) return null
    if (this.clock.nowSeconds() >= entry.expiresAtSeconds) return null
    return entry.claims
  }

  /** Test affordance: forget a token without advancing the clock (revocation cases). */
  revoke(token: string): void {
    this.issued.delete(token)
  }
}
```

### Task 4 — `packages/testing/src/env.ts`

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/** JWT secret used by the integration tier. 32+ bytes: JoseTokenService rejects anything shorter. */
export const TEST_JWT_SECRET = 'beech_cms_super_secret_test_key_2024_!@#'
export const TEST_PUBLIC_READ_KEY = 'pk_read_live_6f8g9h0j1k2l'
export const TEST_PUBLIC_WRITE_KEY = 'pk_write_live_9a8b7c6d5e4f'

/**
 * Hono `Bindings` for harness requests. Deliberately carries no R2/SMTP/webhook endpoints:
 * the workers tier does not reach the Docker stack. Suites that need MinIO, Mailpit or the
 * webhook tester stay in the `forks` project with `apps/api/test/fixtures.ts` TEST_ENV.
 */
export const TEST_ENV = {
  JWT_SECRET: TEST_JWT_SECRET,
  PUBLIC_READ_API_KEY: TEST_PUBLIC_READ_KEY,
  PUBLIC_WRITE_API_KEY: TEST_PUBLIC_WRITE_KEY,
  PUBLIC_PUBLISHED_ONLY: 'true',
  ENV: 'development',
  CORS_ORIGINS: 'http://localhost:5173',
  DATE_FORMAT: 'DD-MM-YYYY',
  APP_URL: 'http://localhost:5173',
} as const

export type TestEnv = typeof TEST_ENV
```

### Task 5 — `packages/testing/src/seeds/canonical.seeds.ts` and `canonical.data.ts`

`canonical.seeds.ts` defines the seeds with `defineSeed()` from `@beechcms/core` (Branch IDs `br_*`,
never physical column names). Port the shapes from `apps/api/test/fixtures.ts` `TEST_SEEDS` — keep
`posts` (with `allowPublicRead: true`, `displayNameAlias: 'title'`, a `restricted`/private branch such
as `internal_note`, and a relation branch) and whatever second/third seed the pilot suite exercises —
so the pilot's assertions carry over unchanged. Do not invent new field types.

```ts
import { defineSeed, type Seed } from '@beechcms/core'

export const CANONICAL_SEEDS: readonly Seed[] = [
  defineSeed({ slug: 'posts', /* …ported from apps/api/test/fixtures.ts TEST_SEEDS… */ }),
  // …
] as const

export const CANONICAL_SEED_SLUGS = CANONICAL_SEEDS.map((seed) => seed.slug)
```

`canonical.data.ts` is the part that closes the defect class named in the brief. **Entry IDs must be
UUIDv4 strings**, because production mints them with `context.get('idGenerator').uuid()`
(`apps/api/src/features/content/handlers/create.ts:108`) and the dashboard round-trips exactly that
shape. Short synthetic ids (`'p_001'`, as `flow-content-management.test.ts` uses today) are the
fruit-ID-format bug reproduced in fixture form and are forbidden here.

```ts
import type { JwtClaims } from '@beechcms/core'

export interface CanonicalUser {
  readonly id: string
  readonly email: string
  readonly password: string
  /** bcrypt hash of `password`, precomputed — hashing at test time costs ~100ms per user. */
  readonly passwordHash: string
  readonly name: string
  readonly role: string
  /** Grants `SuperAdmin` at `GLOBAL_SCOPE`. Defaults to true for `role === 'admin'`. */
  readonly grantSuperAdmin?: boolean
}

export const CANONICAL_USERS = {
  admin: {
    id: 'usr_3f1c0b8e5a2d4c7f9e6b1a3d5c8e0f2a',
    email: 'admin@beech.test',
    password: 'password123',
    passwordHash: '$2a$10$…',      // reuse the hash already in apps/api/test/fixtures.ts TEST_USERS
    name: 'Canonical Admin',
    role: 'admin',
  },
  editor: { /* role: 'editor', grantSuperAdmin: false */ },
  viewer: { /* role: 'viewer', grantSuperAdmin: false */ },
} as const satisfies Record<string, CanonicalUser>

export interface CanonicalEntry {
  readonly seedSlug: string
  /** UUIDv4 — the exact shape `IIdGenerator.uuid()` produces in production. */
  readonly id: string
  readonly data: Record<string, unknown>
}

export const CANONICAL_ENTRIES: readonly CanonicalEntry[] = [
  {
    seedSlug: 'posts',
    id: '9f8e7d6c-5b4a-4392-8170-1a2b3c4d5e6f',
    data: { slug: 'canonical-post', status: 'published', title: 'Canonical Post', internal_note: 'SECRET' },
  },
  // …
] as const

/** Exported so suites can assert the format instead of hardcoding a literal. */
export const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export type CanonicalUserKey = keyof typeof CANONICAL_USERS
export type CanonicalClaims = JwtClaims
```

### Task 6 — `packages/testing/src/seeds/provision.ts`

Content storage is created through the Botanical Engine's own planner. No hand-written `CREATE TABLE`.

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { planCreateSeed, GLOBAL_SCOPE, SUPER_ADMIN_ROLE_NAME, type Seed } from '@beechcms/core'
import { CANONICAL_SEEDS } from './canonical.seeds'
import { CANONICAL_USERS, type CanonicalUser } from './canonical.data'

const UPSERT_SEED_SQL = `
  INSERT INTO seeds (slug, definition, status, source, created_at, updated_at)
  VALUES (?, ?, 'active', 'code', ?, ?)
  ON CONFLICT(slug) DO UPDATE SET
    definition = excluded.definition,
    status     = 'active',
    updated_at = excluded.updated_at
`

/**
 * Registers seeds in the `seeds` table (so seedRegistryMiddleware hydrates them from D1)
 * and materializes their physical storage via the engine's DDL planner.
 */
export async function provisionSeeds(
  db: D1Database,
  seeds: readonly Seed[] = CANONICAL_SEEDS,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<void> {
  for (const seed of seeds) {
    for (const statement of planCreateSeed(seed)) {
      await db.exec(statement.replace(/\n/g, ' '))
    }
    await db.prepare(UPSERT_SEED_SQL)
      .bind(seed.slug, JSON.stringify(seed), nowSeconds, nowSeconds)
      .run()
  }
}

/**
 * Inserts canonical users and grants SuperAdmin at global scope. Mirrors
 * `apps/api/test/helpers/seed-fixtures.ts`: role ids are minted per-database by
 * 0000_v040_base.sql, so they are resolved by name, never hardcoded.
 */
export async function seedUsers(
  db: D1Database,
  users: readonly CanonicalUser[] = Object.values(CANONICAL_USERS),
): Promise<void> {
  for (const user of users) {
    await db.prepare(
      'INSERT OR IGNORE INTO users (id, email, password_hash, role, name) VALUES (?, ?, ?, ?, ?)',
    ).bind(user.id, user.email, user.passwordHash, user.role, user.name).run()

    const grant = user.grantSuperAdmin ?? user.role === 'admin'
    if (!grant) continue

    await db.prepare(
      `INSERT OR IGNORE INTO user_role_assignments (id, user_id, role_id, scope)
       SELECT ?, ?, r.id, ? FROM roles r WHERE r.name = ?`,
    ).bind(`ura_${user.id}`, user.id, GLOBAL_SCOPE, SUPER_ADMIN_ROLE_NAME).run()
  }
}
```

Canonical **entries** are inserted through the real HTTP route (`POST /api/content/:slug` as the admin
client) rather than by direct SQL, so the Botanical Engine's `apiToDb` path is exercised on the way in.
Expose that as `seedCanonicalEntries(harness)` in the same module, asserting each returned id matches
`UUID_V4_PATTERN`.

### Task 7 — `packages/testing/src/harness.ts` and `client/test-client.ts`

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { IClock, ITokenService, IHashProvider, Seed } from '@beechcms/core'
import { FixedClock } from './services/fixed-clock'
import { FakeTokenService } from './services/fake-token.service'
import { TEST_ENV, type TestEnv } from './env'
import { CANONICAL_SEEDS } from './seeds/canonical.seeds'
import { CANONICAL_USERS, type CanonicalUser, type CanonicalUserKey } from './seeds/canonical.data'
import { provisionSeeds, seedUsers } from './seeds/provision'
import { createTestClient, type TestClient } from './client/test-client'

/** Structural type of a Hono app — keeps this package independent of `@beechcms/api`. */
export interface TestApp {
  request(input: string, init?: RequestInit, env?: unknown, executionCtx?: unknown): Promise<Response>
}

/** The only services the harness is allowed to fake. Mirrors `AuthProviderOverrides` in apps/api. */
export interface HarnessAuthProviders {
  clock: IClock
  tokenService: ITokenService
  hashProvider?: IHashProvider
}

export interface HarnessOptions {
  /** Real D1 binding from `cloudflare:test`'s `env.DB`. */
  db: D1Database
  /**
   * Builds the app under test. The caller closes over `createBeechApp` so this package
   * never depends on `@beechcms/api` (which depends on nothing here — no workspace cycle).
   * Pass the overrides straight through: `(authProviders) => createBeechApp({ authProviders })`.
   */
  createApp(authProviders: HarnessAuthProviders): TestApp
  /** Defaults to `CANONICAL_SEEDS`. Pass a narrower list only when the suite needs it. */
  seeds?: readonly Seed[]
  /** Defaults to every canonical user. */
  users?: readonly CanonicalUser[]
  /** Frozen start time, epoch ms. Defaults to 2026-01-01T00:00:00Z. */
  nowMs?: number
  /** Extra `Bindings` merged over `TEST_ENV`. */
  env?: Record<string, unknown>
}

export interface TestHarness {
  readonly app: TestApp
  readonly db: D1Database
  readonly clock: FixedClock
  readonly tokenService: FakeTokenService
  readonly env: TestEnv & Record<string, unknown>
  /** Authenticated client. Injects `Authorization: Bearer <fake token>` on every request. */
  asUser(user: CanonicalUserKey | CanonicalUser, options?: { ttlSeconds?: number }): Promise<TestClient>
  /** Unauthenticated client — for public-API and 401 assertions. */
  anonymous(): TestClient
}

const DEFAULT_NOW_MS = Date.UTC(2026, 0, 1)

export async function createTestHarness(options: HarnessOptions): Promise<TestHarness> {
  const clock = new FixedClock(options.nowMs ?? DEFAULT_NOW_MS)
  const tokenService = new FakeTokenService(clock)
  const env = { ...TEST_ENV, ...options.env, DB: options.db }

  await provisionSeeds(options.db, options.seeds ?? CANONICAL_SEEDS, clock.nowSeconds())
  await seedUsers(options.db, options.users ?? Object.values(CANONICAL_USERS))

  const app = options.createApp({ clock, tokenService })

  return {
    app,
    db: options.db,
    clock,
    tokenService,
    env,
    anonymous: () => createTestClient(app, env, {}),
    async asUser(user, tokenOptions) {
      const resolved = typeof user === 'string' ? CANONICAL_USERS[user] : user
      const token = await tokenService.issue(
        { sub: resolved.id, email: resolved.email, name: resolved.name, role: resolved.role },
        tokenOptions?.ttlSeconds === undefined ? undefined : { ttlSeconds: tokenOptions.ttlSeconds },
      )
      return createTestClient(app, env, { Authorization: `Bearer ${token}` })
    },
  }
}
```

```ts
// packages/testing/src/client/test-client.ts
export interface TestClient {
  request(path: string, init?: RequestInit): Promise<Response>
  get(path: string, init?: RequestInit): Promise<Response>
  post(path: string, body?: unknown, init?: RequestInit): Promise<Response>
  put(path: string, body?: unknown, init?: RequestInit): Promise<Response>
  patch(path: string, body?: unknown, init?: RequestInit): Promise<Response>
  delete(path: string, init?: RequestInit): Promise<Response>
  /** Returns a client carrying the extra headers on top of this one's. */
  withHeaders(headers: Record<string, string>): TestClient
}

export function createTestClient(
  app: TestApp,
  env: Record<string, unknown>,
  baseHeaders: Record<string, string>,
): TestClient {
  const send = (path: string, init: RequestInit = {}): Promise<Response> =>
    app.request(path, { ...init, headers: { ...baseHeaders, ...(init.headers as Record<string, string>) } }, env)

  const withBody = (method: string) => (path: string, body?: unknown, init: RequestInit = {}) =>
    send(path, {
      ...init,
      method,
      headers: { 'Content-Type': 'application/json', ...(init.headers as Record<string, string>) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })

  return {
    request: send,
    get: (path, init) => send(path, { ...init, method: 'GET' }),
    post: withBody('POST'),
    put: withBody('PUT'),
    patch: withBody('PATCH'),
    delete: (path, init) => send(path, { ...init, method: 'DELETE' }),
    withHeaders: (headers) => createTestClient(app, env, { ...baseHeaders, ...headers }),
  }
}
```

`packages/testing/src/index.ts` re-exports: `createTestHarness`, types `TestHarness` / `HarnessOptions`
/ `HarnessAuthProviders` / `TestApp` / `TestClient`, `FixedClock`, `FakeTokenService`,
`TEST_TOKEN_PREFIX`, `TEST_ENV`, `TEST_JWT_SECRET`, `TEST_PUBLIC_READ_KEY`, `TEST_PUBLIC_WRITE_KEY`,
`CANONICAL_SEEDS`, `CANONICAL_SEED_SLUGS`, `CANONICAL_USERS`, `CANONICAL_ENTRIES`, `UUID_V4_PATTERN`,
`provisionSeeds`, `seedUsers`, `seedCanonicalEntries`.

### Task 8 — `apps/api/src/factory.ts`: the one production seam

Add the import and the optional field:

```ts
import type { AuthProviderOverrides } from './middleware/auth-providers.middleware'

export interface BeechConfig {
  // …existing fields unchanged…
  /**
   * Overrides for the auth provider seam (`IHashProvider`, `ITokenService`, `IClock`).
   * Intended for `@beechcms/testing`: the integration harness fakes the clock and the token
   * service and nothing else. Omitted in production — `apps/api/src/index.ts` never sets it.
   */
  authProviders?: AuthProviderOverrides
}
```

and change exactly one call site (step 5 of the registration order — position is unchanged):

```ts
-  app.use('*', authProvidersMiddleware())
+  app.use('*', authProvidersMiddleware(config.authProviders))
```

`authProvidersMiddleware` already falls back to `SystemClock`, `BcryptHashProvider` and
`JoseTokenService` when the argument is `undefined`, so behaviour with no config is byte-identical.
Do not add `clock`/`tokenService` as top-level `BeechConfig` fields — one nested seam, not three.

### Task 9 — Re-home the two existing fakes

Delete `apps/api/src/shared/services/clock/fixed-clock.ts` and
`apps/api/src/auth/__fixtures__/static-token-service.ts`. Update imports to `@beechcms/testing`
(`StaticTokenService` → `FakeTokenService`, now constructed with a clock):

- `apps/api/src/shared/db/repositories/d1-oauth-authorization-code.repository.test.ts`
- `apps/api/src/shared/db/repositories/d1-analytics.repository.test.ts`
- `apps/api/src/shared/db/repositories/d1-notification.repository.test.ts`
- `apps/api/src/shared/db/repositories/d1-oauth-token.repository.test.ts`
- `apps/api/src/shared/db/repositories/d1-session.repository.test.ts`
- `apps/api/src/shared/services/activity-log/d1-activity-logger.test.ts`
- `apps/api/src/auth/providers/jwt-token.service.test.ts` (the `StaticTokenService` describe block →
  `FakeTokenService`, constructed with a `FixedClock`; its expiry assertions now have real meaning)

Remove the now-dangling `'src/shared/services/clock/fixed-clock.ts'` line from the coverage `exclude`
list in `apps/api/vitest.config.ts`. These files stay in the `forks` project — importing a TS-source
workspace package from a Node-pool test is fine, Vite transpiles it.

### Task 10 — `apps/api/vitest.workers.config.ts` (new project)

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const migrations = await readD1Migrations(path.join(dirname, 'migrations'))

export default defineWorkersConfig({
  test: {
    // The integration tier lives inside its owning slice (VSA), never in apps/api/test/.
    include: ['src/features/**/test/integration/**/*.test.ts'],
    setupFiles: ['./test/harness/apply-migrations.ts'],
    reporters: ['verbose'],
    silent: 'passed-only',
    poolOptions: {
      workers: {
        // One worker + per-test storage isolation: each test starts from the migrated,
        // empty database and its writes are rolled back afterwards.
        singleWorker: true,
        isolatedStorage: true,
        miniflare: {
          compatibilityDate: '2026-02-13',        // matches apps/api/wrangler.jsonc
          compatibilityFlags: ['nodejs_compat'],  // matches apps/api/wrangler.jsonc (bcryptjs)
          d1Databases: ['DB'],
          bindings: { TEST_MIGRATIONS: migrations },
        },
      },
    },
  },
})
```

`apps/api/test/harness/apply-migrations.ts`:

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { applyD1Migrations, env } from 'cloudflare:test'

// Top-level await: runs once per test file, inside the file's storage frame, before any test.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
```

`apps/api/test/harness/env.d.ts`:

```ts
import type { D1Migration } from '@cloudflare/vitest-pool-workers/config'

declare module 'cloudflare:test' {
  interface ProvidedEnv {
    DB: D1Database
    TEST_MIGRATIONS: D1Migration[]
  }
}
```

`readD1Migrations` reads only `*.sql` files directly in `apps/api/migrations/` — `0000_v040_base.sql`
and `0030_test_seeds.sql`; `_archive/` is not recursed into. Unlike `D1TestDatabase`, no migration is
skipped: real D1 executes the data-only migration too.

### Task 11 — Keep the two projects from colliding

`apps/api/vitest.config.ts` — the `forks` project's `include` is `['test/**/*.test.ts',
'src/**/*.test.ts']`, which *would* match the new integration files. Add:

```ts
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
+   // Owned by vitest.workers.config.ts (real D1 via @cloudflare/vitest-pool-workers).
+   exclude: ['**/node_modules/**', '**/dist/**', 'src/features/**/test/integration/**'],
```

(Spelling out `node_modules`/`dist` is required: setting `exclude` replaces Vitest's defaults.)

`apps/api/package.json`:

```json
    "test": "vitest run && vitest run --config vitest.workers.config.ts",
    "test:unit": "vitest run",
    "test:integration": "vitest run --config vitest.workers.config.ts",
    "test:coverage": "vitest run --coverage",
```

devDependencies additions:

```json
    "@beechcms/testing": "workspace:*",
    "@cloudflare/vitest-pool-workers": "^0.22.0",
```

Chaining both projects in `test` keeps `turbo run test`, `pnpm beech test`, the CI job
`pnpm --filter @beechcms/api test`, the fingerprint cache and the PID lock working with no change to
`scripts/` or `.github/workflows/` — tier-aware selection is Sprint 3's job, not this one's.

`apps/api/tsconfig.json`: make sure `test/harness/env.d.ts` is inside `include` (add `"test/**/*.ts"`
if the current `include` does not already cover it). `tsconfig.build.json` must **not** pick it up.

### Task 12 — Pilot suite

`apps/api/src/features/content/test/integration/content-management.integration.test.ts`, replacing
`apps/api/test/flow-content-management.test.ts`. Shape:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import {
  createTestHarness, seedCanonicalEntries,
  CANONICAL_ENTRIES, UUID_V4_PATTERN, type TestHarness, type TestClient,
} from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

describe('content slice — integration (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()                       // per-isolate seed cache; still required
    harness = await createTestHarness({
      db: env.DB,
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
    await seedCanonicalEntries(harness)
  })

  it('lists private branches for an authenticated admin', async () => {
    const res = await admin.get('/api/content/posts')
    expect(res.status).toBe(200)
    const body = await res.json<Array<Record<string, unknown>>>()
    expect(body[0].internal_note).toBe('SECRET')
  })

  it('mints entry ids in the exact format the dashboard round-trips', async () => {
    const created = await admin.post('/api/content/posts', { title: 'New', slug: 'new-post' })
    expect(created.status).toBe(201)
    const { id } = await created.json<{ id: string }>()
    expect(id).toMatch(UUID_V4_PATTERN)
    // The regression guard: the id that was just minted must address the entry it created.
    expect((await admin.get(`/api/content/posts/${id}`)).status).toBe(200)
  })

  it('rejects a request whose token has expired', async () => {
    harness.clock.advance(16 * 60 * 1000)            // default TTL is 900s
    expect((await admin.get('/api/content/posts')).status).toBe(401)
  })
})
```

The pilot is also the reference implementation of `_config/testing_conventions.md`: four zones per
`it()` (arrange / act / assert response / assert state), one act per test, canonical fixtures only,
status asserted before body, every write followed by a persisted-state assertion, comments only where
§6.2 requires one. A reviewer will walk the §8 checklist against this file first — if the pilot bends a
rule, every suite migrated in Sprint 2 will inherit the bend.

Rules for the port:
1. `createBeechApp({ seeds: [], authProviders })` — **no** `repository` / `idempotencyRepository`
   override, so `repositoryMiddleware` builds the real `D1ContentRepository(env.DB, …)` and the real
   `D1SeedRepository(env.DB)`. `StaticContentRepository` and `StaticIdempotencyRepository` are not
   imported by this file.
2. Every id assertion goes through `UUID_V4_PATTERN` or a `CANONICAL_ENTRIES` constant. No `'p_001'`.
3. Assertions that exist today must survive the port; any that cannot be expressed against real D1 is
   a finding to report, not to silently drop.
4. The media/upload cases in the old suite depended on `vi.spyOn(S3Client.prototype, 'send')` and the
   MinIO stack. R2 is not bound in the workers project: **leave those cases in the `forks` tier** —
   move them into `apps/api/test/flow-media-assets.test.ts` if they are not already covered there, and
   note the split in the PR description. Do not bind R2 in `vitest.workers.config.ts` this sprint.
5. Delete `apps/api/test/flow-content-management.test.ts` only once the ported suite is green and the
   assertion count is accounted for.

### Task 13 — Close the faked-`ITokenService` blind spot

`apps/api/src/auth/providers/jwt-token.service.test.ts` already covers malformed tokens, missing/empty
`sub`, wrong secret, expiry via `ttlSeconds: -1`, issuer mismatch, custom TTL, injected-clock expiry,
and the <32-byte secret guard. The genuine gaps are tamper cases:

```ts
it('verify returns null for a token whose payload segment was tampered with', async () => {
  const token = await service.issue({ sub: 'user-1', role: 'viewer' })
  const [header, payload, signature] = token.split('.')
  const decoded = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload)))
  const forged = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ ...decoded, role: 'admin' })))
  expect(await service.verify(`${header}.${forged}.${signature}`)).toBeNull()
})

it('verify returns null for an unsigned token that claims alg: none', async () => {
  const header = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ alg: 'none', typ: 'JWT' })))
  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ sub: 'user-1', exp: 9_999_999_999 })))
  expect(await service.verify(`${header}.${payload}.`)).toBeNull()
})

it('verify returns null on audience mismatch', async () => { /* issue with audience A, verify with audience B */ })
```

Use small local base64url helpers in the test file; do not add a dependency.

### Task 14 — Root wiring

`pnpm-workspace.yaml` already globs `packages/*` — **no change needed**. Run `pnpm install` to link
`@beechcms/testing` and fetch `@cloudflare/vitest-pool-workers`. `turbo.json` needs no change: the new
package declares neither `build` nor `test`, so it joins no task graph.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run from the repository root unless stated otherwise.

```bash
# 1. Link the new workspace and install the pool
pnpm install

# 2. Build the dependency the tests import
pnpm --filter @beechcms/core build

# 3. Types — the new package, then the API (build config must stay clean of test types)
pnpm --filter @beechcms/testing type-check
pnpm --filter @beechcms/api type-check

# 4. Lint (noopParser workaround for TS 7.0 is already in eslint.config.js)
pnpm lint

# 5. The new integration tier, on real D1 via workerd — run this in isolation first
pnpm --filter @beechcms/api test:integration

# 6. The pre-existing forks tier, to prove the re-homed fakes and the exclude glob did not
#    break the other 148 API test files. Requires the Docker stack.
pnpm beech dev        # in a second shell, if the stack is not already up
pnpm --filter @beechcms/api test:unit

# 7. Both projects through the normal entry point (fingerprint cache + PID lock path)
pnpm beech test

# 8. Scoped to what changed — must still select apps/api and must not error on
#    packages/testing (which the diff runner does not track; it is expected to be
#    reported as "outside tracked workspaces", not to fail)
pnpm beech test --diff

# 9. Full monorepo build, last
pnpm run build
```

Assertions to make by hand while validating:
- Step 5 must print a nonzero test count. A silent zero means the `include` glob and the pilot's path
  disagree.
- Step 6's total must equal the pre-sprint API total minus the deleted
  `flow-content-management.test.ts` count, plus nothing.
- `pnpm --filter @beechcms/api test:integration` must pass with the Docker stack **down** — the
  workers tier must not reach MinIO/Mailpit. If it fails without Docker, something in the harness path
  is touching the stack and must be removed.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `packages/testing` exists as private workspace `@beechcms/testing`, exports `./src/index.ts`,
      and declares **no** `build` script and **no** dependency on `@beechcms/api` (no workspace cycle).
- [ ] `@beechcms/testing`'s only runtime dependency is `@beechcms/core`.
- [ ] `createTestHarness()` provisions storage exclusively through `applyD1Migrations()` (structural)
      and `planCreateSeed()` from `@beechcms/core` (content). Grep proves zero occurrences of
      `CREATE TABLE content_` in `packages/testing/src/`.
- [ ] The harness fakes exactly two services — `IClock` and `ITokenService`. `packages/testing/src/`
      contains no fake repository, no fake `IIdGenerator`, and no fake middleware.
- [ ] `FakeTokenService.verify()` returns `null` once `FixedClock` has advanced past the issued TTL,
      and there is a test proving it.
- [ ] `harness.asUser('admin')` issues a token accepted by the real `authMiddleware` →
      `oauthScopeMiddleware` → `permissionMiddleware` chain, with no hand-signed JWT and no
      `POST /auth/login` round-trip in the suite.
- [ ] `BeechConfig.authProviders` is optional; `apps/api/src/index.ts` is unmodified; `createBeechApp`
      called without it behaves identically to before (`factory.csp.test.ts`,
      `factory.custom-routes.test.ts`, `factory.docs-parity.test.ts` pass untouched).
- [ ] `apps/api/vitest.workers.config.ts` runs on `@cloudflare/vitest-pool-workers` with
      `d1Databases: ['DB']`, `compatibilityDate` and `compatibilityFlags` matching
      `apps/api/wrangler.jsonc`. No `better-sqlite3`, no `node:sqlite` anywhere in the integration tier.
- [ ] The integration tier passes with the Docker stack stopped.
- [ ] The two Vitest projects do not overlap: no test file is collected by both (`forks` excludes
      `src/features/**/test/integration/**`).
- [ ] `apps/api/test/helpers/d1-test-database.ts` is **unmodified and undeleted**, and all 36 of its
      dependents still pass.
- [ ] The pilot suite lives at `apps/api/src/features/content/test/integration/`, imports no sibling
      slice, and imports neither `StaticContentRepository` nor `StaticIdempotencyRepository`.
- [ ] The pilot asserts the created-entry id against `UUID_V4_PATTERN` and re-fetches the entry by that
      id — the direct regression guard for the shipped ID-format bug.
- [ ] `apps/api/test/flow-content-management.test.ts` is deleted and its assertions are accounted for
      (ported, or explicitly relocated to the `forks` tier with a note in the PR).
- [ ] `FixedClock` and the token fake exist in exactly one place in the monorepo (`@beechcms/testing`);
      `apps/api/src/shared/services/clock/fixed-clock.ts` and
      `apps/api/src/auth/__fixtures__/static-token-service.ts` are deleted, all 7 importers updated,
      and the stale coverage-exclude line is removed from `apps/api/vitest.config.ts`.
- [ ] `jwt-token.service.test.ts` covers payload tampering, `alg: none`, and audience mismatch.
- [ ] Every test file created or modified in this sprint passes the §8 checklist of
      `_config/testing_conventions.md`: correct tier and placement, SPDX header, behaviour+outcome
      `it()` names, four zones in order, one act per test, act result named, baseline in `beforeEach`
      with per-test preconditions in their own test, canonical fixtures, status asserted before body,
      typed body, persisted-state assertion on every write, nothing from its §7 forbidden list.
- [ ] Each test in the pilot suite passes when run alone (`vitest run --config vitest.workers.config.ts -t '<name>'`).
- [ ] `docs/testing.md` exists, states the tier table and placement rule, and points to
      `_config/testing_conventions.md` as the normative source without duplicating its rules.
- [ ] `apps/dashboard/**`, `packages/core/src/**`, `scripts/**` and `.github/workflows/**` show zero
      diff.
- [ ] All strict-typing rules hold: no `any` in `packages/testing/src/`, no non-null assertion on
      harness state, `pnpm --filter @beechcms/testing type-check` and
      `pnpm --filter @beechcms/api type-check` both clean.
- [ ] `pnpm lint`, `pnpm run build`, `pnpm beech test` and `pnpm beech test --diff` all pass.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executing agent MUST NOT, in this sprint:

1. **Migrate any suite other than the pilot.** The other 41 `apps/api/test/*.test.ts` files and all 107
   co-located `src/` tests stay where they are, on the `forks` project. → Sprint 2 `slice-test-layout`.
2. **Touch `apps/api/test/helpers/d1-test-database.ts`, its 36 dependents, or `apps/api/test/mocks/*`.**
   `graphify affected` proves a single edit there breaks 36 suites at once — the big-bang rewrite the
   brief rejects. It decays under the Boy Scout Rule. → Sprint 2.
3. **Create per-slice `test/unit/` folders, or move dashboard tests.** Only the one integration folder
   the pilot needs is created here. → Sprint 2 `slice-test-layout`.
4. **Modify `scripts/test-coverage-diff.mjs`, `scripts/test-runner.mjs`, or `.github/workflows/test.yml`.**
   No `--tier` flag, no workspace-list edit, no CI job split. The new project is reached through the
   existing `apps/api` `test` script precisely so none of this is needed yet.
   → Sprint 3 `ci-test-tiering`.
5. **Add Playwright, an `e2e/` directory, or any browser dependency.** No nightly/pre-merge trigger, no
   e2e concurrency cap. → Sprint 4 `e2e-playwright`.
6. **Build scale/perf seeding.** No multi-thousand-row generator, no perf assertions, no opt-in perf
   tier. Canonical seeds stay small and deterministic. → Sprint 5 `scale-perf-tier`.
7. **Add a third or fourth fake.** `IHashProvider` stays real (`BcryptHashProvider`); `IIdGenerator`
   stays real — faking it would reproduce the very ID-shape defect this sprint guards against.
8. **Bind R2, SMTP, or the webhook tester in the workers project.** Suites needing the Docker stack
   remain on the `forks` project. The integration tier must pass with Docker stopped.
9. **Publish `@beechcms/testing`.** It stays `"private": true` with no `build` step and no semver or
   API-stability promise — the public/third-party testing tool is explicitly deferred by the brief.
10. **Retrofit `_config/testing_conventions.md` onto the 344 test files this sprint does not touch.**
    The conventions bind new and touched tests only (Boy Scout Rule). Reformatting untouched suites
    would bury the real diff and is a scope violation. → Sprint 2, incrementally.
11. **Change `packages/core` source, `apps/api/migrations/`, or `apps/api/wrangler.jsonc`.** If the
    harness appears to need a core change, stop and report it: it is an architecture finding, not a
    harness gap to work around.
