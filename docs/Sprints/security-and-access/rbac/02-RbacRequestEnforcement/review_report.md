# Verdict
PASS

# Findings
1. (non-blocking, doc drift) `apps/api/src/features/oauth/authorize.ts:175` — the docstring comment still reads `roleGuard.arbitrate(role, scopes)`, describing the pre-sprint role-string signature. The actual call two lines below (`arbitrate(effective, request.scopes)`) is correct; only the comment is stale. Fix opportunistically, does not affect behavior.
2. (non-blocking, scoped by plan itself, not an execution deviation) `POST /oauth/authorize/consent` runs on `oauthApp` with a bare `authMiddleware()`, outside `apiProtected`. Its JWT branch performs no user lookup, so a deactivated account holding an unexpired (≤15 min) access JWT can still complete OAuth consent and have `PermissionRoleGuard.arbitrate()` evaluate its *assignments* (which deactivation does not revoke) — the `account_disabled` guarantee does not reach this one route. This is called out explicitly in the plan (Section 2) as a known consequence of the VSA boundary, not something this sprint promised to close. Documented here for the record; no action required this sprint.

# Verification Evidence

**Build**
```
$ pnpm --filter @beechcms/core run build
$ tsc
(exit 0)
```

**Typecheck — apps/api**
```
$ cd apps/api && npx tsc --noEmit
32 errors, exit 0 (tsc --noEmit reports via stdout, not exit code)
```
Errors confirmed pre-existing / unrelated to this sprint: `full-text-search.test.ts`, `semantic-search.*.test.ts`, `rate-limit.middleware.test.ts`, `api-key-middleware.test.ts`, `d1-vector.repository.test.ts`, `packages/client/src/types.ts` (`RequestCache`). None touch RBAC files. Count matches execution_log.md's claimed 32.

**Typecheck — apps/dashboard**
```
$ cd apps/dashboard && npx tsc --noEmit
(no output — 0 errors)
```

**Migrations / RBAC repositories untouched**
```
$ git diff devs -- apps/api/migrations | wc -l
0
$ git diff devs -- apps/api/src/shared/db/repositories/d1-role.repository.ts apps/api/src/shared/db/repositories/d1-role-assignment.repository.ts | wc -l
0
$ git diff devs --stat -- apps/dashboard
(empty — no dashboard file touched)
$ test -d apps/api/src/features/rbac && echo EXISTS || echo ABSENT
ABSENT
```

**Full API test suite**
```
$ pnpm --filter @beechcms/api test -- run
Test Files  139 passed (139)
     Tests  1553 passed (1553)
```
Matches execution_log.md's claim exactly.

**RBAC-specific suites run in isolation (direct vitest invocation, not trusting the aggregate run alone)**
```
$ npx vitest run test/flow-rbac-enforcement.test.ts src/middleware/permission.middleware.test.ts \
    test/flow-setup-race.test.ts test/flow-stats.test.ts src/shared/rbac/effective-permissions.test.ts
Test Files  5 passed (5)
     Tests  18 passed (18)
```

**Lint**
```
$ pnpm lint
Tasks: 12 successful, 12 total
```

**Invariant grep checks**
```
$ grep -n "PERMISSIONS = \[" -A 10 packages/core/src/rbac/permissions.ts
  → exactly 7 entries, manage_seeds absent
$ grep -rn "\.arbitrate(" apps/api packages/core   → single production call site, features/oauth/authorize.ts:224
```

**Runtime verification (`pnpm beech dev`, real Worker + D1 + Docker stack, port 8789)**
```
$ curl /api/schema (no token)                          → 401 Unauthorized
$ curl -X POST /auth/setup {..., settings:{...}}        → {"success":true}
$ wrangler d1 execute ... user_role_assignments JOIN roles
  → exactly one row: scope '*', name 'SuperAdmin'
$ wrangler d1 execute ... SELECT users
  → role 'admin', is_active 1
$ login → token; GET /api/schema with token             → 200
$ GET /api/settings/me with token                       → 200
$ GET /api/does-not-exist with token                    → 403 route_not_registered
$ GET /api/seeds with token (role=admin, legacy-admin)  → 200
$ UPDATE users SET is_active=0 WHERE email=...
$ GET /api/schema with the SAME still-unexpired token   → 403 account_disabled
$ GET /api/settings/me with the SAME token              → 403 account_disabled
$ POST /auth/login with deactivated account             → 401 "Invalid credentials"
$ (restored is_active=1, stopped dev stack)
```
All observed statuses match Section 6 acceptance criteria exactly, including the "self-service and settings/me are not exempt from deactivation" requirement and the "no account-status oracle on login" requirement (401, not a distinct code).

# Sprint Documentation
Shipped the fail-closed RBAC enforcement gate (`permissionMiddleware`) on `apiProtected`, registered after `oauthScopeMiddleware`. New `PROTECTED_ROUTES` allowlist maps every mounted `/api/*` route to `permission`/`authenticated`/`legacy-admin`, verified complete by a test driven off `app.routes`. `IRoleGuard.arbitrate()` widened from a role string to `EffectivePermissions`; production binding switched from `AllowAllRoleGuard` to the new `PermissionRoleGuard` (requires global `manage_users` to delegate OAuth/MCP scopes). Added reversible `users.is_active` deactivation, enforced at login, refresh, the OAuth-token auth path, and every `apiProtected` route including self-service (`/api/settings/me`) — closing access instantly despite 15-minute JWTs, with one documented exception: `/oauth/authorize/consent` sits outside `apiProtected` and its bare-JWT auth path does not check `is_active` (called out in the plan itself, not a new gap). `POST /auth/setup` now grants the seeded `SuperAdmin` role at `'*'` to the account it creates, resolved by name and idempotent, preventing the empty-`user_role_assignments` lockout. `seedTestUsers()` mirrors this so all 19 pre-existing authenticated test suites keep passing without a production admin-role bridge. No migration, no dashboard file, no `features/rbac/` slice — all deferred per roadmap. Deviation from plan: none of substance; three pre-existing test files were adapted to the new default-grant/is_active behavior, documented in execution_log.md and independently re-verified here.

## Handoff (Human Gate)
Human reviews this verdict. This is an intermediate sprint (roadmap 2/5) — on acceptance, merge the branch and run `pnpm pipeline next`.
