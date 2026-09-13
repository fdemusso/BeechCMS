# Execution Log — Sprint 4 `e2e-playwright`

Branch: `feature/e2e-playwright` (from `devs`). Not committed, per stage contract.

## SECTION 6 — ACCEPTANCE CRITERIA

- [x] `pnpm-workspace.yaml` lists `e2e`; `pnpm install` links `@beechcms/e2e` and resolves its four `workspace:` dependencies.
- [x] `e2e/package.json` declares `test:e2e`, `lint` and `type-check`, and declares **no** `test` script.
- [x] `pnpm test` (root, fingerprint-cached) launches no browser process and its task list contains no `@beechcms/e2e` entry; a second consecutive `pnpm test` replays from cache (`[Test Cache] Snapshot fingerprint matched … Replaying cached results`).
- [x] `pnpm beech test --tier e2e` passes with the Docker stack stopped — no MinIO/Mailpit/webhook-tester connection attempted (wrangler logs the expected "non raggiungibile" warnings and proceeds).
- [x] The e2e run recreates `e2e/.wrangler-e2e/` from scratch: ran twice consecutively, both green; each run's `GET /auth/setup` reported `needsSetup: true` before provisioning.
- [x] An e2e run leaves `apps/api/.wrangler/state/` byte-identical — verified via `shasum` diff before/after a run.
- [x] `e2e/tests/content-id-contract.e2e.ts` asserts the API-minted id against `UUID_V4_PATTERN` from `@beechcms/testing` and navigates to `/admin/content/<slug>/<id>` successfully. No literal id/slug/alias in the spec.
- [x] Every fixture value comes from `@beechcms/testing`. `grep -rn "admin@\|password123\|br_0" e2e/tests/` returns one hit: a code comment in `global.setup.ts` explaining branch-id ordering (`br_08`) — no literal fixture value.
- [x] `e2e/` contains no D1 handle, no `node:sqlite` import, no raw SQL, no `CREATE TABLE`.
- [x] `scripts/lib/test-tiers.mjs` exports `RUNNABLE_TIERS` (4 tiers) and `DIFF_SELECTABLE_TIERS` (3); `WORKSPACES`, `DEFAULT_DIFF_TIERS`, `NEVER_SELECTED_PREFIXES`, `isNeverSelected` unchanged.
- [x] `node scripts/test-coverage-diff.mjs --tier e2e` exits 1, no vitest spawned, names `pnpm beech test --tier e2e`.
- [x] `pnpm beech test --diff --tier e2e` exits 1, no turbo/vitest spawned.
- [x] `node scripts/test-coverage-diff.mjs` (no `--tier`) runs unit+integration only; e2e/ files reported under "Skipping … never-selected prefix (e2e/)", not "outside tracked workspaces".
- [x] `packages/cli/src/test/test.test.ts` passes, including the unedited mirror test (tier-name parity with the `.mjs`).
- [x] `turbo.json` declares `test:e2e` with `cache: false`, `dependsOn: ["^build"]`.
- [x] `bin/cli.mjs` help lists four tiers + `--diff` exclusion note; `pnpm run docs:check` passes all 4 checks.
- [x] `scripts/check-test-placement.mjs` R6/R7 proved with temporary files (both violations fired), then reverted; `pnpm run lint:tests` prints `test placement — OK` on the real tree.
- [x] Both specs and `global.setup.ts` carry SPDX header, `<flow>.e2e.ts` naming, no `any`, no `.only`/`.skip`, no sleep, no conditional assertion.
- [x] `bootstrap-d1.mjs` with `BEECH_D1_PERSIST_DIR` unset produces the same `D1_DIR`/command strings as before; `pnpm beech db:migrate` still short-circuits (`DB already initialized — skipping.`).
- [x] `vite.config.ts` with `BEECH_DEV_API_TARGET` unset proxies to `http://127.0.0.1:8789`.
- [x] `.github/workflows/e2e.yml` exists with `pull_request: branches: [master]`, `schedule` cron, `workflow_dispatch`, no container. `.github/workflows/test.yml` shows zero diff (verified below).
- [x] `git diff devs --stat` shows zero changes under `packages/core/`, `packages/testing/`, `apps/api/src/`, `apps/api/migrations/`, `apps/dashboard/src/`, `scripts/test-runner.mjs`, `scripts/test-coverage-diff.mjs`, `.github/workflows/test.yml`.
- [x] `pnpm run build`, `pnpm run type-check`, `pnpm beech lint` green; API and dashboard coverage thresholds hold (exit 0 both).
- [x] `docs/testing.md` / `docs/build/cli-workflows.md` no longer say "Sprint 4, not built yet"; `e2e/README.md` exists.
- [x] `graphify update . --force` completed; e2e workspace present in the graph (`e2e_tests_global_setup` node resolves; 151 `e2e/`-path references).

## Deviations from the plan (both inside `e2e/`, no production/API diff)

The plan's Task 7/8 code, run against the real dev environment, surfaced three bugs the plan's own review notes anticipated needing verification for. All fixes are confined to `e2e/tests/*`:

1. **`global.setup.ts` / `POST /auth/login` response key** — real route returns `{ token, expiresIn }`, not `{ accessToken }`. Fixed per the plan's own Task 7 instruction to verify and adjust.
2. **`global.setup.ts` post-login URL** — `safeReturnTo(null)` + react-router basename resolves to `/admin` (no trailing slash), not `/admin/`. `waitForURL` changed to `/\/admin\/?$/`, matching the regex `auth.e2e.ts` already used.
3. **`getByLabel('Password')` strict-mode violation** — the show/hide-password toggle button's `aria-label="Show password"` also substring-matches a `Password` query. Added `{ exact: true }`.
4. **`content-id-contract.e2e.ts` top-level `readFileSync(FIXTURE_FILE)`** — Playwright imports every spec during collection, before the `setup` project runs. Moved the read into `test.beforeAll`.
5. **Refresh-token single-use rotation vs. static `storageState`** — `POST /auth/refresh` rotates and revokes the refresh token on every use (`apps/api/src/auth/auth.app.ts`, untouched). Each Playwright test opens a fresh context from the same `ADMIN_STATE` snapshot, so a second/third authenticated navigation was rejected. Fixed without touching `apps/api/src/**`: the session-restoring test now re-persists `storageState` after its navigation so the next test inherits the rotated cookie, and the sign-out test clears cookies *before* its first navigation so it never consumes a token it doesn't need.

No spec assertion, selector intent, or fixture source changed — only what was necessary to match the real API/dashboard behavior, as Task 7 itself instructed.

## Validation command output (Section 5)

```
pnpm install                                          — OK, @beechcms/e2e linked
pnpm --filter @beechcms/e2e exec playwright install chromium  — OK

pnpm run build                                         — 10/10 tasks, PASS
pnpm run type-check                                     — 16/16 tasks, PASS
pnpm beech lint                                          — 17/17 tasks, PASS (0 errors)
pnpm run lint:tests                                       — test placement — OK

pnpm beech test --tier unit                                — PASS (packages/mcp#test:unit
  intermittently fails src/auto-restart.test.ts on a 200ms timing assertion under parallel
  turbo load; passes standalone; packages/mcp has zero diff vs devs — pre-existing flake,
  unrelated to this sprint)
pnpm beech test --tier integration                          — PASS (3/3 tests)
pnpm --filter @beechcms/cli test                              — PASS (70/70 tests)
pnpm --filter @beechcms/api test:coverage                      — PASS, exit 0, thresholds met
pnpm --filter @beechcms/dashboard test:coverage                 — PASS, exit 0, thresholds met

pnpm beech dev (stack up) + pnpm beech test --tier flow           — PASS (351/351 tests, 41 files)

pnpm beech test --tier e2e (Docker stopped)                        — PASS (6/6 tests), run twice
  consecutively, both green
node scripts/test-coverage-diff.mjs --tier e2e                      — exit 1, no vitest spawned
pnpm beech test --diff --tier e2e                                    — exit 1, no turbo/vitest spawned
node scripts/test-coverage-diff.mjs (no --tier)                       — unit+integration only;
  e2e/ files listed as skipped under never-selected prefix

pnpm test (root)                                                       — PASS, no @beechcms/e2e task
pnpm test (2nd consecutive run)                                         — replayed from fingerprint cache

pnpm beech db:migrate                                                    — "DB already initialized —
  skipping." (short-circuit intact)
pnpm beech dev                                                            — API :8789, dashboard :5173,
  proxy unchanged

pnpm run docs:check                                                        — 4/4 checks PASS

git diff devs --stat -- packages/core packages/testing apps/api/src \
  apps/api/migrations apps/dashboard/src scripts/test-runner.mjs \
  scripts/test-coverage-diff.mjs .github/workflows/test.yml                 — zero output (no changes)

graphify update . --force                                                    — 12784 nodes, 23038 edges;
  e2e workspace present in graph
```
