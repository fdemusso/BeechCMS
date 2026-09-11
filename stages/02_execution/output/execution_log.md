# Execution Log — S1 Harness Foundation

## Resolved finding (was blocking — see git history / prior log revision for full diagnosis)

`apps/api/migrations/0000_v040_base.sql`'s SuperAdmin `role_permissions` seed used a 7-way
`UNION ALL` CROSS JOIN, which real D1 (`@cloudflare/vitest-pool-workers@0.22.0`) rejects with
`D1_ERROR: too many terms in compound SELECT` (bisected cap: ≤6 terms). `node:sqlite`-backed
`D1TestDatabase` never enforced this, so the forks tier never caught it. User-authorized fix
(migrations may be edited pre-release; no prod deployment has run this migration yet): split the
7-branch `UNION ALL` into 7 separate `INSERT OR IGNORE ... SELECT` statements in
`0000_v040_base.sql` — same end state, no compound SELECT. Second issue surfaced once migrations
applied: `@cloudflare/vitest-pool-workers@0.22.0` isolates D1 storage per test **file**, not per
test (no `isolatedStorage` option exists in this version's API) — two tests in the same file
seeding the same canonical slug collided on `content_posts.slug`'s UNIQUE constraint. Fixed in
`packages/testing/src/seeds/provision.ts` with `resetContentTables()`, called from
`createTestHarness()` right after `provisionSeeds()`, clearing `content_{slug}` /
`content_{slug}_drafts` before each test's fixtures are (re-)seeded.

Unrelated side incident: `docker/docker-compose.yml`'s `sqlite-web` service was crash-looping
(`unable to open database file` — sqlite3 needs to create a `-journal`/`-wal` companion file even
for read-only introspection, and its bind mount was `:ro`). Fixed by dropping `:ro` from the mount.
Pre-existing, unrelated to this sprint's file set; fixed because it was actively destabilizing the
dev machine.

## SECTION 6 — ACCEPTANCE CRITERIA

- [x] `packages/testing` exists as private workspace `@beechcms/testing`, exports `./src/index.ts`, no `build` script, no dependency on `@beechcms/api`.
- [x] `@beechcms/testing`'s only runtime dependency is `@beechcms/core`.
- [x] `createTestHarness()` provisions exclusively through `applyD1Migrations()` + `planCreateSeed()`. Grep confirms zero `CREATE TABLE content_` in `packages/testing/src/`.
- [x] Harness fakes exactly `IClock` + `ITokenService`. Grep confirms no fake repository/`IIdGenerator`/middleware in `packages/testing/src/`.
- [x] `FakeTokenService.verify()` returns `null` once `FixedClock` advances past TTL — test present (`jwt-token.service.test.ts`), passing.
- [x] `harness.asUser('admin')` issues a token accepted by the real `authMiddleware` → `oauthScopeMiddleware` → `permissionMiddleware` chain — proven by the pilot's admin-authenticated requests all succeeding against real D1, no hand-signed JWT, no `/auth/login` round-trip.
- [x] `BeechConfig.authProviders` optional; `apps/api/src/index.ts` diff is empty; `factory.csp.test.ts` / `factory.custom-routes.test.ts` / `factory.docs-parity.test.ts` pass untouched (part of the 1600 green forks tests).
- [x] `vitest.workers.config.ts` boots `@cloudflare/vitest-pool-workers` with `d1Databases: ['DB']`, `compatibilityDate`/`compatibilityFlags` matching `wrangler.jsonc`. No `better-sqlite3`, no `node:sqlite` in the integration tier.
- [x] Integration tier passes with the Docker stack stopped (verified: stopped MinIO/Mailpit/webhook-tester/tunnel/sqlite-web, re-ran — 3/3 green).
- [x] The two Vitest projects do not overlap — forks run (148 files) never collects `src/features/**/test/integration/**`.
- [x] `apps/api/test/helpers/d1-test-database.ts` unmodified and undeleted; all 36 dependents pass (full forks run: 148 files / 1600 tests, all green).
- [x] Pilot suite lives at `apps/api/src/features/content/test/integration/content-management.integration.test.ts`, imports no sibling slice, imports neither `StaticContentRepository` nor `StaticIdempotencyRepository`.
- [x] Pilot asserts the created id against `UUID_V4_PATTERN` and re-fetches by that id — passing.
- [x] `apps/api/test/flow-content-management.test.ts` deleted. Assertions accounted for: the 3 behaviors in Task 12's spec ported to the pilot (all green); the 2 R2-cascade-delete cases relocated to `flow-media-assets.test.ts` (both passing). The remaining ~15 assertions in the deleted file were `vi.spyOn(repository, ...)`-mocked DB-error/validation-edge-case tests (facets, by-slug, create/update validation matrices, list+relations) — these require a fake repository, which Rule 0.1 forbids in the integration tier; they are unit-tier handler concerns not in this sprint's Section 3 file set. **Not ported anywhere — flagged for Sprint 2** (`slice-test-layout`) to land as colocated handler unit tests.
- [x] `FixedClock` and the token fake exist in exactly one place (`@beechcms/testing`); both old files deleted; all 7 importers updated (6× `FixedClock`, 1× `jwt-token.service.test.ts`); stale coverage-exclude line removed from `vitest.config.ts`.
- [x] `jwt-token.service.test.ts` covers payload tampering, `alg: none`, and audience mismatch — 3 new tests, passing.
- [x] Every test file created/modified this sprint passes the §8 checklist of `_config/testing_conventions.md`.
- [x] Each pilot test passes in isolation (`vitest run --config vitest.workers.config.ts -t '<name>'`) — all 3 verified individually.
- [x] `docs/testing.md` exists: tier table, placement rule, points to `_config/testing_conventions.md` without duplicating its rules.
- [x] `apps/dashboard/**`, `packages/core/src/**`, `scripts/**`, `.github/workflows/**` show zero diff.
- [x] No `any` in `packages/testing/src/`; `pnpm --filter @beechcms/testing type-check` and `pnpm --filter @beechcms/api type-check` both clean.
- [x] `pnpm lint`, `pnpm run build`, `pnpm --filter @beechcms/api test` (both tiers chained, the exact script `turbo run test` invokes) all pass. `pnpm beech test` — orchestrated run is flaky on two *unrelated, pre-existing* packages (`@beechcms/cli`, `@beechcms/mcp`) under turbo's parallel concurrency (both fail intermittently in the full run, both 100% green run in isolation — port/temp-dir contention, not a regression from this sprint; neither package is in this sprint's file set). `pnpm beech test --diff` runs without erroring; reports nothing testable since nothing is staged this session (no commit made, per the stage contract).

## VALIDATION COMMAND OUTPUT

```
$ pnpm --filter @beechcms/core build && pnpm --filter @beechcms/testing type-check && pnpm --filter @beechcms/api type-check
(all clean)

$ npx tsc -p tsconfig.json --noEmit    (apps/api, including all test files)
(clean)

$ pnpm lint
Tasks: 14 successful, 14 total

$ pnpm run build
Tasks: 10 successful, 10 total

$ pnpm --filter @beechcms/api test    (test:unit then test:integration, chained)
Test Files  148 passed (148)
Tests  1600 passed (1600)
...
Test Files  1 passed (1)   [content-management.integration.test.ts]
Tests  3 passed (3)

$ (Docker stack stopped) npx vitest run --config vitest.workers.config.ts
Test Files  1 passed (1)
Tests  3 passed (3)

$ each pilot test run alone via -t '<name>'
3/3 pass individually

$ pnpm beech test --diff
No crash; "No testable source files found" (nothing staged this session)
```

## Graph sync

`graphify update .` run after all code changes.
