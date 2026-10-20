# 1. Feature Definition and Core Value

BeechCMS's test suite has no structure: unit and integration concerns are mixed, repositories are mocked with hand-rolled `vi.fn()` objects that simulate database behavior in memory, and there is no local e2e coverage across the dashboard-to-API boundary. This produces false positives — tests pass while real bugs ship. The concrete failure mode that motivated this work: API integration tests used arbitrary/random IDs instead of the real ID format the dashboard actually sends, so a fruit-ID-format bug shipped despite "passing" API tests.

The fix is a standardized **Test Harness** (`@beechcms/testing`) that replaces mocked repositories with a real, isolated D1 database (matching the production engine, `@cloudflare/vitest-pool-workers`) plus dependency injection for the few services that must stay fast and deterministic (`IClock`, `ITokenService`). On top of the Harness, the test suite is reorganized to mirror the existing Vertical Slice Architecture, replacing the current spaghetti with a clear, per-slice test structure and a CI execution strategy that only runs what changed.

This is indispensable because BeechCMS's positioning — a headless CMS for the middle ground between "WordPress + 30 plugins" and full custom-built complexity — depends on being trustworthy at low implementation cost. A test suite that produces false confidence directly undermines that value proposition, and a slow/undisciplined one erodes the DX BeechCMS is supposed to deliver.

Building a public-facing testing tool for third-party/external BeechCMS developers is a clear future direction but is explicitly not part of this feature — it is deferred until the internal Harness and test structure are solid (see Out of Scope).

# 2. Domain Boundaries and Business Rules

**Entities involved:**

- **Test Harness (`@beechcms/testing`)** — new package. Owns: real D1 instance provisioning/teardown, DI container for `IClock`/`ITokenService`, the Hono app factory used by tests, and the `.asUser({ role })` test client that wraps `app.request()` and injects fake-but-valid tokens.
- **Canonical Seed Data** — the single source of truth for fixture data used by integration tests. Must be generated from/validated against the same shared Zod schemas `apps/dashboard` and `apps/api` both already import from `@beechcms/core` (confirmed: 10+ dashboard test files import `@beechcms/core` schemas directly). Integration tests are forbidden from hand-rolling ad-hoc fixture objects for entity IDs/shapes that canonical seeds already cover.
- **Scale Seed Data** — a separate, larger dataset (low-thousands of rows per content type, matching BeechCMS's actual small/mid-blog target scale, not enterprise volume) used only by a distinct perf/scale test tier. Never the default for ordinary integration tests.
- **Per-slice Test Folders** — `apps/api/src/features/<slice>/test/{unit,integration}/` and `apps/dashboard/src/features/<slice>/test/unit/`, co-located inside each feature slice per the existing VSA "high cohesion inside a slice" rule.
- **E2E Suite** — a top-level `e2e/` directory (Playwright, or equivalent), living outside the slice tree because e2e flows inherently cross slice boundaries (dashboard UI → real backend → real D1) and VSA forbids cross-slice imports within the slice tree.
- **Existing `--diff` CI tooling** (`packages/cli/src/commands/test.ts`, `scripts/test-coverage-diff.mjs`) — already does git-diff-based, per-workspace, `vitest related`-scoped test execution with coverage thresholds. It has no concept of unit/integration/e2e tiers today.
- **Existing thermal/fingerprint cache** (`scripts/test-runner.mjs`) — whole-repo SHA256 fingerprint cache with instant replay on unchanged content, single-run PID lock, and hardware-aware Turbo/Vitest concurrency capping (tuned for an 8GB fanless MacBook Air). This infrastructure is not being rebuilt; new test tiers must remain compatible with it.

**Business rules:**

1. Integration tests (Harness-based) must run against real D1, never a JS-object mock of a repository.
2. Integration tests must default to canonical seed data; ad-hoc fixture objects are permitted only for testing rejection/validation of deliberately malformed data.
3. `IClock` and `ITokenService` are the only two services the Harness is allowed to fake — everything else in the request path (repositories, middleware, D1) must be real.
4. Test file placement must mirror VSA: unit + integration tests live inside their owning slice; e2e tests live outside any slice because they cross slice boundaries by nature.
5. E2E tests must never run on every push — they are gated to pre-merge (PR→master) or nightly, and must respect the existing thermal/lock/concurrency system (likely needing their own, lower, concurrency default given the extra cost of a real browser over a Vitest worker).
6. Migration off the old mock-based tests is incremental (Boy Scout Rule) — no big-bang rewrite of the ~70 existing tests; every new endpoint/feature must use the Harness or be purely unit, and every old endpoint touched for any reason gets its mocked tests replaced.

# 3. Primary Requirements (User Stories)

* AS A BeechCMS core developer I WANT a Test Harness that provisions a real, isolated D1 database per test run SO THAT integration tests exercise real SQL constraints, foreign keys, and relations instead of a fragile in-memory mock.

* AS A BeechCMS core developer I WANT a `.asUser({ role })` test client that automatically injects valid fake tokens into HTTP requests SO THAT I don't have to hand-sign JWTs in every integration test.

* AS A BeechCMS core developer I WANT the Harness to fake only `IClock` and `ITokenService` SO THAT time-dependent and auth-expiry logic is testable deterministically without faking the rest of the request pipeline.

* AS A BeechCMS core developer I WANT integration tests to default to canonical seed data generated from the shared `@beechcms/core` Zod schemas SO THAT tests can never again pass against an ID format or data shape the real dashboard doesn't actually send.

* AS A BeechCMS core developer I WANT a documented, VSA-aligned test folder structure (`test/unit/`, `test/integration/` inside each slice; a top-level `e2e/`) SO THAT tests are discoverable, organized by intent, and no longer spaghetti.

* AS A BeechCMS core developer I WANT a local e2e suite that drives the real dashboard against the real backend SO THAT dashboard-to-API contract bugs (like the fruit-ID mismatch) are caught before merge, not in production.

* AS A CI pipeline I WANT unit and integration tests to run only for affected slices/workspaces on every push (extending the existing `--diff` mechanism) SO THAT feedback stays fast without running the entire suite for every trivial change.

* AS A CI pipeline I WANT e2e tests to run only pre-merge or nightly, never on every push SO THAT the slow/expensive tier doesn't block routine development velocity.

* AS A BeechCMS core developer I WANT a separate, explicitly-opt-in scale/perf test tier seeded with low-thousands-of-rows datasets SO THAT I can validate realistic small/mid-blog-scale behavior (pagination, query performance) without paying that cost on every normal test run.

# 4. Secondary Requirements and Logical Constraints

- **DB engine parity**: Harness must use `@cloudflare/vitest-pool-workers` (D1), not `better-sqlite3` — test environment must match production exactly, or the Harness reintroduces the same fake-positive risk it's meant to eliminate.
- **Shared-schema enforcement**: since `apps/dashboard` already imports `@beechcms/core` Zod schemas (verified in codebase), the canonical-seed rule is enforceable today without waiting on new type-sharing work. If a future entity type is added to only one side, that's an architecture violation to flag, not a Harness gap to work around.
- **Auth logic blind spot**: because `ITokenService` is faked in Harness tests, real JWT signing/verification/expiry/tamper-rejection logic needs its own dedicated unit-test coverage outside the Harness — the Harness intentionally cannot catch bugs in that service itself.
- **`vitest related` over-inclusion risk**: the existing `--diff` script uses `vitest related`, which may pull in a slow Harness/D1 integration test as "related" to a changed file with the same weight as a fast unit test. The CI tiering work must account for this — e.g., explicit tier-aware filtering rather than relying on `vitest related` alone to keep the fast/slow split intact.
- **E2E has no CI awareness today**: `test-coverage-diff.mjs` only knows about `packages/core`, `packages/cli`, `packages/mcp`, `apps/api`, `apps/dashboard` — it has zero knowledge of a prospective `e2e/` directory. Adding e2e must not cause it to be silently swept into `--diff` runs; exclusion must be explicit.
- **Thermal/cache compatibility**: new test tiers (especially e2e/Playwright) must work under the existing fingerprint-cache + single-run-lock + hardware-aware concurrency system in `scripts/test-runner.mjs`. A real browser process is heavier than a Vitest worker thread — the existing concurrency defaults (tuned for Vitest on an 8GB fanless MacBook Air) are not assumed to be safe for e2e without their own, likely lower, cap.
- **Full-repo fingerprint granularity**: the existing cache invalidates on ANY tracked file change (whole-repo hash), not per-package. This is pre-existing behavior, not something this feature needs to fix, but the new test structure must not assume finer-grained caching exists.
- **Scale-tier scope**: "low thousands of rows per content type" is the working scale target (matches BeechCMS's actual positioning as small/mid-blog CMS, not enterprise). This number is a starting assumption for the Architect to validate, not a hard spec.
- **Migration is incremental**: no requirement to rewrite the ~70 existing mock-based tests as part of this feature. Only new/touched code is required to adopt the Harness/structure.

# 5. Out of Scope (Discarded during sparring)

- **External/third-party developer testing tool.** Building on top of the internal Harness to give external BeechCMS consumers a public testing API (with the docs/stability/semver guarantees that implies) is a deliberate future phase, not part of issue #108. Discarded from this brief to avoid scope explosion — internal fix ships first.
- **`better-sqlite3` as the Harness DB engine.** Rejected in favor of the D1-native `@cloudflare/vitest-pool-workers`, since prod runs on D1 and a second engine would mean two migration paths and reintroduce environment-mismatch risk.
- **Full production-scale/fuzzed datasets as the default integration-test seed.** Rejected as the default because it conflicts with the "fast, deterministic" goal; realism-of-shape (canonical seed) and scale/perf testing (separate scale tier) are different concerns and were split rather than merged.
- **Running e2e (Playwright) tests on every push.** Rejected as too slow/costly for routine CI; gated to pre-merge/nightly instead.
- **Big-bang rewrite of all ~70 existing tests.** Rejected in favor of the Boy Scout Rule — incremental replacement only, tied to when code is actually touched.
- **Rebuilding the fingerprint cache / thermal lock / Turbo concurrency system.** Already exists and works (`scripts/test-runner.mjs`); this feature must remain compatible with it, not replace it.
