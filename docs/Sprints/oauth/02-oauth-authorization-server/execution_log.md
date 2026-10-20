# Execution Log — `oauth-authorization-server`

Branch: `feature/mcp-server` (per explicit user instruction, overriding the stage's default `devs`-branch-off rule).

## SECTION 6 — ACCEPTANCE CRITERIA

**Architecture**
- [x] `apps/api/src/features/oauth/` imports nothing from any other directory under `apps/api/src/features/`.
- [x] The slice contains no reference to `context.env.DB`, `D1Database`, or `apps/api/src/shared/db/**`.
- [x] `graphify path "issueTokenPair" "D1Database"` reports `No directed path found`.
- [x] Zero files changed under `packages/core/`, `apps/dashboard/`, or `apps/api/migrations/`.
- [x] `apps/api/src/middleware/auth.middleware.ts` untouched (byte-identical).
- [x] `role` read in exactly one production place: `roleGuard.arbitrate(...)` in `authorize.ts:158`.
- [x] `generateOpaqueToken()` promoted to `shared/utils/opaque-token.ts`; `auth/utils/refresh-token.ts` deleted; `grep -rn "generateRefreshToken" apps/api` returns nothing; `getRandomValues` appears only in `opaque-token.ts`.
- [x] `/auth/login` and `/auth/refresh` behaviour unchanged; `flow-admin-auth.test.ts` green, no assertion edited.

**Wiring**
- [x] `Variables.roleGuard: IRoleGuard` set by `repositoryMiddleware`, defaults to `AllowAllRoleGuard`.
- [x] `BeechConfig.roleGuard` threads an override through `createBeechApp`.
- [x] `RateLimiterName` includes `oauthToken` / `oauthTokenAccount`; `buildDefaultRegistry` covers both.
- [x] `oauthApp` mounted at `/` in `factory.ts`; no pre-existing route shadowed.

**Protocol correctness** — all verified by tests: `code_challenge_method != S256` rejected, `state` mandatory, unregistered `redirect_uri` never redirects, loopback port-agnostic matching, single-use codes with cascade revocation on replay, failed PKCE does not consume the code, refresh rotation issues-before-revokes with rollback, revoke is always 200 and cascades both token types, every `/oauth/token` response carries `Cache-Control: no-store`, D1 rows hold hashes only (asserted against plaintext).

**Rate limiting**
- [x] `/oauth/token` runs `checkDualKeyRateLimit` before parsing/crypto, no `ENV` exemption.
- [x] Rate-limited response is `429` with `Retry-After` when known.

**Quality gates**
- [x] `pnpm --filter @beechcms/api exec tsc --noEmit` — zero new errors (verified diff against `devs`: all reported errors are pre-existing, in files untouched by this sprint).
- [x] `pnpm beech lint` passes.
- [x] `pnpm beech test` passes in full (12/12 workspace tasks; API: 130 files / 1479 tests; dashboard: 106 files / 795 tests).
- [x] `pnpm beech db:reset && pnpm beech db:migrate` succeeds; `0038_oauth_authorization.sql` still newest.
- [x] Every new file carries the `SPDX-License-Identifier: BUSL-1.1` header.

## Validation output (summary)

```
pnpm --filter @beechcms/core run build     -> PASS (tsc clean)
pnpm --filter @beechcms/api exec tsc --noEmit -> PASS (0 errors in changed/new files;
                                                 pre-existing baseline errors elsewhere, confirmed
                                                 identical to devs)
pnpm beech lint                            -> PASS (12/12 packages)
pnpm beech test                            -> PASS (12/12 workspace tasks)
  apps/api   -> 130 files / 1479 tests passed
  apps/dashboard -> 106 files / 795 tests passed
  packages/core  -> included, passed

pnpm beech db:reset && pnpm beech db:migrate -> PASS, 11 migrations, 0038 newest

grep botanical/VSA/role/entropy checks (SECTION 5 steps 6-8b) -> all OK

graphify update . --force -> graph refreshed (11712 nodes, 20440 edges)
graphify path "issueTokenPair" "D1Database" -> No directed path found (expected)
graphify explain "AllowAllRoleGuard" -> no new edge shown from repository.middleware.ts;
  verified this is a pre-existing graphify limitation with cross-package (@beechcms/core)
  import resolution, not a wiring defect — the same gap reproduces for PrivacyService and
  SystemClock, both already bound in that same file before this sprint.
```

## Note on branch

The sprint plan (SECTION 0 of `stages/02_execution/CONTEXT.md`) specifies branching off `devs`. Per explicit user instruction this sprint's code was implemented directly on `feature/mcp-server` instead, alongside the already-landed Sprint 1 commit (`00e3315`).
