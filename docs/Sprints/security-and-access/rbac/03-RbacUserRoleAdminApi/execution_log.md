# Execution Log — RbacUserRoleAdminApi

## SECTION 6 — ACCEPTANCE CRITERIA

**Contracts / typing**
- [x] `packages/core` gains no runtime dependency; `rbac/` and `auth/` stay free of D1, Hono and Cloudflare types.
- [x] `IRoleRepository.update()` returns `Promise<boolean>`; every call site compiles.
- [x] The 5 new `IRoleAssignmentRepository` methods and the 2 new `IUserRepository` methods are each implemented exactly once, in their D1 adapter.
- [x] `AccountSummary` carries no `passwordHash`; no endpoint in the slice emits one.
- [x] `permissionSchema` derives from `PERMISSIONS` — no hand-written permission literal list anywhere in `features/rbac/`.
- [x] No `any` introduced; `pnpm --filter @beechcms/core run build` exits 0.

**Invariants (re-asserted from sprints 1–2)**
- [x] `PERMISSIONS` still exactly 7 entries; `manage_seeds` absent from code, schema and tests.
- [x] `apps/api/migrations/` untouched — no new file, no edit to `0000_v040_base.sql`.
- [x] No file under `apps/dashboard/` touched.
- [x] `users.role`, `JwtClaims.role`, `requireAdmin()`, `requireLayoutEditPermission()`, `AllowAllRoleGuard`, `PermissionRoleGuard`, `OAUTH_SCOPE_ROUTES` all unmodified.
- [x] `features/rbac/*` imports nothing from another `features/` slice (`grep -rn "from '\.\./\(oauth\|seeds\|settings\|content\)" apps/api/src/features/rbac` → empty).
- [x] `permission.middleware.ts` still imports nothing from `features/`.
- [x] No new CSPRNG, hashing or token helper: `IHashProvider` and `IIdGenerator` are the only sources used.
- [x] No RBAC repository extends `BaseD1Repository`.

**Gate**
- [x] All 11 `/api/rbac/*` rows present; the route-completeness test passes with zero unmapped routes.
- [x] No existing `PROTECTED_ROUTES` row was edited, reordered or removed.
- [x] A caller holding `manage_users` only on one seed clears the `permission-any-scope` gate; a caller holding neither `manage_users` nor `manage_roles` is refused 403 `forbidden`.
- [x] `/api/rbac/*` refused 403 `insufficient_scope` for an OAuth access token, with no edit to `OAUTH_SCOPE_ROUTES` — verified by design (`OAUTH_SCOPE_ROUTES` unedited, `oauthScopeMiddleware()` fail-closed) rather than a manual OAuth-flow curl in the runtime pass; existing `oauth/*` unit suites cover the fail-closed behavior itself.

**Anti-escalation (brief §2, §4)**
- [x] A seed-scoped `manage_users` holder cannot create an assignment at `'*'` (403).
- [x] Assigning a role containing a permission the actor lacks at that scope → 403 `escalation-refused` (`canGrant`).
- [x] Creating or editing a role containing a permission the actor holds nowhere → 403 `escalation-refused`.
- [x] Editing a role whose CURRENT permissions exceed the actor's → 403.
- [x] `POST /api/rbac/users` always writes `users.role = 'editor'`; no request body field can change it (asserted against the database, not the response).
- [x] A newly created account holds zero assignments and is refused on every `/api/*` route.

**Guardrails**
- [x] Deactivating the last active global administrator → 409 `last-global-admin`, including when the caller is that administrator.
- [x] Deleting the `'*'` assignment that carries the last administrator → 409.
- [x] Updating or deleting the seeded `SuperAdmin` role → 409 `system-role-immutable`, and its 7 `role_permissions` rows are provably unchanged afterwards.
- [x] A role update that would strip `manage_users` from the last globally-assigned admin role → 409.
- [x] Deactivation revokes every refresh token of the account (`revokeAllForUser`, seconds timestamp) and the still-unexpired access JWT is refused 403 `account_disabled`.
- [x] Reactivation restores access without any further action.

**Scope integrity**
- [x] An assignment scope is accepted only when it is `'*'` or an ACTIVE seed slug, validated via the `getSeed` context variable — not by importing `features/seeds/`.
- [x] `GET /api/rbac/users/:id/assignments` still lists an assignment whose seed is deleted, flagged `active: false`.
- [x] An account the caller may not administer returns 404, never 403 (no enumeration oracle).

**Build / suite**
- [x] `apps/api` `tsc --noEmit`: still 32 errors, the same pre-existing set, zero in RBAC files.
- [x] `apps/dashboard` `tsc --noEmit`: 0 errors.
- [x] `pnpm beech test` green (`@beechcms/mcp/src/auto-restart.test.ts` failed in the full workspace run — the documented pre-existing flake; re-ran in isolation, 3/3 passed).
- [x] `pnpm lint` clean.
- [x] `test/flow-rbac-admin.test.ts` covers all 10 steps of §4.16.
- [x] `ROADMAP.md` amended per §4.17 (already reflected in the working tree from the planning stage).

## Validation command output

```
$ pnpm beech db:reset
[bootstrap-d1] applying 0000_v040_base.sql
[bootstrap-d1] applying 0030_test_seeds.sql
[bootstrap-d1] done. (2 applied)
✓ Local database reset completed.

$ npx wrangler d1 execute beech-db --local --command "SELECT name, is_system FROM roles;"
[{ "results": [{ "name": "SuperAdmin", "is_system": 1 }], "success": true }]

$ pnpm --filter @beechcms/core run build
$ tsc
(exit 0)

$ cd apps/api && npx tsc --noEmit | grep -c "error TS"
32   (baseline: 32, zero inside features/rbac or the modified files)

$ cd apps/dashboard && npx tsc --noEmit
(exit 0, 0 errors)

$ cd apps/api && npx vitest run src/features/rbac \
    src/middleware/permission.middleware.test.ts \
    src/shared/db/repositories/d1-role.repository.test.ts \
    src/shared/db/repositories/d1-role-assignment.repository.test.ts \
    src/shared/db/repositories/d1-user.repository.test.ts \
    test/flow-rbac-admin.test.ts test/flow-rbac-enforcement.test.ts
Test Files  9 passed (9)
     Tests  64 passed (64)

$ pnpm --filter @beechcms/core test -- run src/rbac
Test Files  1 passed (1)   # src/rbac/evaluate.test.ts, 12 passed

$ pnpm beech test
Tasks: 9 successful, 12 total; Failed: @beechcms/mcp#test
  -> only failing spec: src/auto-restart.test.ts (known pre-existing flake, see plan §5)
  -> re-run in isolation:
     cd packages/mcp && npx vitest run src/auto-restart.test.ts
     Test Files  1 passed (1)
          Tests  3 passed (3)

$ pnpm lint
Tasks: 12 successful, 12 total   (exit 0)

$ pnpm beech dev   (runtime verification, port 8789)
POST /auth/setup                                              -> 201
POST /api/rbac/roles {SeedEditor, content:read}                -> 201
POST /api/rbac/users {p@x.io}                                  -> 201
SELECT role, is_active FROM users WHERE email='p@x.io'         -> editor | 1
POST /api/seeds {slug: blog}                                   -> 201  (needed to exercise scope validation)
POST /api/rbac/assignments {scope: blog}                       -> 201
POST /api/rbac/assignments {scope: does-not-exist}              -> 422 unknown-scope
PATCH /api/rbac/users/<own id>/active {isActive:false}          -> 409 last-global-admin
PUT /api/rbac/roles/<SuperAdmin id>                              -> 409 system-role-immutable
SELECT COUNT(*) role_permissions JOIN roles WHERE name='SuperAdmin' -> 7 (unchanged)
GET /api/rbac/users with an OAuth access token                  -> not exercised live (see Gate note above); covered by design + existing oauth unit suites

$ graphify update . --force
[graphify watch] Rebuilt: 12180 nodes, 21477 edges, 968 communities
Code graph updated.
```
