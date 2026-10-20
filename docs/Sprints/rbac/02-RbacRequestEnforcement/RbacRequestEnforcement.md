# Sprint Plan — RbacRequestEnforcement (roadmap 2/5)

Feature brief: `stages/00_ideation/output/feature_brief.md`
Roadmap: `stages/01_sprint_planning/output/backlog/ROADMAP.md`
Previous sprint (shipped, commit `5c6c27d`): `docs/Sprints/RbacCorePrimitives/`

### Pre-Computation Analysis

Graph regenerated before planning: `graphify update . --force` → **12040 nodes, 21119 edges, 979
communities** (sprint 1's `packages/core/src/rbac/*` and both D1 repositories are in the graph).

**a) God Nodes identified via the CLI**

| Node | Degree | Source | Why it is a god node for this sprint |
|------|--------|--------|--------------------------------------|
| `createBeechApp()` | **46** | `apps/api/src/factory.ts:106` | Sole composition root. Every middleware ordering decision lands here, and 30 of its 46 edges are `imports` from test files — the enforcement gate's blast radius is measured here. |
| `authMiddleware()` | 11 | `apps/api/src/middleware/auth.middleware.ts:80` | Sole authentication seam. Called by `createBeechApp()` at `factory.ts:227` (`acceptOAuth: true`, for `apiProtected`) and `factory.ts:267` (bare, for custom routes); also imported directly by `features/oauth/index.ts:8` and `features/search/search.ts:18`. |
| `oauthScopeMiddleware()` | 7 | `apps/api/src/middleware/oauth-scope.middleware.ts:96` | The existing fail-closed route-table gate. It is the exact structural template this sprint copies, and the new gate must sit immediately after it. |
| `repositoryMiddleware()` | 5 | `apps/api/src/middleware/repository.middleware.ts:96` | Sole DI seam. `roleRepository`, `roleAssignmentRepository` and `roleGuard` are all bound here (lines 151-153); swapping `AllowAllRoleGuard` is a one-line change at `repository.middleware.ts:151`. |
| `seedTestUsers()` | 19 inbound | `apps/api/test/helpers/seed-fixtures.ts:15` | Not a production node, but the single choke point that makes this sprint feasible: `graphify affected "seedTestUsers" --depth 1` returns **19 test files**. One edit there re-authorizes the whole existing suite. |

**b) Architectural boundaries affected**

- `@beechcms/core` — **contract tier, additive plus one widening.**
  - `packages/core/src/rbac/permissions.ts`: add `SUPER_ADMIN_ROLE_NAME`.
  - `packages/core/src/oauth/role-guard.ts`: widen `IRoleGuard.arbitrate()` from `(role: string | undefined, …)` to `(effective: EffectivePermissions, …)`, and add `PermissionRoleGuard` next to `AllowAllRoleGuard`.
  - `packages/core/src/auth/user.repository.ts`: `UserRecord` gains `isActive: boolean`.
  - No new runtime dependency; `rbac/` stays pure and I/O-free.
- `apps/api` — **middleware tier + auth path.** New `middleware/permission.middleware.ts` (route→permission table + gate) and `shared/rbac/effective-permissions.ts` (per-request resolver). Modified: `factory.ts` (one `use()`), `types.ts` (one Variable), `repository.middleware.ts` (one binding), `auth/auth.app.ts` (`is_active` on login/refresh), `middleware/auth.middleware.ts` (`is_active` on the OAuth token path), `features/oauth/authorize.ts` (new `arbitrate()` call shape), `features/setup/index.ts` (the SuperAdmin grant), `shared/db/repositories/d1-user.repository.ts` (`is_active` column).
  - **VSA note:** the gate is middleware, not a slice. It imports only from `@beechcms/core`, `../types` and `../shared/`. Zero `features/*` → `features/*` imports are created. `features/oauth/authorize.ts` reaches the resolver through `shared/rbac/`, never through another slice.
- `apps/dashboard` — **untouched.** Permission-derived UI is roadmap 5/5. The dashboard keeps working because the account it logs in as holds `SuperAdmin` at `'*'`.
- `apps/api/migrations/` — **untouched.** No column is added or dropped this sprint; `users.is_active` already exists in `0000_v040_base.sql` (sprint 1, line ~35). No `db:reset` is required by the schema, only by convention when re-verifying.

**c) `graphify affected` impact analysis (breaking-change proof)**

```
$ graphify affected "requireAdmin" --depth 2
- seeds.handler.ts   [imports]      apps/api/src/features/seeds/seeds.handler.ts:L22
- seeds/index.ts     [re_exports]   apps/api/src/features/seeds/index.ts:L5
- seeds.test.ts      [imports_from] apps/api/src/features/seeds/seeds.test.ts:L8
```
→ `requireAdmin()` has exactly **one production consumer**: the `seedsApp.use('*')` router guard at `seeds.handler.ts:38-43`. It is NOT a cross-cutting gate, so this sprint does not have to unwind it (see VETO Audit §3).

```
$ graphify affected "IRoleGuard" --depth 2
- AllowAllRoleGuard  [implements]  packages/core/src/oauth/role-guard.ts:L35
- role-guard.test.ts [imports]     packages/core/src/oauth/role-guard.test.ts:L5

$ graphify affected "AllowAllRoleGuard" --depth 2
- role-guard.test.ts [imports]     packages/core/src/oauth/role-guard.test.ts:L5
```
→ widening `arbitrate()` breaks **one implementation** (`AllowAllRoleGuard`), **one test file**
(`role-guard.test.ts`) and **one production call site**, confirmed by direct read at
`apps/api/src/features/oauth/authorize.ts:222`. Nothing else in the monorepo calls it.

```
$ graphify affected "buildEffectivePermissions" --depth 2
- evaluate.test.ts   [imports]     packages/core/src/rbac/evaluate.test.ts:L7
```
→ the evaluator still has **zero production consumers**. This sprint is the one that gives it one;
nothing downstream can break from wiring it, because nothing depends on it yet.

```
$ graphify affected "seedTestUsers" --depth 1
19 test files: features/oauth/{authorize,consents,revoke,token}.test.ts,
shared/db/repositories/d1-role-assignment.repository.test.ts, test/draft-relation.test.ts,
test/flow-{admin-auth,background-queues,backrefs,bulk-edit,content-management,draft-management,
media-assets,oauth-authorization,oauth-connected-apps,oauth-resource-server,relations,stats,
system-schema}.test.ts
```
→ **the decisive result.** Turning on a fail-closed gate would 403 every authenticated test request.
Because all 19 authenticated suites hydrate their users through this one helper, granting
`SuperAdmin` inside `seedTestUsers()` re-authorizes all of them with a single edit — no per-file
churn, and no "legacy admin bridge" in production code.

Cross-checked with direct tools (per `tooling_graphify.md`: exact symbols → grep, not `query`):
the 10 test files that do **not** use `D1TestDatabase` (`factory.custom-routes`, `factory.csp`,
`factory.docs-parity`, `public/public-add`, `test/e2e-file-signatures`, `test/flow-guest-access`,
`test/public-edit`, `test/client-sdk-e2e`, `test/public-anti-bot`, `test/public-routes`) exercise
`/api/v1/public/*`, `/api/custom/*` or unauthenticated 401 paths — all outside `apiProtected`, hence
outside the gate. `test/e2e-file-signatures.test.ts` is the one to re-check by hand during execution.

### VETO Audit

Evaluated against `_config/ponytail_arch.md`.

**1. THE BOTANICAL INVARIANT — no D1 access bypasses `@beechcms/core`.**
PASS. The gate performs zero SQL of its own. It reads through `IRoleAssignmentRepository` and
`IRoleRepository` (core interfaces, sprint 1) and `IUserRepository`, then calls the pure core
functions `buildEffectivePermissions()` / `hasPermission()`. No hardcoded field name, no `br_XX`
handling — RBAC tables are **system tables**, never content tables: they carry no Branch, and are
correctly kept out of `apiToDb`/`dbToApi` and out of `BaseD1Repository` (the split sprint 1
established and stage-03 review verified). The route table keys off `seeds.slug`, which is the
scope vocabulary the brief mandates, not off a content column.

**2. VSA ENFORCEMENT — zero cross-feature imports.**
PASS, and it is the reason the gate is middleware rather than a slice. Verified target state:
`apps/api/src/features/oauth/authorize.ts` will import `resolveEffectivePermissions` from
`../../shared/rbac/effective-permissions`, i.e. `features/oauth` → `shared/`, never
`features/oauth` → `features/rbac`. The `features/rbac/` slice does not exist until roadmap 3/5,
and this sprint must not create it. `permission.middleware.ts` imports `@beechcms/core`, `../types`
and `../shared/rbac/` only — it must never import from `../features/`.

**3. RUTHLESS VETO / YAGNI — two proposals cut here, before drafting.**

- **VETOED: dropping the legacy `users.role` column in this sprint.** The roadmap left it as
  "may also drop". `graphify affected "requireAdmin"` proves the column authorizes exactly one
  router (`/api/seeds/*`), but the column itself is threaded through `JwtClaims`, `ITokenService.issue()`,
  login, refresh, `authMiddleware`'s OAuth claim hydration, `createInitialAdmin()` and 5 statements in
  `D1UserRepository`. Landing that unwind in the same PR as the authorization gate makes the security-
  critical diff unreviewable — the exact failure mode the roadmap's own ordering rationale exists to
  prevent. **Deferred to roadmap 3/5**, where the admin API owns user records anyway. SECTION 7 records it.

- **VETOED: an RBAC permission that gates `/api/seeds/*`.** Tempting, and wrong: brief §2 states
  `manage_seeds` must never exist in the enum, in any circumstance, for any role — and sprint 1 made it
  unrepresentable at rest (the `role_permissions` CHECK list). Gating seed management on
  `content:update` or `manage_roles` would smuggle schema mutation back into the dashboard authority
  axis through the side door. **Resolution:** `/api/seeds/*` and `PUT|DELETE /api/schema/:slug/layout`
  are classified `legacy-admin` in the route table — the gate requires authentication and then defers to
  the in-slice `requireAdmin()` / `requireLayoutEditPermission()`, which read `users.role === 'admin'`.
  That keeps `users.role` alive **as the developer/owner axis**, exactly the "Dev vs BeechAdmin — separate
  axis, not hierarchical" boundary from brief §2, and independently justifies VETO #1 above.

**4. CLOUDFLARE PURITY.** PASS. Two extra D1 reads per protected request (`findById` for
`is_active`, `listActiveForUser` + `findByIds` for the assignment fold), memoized per request in a
context Variable. No ORM, no background job, no schema change, no new binding. Nothing stateful
survives a request.

**5. MINIMALIST BLUEPRINT.** 2 new production files, 8 modified, across the 3 tiers
(core contracts → api middleware → dashboard untouched). No new slice, no new table, no migration.

**Adjustment made during this audit:** the initially considered "treat `users.role='admin'` as
SuperAdmin at `'*'`" production bridge is **dropped**. It would create a second authorization
authority alongside the assignment table, permanently. The `seedTestUsers()` finding removes the
only motive for it — test-suite continuity — so the bridge buys nothing and costs an invariant.

HANDOFF -> caveman_coder.

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Sprint 1 shipped the RBAC vocabulary, the D1 tables and the pure evaluator with, by explicit design,
**zero enforcement**: `graphify affected "buildEffectivePermissions"` still returns only its own test
file. Right now BeechCMS has a fully-formed authorization model that no request ever consults. Every
authenticated caller reaches every `/api/*` route, exactly as before.

This sprint must land **before** the admin API (roadmap 3/5) for one structural reason stated in the
roadmap's ordering rationale: an endpoint that creates roles and assignments must itself be protected
by the gate it feeds. Shipping `POST /api/rbac/roles` first would mean shipping, for the length of one
sprint, an unauthenticated-in-practice privilege factory that sprint 2 then closes. Enforcement first
makes that window impossible.

It must land **after** sprint 1 because the gate is a pure consumer: it introduces no table, no
migration and no new storage contract. Everything it needs — `PERMISSIONS`, `hasPermission()`,
`IRoleAssignmentRepository.listActiveForUser()` with its scope-decay `LEFT JOIN seeds` predicate —
already exists and is already covered by real-SQL tests.

**VSA adherence.** The gate is deliberately *not* a vertical slice. Authorization is a cross-cutting
request-lifecycle concern; putting it in `features/rbac/` would force every other slice to import from
it, which is precisely the cross-feature import `ponytail_arch.md` §3 forbids. It therefore lives in
`apps/api/src/middleware/`, alongside `oauthScopeMiddleware()` — whose fail-closed route-table shape it
copies exactly — with its per-request resolver in `apps/api/src/shared/rbac/`, reachable by
`features/oauth/authorize.ts` without any slice-to-slice edge.

**Botanical adherence.** The gate never touches D1 directly. It reads through core interfaces and
folds the result with core's pure evaluator. RBAC tables are system tables: no Branch, no `br_XX`, no
`apiToDb`/`dbToApi`, no `BaseD1Repository` — the same split sprint 1 established and the stage-03
review verified line by line.

**The lockout constraint that shapes the whole sprint.** `user_role_assignments` ships empty.
The instant this middleware is registered, nobody holds any permission. The SuperAdmin grant on
`POST /auth/setup` is therefore not a nice-to-have in this sprint — it is the same commit's other
half. Registering the gate without it bricks every install.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Middleware registration order in `createBeechApp()` (`apps/api/src/factory.ts`), verbatim.**

App-level, `app.use('*', …)`, in order:
1. `repositoryMiddleware({…})` — L118. Must be first; `seedRegistryMiddleware` depends on `seedRepository`.
2. `seedRegistryMiddleware()` — L132.
3. `storageMiddleware({ bucket })` — L135.
4. `queueMiddleware(config.jobs ?? {})` — L139.
5. `authProvidersMiddleware()` — L141.
6. `rateLimiterMiddleware(…)` — L142.
7. `observabilityMiddleware()` — L143.
8. inline CORS middleware — L145.
9. inline security-headers middleware — L186.
10. inline analytics middleware, `/api/*` only — L197.

Routers, in mount order:
- `app.route('/', authApp)` L219, `setupApp` L220, `passwordResetApp` L221, `oauthApp` L222 — **all outside `apiProtected`.**
- `apiProtected` (L225) uses, in order: `authMiddleware({ acceptOAuth: true })` L227 → `oauthScopeMiddleware()` L230. The comment at L228-229 states `oauthScopeMiddleware` "must stay immediately after authMiddleware — it consumes the `oauthGrant` it sets."
- `apiProtected` sub-routes L232-245: `/settings`, `/schema`, `/dashboard-layout`, `/seeds`, `/content`×5 (`notificationsApp`, `statsApp`, `rotateFieldApp`, `draftApp`, `backrefsApp`, `contentFeature`), `/widget`, `/automations`, `/search`, `/` (`uploadRoutes`).
- `apiPublic` mounted at `/api/v1/public` L255 — separate router, `publicRateLimitMiddleware` + `apiKeyMiddleware`, **never sees `authMiddleware`.**
- `/api/webhooks` L258, `/api/media/:key` L260, `/api/custom{,/public}` L263-273 (custom routes get a **bare** `authMiddleware()`), `app.route('/api', apiProtected)` L275.

**`AppEnv.Variables` (`apps/api/src/types.ts:138-240`)** — RBAC-relevant entries as shipped by sprint 1:
```ts
jwtPayload: JwtClaims
oauthGrant: OAuthGrantContext | null
userRepository: IUserRepository
roleGuard: IRoleGuard                                 // bound to AllowAllRoleGuard
roleRepository: IRoleRepository                       // D1RoleRepository
roleAssignmentRepository: IRoleAssignmentRepository   // D1RoleAssignmentRepository
```
All three RBAC entries are bound unconditionally in `repositoryMiddleware` at
`repository.middleware.ts:151-153`, on **every** request including public ones.

**Authorization as it exists today — there are exactly two gates, both in-slice, both role-string:**
1. `requireAdmin(context)` — `features/seeds/seeds.helpers.ts:31`, reads `jwtPayload.role !== 'admin'`,
   returns RFC 7807 403. Applied as a router-wide guard at `seeds.handler.ts:38-43`, covering every
   `/api/seeds/*` route including `seeds.destructive.ts` and `seeds.mcp.ts`.
2. `requireLayoutEditPermission(context)` — `features/schema/schema.handler.ts:15`, same role check,
   applied only to `PUT /api/schema/:slug/layout` and `DELETE /api/schema/:slug/layout`.

Everything else under `/api/*` is reachable by **any** authenticated caller. `GET /api/schema` (L51) is
ungated by design — the dashboard needs it to render menus and forms.

**Authentication (`apps/api/src/middleware/auth.middleware.ts`).** Bearer only. When
`acceptOAuth` and the token matches `/^[0-9a-f]{64}$/`, it looks up `oauthTokenRepository.findActiveByHash(sha256hex(token), 'access', now)`,
then `userRepository.findById(record.userId)` and hydrates `JwtClaims` **from the user row** (L109-115,
including `role: user.role`), sets `oauthGrant`. Otherwise `tokenService.verify(token)` → `jwtPayload`,
`oauthGrant = null`. No `is_active` check exists anywhere on this path.

**Session lifecycle (`apps/api/src/auth/auth.app.ts`).** Sessions are `refresh_tokens` rows (there is no
`sessions` table). `POST /auth/login` L121 → dual-key rate limit → `findByEmail` → `verifyPassword` →
`tokenService.issue({… role: user.role})` + 7-day rotated refresh cookie. `POST /auth/refresh` L188 →
`findActiveByHash` → `findById` → re-issue → `revokeByHash` the old one. `POST /auth/logout` L251 →
`revokeByHash`. Access JWTs live **15 minutes**; no path consults `users.is_active`.

**`IRoleGuard` (`packages/core/src/oauth/role-guard.ts`).** `arbitrate(role: string | undefined, requestedScopes)`.
`AllowAllRoleGuard` (L35) grants everything, with a docstring stating the permissiveness is explicit and
that "when the roles feature lands, replace this binding … the behaviour change will then be visible as
a failing test here, by design." Single production call site: `features/oauth/authorize.ts:222`,
`await context.get('roleGuard').arbitrate(context.get('jwtPayload').role, request.scopes)`. Note that
`/oauth/authorize/consent` lives on `oauthApp` with a **bare** `authMiddleware()` — it is outside
`apiProtected`, so the new gate never runs for it and it must resolve permissions itself.

**Schema, as shipped by sprint 1 (`apps/api/migrations/0000_v040_base.sql`).**
`users` carries `role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('admin','editor'))` **and**
`is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1))`. Section 20 holds `roles`,
`role_permissions` (CHECK list of the 7 permissions, no `manage_seeds`), `user_role_assignments`
(`UNIQUE (user_id, role_id, scope)`, indexes on user/role/scope) and an idempotent
`INSERT OR IGNORE` seeding the `SuperAdmin` system role with all 7 permissions. `user_role_assignments`
is **empty** on a fresh database, by design; the migration comment states the first grant is "runtime
work on the `POST /auth/setup` path, owned by the enforcement sprint."

**`D1UserRepository` (`apps/api/src/shared/db/repositories/d1-user.repository.ts`).** `UserRow` and both
SELECTs (L44, L52) enumerate columns explicitly and **omit `is_active`**; `rowToRecord` (L19) therefore
cannot surface it. `UserRecord` (`packages/core/src/auth/user.repository.ts:4`) has no `isActive` field.

**Test topology.** 19 authenticated suites seed users through `seedTestUsers(db, TEST_USERS)`
(`test/helpers/seed-fixtures.ts:15`), which inserts with `role ?? 'admin'`. Both `TEST_USERS`
(`test/fixtures.ts:129`) omit `role`, so both are admins. `D1TestDatabase` applies every
`^\d{4}_.+\.sql$` migration to real in-memory SQLite, so `roles`/`role_permissions` and the seeded
`SuperAdmin` row are present in all of them.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

**New — `@beechcms/core` (contracts + pure logic only, zero I/O):**
- *(none — core gains no new file this sprint; all core work is edits, below)*

**New — `apps/api`:**
1. `apps/api/src/middleware/permission.middleware.ts` — frozen `PERMISSION_ERRORS` map, the
   `PROTECTED_ROUTES` table, `resolveRouteRule()`, and `permissionMiddleware()`. Fail-closed.
2. `apps/api/src/middleware/permission.middleware.test.ts` — gate behaviour + **route-table
   completeness** test driven off `app.routes`.
3. `apps/api/src/shared/rbac/effective-permissions.ts` — `resolveEffectivePermissions(context)`,
   per-request memoized; the single place assignments are folded into authority.
4. `apps/api/src/shared/rbac/effective-permissions.test.ts` — real-SQL resolution via `D1TestDatabase`.
5. `apps/api/test/flow-rbac-enforcement.test.ts` — end-to-end: scoped editor allowed on own seed,
   403 on another seed, 403 on unmapped route, deactivated account 403, SuperAdmin passes everywhere.

**Modified — `@beechcms/core`:**
6. `packages/core/src/rbac/permissions.ts` — add `SUPER_ADMIN_ROLE_NAME`.
7. `packages/core/src/oauth/role-guard.ts` — widen `IRoleGuard.arbitrate()`; add `PermissionRoleGuard`.
8. `packages/core/src/oauth/role-guard.test.ts` — updated call shape + `PermissionRoleGuard` cases.
9. `packages/core/src/auth/user.repository.ts` — `UserRecord.isActive: boolean`.

**Modified — `apps/api`:**
10. `apps/api/src/factory.ts` — one `apiProtected.use('*', permissionMiddleware())`.
11. `apps/api/src/types.ts` — one Variable: `effectivePermissions?: EffectivePermissions`.
12. `apps/api/src/middleware/repository.middleware.ts` — `AllowAllRoleGuard` → `PermissionRoleGuard`.
13. `apps/api/src/shared/db/repositories/d1-user.repository.ts` — select and map `is_active`.
14. `apps/api/src/auth/auth.app.ts` — refuse deactivated accounts on login and refresh.
15. `apps/api/src/middleware/auth.middleware.ts` — refuse deactivated accounts on the OAuth token path.
16. `apps/api/src/features/oauth/authorize.ts` — new `arbitrate()` call shape.
17. `apps/api/src/features/setup/index.ts` — **grant `SuperAdmin` at `'*'` to the account it creates.**
18. `apps/api/test/helpers/seed-fixtures.ts` — grant `SuperAdmin` at `'*'` to seeded `role='admin'` users.

**Explicitly NOT in this sprint:** no migration file is created or edited; no `features/rbac/` slice;
no dashboard file; no `users.role` drop; no `/api/settings/me` permission payload.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### 4.1 `packages/core/src/rbac/permissions.ts` — append

```ts
/**
 * Name of the system role seeded by `0000_v040_base.sql` with the full permission set.
 *
 * `roles.name` is UNIQUE, so the name is a stable handle; the id is minted by the
 * migration and differs per database, which is why nothing may hardcode it.
 */
export const SUPER_ADMIN_ROLE_NAME = 'SuperAdmin'
```

Nothing else in this file changes. `PERMISSIONS` stays exactly the 7 entries; `manage_seeds` must not
appear.

### 4.2 `packages/core/src/auth/user.repository.ts` — widen `UserRecord`

Add one field to the existing interface (leave `NewUserInput` alone — new rows take the column default):

```ts
export interface UserRecord {
  id: string
  email: string
  name: string | null
  surname: string | null
  passwordHash: string
  role: string
  avatarUrl: string | null
  notificationPreferences: string
  /**
   * Reversible deactivation (`users.is_active`). A deactivated account keeps its rows,
   * its assignments and its refresh tokens, but is refused at every authorization
   * boundary — which is what makes revocation instant despite 15-minute access JWTs.
   */
  isActive: boolean
}
```

### 4.3 `packages/core/src/oauth/role-guard.ts` — widen the seam, add the real guard

Replace the `IRoleGuard` interface and append `PermissionRoleGuard`. `AllowAllRoleGuard` keeps its
name, its docstring intent and its permissive behaviour — it stays as the test double.

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { OAuthScope } from './scopes.js'
import { GLOBAL_SCOPE } from '../rbac/permissions.js'
import type { EffectivePermissions } from '../rbac/types.js'

/** Outcome of a role arbitration. `deniedScopes` is empty when fully granted. */
export interface ScopeGrantDecision {
  grantedScopes: OAuthScope[]
  deniedScopes: OAuthScope[]
}

/**
 * Arbitrates which of the requested scopes a given caller may grant.
 *
 * This is the ONLY place role-based authorization may live in the OAuth flow.
 * `/oauth/authorize` and `/oauth/token` must never branch on authority themselves.
 *
 * The parameter is the caller's RESOLVED authority, not a role string: the role
 * string is the pre-RBAC vocabulary and is on its way out.
 */
export interface IRoleGuard {
  /**
   * @param effective - The resource owner's effective permissions, already folded.
   * @param requestedScopes - Scopes the client asked for, already validated.
   */
  arbitrate(
    effective: EffectivePermissions,
    requestedScopes: readonly OAuthScope[],
  ): Promise<ScopeGrantDecision>
}

/**
 * Stub guard: grants every requested scope to every caller.
 *
 * Retained as the explicit, directly-tested permissive baseline and as the test
 * double for suites that are not exercising arbitration. It is NO LONGER the
 * production binding — `repositoryMiddleware` binds {@link PermissionRoleGuard}.
 */
export class AllowAllRoleGuard implements IRoleGuard {
  async arbitrate(
    _effective: EffectivePermissions,
    requestedScopes: readonly OAuthScope[],
  ): Promise<ScopeGrantDecision> {
    return { grantedScopes: [...requestedScopes], deniedScopes: [] }
  }
}

/**
 * Production guard: only a platform-wide administrator may delegate authority to an
 * OAuth/MCP client.
 *
 * Every OAuth scope in this system (`schema:read`, `schema:write`) drives seed-schema
 * tooling, which brief §2 keeps OUT of the dashboard permission axis entirely — there is
 * deliberately no `manage_seeds` permission to map onto. So the question this guard
 * answers is not "which seed?" but "may this account hand platform authority to a
 * client at all?", and the marker for that is holding `manage_users` at
 * {@link GLOBAL_SCOPE} — the same SuperAdmin marker `countActiveGlobalAdmins()` uses.
 *
 * A seed-scoped collaborator therefore cannot mint an MCP token, no matter which
 * scopes the client requests. Denial is all-or-nothing: there is no partial grant.
 */
export class PermissionRoleGuard implements IRoleGuard {
  async arbitrate(
    effective: EffectivePermissions,
    requestedScopes: readonly OAuthScope[],
  ): Promise<ScopeGrantDecision> {
    if (!effective.global.has('manage_users')) {
      return { grantedScopes: [], deniedScopes: [...requestedScopes] }
    }
    return { grantedScopes: [...requestedScopes], deniedScopes: [] }
  }
}
```

> `GLOBAL_SCOPE` is imported for documentation symmetry only; if the executor finds it unused after
> writing the body, drop the import rather than inventing a use for it — an unused import fails lint.

### 4.4 `apps/api/src/shared/rbac/effective-permissions.ts` — NEW

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { Context } from 'hono'
import { buildEffectivePermissions, type EffectivePermissions } from '@beechcms/core'
import type { Env, Variables } from '../../types'

type AppContext = Context<{ Bindings: Env; Variables: Variables }>

/** An authority of exactly nothing. Returned for callers with no active assignment. */
const EMPTY_PERMISSIONS: EffectivePermissions = { global: new Set(), byScope: new Map() }

/**
 * Resolves the caller's effective authority once per request and memoizes it in the
 * `effectivePermissions` context Variable.
 *
 * Two D1 reads on first call: the decay-filtered assignment list, then the referenced
 * roles in one round trip. Assignments naming an unknown role are dropped by the core
 * evaluator, so a torn read can only ever narrow authority, never widen it.
 *
 * Lives in `shared/` — not in a slice — because `features/oauth/authorize.ts` needs it
 * on a route that never reaches `permissionMiddleware()`, and a slice-to-slice import
 * would violate VSA.
 */
export async function resolveEffectivePermissions(context: AppContext): Promise<EffectivePermissions> {
  const cached = context.get('effectivePermissions')
  if (cached) return cached

  const userId = context.get('jwtPayload')?.sub
  if (!userId) return EMPTY_PERMISSIONS

  const assignments = await context.get('roleAssignmentRepository').listActiveForUser(userId)
  if (assignments.length === 0) {
    context.set('effectivePermissions', EMPTY_PERMISSIONS)
    return EMPTY_PERMISSIONS
  }

  const roleIds = [...new Set(assignments.map(assignment => assignment.roleId))]
  const roles = await context.get('roleRepository').findByIds(roleIds)
  const effective = buildEffectivePermissions(assignments, roles)

  context.set('effectivePermissions', effective)
  return effective
}
```

### 4.5 `apps/api/src/types.ts` — one additive Variable

Add `EffectivePermissions` to the existing `@beechcms/core` type import list on L13, then append to
`Variables` (keep it last, next to the other RBAC entries):

```ts
  /**
   * The caller's folded authority, memoized by `resolveEffectivePermissions()`.
   * Absent until something on the request path asks for it.
   */
  effectivePermissions?: EffectivePermissions
```

### 4.6 `apps/api/src/middleware/permission.middleware.ts` — NEW (the gate)

Structural template: `oauth-scope.middleware.ts` — exported table, exported resolver, fail-closed
middleware, one frozen error map.

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { Context, Next } from 'hono'
import { GLOBAL_SCOPE, hasPermission, type Permission } from '@beechcms/core'
import { resolveEffectivePermissions } from '../shared/rbac/effective-permissions'
import type { Env, Variables } from '../types'

/** Frozen error-code map for this gate, per the `auth/constants.ts` convention. */
export const PERMISSION_ERRORS = {
  FORBIDDEN: 'forbidden',
  ACCOUNT_DISABLED: 'account_disabled',
  ROUTE_NOT_REGISTERED: 'route_not_registered',
} as const

/**
 * How a route's scope is derived.
 * - `'global'`   — the route is not seed-scoped; it is checked at `GLOBAL_SCOPE`.
 * - `'capture1'` — capture group 1 of `pattern` is the `seeds.slug` to check against.
 */
export type ScopeSource = 'global' | 'capture1'

/**
 * What a route demands.
 * - `{ permission, scope }`     — a real RBAC check.
 * - `'authenticated'`           — any active account; self-service and dashboard chrome.
 * - `'legacy-admin'`            — deferred to the slice's own `users.role === 'admin'`
 *                                 guard. The developer axis (brief §2): schema mutation
 *                                 is NOT representable as an RBAC permission and must
 *                                 never become one.
 */
export type RouteRequirement =
  | { kind: 'permission'; permission: Permission; scope: ScopeSource }
  | { kind: 'authenticated' }
  | { kind: 'legacy-admin' }

export interface ProtectedRoute {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  /** Tested against `c.req.path`, which includes the `/api` prefix. */
  pattern: RegExp
  requirement: RouteRequirement
}

const perm = (permission: Permission, scope: ScopeSource): RouteRequirement =>
  ({ kind: 'permission', permission, scope })
const AUTHED: RouteRequirement = { kind: 'authenticated' }
const LEGACY_ADMIN: RouteRequirement = { kind: 'legacy-admin' }

/**
 * Closed allowlist of every route mounted under `apiProtected`.
 *
 * ORDER IS SIGNIFICANT — first match wins. Literal `/api/content/...` prefixes
 * (`notifications`, `drafts`, `stats`) MUST precede the `/api/content/:slug`
 * patterns, because `:slug` would otherwise swallow them.
 *
 * Enforcement is fail-closed: any `/api/*` path not listed here is refused for every
 * caller. Adding a route without adding a row breaks that route loudly in the
 * completeness test, which is the intended failure mode.
 */
export const PROTECTED_ROUTES: readonly ProtectedRoute[] = [
  // --- settings: self-service first, then the site-wide ones -------------------
  { method: 'GET',    pattern: /^\/api\/settings\/me$/,                    requirement: AUTHED },
  { method: 'PUT',    pattern: /^\/api\/settings\/profile$/,               requirement: AUTHED },
  { method: 'PUT',    pattern: /^\/api\/settings\/password$/,              requirement: AUTHED },
  { method: 'PUT',    pattern: /^\/api\/settings\/avatar$/,                requirement: AUTHED },
  { method: 'GET',    pattern: /^\/api\/settings\/sessions$/,              requirement: AUTHED },
  { method: 'DELETE', pattern: /^\/api\/settings\/sessions\/[^/]+$/,       requirement: AUTHED },
  { method: 'GET',    pattern: /^\/api\/settings\/notifications$/,         requirement: AUTHED },
  { method: 'PUT',    pattern: /^\/api\/settings\/notifications$/,         requirement: AUTHED },
  { method: 'GET',    pattern: /^\/api\/settings\/activity$/,              requirement: perm('view_analytics', 'global') },
  { method: 'GET',    pattern: /^\/api\/settings\/storage$/,               requirement: perm('view_analytics', 'global') },
  { method: 'GET',    pattern: /^\/api\/settings\/?$/,                     requirement: AUTHED },
  { method: 'PUT',    pattern: /^\/api\/settings\/?$/,                     requirement: perm('manage_users', 'global') },

  // --- schema: read is dashboard chrome; layout writes are the developer axis ---
  { method: 'GET',    pattern: /^\/api\/schema\/?$/,                       requirement: AUTHED },
  { method: 'PUT',    pattern: /^\/api\/schema\/[^/]+\/layout$/,           requirement: LEGACY_ADMIN },
  { method: 'DELETE', pattern: /^\/api\/schema\/[^/]+\/layout$/,           requirement: LEGACY_ADMIN },

  // --- seeds: developer axis in full (in-slice requireAdmin decides) -----------
  { method: 'GET',    pattern: /^\/api\/seeds(\/.*)?$/,                    requirement: LEGACY_ADMIN },
  { method: 'POST',   pattern: /^\/api\/seeds(\/.*)?$/,                    requirement: LEGACY_ADMIN },
  { method: 'PUT',    pattern: /^\/api\/seeds(\/.*)?$/,                    requirement: LEGACY_ADMIN },
  { method: 'PATCH',  pattern: /^\/api\/seeds(\/.*)?$/,                    requirement: LEGACY_ADMIN },
  { method: 'DELETE', pattern: /^\/api\/seeds(\/.*)?$/,                    requirement: LEGACY_ADMIN },

  // --- dashboard layout --------------------------------------------------------
  { method: 'GET',    pattern: /^\/api\/dashboard-layout(\/.*)?$/,         requirement: AUTHED },
  { method: 'PUT',    pattern: /^\/api\/dashboard-layout(\/.*)?$/,         requirement: perm('manage_users', 'global') },
  { method: 'DELETE', pattern: /^\/api\/dashboard-layout(\/.*)?$/,         requirement: perm('manage_users', 'global') },

  // --- /api/content literal prefixes — MUST precede the :slug patterns ---------
  { method: 'GET',    pattern: /^\/api\/content\/notifications$/,          requirement: AUTHED },
  { method: 'PATCH',  pattern: /^\/api\/content\/notifications\/[^/]+\/(read|unread)$/, requirement: AUTHED },
  { method: 'DELETE', pattern: /^\/api\/content\/notifications\/[^/]+$/,   requirement: AUTHED },
  { method: 'POST',   pattern: /^\/api\/content\/notifications\/mark-all-read$/, requirement: AUTHED },
  { method: 'GET',    pattern: /^\/api\/content\/drafts$/,                 requirement: perm('content:read', 'global') },
  { method: 'GET',    pattern: /^\/api\/content\/stats\/[^/]+$/,           requirement: perm('view_analytics', 'global') },
  { method: 'POST',   pattern: /^\/api\/content\/stats\/storage\/sync$/,   requirement: perm('view_analytics', 'global') },

  // --- /api/content per-seed: capture group 1 IS the scope ---------------------
  { method: 'GET',    pattern: /^\/api\/content\/([^/]+)\/view-config$/,   requirement: perm('content:read',   'capture1') },
  { method: 'PUT',    pattern: /^\/api\/content\/([^/]+)\/view-config$/,   requirement: perm('content:update', 'capture1') },
  { method: 'GET',    pattern: /^\/api\/content\/([^/]+)\/facets$/,        requirement: perm('content:read',   'capture1') },
  { method: 'PATCH',  pattern: /^\/api\/content\/([^/]+)\/bulk$/,          requirement: perm('content:update', 'capture1') },
  { method: 'GET',    pattern: /^\/api\/content\/([^/]+)\/by-slug\/[^/]+$/, requirement: perm('content:read',  'capture1') },
  { method: 'GET',    pattern: /^\/api\/content\/([^/]+)\/[^/]+\/backrefs$/, requirement: perm('content:read', 'capture1') },
  { method: 'GET',    pattern: /^\/api\/content\/([^/]+)\/[^/]+\/draft$/,  requirement: perm('content:read',   'capture1') },
  { method: 'PUT',    pattern: /^\/api\/content\/([^/]+)\/[^/]+\/draft$/,  requirement: perm('content:update', 'capture1') },
  { method: 'DELETE', pattern: /^\/api\/content\/([^/]+)\/[^/]+\/draft$/,  requirement: perm('content:update', 'capture1') },
  { method: 'POST',   pattern: /^\/api\/content\/([^/]+)\/[^/]+\/draft\/publish$/, requirement: perm('content:update', 'capture1') },
  { method: 'PATCH',  pattern: /^\/api\/content\/([^/]+)\/[^/]+\/kanban-(move|position)$/, requirement: perm('content:update', 'capture1') },
  { method: 'POST',   pattern: /^\/api\/content\/([^/]+)\/[^/]+\/rotate-field$/, requirement: perm('content:update', 'capture1') },
  { method: 'GET',    pattern: /^\/api\/content\/([^/]+)\/[^/]+$/,         requirement: perm('content:read',   'capture1') },
  { method: 'PUT',    pattern: /^\/api\/content\/([^/]+)\/[^/]+$/,         requirement: perm('content:update', 'capture1') },
  { method: 'DELETE', pattern: /^\/api\/content\/([^/]+)\/[^/]+$/,         requirement: perm('content:delete', 'capture1') },
  { method: 'GET',    pattern: /^\/api\/content\/([^/]+)$/,                requirement: perm('content:read',   'capture1') },
  { method: 'POST',   pattern: /^\/api\/content\/([^/]+)$/,                requirement: perm('content:create', 'capture1') },

  // --- widgets: last path segment is the seed ---------------------------------
  { method: 'GET',    pattern: /^\/api\/widget\/(?:aggregate|growth|leaderboard|list|timeseries|distribution)\/([^/]+)$/, requirement: perm('content:read', 'capture1') },

  // --- automations, search, uploads: global scope ------------------------------
  { method: 'GET',    pattern: /^\/api\/automations(\/.*)?$/,              requirement: perm('content:read',   'global') },
  { method: 'POST',   pattern: /^\/api\/automations\/?$/,                  requirement: perm('content:update', 'global') },
  { method: 'PUT',    pattern: /^\/api\/automations\/[^/]+$/,              requirement: perm('content:update', 'global') },
  { method: 'PATCH',  pattern: /^\/api\/automations\/[^/]+\/toggle$/,      requirement: perm('content:update', 'global') },
  { method: 'DELETE', pattern: /^\/api\/automations\/[^/]+$/,              requirement: perm('content:delete', 'global') },
  { method: 'GET',    pattern: /^\/api\/search\/?$/,                       requirement: perm('content:read',   'global') },
  { method: 'POST',   pattern: /^\/api\/upload(\/(presign|confirm))?$/,    requirement: perm('content:create', 'global') },
  { method: 'GET',    pattern: /^\/api\/upload\/download-url\/.+$/,        requirement: perm('content:read',   'global') },
  { method: 'DELETE', pattern: /^\/api\/upload\/.+$/,                      requirement: perm('content:delete', 'global') },
]

/** Resolves the rule for a request, plus the scope its pattern captured. */
export function resolveRouteRule(
  method: string,
  path: string,
): { requirement: RouteRequirement; scope: string } | null {
  for (const route of PROTECTED_ROUTES) {
    if (route.method !== method) continue
    const match = route.pattern.exec(path)
    if (!match) continue
    const scope =
      route.requirement.kind === 'permission' && route.requirement.scope === 'capture1'
        ? match[1] ?? GLOBAL_SCOPE
        : GLOBAL_SCOPE
    return { requirement: route.requirement, scope }
  }
  return null
}

function forbidden(code: string, detail: string): Response {
  return new Response(JSON.stringify({ error: code, error_description: detail }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * The single authorization gate for every request under `apiProtected`.
 *
 * Registered AFTER `authMiddleware` (it needs `jwtPayload`) and AFTER
 * `oauthScopeMiddleware` (an OAuth token must clear its scope allowlist before its
 * owner's permissions are even consulted). Both gates apply; neither replaces the other.
 *
 * Order of refusal, all 403:
 * 1. deactivated account — checked for EVERY requirement class, self-service included,
 *    which is what makes deactivation revoke access instantly despite 15-minute JWTs;
 * 2. unregistered route — fail-closed;
 * 3. missing permission at the route's scope.
 *
 * `legacy-admin` routes are passed through to their in-slice `users.role === 'admin'`
 * guard: seed-schema mutation is deliberately not expressible as an RBAC permission
 * (brief §2) and must never be granted one.
 */
export function permissionMiddleware() {
  return async (c: Context<{ Bindings: Env; Variables: Variables }>, next: Next): Promise<Response | void> => {
    const userId = c.get('jwtPayload')?.sub
    if (!userId) return forbidden(PERMISSION_ERRORS.FORBIDDEN, 'No authenticated subject on this request.')

    const user = await c.get('userRepository').findById(userId)
    if (!user || !user.isActive) {
      return forbidden(PERMISSION_ERRORS.ACCOUNT_DISABLED, 'This account is deactivated.')
    }

    const rule = resolveRouteRule(c.req.method, c.req.path)
    if (!rule) {
      return forbidden(
        PERMISSION_ERRORS.ROUTE_NOT_REGISTERED,
        'This endpoint is not registered in the permission table.',
      )
    }

    if (rule.requirement.kind === 'authenticated' || rule.requirement.kind === 'legacy-admin') {
      await next()
      return
    }

    const effective = await resolveEffectivePermissions(c)
    if (!hasPermission(effective, rule.requirement.permission, rule.scope)) {
      return forbidden(
        PERMISSION_ERRORS.FORBIDDEN,
        `This endpoint requires '${rule.requirement.permission}' on scope '${rule.scope}'.`,
      )
    }

    await next()
  }
}
```

### 4.7 `apps/api/src/factory.ts` — register the gate

Add the import next to the other middleware imports:
```ts
import { permissionMiddleware } from './middleware/permission.middleware'
```
and one line immediately after `oauthScopeMiddleware()` (currently L230), preserving the existing
comment block:
```ts
  apiProtected.use('*', oauthScopeMiddleware())
  // Fail-closed RBAC gate. Runs last of the three: authentication has produced a
  // subject, the OAuth scope allowlist has already refused off-limits tokens, and this
  // decides what the subject may do on the scope named by the route.
  apiProtected.use('*', permissionMiddleware())
```
**Nothing else in `factory.ts` changes.** In particular `/api/custom` keeps its bare
`authMiddleware()` and stays outside the gate — developer custom routes are the developer axis.

### 4.8 `apps/api/src/middleware/repository.middleware.ts` — swap the guard

Change the `@beechcms/core` value import (L35) from `AllowAllRoleGuard` to `PermissionRoleGuard`, and
L151:
```ts
    context.set('roleGuard', overrides?.roleGuard ?? new PermissionRoleGuard())
```
`AllowAllRoleGuard` remains exported from core for tests that inject it via `config.roleGuard`.

### 4.9 `apps/api/src/shared/db/repositories/d1-user.repository.ts` — surface `is_active`

Add `is_active: number` to `UserRow`, add `isActive: row.is_active === 1` to `rowToRecord`, and add
`is_active` to the column list of **both** SELECTs (L44 and L52):
```sql
SELECT id, email, name, surname, password_hash, role, avatar_url, notification_prefs, is_active FROM users WHERE id = ? LIMIT 1
SELECT id, email, name, surname, password_hash, role, avatar_url, notification_prefs, is_active FROM users WHERE email = ? LIMIT 1
```
`create()` and `createInitialAdmin()` are unchanged — the column defaults to `1`.

### 4.10 `apps/api/src/auth/auth.app.ts` — refuse deactivated accounts

In `POST /auth/login`, extend the existing credential check so a deactivated account is
indistinguishable from bad credentials (no account-status oracle):
```ts
    if (!user || !isValid || !user.isActive) return context.json({ error: AUTH_ERRORS.INVALID_CREDENTIALS }, 401)
```
In `POST /auth/refresh`, after the existing `findById` null-check block, revoke and refuse:
```ts
    if (!user.isActive) {
      await context.get('sessionRepository').revokeByHash(tokenHash, nowSeconds)
      return context.json({ error: 'Invalid refresh token' }, 401)
    }
```
`POST /auth/logout` is unchanged.

### 4.11 `apps/api/src/middleware/auth.middleware.ts` — refuse deactivated accounts on the OAuth path

In the `acceptOAuth` branch, widen the existing user check (currently L104-107):
```ts
      const user = await c.get('userRepository').findById(record.userId)
      if (!user || !user.isActive) {
        throw new HTTPException(401, { res: invalidTokenResponse() })
      }
```
The JWT branch is deliberately left alone: it performs no user lookup, and
`permissionMiddleware()` already refuses deactivated accounts on every route it guards.

### 4.12 `apps/api/src/features/oauth/authorize.ts` — new `arbitrate()` shape

Add the import:
```ts
import { resolveEffectivePermissions } from '../../shared/rbac/effective-permissions'
```
and replace the call at L222:
```ts
  const effective = await resolveEffectivePermissions(context)
  const decision = await context.get('roleGuard').arbitrate(effective, request.scopes)
```
The surrounding `decision.grantedScopes.length === 0` branch, its error redirect and everything after
are unchanged. `/oauth/authorize/consent` runs on `oauthApp` with a bare `authMiddleware()`, so it
resolves permissions itself — this is exactly why the resolver lives in `shared/`.

### 4.13 `apps/api/src/features/setup/index.ts` — **the grant that prevents lockout**

In `POST /auth/setup`, immediately after the `if (!created) { … }` block (currently ends L220) and
before the demo-data branch, insert:

```ts
  // LOCKOUT GUARD. `user_role_assignments` ships empty, so without this grant the account
  // just created would hold nothing and every `/api/*` route would 403 it. The role id is
  // minted per-database by `0000_v040_base.sql`, so it is resolved BY NAME, never hardcoded.
  const superAdminRole = (await context.get('roleRepository').listAll())
    .find(role => role.name === SUPER_ADMIN_ROLE_NAME)

  if (!superAdminRole) {
    return publicProblem(context, {
      type: 'rbac-not-provisioned',
      title: 'RBAC not provisioned',
      status: 500,
      detail: `The '${SUPER_ADMIN_ROLE_NAME}' system role is missing. Run \`pnpm beech db:reset\`.`,
    })
  }

  await context.get('roleAssignmentRepository').create({
    userId: created ? adminUserId : adminUserId,
    roleId: superAdminRole.id,
    scope: GLOBAL_SCOPE,
  })
```

Two mechanical prerequisites in the same file:
- import `import { GLOBAL_SCOPE, SUPER_ADMIN_ROLE_NAME } from '@beechcms/core'`;
- the generated id is currently inlined into `createInitialAdmin` at L204-211. Hoist it so the grant
  can reference it:
  ```ts
  const adminUserId = context.get('idGenerator').uuid()
  const created = await context.get('userRepository').createInitialAdmin({
    id: adminUserId,
    email: normalizedEmail,
    passwordHash,
    role: 'admin',
    name: normalizedName,
    surname: normalizedSurname,
  })
  ```
  and simplify the `create({ userId: … })` argument above to `userId: adminUserId` (the ternary in the
  snippet is redundant — the `!created` early-return has already fired).

`create()` is `INSERT OR IGNORE` + read-back (sprint 1), so a retried setup is idempotent.

### 4.14 `apps/api/test/helpers/seed-fixtures.ts` — re-authorize the existing suite

This is the single edit that keeps 19 authenticated suites green. It belongs in the test helper, not
in production code — see the VETO Audit's dropped "legacy admin bridge".

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { GLOBAL_SCOPE, SUPER_ADMIN_ROLE_NAME } from '@beechcms/core'
import type { D1TestDatabase } from './d1-test-database'

export interface TestUser {
  id: string
  email: string
  password_hash: string
  name?: string
  role?: string
  /**
   * Grant the seeded `SuperAdmin` role at `'*'`. Defaults to true for `role === 'admin'`,
   * which is what every pre-RBAC suite assumes. Set `false` to build an account with no
   * authority at all (zero-trust cases), or seed narrower assignments by hand.
   */
  grantSuperAdmin?: boolean
}

export async function seedTestUsers(db: D1TestDatabase, users: TestUser[]): Promise<void> {
  for (const u of users) {
    const role = u.role ?? 'admin'
    await db.prepare(
      'INSERT OR IGNORE INTO users (id, email, password_hash, role, name) VALUES (?, ?, ?, ?, ?)'
    ).bind(u.id, u.email, u.password_hash, role, u.name ?? null).run()

    const grant = u.grantSuperAdmin ?? role === 'admin'
    if (!grant) continue

    // The role id is minted per-database by 0000_v040_base.sql — resolve it by name.
    await db.prepare(
      `INSERT OR IGNORE INTO user_role_assignments (id, user_id, role_id, scope)
       SELECT ?, ?, r.id, ? FROM roles r WHERE r.name = ?`
    ).bind(`ura_${u.id}`, u.id, GLOBAL_SCOPE, SUPER_ADMIN_ROLE_NAME).run()
  }
}
```

> Assignment ids here are fixture-shaped (`ura_…`), not v4 — acceptable in a test helper, since
> `IIdGenerator.isValid()` is never applied to assignment ids on a read path. Do not copy this into
> production code.

### 4.15 Tests to author

**`packages/core/src/oauth/role-guard.test.ts`** (modified) — update `AllowAllRoleGuard` calls to the
new signature; add `PermissionRoleGuard`: grants all when `global` contains `manage_users`; denies all
(and reports every requested scope in `deniedScopes`) for an empty authority and for a caller holding
`manage_users` only at a seed scope.

**`apps/api/src/shared/rbac/effective-permissions.test.ts`** (new, `D1TestDatabase`, real SQL) — an
account with no assignments resolves to empty; a SuperAdmin `'*'` assignment resolves to all 7 global;
a seed-scoped assignment lands in `byScope`; a second call on the same context issues no further
queries (memoization).

**`apps/api/src/middleware/permission.middleware.test.ts`** (new) — the two that matter most:

1. *Route-table completeness (fail-closed regression guard).* Build the app and assert every route it
   mounts under `/api` — excluding `/api/v1/public/*`, `/api/custom*`, `/api/webhooks*`, `/api/media/*`
   — resolves to a rule:
   ```ts
   const app = createBeechApp({ seeds: TEST_SEEDS })
   const EXCLUDED = /^\/api\/(v1\/public|custom|webhooks|media)\b/
   const unmapped = app.routes
     .filter(r => r.path.startsWith('/api') && !EXCLUDED.test(r.path) && r.method !== 'ALL')
     .filter(r => resolveRouteRule(r.method, r.path.replace(/:([^/]+)/g, 'x')) === null)
   expect(unmapped).toEqual([])
   ```
   The executor must verify the exact shape of `app.routes` entries in the installed Hono version and
   adapt the param substitution; the assertion, not the mechanism, is the deliverable.
2. *Ordering.* `resolveRouteRule('GET', '/api/content/notifications')` returns `authenticated`, NOT
   `content:read` on a seed called `notifications`. Same for `/api/content/drafts`.

Plus: unmapped path → 403 `route_not_registered`; `legacy-admin` passes the gate and is then refused
by `requireAdmin` for a non-admin; deactivated account → 403 `account_disabled` even on
`GET /api/settings/me`.

**`apps/api/test/flow-rbac-enforcement.test.ts`** (new, end-to-end through `createBeechApp`) — seed an
account with `grantSuperAdmin: false` plus a hand-built role holding `content:read`+`content:update`
scoped to `posts`; assert 200 on `GET /api/content/posts`, 403 on `DELETE /api/content/posts/:id`
(no `content:delete`), 403 on `GET /api/content/pages` (wrong scope), 403 on `GET /api/settings/activity`
(no `view_analytics`), 200 on `GET /api/settings/me`. Then flip `users.is_active = 0` and assert every
one of those 403s with `account_disabled`.

**Setup grant** — extend `test/flow-setup-race.test.ts` or add a case: after `POST /auth/setup`,
`user_role_assignments` holds exactly one row for the new user with `scope = '*'` and the
`SuperAdmin` role id; then log in with that account and reach `GET /api/content/:slug`.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

```bash
# 1. Core builds and its contracts still typecheck
pnpm --filter @beechcms/core run build

# 2. API typecheck — compare against the devs baseline, which has 32 PRE-EXISTING errors
#    (stage-03 verified this count on the previous sprint). Zero NEW errors is the bar.
cd apps/api && npx tsc --noEmit

# 3. Dashboard must be untouched and still typecheck
cd apps/dashboard && npx tsc --noEmit

# 4. Fresh database (no migration changed this sprint, but the SuperAdmin seed row and
#    users.is_active must be present for the setup-grant and is_active tests)
pnpm beech db:reset

# 5. Full suite — the real gate on this sprint. Any authenticated suite that 403s
#    means the route table has a hole.
pnpm beech test

# 6. Lint
pnpm lint

# 7. Refresh the graph for the downstream review stage
graphify update . --force
```

Manual verification after `pnpm beech db:reset` plus a `POST /auth/setup` against the dev server:

```bash
npx wrangler d1 execute beech-db --local --command \
  "SELECT a.scope, r.name FROM user_role_assignments a JOIN roles r ON r.id = a.role_id;"
# -> exactly one row: '*' | SuperAdmin

npx wrangler d1 execute beech-db --local --command \
  "SELECT id, email, role, is_active FROM users;"
# -> the setup account, role 'admin', is_active 1
```

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

**Gate correctness**
- [ ] `permissionMiddleware()` is registered on `apiProtected` **after** `oauthScopeMiddleware()`, and on no other router.
- [ ] An `/api/*` path under `apiProtected` with no row in `PROTECTED_ROUTES` receives 403 `route_not_registered` — fail-closed, proven by test.
- [ ] The route-table completeness test passes: every route Hono mounts under `/api` (excluding `/api/v1/public`, `/api/custom`, `/api/webhooks`, `/api/media`) resolves to exactly one rule.
- [ ] `resolveRouteRule('GET', '/api/content/notifications')` and `'/api/content/drafts'` do **not** fall through to the `:slug` patterns.
- [ ] A caller scoped to seed X is refused (403) on seed Y and on `GLOBAL_SCOPE` routes.
- [ ] `hasPermission`/`buildEffectivePermissions` are consumed **unmodified** from `@beechcms/core`; the gate implements no evaluation logic of its own.

**Invariants**
- [ ] `PERMISSIONS` still contains exactly 7 entries; `manage_seeds` appears in neither `packages/core/src/rbac/permissions.ts` nor the `role_permissions` CHECK list.
- [ ] No route in `PROTECTED_ROUTES` maps a `/api/seeds/*` path or a `/api/schema/:slug/layout` path to an RBAC `permission` requirement — all are `legacy-admin`.
- [ ] `apps/api/src/middleware/permission.middleware.ts` imports nothing from `apps/api/src/features/`.
- [ ] `features/oauth/authorize.ts` reaches the resolver via `shared/rbac/`, not via another slice.
- [ ] `apps/api/migrations/` is byte-identical to `devs` — no new file, no edit (`git diff devs -- apps/api/migrations | wc -l` → 0).
- [ ] No file under `apps/dashboard/` is created or modified.
- [ ] No `apps/api/src/features/rbac/` directory exists.
- [ ] `users.role` column, `JwtClaims.role` and `requireAdmin()` are all still present and unmodified.
- [ ] No new CSPRNG, hashing or token helper; `generateOpaqueToken()` and `sha256hex()` untouched.
- [ ] Both RBAC repositories from sprint 1 are unmodified (`git diff devs -- apps/api/src/shared/db/repositories/d1-role*.ts | wc -l` → 0).

**Deactivation**
- [ ] `UserRecord.isActive` is populated by both `D1UserRepository` SELECTs.
- [ ] Login with `is_active = 0` returns 401 `INVALID_CREDENTIALS` — no distinct status oracle.
- [ ] Refresh with `is_active = 0` revokes the presented token and returns 401.
- [ ] An **already-issued, unexpired** access JWT for a deactivated account is refused 403 `account_disabled` on every `apiProtected` route, `GET /api/settings/me` included.
- [ ] An OAuth access token whose owner is deactivated is refused 401 by `authMiddleware`.

**Lockout**
- [ ] `POST /auth/setup` creates exactly one `user_role_assignments` row: the new account, the `SuperAdmin` role resolved **by name**, scope `'*'`.
- [ ] The role id is never hardcoded anywhere in `apps/api/src/` or the test helper.
- [ ] After a `db:reset` + setup + login, that account reaches every `/api/*` route the dashboard uses.
- [ ] Setup called twice does not produce a duplicate assignment.

**OAuth arbitration**
- [ ] `IRoleGuard.arbitrate()` takes `EffectivePermissions`; no implementation or call site passes a role string.
- [ ] `repositoryMiddleware` binds `PermissionRoleGuard`; `AllowAllRoleGuard` survives as an injectable test double.
- [ ] A caller without global `manage_users` gets `grantedScopes: []` and the full request in `deniedScopes`.
- [ ] Existing `features/oauth/*.test.ts` and `test/flow-oauth-*.test.ts` are green.

**Build**
- [ ] `pnpm --filter @beechcms/core run build` exits 0.
- [ ] `npx tsc --noEmit` in `apps/api` introduces **zero** new errors versus the `devs` baseline (confirm the baseline with `git stash`; it was 32 at the end of sprint 1).
- [ ] `npx tsc --noEmit` in `apps/dashboard` is unchanged.
- [ ] `pnpm beech test` fully green, including all 19 `seedTestUsers` suites.
- [ ] `pnpm lint` clean.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

**Deferred to `RbacUserRoleAdminApi` (roadmap 3/5) — do not build:**
- Any `apps/api/src/features/rbac/` slice: user CRUD, role CRUD, assignment CRUD, activate/deactivate endpoints. This sprint enforces permissions; it does not let anyone administer them. Assignments are created by exactly two things: `POST /auth/setup` and SQL.
- `canGrant()` wiring / anti-escalation enforcement. The function exists in core and stays unconsumed.
- The last-active-SuperAdmin guardrail. `countActiveGlobalAdmins()` stays unconsumed.
- **Dropping the legacy `users.role` column** (moved here from roadmap 2/5 by the VETO Audit). It stays authoritative for `/api/seeds/*` and `/api/schema/:slug/layout` until sprint 3 replaces those in-slice guards deliberately.
- The `is_system` guard gap in `D1RoleRepository.update()` flagged non-blocking by the sprint-1 review (`review_report.md` finding 1). It must be closed or explicitly documented **before** any route is wired to `update()` — which happens in sprint 3, not here.

**Deferred to `RbacInvitations` (roadmap 4/5):** the `invitations` table, invite issue/regenerate/redeem, `INotificationService` dispatch, activation-sets-credentials.

**Deferred to `RbacDashboardSurfaces` (roadmap 5/5):**
- Any dashboard file. Permission-derived navigation and section visibility.
- A permission payload on `GET /api/settings/me`. That route stays `authenticated` and its response shape is unchanged.
- **Scope-filtered projections**, which this sprint knowingly leaves coarse and which the executor must not try to fix here:
  - `GET /api/schema` returns the full seed list to any authenticated caller. Schema is metadata, not content; per-seed data isolation is unaffected.
  - `GET /api/content/drafts` and `GET /api/search` require `content:read` at `GLOBAL_SCOPE`, so a seed-scoped collaborator is refused rather than served a filtered list.
  - `/api/upload*` requires `content:*` at `GLOBAL_SCOPE`: R2 media is not seed-partitioned, so a seed-scoped collaborator cannot upload.
  - `/api/automations*` and `/api/dashboard-layout` writes are likewise global-only.

**Never, in any sprint:** a `manage_seeds` permission, or any RBAC permission that reaches seed-schema
mutation. `/api/seeds/*` stays on the developer axis.

**Also out of scope here:** new migrations of any kind; changes to the public API
(`/api/v1/public/*`), webhooks, `/api/media/:key` or `/api/custom/*`; row-level data filtering
(isolation is per-seed by design, brief §5); any change to `generateOpaqueToken`, `sha256hex`,
`IHashProvider`, `IIdGenerator` or the rate limiters.
