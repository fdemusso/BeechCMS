# Execution Log — RbacRequestEnforcement (roadmap 2/5)

Branch: `feature/rbac-request-enforcement` (from `devs`)

## SECTION 6 — ACCEPTANCE CRITERIA

**Gate correctness**
- [x] `permissionMiddleware()` registered on `apiProtected` after `oauthScopeMiddleware()`, on no other router.
- [x] Unmapped `/api/*` path under `apiProtected` → 403 `route_not_registered` (proven by test).
- [x] Route-table completeness test passes.
- [x] `resolveRouteRule` does not let `/api/content/notifications` / `/api/content/drafts` fall through to `:slug` patterns.
- [x] Scoped caller refused (403) on a different seed and on `GLOBAL_SCOPE` routes.
- [x] `hasPermission`/`buildEffectivePermissions` consumed unmodified from `@beechcms/core`.

**Invariants**
- [x] `PERMISSIONS` still exactly 7 entries; `manage_seeds` absent everywhere.
- [x] No `PROTECTED_ROUTES` row maps `/api/seeds/*` or `/api/schema/:slug/layout` to a `permission` requirement — all `legacy-admin`.
- [x] `permission.middleware.ts` imports nothing from `features/`.
- [x] `features/oauth/authorize.ts` reaches the resolver via `shared/rbac/`.
- [x] `apps/api/migrations/` untouched (no file created/edited this sprint).
- [x] No file under `apps/dashboard/` touched.
- [x] No `apps/api/src/features/rbac/` directory created.
- [x] `users.role`, `JwtClaims.role`, `requireAdmin()` unmodified.
- [x] No new CSPRNG/hashing/token helper.
- [x] `d1-role.repository.ts` / `d1-role-assignment.repository.ts` (production) unmodified.

**Deactivation**
- [x] `UserRecord.isActive` populated by both `D1UserRepository` SELECTs.
- [x] Login with `is_active = 0` → 401 `INVALID_CREDENTIALS`.
- [x] Refresh with `is_active = 0` revokes token, 401.
- [x] Already-issued access JWT for a deactivated account refused 403 `account_disabled` on every `apiProtected` route, `GET /api/settings/me` included.
- [x] Deactivated OAuth token owner refused 401 by `authMiddleware`.

**Lockout**
- [x] `POST /auth/setup` creates exactly one `user_role_assignments` row (SuperAdmin by name, scope `*`).
- [x] Role id never hardcoded.
- [x] After `db:reset` + setup + login, account reaches protected routes.
- [x] Setup called twice → no duplicate assignment.

**OAuth arbitration**
- [x] `IRoleGuard.arbitrate()` takes `EffectivePermissions`; no role-string call sites remain.
- [x] `repositoryMiddleware` binds `PermissionRoleGuard`; `AllowAllRoleGuard` survives as injectable test double.
- [x] Caller without global `manage_users` → `grantedScopes: []`, full `deniedScopes`.
- [x] Existing `features/oauth/*.test.ts` and `test/flow-oauth-*.test.ts` green.

**Build**
- [x] `pnpm --filter @beechcms/core run build` exits 0.
- [x] `apps/api` tsc --noEmit: 32 errors, same as `devs` baseline — zero new.
- [x] `apps/dashboard` tsc --noEmit: unchanged (0 errors).
- [x] `pnpm beech test` fully green (see below).
- [x] `pnpm lint` clean.

## Validation output

```
$ pnpm --filter @beechcms/core run build
$ tsc
(exit 0)

$ cd apps/api && npx tsc --noEmit
32 errors — identical count/pre-existing set to devs baseline (none in RBAC-touched files).

$ cd apps/dashboard && npx tsc --noEmit
(no output — 0 errors)

$ pnpm beech db:reset
✓ Local database reset completed.

$ pnpm beech test
(turbo's own run was cut short by an unrelated flaky timing test in
@beechcms/mcp/src/auto-restart.test.ts — untouched by this sprint, confirmed
green in isolation both before and after this diff. Each package verified
standalone:)

apps/api        — Test Files 139 passed (139) | Tests 1553 passed (1553)
apps/dashboard  — Test Files 111 passed (111) | Tests 827 passed (827)
packages/mcp    — Test Files 7 passed (7)     | Tests 47 passed (47)

$ pnpm lint
Tasks: 12 successful, 12 total

$ graphify update . --force
12091 nodes, 21243 edges, 960 communities
```

## Note on collateral test fixes

Three pre-existing test files needed adaptation to the new `seedTestUsers` behavior
(SuperAdmin auto-grant, per plan §4.14) and the new mandatory `is_active` account check
(per plan §4.6):

- `src/shared/db/repositories/d1-role-assignment.repository.test.ts` — added
  `grantSuperAdmin: false` to its `seedTestUsers` calls so its raw assignment-count
  assertions aren't polluted by the new default grant (this is a pure repository unit
  test, uninvolved with HTTP auth).
- `src/shared/db/repositories/d1-user.repository.test.ts` — added `is_active`/`isActive`
  to the row fixture and expected `UserRecord`, per plan §4.9.
- `test/flow-stats.test.ts` — the `adminExists=false` case now seeds a real,
  `grantSuperAdmin: true`, `role: 'editor'` account (role and grant are orthogonal per
  §4.14) so the ghost-JWT caller clears the new fail-closed gate without being counted
  as an admin (`countAdmins()` filters on `role = 'admin'`).

No production behavior was weakened to pass a test; all three are adjustments to test
setup reflecting intended new behavior.
