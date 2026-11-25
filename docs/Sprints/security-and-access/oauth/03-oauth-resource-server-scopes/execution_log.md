# Execution Log — `oauth-resource-server-scopes`

**Branch:** worked directly on `feature/mcp-server` (user override of the branch-from-`devs` step; Sprint 1+2 deps `00e3315`/`07ff827` are not on `devs`, only on `feature/mcp-server` — logged in `rejections.md` before the override).

**Deviation from Task 5 (out-of-scope veto, documented):** `apps/api/test/helpers/d1-test-database.ts` — the shared D1 test double bound integral JS numbers as SQLite REAL, not INTEGER, unlike real Cloudflare D1. This broke `D1SeedRepository.applyAtomic`'s OCC guard (`CAST(? AS TEXT)` comparison) whenever `mcp-apply` ran through the full D1-backed flow — required by Task 4.6. Fixed by coercing safe-integer params to `BigInt` before binding (`toSqliteParams`). Test-only fidelity fix, zero production files touched, zero behavior change outside the test harness.

## SECTION 6 — ACCEPTANCE CRITERIA

**Architecture**
- [x] Zero files changed under `packages/core/`, `packages/mcp/`, `apps/dashboard/`, `apps/api/migrations/`.
- [x] Zero files changed under `apps/api/src/features/`.
- [x] `oauth-scope.middleware.ts` contains no `env.DB`, no `D1Database`, no SQL, no `shared/db`/feature-slice import.
- [x] OAuth branch of `authMiddleware` reads persistence only via `oauthTokenRepository` / `userRepository`.
- [x] `graphify path "oauthScopeMiddleware" "D1Database"` → `No directed path found`.
- [x] No new HTTP route registered; `factory.docs-parity.test.ts` passes unchanged.

**Non-regression of the JWT path**
- [x] `acceptOAuth` defaults to `false`; `factory.ts:227` is the only production call site with `true`.
- [x] `factory.ts:262`, `features/oauth/index.ts:40-41`, `features/search/search.ts:24` still call `authMiddleware()` with no argument.
- [x] `auth.middleware.test.ts` and `flow-admin-auth.test.ts` pass, zero edited assertions.
- [x] Failed JWT verification still returns bare 401, no `WWW-Authenticate`.
- [x] Admin-JWT requests carry `oauthGrant === null`, passed through untouched.

**Scope enforcement (fail-closed)**
- [x] `OAUTH_SCOPE_ROUTES` has exactly 5 entries, covering the 6 MCP tools.
- [x] Any unlisted `/api/*` path → `403 insufficient_scope` (12-path default-deny sweep, `oauth-scope.middleware.test.ts`).
- [x] `mcp-plan` requires `schema:read`, dry-run rationale documented at that entry.
- [x] `mcp-apply` is the only `schema:write` entry.
- [x] Method is part of the match (`POST /api/seeds` denied, `GET /api/seeds` allowed).
- [x] Scope literals appear only in `OAUTH_SCOPE_ROUTES`.

**Status-code contract**
- [x] Unknown/expired/revoked token → 401 `invalid_token` with `WWW-Authenticate`.
- [x] Deleted resource owner → 401 `invalid_token`, not 500.
- [x] Refresh token as Bearer → 401.
- [x] Insufficient scope / unlisted route → 403 `insufficient_scope`, never 401.

**Privilege containment**
- [x] Maximal access token refused (401) on `/oauth/authorize/request` and `/oauth/authorize/consent`.
- [x] `jwtPayload` hydrated from `userRepository.findById`, resource owner's own role.
- [x] `requireAdmin` satisfied by that hydration, `seeds.helpers.ts` unmodified.
- [x] Activity-log actor for OAuth-driven `mcp-apply` is the resource owner, not `'unknown'`.
- [x] `roleGuard` not called in the request path.

**Typing & quality gates**
- [x] `OAuthGrantContext.scope` is `OAuthScope[]`, no `any`, no non-null assertion.
- [x] `pnpm --filter @beechcms/core run build` passes.
- [x] `pnpm --filter @beechcms/api exec tsc --noEmit` — 39 baseline errors, unchanged, none in the 4 touched files.
- [x] `pnpm beech lint` passes.
- [x] `pnpm beech test` passes across the whole workspace (12/12 tasks).
- [x] `pnpm beech db:reset && pnpm beech db:migrate` succeeds, `0038_oauth_authorization.sql` still newest.
- [x] Both new files carry `SPDX-License-Identifier: BUSL-1.1`.

## Validation output (success)

```
1. git status --porcelain packages/core/ apps/dashboard/ packages/mcp/ apps/api/migrations/  -> empty
2. git status --porcelain apps/api/src/features/                                             -> empty
3. pnpm --filter @beechcms/core run build                                                    -> $ tsc (0 errors)
4. pnpm --filter @beechcms/api exec tsc --noEmit                                              -> 39 pre-existing errors (baseline, unrelated files), 0 new
5. pnpm beech lint                                                                            -> 12 successful, 12 total
6. pnpm beech test                                                                            -> 12 successful, 12 total (api: 132 files, 1517 tests; dashboard: 106 files, 795 tests)
7. pnpm beech db:reset && pnpm beech db:migrate                                               -> 11 applied, 0038_oauth_authorization.sql newest
8/8b. grep env.DB|D1Database|shared/db|SQL in oauth-scope.middleware.ts, auth.middleware.ts   -> no matches
9.  grep features/ in middleware files                                                        -> doc-comment mentions only, no imports
10. grep acceptOAuth (non-test)                                                                -> factory.ts:227 (true) + definition/JSDoc only
11. grep oauthScopeMiddleware apps/api/src/factory.ts                                          -> import + single registration
12. grep 'schema:read'|'schema:write' (non-test)                                               -> OAUTH_SCOPE_ROUTES only
13. grep findActiveByHash auth.middleware.ts                                                   -> 'access' token type only
graphify update . --force                                                                      -> 11730 nodes, 20490 edges
graphify path "oauthScopeMiddleware" "D1Database"                                              -> No directed path found
graphify affected "authMiddleware" --depth 2                                                   -> flow-oauth-resource-server.test.ts present, no new production importer beyond factory.ts
```
