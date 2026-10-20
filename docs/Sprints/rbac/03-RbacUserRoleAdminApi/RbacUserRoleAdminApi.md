# Sprint Plan — RbacUserRoleAdminApi (roadmap 3/5)

Feature brief: `stages/00_ideation/output/feature_brief.md`
Roadmap: `stages/01_sprint_planning/output/backlog/ROADMAP.md`
Predecessors (shipped): `docs/Sprints/RbacCorePrimitives/`, `docs/Sprints/RbacRequestEnforcement/`

---

### Pre-Computation Analysis

**a) God Nodes identified via the CLI** (`graphify update . --force` re-run first: 12088 nodes,
21250 edges, 995 communities — the graph shipped in the repo predated sprint 2 and did not
contain `permissionMiddleware`; it does now).

| Node | Degree / blast radius | Why it matters here |
|---|---|---|
| `createBeechApp()` (`apps/api/src/factory.ts:106`) | degree **46**, imported by `src/index.ts` + ~40 test files | The single composition root. Mounting the new slice touches it; every authenticated suite re-runs through it. |
| `permissionMiddleware()` (`apps/api/src/middleware/permission.middleware.ts`) | `graphify affected "permissionMiddleware" --depth 2` → `createBeechApp()` [calls] `factory.ts:235`, plus 15+ test entrypoints via the factory | The only authorization gate. A new `RouteRequirement` kind lands here, so its route table and its refusal ladder are the blast surface. |
| `D1RoleRepository` (`d1-role.repository.ts:28`) | degree **13**; consumers: `repository.middleware.ts:33`, two repository specs | Widening `update()` to return `boolean` changes the `IRoleRepository` contract — exactly one production implementation, one binding site. |
| `seedTestUsers()` (`test/helpers/seed-fixtures.ts`) | single choke point for all authenticated suites (established sprint 2) | Scoped, non-SuperAdmin test accounts must be built through it (`grantSuperAdmin: false` + hand-built assignments), never through a second seeding path. |
| `@beechcms/core` barrel `packages/core/src/index.ts:42-44` | re-exports all of `rbac/{permissions,types,evaluate}` | Two new pure evaluator functions become public API automatically; no barrel edit needed. |

**b) Architectural boundaries affected**

| Tier | Touched? | What exactly |
|---|---|---|
| `@beechcms/core` | **Yes — contracts + pure logic only** | `rbac/evaluate.ts`: 2 new pure functions (`permissionsHeldAnywhere`, `hasPermissionAnywhere`). `rbac/types.ts`: `IRoleRepository.update()` → `Promise<boolean>`; 5 new `IRoleAssignmentRepository` methods. `auth/user.repository.ts`: `AccountSummary` + `listAccounts()` + `setActive()`. Zero runtime dependencies added, zero D1 in core. |
| `apps/api` — `shared/db/repositories/` | **Yes** | `d1-role.repository.ts` (is_system guard extended to the permission statements — closes the sprint-1 review finding), `d1-role-assignment.repository.ts`, `d1-user.repository.ts`. System tables: no Branch, no `apiToDb`/`dbToApi`, no `BaseD1Repository`. |
| `apps/api` — `middleware/` | **Yes** | `permission.middleware.ts`: one new `RouteRequirement` kind (`permission-any-scope`) + 11 new `PROTECTED_ROUTES` rows for `/api/rbac/*`. |
| `apps/api` — `features/rbac/` | **Yes — new VSA slice** | `index.ts`, `constants.ts`, `rbac.schema.ts`, `guards.ts`, `users.ts`, `roles.ts`, `assignments.ts` + specs. |
| `apps/api` — `factory.ts` | **Yes — one line** | `apiProtected.route('/rbac', rbacApp)`. |
| `apps/api/migrations/` | **No** | Every table and column this sprint needs already exists in `0000_v040_base.sql` (§20, verified by reading the file). No DDL, no reset required for the feature itself. |
| `apps/dashboard` | **No** | Sprint 5 owns every UI surface. Zero files touched. |
| `packages/client`, `packages/mcp` | **No** | The RBAC admin API is dashboard-only; it is not OAuth-reachable (see VETO audit §4). |

**c) `graphify affected` impact analysis — proof of breaking-change check**

```
$ graphify affected "canGrant" --depth 2
- evaluate.test.ts [imports] packages/core/src/rbac/evaluate.test.ts:L7
  → canGrant() has ZERO production call sites today. This sprint is its first consumer;
    wiring it cannot regress anything.

$ graphify affected "permissionMiddleware" --depth 2
- createBeechApp() [calls] apps/api/src/factory.ts:L235
- src/factory.ts [imports] apps/api/src/factory.ts:L18
- permission.middleware.test.ts [imports] .../permission.middleware.test.ts:L6
- (+ ~15 test files, all reaching it transitively through createBeechApp)
  → the new requirement kind is additive: no existing PROTECTED_ROUTES row changes,
    so every currently-passing route keeps its exact verdict.

$ graphify affected "requireAdmin" --depth 2
- seeds.handler.ts [imports] apps/api/src/features/seeds/seeds.handler.ts:L22
- seeds/index.ts  [re_exports] apps/api/src/features/seeds/index.ts:L5
- seeds.test.ts   [imports_from] apps/api/src/features/seeds/seeds.test.ts:L8
$ graphify affected "requireLayoutEditPermission" --depth 2
- (none — file-local to schema.handler.ts)
  → the developer axis has exactly 2 consumers. See VETO audit §5: this sprint does NOT
    touch them, and the roadmap is amended accordingly.

$ graphify explain "D1RoleRepository"      → degree 13, single production consumer
    (repository.middleware.ts:L33). Widening update()'s return type breaks nothing else.

$ grep -rln "IUserRepository|IRoleRepository|IRoleAssignmentRepository" apps packages --include=*.ts
    → apps/api/src/types.ts, repository.middleware.ts, the three D1 repositories,
      packages/core sources. EXACTLY ONE implementation per interface: no test double
      implements them structurally, so widening the interfaces cannot orphan a fake.
```

**Verified facts the plan depends on (read directly, not guessed):**
- `PERMISSIONS` is 7 entries; `manage_seeds` absent from the enum AND from the
  `role_permissions` CHECK in `0000_v040_base.sql:479-490`.
- `getSeed(slug)` resolves against the registry hydrated from `ISeedRepository.listActive()`
  (`seed-registry.middleware.ts:18` → `seed.repository.d1.ts:20`, `WHERE status = 'active'`),
  i.e. **exactly the same predicate as the assignment decay filter** in
  `d1-role-assignment.repository.ts:41-54`. Scope validation and scope decay therefore agree by
  construction.
- `oauthScopeMiddleware()` is fail-closed for OAuth tokens: `resolveRequiredScope()` returns
  `null` for anything outside `OAUTH_SCOPE_ROUTES` (5 entries, all `/api/seeds|schema`) and the
  middleware refuses with 403 `insufficient_scope`. New `/api/rbac/*` routes are therefore
  unreachable with an OAuth access token **without adding a single line**.
- `sessionRepository.revokeAllForUser(userId, nowTimestamp)` expects **seconds**
  (`password-reset/reset.ts:72` uses `Math.floor(Date.now()/1000)`) → use `clock.nowSeconds()`.
- `zod ^4.4.3` is already a dependency of `apps/api`; slices validate with a co-located
  `*.schema.ts` (`features/automations/api/automations.schema.ts` precedent).
- Error responses on protected slices are RFC 7807 via `publicProblem(context, {...})`.

---

### VETO Audit

Evaluated against `_config/ponytail_arch.md`.

**1. Botanical invariant (no D1 bypassing `@beechcms/core`).** RESPECTED. `roles`,
`role_permissions`, `user_role_assignments` and `users` are **system tables**, exactly like
`oauth_clients` and `refresh_tokens`: they carry no Branch, no `br_XX` field ids, and no Seed
definition. `apiToDb`/`dbToApi` are content-tier translators and are correctly not involved —
the precedent was set and reviewed in sprint 1. Every SQL statement this sprint writes lives in a
`shared/db/repositories/D1*` adapter behind an interface **declared in `@beechcms/core`**; no
handler in `features/rbac/` touches `c.env.DB`. Zero hardcoded content field names.

**2. VSA enforcement (no cross-feature imports).** RESPECTED, with one deliberate rule:
- `features/rbac/*` imports from `@beechcms/core`, `../../types`, `../../public/problem-details`
  and `../../shared/rbac/effective-permissions` only. It imports **nothing** from
  `features/oauth/`, `features/seeds/`, `features/settings/` or any other slice.
- The authority resolver stays in `shared/rbac/` (where sprint 2 put it precisely so two slices
  could reach it without importing each other). `features/rbac/` is its second consumer — which
  validates that placement rather than straining it.
- Scope validation uses the `getSeed` **context variable**, not `features/seeds/seeds.helpers.ts`.
  A slice-to-slice import to reach seed metadata would be the obvious VSA violation here and is
  explicitly forbidden by SECTION 7.
- `permission.middleware.ts` keeps importing nothing from `features/` (sprint-2 invariant,
  re-asserted as an acceptance criterion).

**3. Cloudflare purity.** RESPECTED. No ORM, no background job, no stateful process. All writes
are `D1PreparedStatement` / `db.batch()`. No schema mutation at runtime: **this sprint adds zero
DDL** — the tables already exist. The permission vocabulary stays closed at rest via the existing
CHECK constraint; nothing this sprint writes can introduce a permission string outside the enum
(zod validates against `PERMISSIONS`, D1 rejects the rest).

**4. `manage_seeds` must never exist (brief §2) — the hardest invariant.** RESPECTED, three ways:
- The enum is untouched (7 entries, asserted by test).
- The new routes are gated on `manage_users` / `manage_roles` only.
- Accounts created through `POST /api/rbac/users` are minted with `users.role = 'editor'`,
  **never `'admin'`** — so no dashboard path, at any privilege level, can produce an account that
  clears `requireAdmin()` and reaches `/api/seeds/*`. The only producer of `role = 'admin'` stays
  `POST /auth/setup`, which runs exactly once per database. This is a strictly stronger guarantee
  than the brief asks for, and it costs one hardcoded literal.

**5. VETO RAISED AND RESOLVED — dropping `users.role` in this sprint.** The roadmap's row 3
inherits "dropping the legacy `users.role` column (and with it `requireAdmin()` /
`requireLayoutEditPermission()`)" from sprint 2. **Vetoed as scope creep and as an
architectural contradiction**, on this evidence:
- The roadmap's own *"The developer axis"* section (written in sprint 2's VETO audit and declared
  binding) keeps `users.role` alive **as the developer/owner axis, orthogonal to RBAC**, because
  `/api/seeds/*` and `/api/schema/:slug/layout` must never be gated by an RBAC permission. Dropping
  the column would leave those routes with **no gate at all** beyond `authenticated` — a privilege
  hole opened by a cleanup task.
- `users.role` is not local: it is on `JwtClaims`, on `UserRecord`, in `POST /auth/setup`, in
  `countAdmins()` (`flow-stats`), in the `users` CHECK constraint, in `seedTestUsers()`, in demo
  data, and in the dashboard. Bundling that refactor with the anti-escalation admin API makes both
  diffs unreviewable — the exact failure the roadmap's ordering rationale exists to prevent.
- Nothing in this sprint needs the column gone. `manage_users` and `users.role` do not overlap:
  one governs accounts, the other governs schema.
**Resolution:** `users.role` is **retained as the developer/owner axis**, `requireAdmin()` and
`requireLayoutEditPermission()` are untouched, and `ROADMAP.md` is amended in the same commit to
record the decision (row 3 loses the inheritance; the developer-axis section states the column is
now permanent, not deprecated). Recorded in SECTION 7.

**6. YAGNI trims applied before drafting** (each was in the roadmap's "users CRUD" wording or an
obvious extension, each is cut):
- **No account hard-delete.** Brief §4: "La disattivazione di un account è reversibile […] non è
  richiesta una distinzione con l'eliminazione definitiva per la prima iterazione."
- **No profile-edit-by-admin endpoint.** `PUT /api/settings/profile` is self-service and already
  exists; an admin-edits-someone-else's-name endpoint has no user story behind it.
- **No audit logging of RBAC actions.** `ActivityLogEntry.entityType` is
  `'content' | 'media' | 'seed'`; adding `'user' | 'role'` widens a core contract and every log
  consumer for a capability no user story requests. Deliberately deferred.
- **No `/api/settings/me` permission payload.** Roadmap assigns it to sprint 5, with the UI that
  consumes it.
- **No invitation anything.** Sprint 4 owns tokens, email and activation. This sprint creates
  accounts with an admin-set password, which is what makes an invite a *deferred* assignment
  rather than a new mechanism.

**Verdict: no invariant violated. Plan proceeds as drafted below.**
HANDOFF -> caveman_coder

---

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Sprint 2 turned the evaluator into a gate. That gate reads a table
(`user_role_assignments`) which, today, exactly one code path in the entire product can write:
`POST /auth/setup`, once per database, granting `SuperAdmin` at `'*'`. Every other account the
system can produce holds nothing and is refused everywhere. **The RBAC feature is currently
write-only for one row and read-only forever after.** This sprint is the administration surface
that makes the authority model operable: create accounts, compose roles, assign (user, role, scope)
triples, deactivate accounts — all of it under the two rules the brief refuses to compromise on
(anti-escalation, last-SuperAdmin guardrail).

It must exist *before* invitations (sprint 4) because an invitation is a **deferred assignment**:
it pre-binds a role+scope that must already be creatable and grantable by an endpoint, or the
invite has nothing to defer. It must exist *before* the dashboard (sprint 5) because the UI is a
projection of an API contract that does not yet exist.

**Vertical Slice Architecture.** All new behaviour lands in one new slice,
`apps/api/src/features/rbac/`, owning its router, its zod schemas, its frozen error map and its
handlers — the shape of `features/oauth/`. It imports no sibling slice. The two things it shares
with the rest of the API are reached through the two seams built for exactly that purpose: the
`@beechcms/core` repository interfaces (storage) and `shared/rbac/effective-permissions.ts` (the
caller's folded authority). Where a naive implementation would import `features/seeds/` to check
that a scope names a real seed, this plan uses the `getSeed` context variable instead.

**Botanical Engine invariants.** RBAC tables are system tables: no Branch, no `br_XX`, no
`apiToDb`/`dbToApi`, no `BaseD1Repository` (whose `getTableName` → `content_{slug}` contract is
content-tier by definition). Not one line of SQL is written outside a `D1*Repository` adapter that
implements a core-declared interface, so the "no D1 bypasses core" rule holds in the strong form:
handlers cannot even see `c.env.DB`.

**Why the closed vocabulary survives this sprint.** The single most dangerous thing an admin API
can do is let authority be minted at runtime. Three independent layers prevent it: zod validates
every submitted permission against `PERMISSIONS`; the D1 CHECK constraint rejects anything else at
rest; and `canGrant()` refuses any grant exceeding what the actor already holds — including,
structurally, any attempt by a seed-scoped actor to mint a `'*'` assignment.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Middleware registration order on `apiProtected`** (`factory.ts:226-250`, unchanged by this
sprint):

```
app.use('*', repositoryMiddleware(...))      // 1. binds every repository incl. roleRepository,
                                             //    roleAssignmentRepository, PermissionRoleGuard
app.use('*', seedRegistryMiddleware())       // 2. hydrates seedRegistry + getSeed (active seeds only)
app.use('*', storageMiddleware(...))         // 3.
app.use('*', queueMiddleware(...))           //    …
app.use('*', authProvidersMiddleware())
app.use('*', rateLimiterMiddleware(...))
app.use('*', observabilityMiddleware())
app.use('*', cors(...)) / security headers
  ── apiProtected ──
apiProtected.use('*', authMiddleware({ acceptOAuth: true }))   // sets jwtPayload, oauthGrant
apiProtected.use('*', oauthScopeMiddleware())                  // fail-closed for OAuth tokens
apiProtected.use('*', permissionMiddleware())                  // fail-closed RBAC gate
apiProtected.route('/settings' | '/schema' | '/dashboard-layout' | '/seeds' |
                   '/content' ×6 | '/widget' | '/automations' | '/search' | '/')
app.route('/api', apiProtected)
```

**`Variables` already available to a handler** (`apps/api/src/types.ts:138-245`) — nothing new is
added to it this sprint: `jwtPayload`, `userRepository`, `sessionRepository`, `hashProvider`,
`idGenerator`, `clock`, `getSeed`, `roleRepository`, `roleAssignmentRepository`,
`effectivePermissions?` (memoized by `resolveEffectivePermissions`).

**RBAC storage as it stands** (`0000_v040_base.sql` §20 — read, not guessed):
`roles(id, name UNIQUE, description, is_system, created_at, updated_at)`;
`role_permissions(role_id → roles ON DELETE CASCADE, permission CHECK IN (7 values), PK(role_id, permission))`;
`user_role_assignments(id, user_id → users ON DELETE CASCADE, role_id → roles ON DELETE CASCADE,
scope, created_at, UNIQUE(user_id, role_id, scope))` + 3 indexes;
one seeded `is_system = 1` role named `SuperAdmin` holding all 7 permissions, its id minted
per-database (**resolve by name, never hardcode**).
`users` carries `role TEXT CHECK (role IN ('admin','editor'))`, `is_active INTEGER DEFAULT 1`,
`created_at`.

**Existing evaluator surface** (`packages/core/src/rbac/evaluate.ts`):
`buildEffectivePermissions`, `permissionsForScope`, `hasPermission`, `canGrant` — the last with
**zero production call sites** (`graphify affected`), waiting for this sprint.

**Existing gate surface** (`permission.middleware.ts`): `PROTECTED_ROUTES` (52 rows, first-match-
wins, order-significant), `resolveRouteRule()`, `PERMISSION_ERRORS`
(`forbidden` / `account_disabled` / `route_not_registered`), and a completeness test that walks
`app.routes` and fails if any mounted `/api/*` route resolves to `null`. **Adding a route without
adding a row is a test failure, by design.**

**Known gaps this sprint inherits and must close:**
1. `D1RoleRepository.update()` guards `is_system` on the `UPDATE roles` statement but **not** on
   the `DELETE FROM role_permissions` + reinsert in the same batch (sprint-1 review finding #1).
   Harmless while unwired; this sprint wires it, so the gap must close first.
2. No production caller exists for `canGrant()`, `countActiveGlobalAdmins()` or
   `listByRole()` — they were built for this sprint.

**Not in current state (verified absent):** `apps/api/src/features/rbac/` does not exist; no
endpoint anywhere lists, creates, or deactivates an account; `grep -rn "/users"` over
`apps/api/src` returns no route registration.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

**`packages/core` — contracts and pure logic only, zero runtime dependencies added**
1. `packages/core/src/rbac/evaluate.ts` — MODIFIED: `+permissionsHeldAnywhere()`,
   `+hasPermissionAnywhere()`.
2. `packages/core/src/rbac/evaluate.test.ts` — MODIFIED: cases for both.
3. `packages/core/src/rbac/types.ts` — MODIFIED: `IRoleRepository.update()` → `Promise<boolean>`;
   `IRoleAssignmentRepository` gains `findById`, `listAll`, `listAllForUser`,
   `countActiveGlobalAdminsExcludingUser`, `countActiveGlobalAdminsExcludingRole`.
4. `packages/core/src/auth/user.repository.ts` — MODIFIED: `+AccountSummary`,
   `IUserRepository.listAccounts()`, `IUserRepository.setActive()`.
   *(No `packages/core/src/index.ts` edit: `rbac/*` and `auth/*` are already `export *`-ed.)*

**`apps/api` — storage adapters**
5. `apps/api/src/shared/db/repositories/d1-role.repository.ts` — MODIFIED: `update()` returns
   `boolean` and guards `is_system` across **all** statements in the batch.
6. `apps/api/src/shared/db/repositories/d1-role-assignment.repository.ts` — MODIFIED: 5 new methods.
7. `apps/api/src/shared/db/repositories/d1-user.repository.ts` — MODIFIED: `listAccounts()`,
   `setActive()`.
8. `.../d1-role.repository.test.ts`, `.../d1-role-assignment.repository.test.ts`,
   `.../d1-user.repository.test.ts` — MODIFIED: real-D1 coverage for each new method.

**`apps/api` — gate**
9. `apps/api/src/middleware/permission.middleware.ts` — MODIFIED: `permission-any-scope`
   requirement kind + 11 `/api/rbac/*` rows.
10. `apps/api/src/middleware/permission.middleware.test.ts` — MODIFIED: the new kind's pass/refuse
    paths.

**`apps/api` — the new slice (all NEW files)**
11. `apps/api/src/features/rbac/constants.ts` — frozen `RBAC_ERRORS` map.
12. `apps/api/src/features/rbac/rbac.schema.ts` — zod bodies.
13. `apps/api/src/features/rbac/guards.ts` — `canAdministerAccount()`, `holdsAll()`,
    `problemFor()` helpers.
14. `apps/api/src/features/rbac/users.ts` — list / create / get / set-active handlers.
15. `apps/api/src/features/rbac/roles.ts` — list / create / update / delete handlers.
16. `apps/api/src/features/rbac/assignments.ts` — create / delete / list-for-user handlers.
17. `apps/api/src/features/rbac/index.ts` — `rbacApp` router.
18. `apps/api/src/features/rbac/users.test.ts`, `roles.test.ts`, `assignments.test.ts`.

**`apps/api` — wiring and flow coverage**
19. `apps/api/src/factory.ts` — MODIFIED: one import + `apiProtected.route('/rbac', rbacApp)`.
20. `apps/api/test/flow-rbac-admin.test.ts` — NEW: end-to-end lifecycle.

**Documentation**
21. `stages/01_sprint_planning/output/backlog/ROADMAP.md` — MODIFIED: row 3 marked PLANNED, the
    `users.role` inheritance removed per VETO audit §5, developer-axis section updated.

**Explicitly NOT produced:** no migration file and no edit to `0000_v040_base.sql`; no file under
`apps/dashboard/`; no invitation code; no change to `users.role`, `JwtClaims.role`,
`requireAdmin()`, `requireLayoutEditPermission()`, `AllowAllRoleGuard`, `PermissionRoleGuard`, or
`OAUTH_SCOPE_ROUTES`.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### 4.0 — D1 schema

**None. This sprint writes zero DDL.** `roles`, `role_permissions`, `user_role_assignments`,
`users.is_active` and `users.created_at` all already exist in `0000_v040_base.sql` §20 / §1, and
the `SuperAdmin` seed row is already inserted there. `pnpm beech db:reset` is therefore not
required to *land* this sprint — it is required only because the executor's local DB may predate
sprint 1 (see SECTION 5).

### 4.1 — `packages/core/src/rbac/evaluate.ts` (append)

```ts
/**
 * Every permission the actor holds at ANY scope — global or seed-scoped — folded into
 * one set.
 *
 * This is deliberately NOT an authorization primitive: it answers "could this actor
 * ever grant X somewhere", not "may this actor do X here". Only {@link hasPermission}
 * and {@link canGrant} answer the latter, and every route-level decision must keep
 * using them.
 */
export function permissionsHeldAnywhere(effective: EffectivePermissions): ReadonlySet<Permission> {
  const held = new Set<Permission>(effective.global)
  for (const bucket of effective.byScope.values()) {
    for (const permission of bucket) held.add(permission)
  }
  return held
}

/**
 * Whether the actor holds `permission` on at least one scope.
 *
 * Backs the coarse route gate for administration endpoints whose scope is not in the
 * URL: the gate keeps out callers with no administrative authority at all, and the
 * slice then makes the exact per-scope decision with {@link hasPermission} /
 * {@link canGrant}. Never use it as the final authorization check.
 */
export function hasPermissionAnywhere(
  effective: EffectivePermissions,
  permission: Permission,
): boolean {
  if (effective.global.has(permission)) return true
  for (const bucket of effective.byScope.values()) {
    if (bucket.has(permission)) return true
  }
  return false
}
```

Tests to add in `evaluate.test.ts`: (a) `hasPermissionAnywhere` true for a seed-scoped-only holder
and false for a permission held nowhere; (b) `permissionsHeldAnywhere` unions global + every
bucket and de-duplicates; (c) an actor with only `content:read` on `blog` returns `false` for
`manage_users`.

### 4.2 — `packages/core/src/rbac/types.ts` (modify)

```ts
export interface IRoleRepository {
  findById(roleId: string): Promise<RoleRecord | null>
  findByIds(roleIds: readonly string[]): Promise<RoleRecord[]>
  listAll(): Promise<RoleRecord[]>
  create(input: NewRoleInput): Promise<string>

  /**
   * Replaces a role's name, description and full permission set atomically.
   *
   * Returns false — changing NOTHING, permissions included — when the role does not
   * exist or is a system role. System roles are seeded by migration and are immutable
   * in both halves of the write, which is the guarantee callers rely on to keep
   * `SuperAdmin` intact.
   */
  update(roleId: string, input: NewRoleInput): Promise<boolean>

  delete(roleId: string): Promise<boolean>
}

export interface IRoleAssignmentRepository {
  listActiveForUser(userId: string): Promise<PermissionAssignment[]>
  listByRole(roleId: string): Promise<PermissionAssignment[]>
  create(input: NewAssignmentInput): Promise<string>
  delete(assignmentId: string): Promise<boolean>
  countActiveGlobalAdmins(): Promise<number>

  /** One assignment by id, decay filter NOT applied. Null when absent. */
  findById(assignmentId: string): Promise<PermissionAssignment | null>

  /**
   * Every assignment in the system, decay filter NOT applied.
   *
   * Exists so the account-list endpoint can resolve each account's scopes in ONE round
   * trip instead of one query per account. Administration tables are small by nature;
   * content never flows through here.
   */
  listAll(): Promise<PermissionAssignment[]>

  /**
   * Every assignment of one user, decay filter NOT applied — administration screens must
   * see (and be able to remove) a row whose seed is currently deleted, which
   * {@link listActiveForUser} deliberately hides.
   */
  listAllForUser(userId: string): Promise<PermissionAssignment[]>

  /**
   * {@link countActiveGlobalAdmins} ignoring one user. `0` means that user is the last
   * account able to administer the platform, and any operation revoking their authority
   * must be refused.
   */
  countActiveGlobalAdminsExcludingUser(userId: string): Promise<number>

  /**
   * {@link countActiveGlobalAdmins} ignoring every assignment that goes through one role.
   * `0` means mutating that role would strip the platform of its last administrator.
   */
  countActiveGlobalAdminsExcludingRole(roleId: string): Promise<number>
}
```

### 4.3 — `packages/core/src/auth/user.repository.ts` (modify)

```ts
/**
 * Administrative projection of an account. Deliberately carries NO `passwordHash`:
 * account listings must never put credential material on the wire.
 */
export interface AccountSummary {
  id: string
  email: string
  name: string | null
  surname: string | null
  /** Developer/owner axis (`'admin' | 'editor'`), orthogonal to RBAC permissions. */
  role: string
  isActive: boolean
  createdAt: number
}
```

Added to `IUserRepository`:

```ts
  /** Every account, oldest first, without credential material. */
  listAccounts(): Promise<AccountSummary[]>

  /**
   * Flips `users.is_active`. Returns false when the user does not exist.
   * Reversible by design (brief §4): rows, assignments and tokens are all preserved.
   */
  setActive(userId: string, isActive: boolean): Promise<boolean>
```

### 4.4 — `apps/api/src/shared/db/repositories/d1-role.repository.ts` (modify)

Replace `update()` in full (closes sprint-1 review finding #1):

```ts
  async update(roleId: string, input: NewRoleInput): Promise<boolean> {
    // The is_system guard must cover the permission statements too, not just the row
    // update: replacing SuperAdmin's permission set while leaving its name intact would
    // be a silent authority change. `is_system` is written only by the migration, so
    // reading it first cannot race with any runtime write.
    const row = await this.db
      .prepare(`SELECT is_system FROM roles WHERE id = ? LIMIT 1`)
      .bind(roleId)
      .first<{ is_system: number }>()

    if (!row || row.is_system === 1) return false

    await this.db.batch([
      this.db
        .prepare(
          `UPDATE roles SET name = ?, description = ?, updated_at = unixepoch()
           WHERE id = ? AND is_system = 0`
        )
        .bind(input.name, input.description, roleId),
      this.db.prepare(`DELETE FROM role_permissions WHERE role_id = ?`).bind(roleId),
      ...this.permissionInserts(roleId, input.permissions),
    ])
    return true
  }
```

### 4.5 — `apps/api/src/shared/db/repositories/d1-role-assignment.repository.ts` (append)

```ts
  async findById(assignmentId: string): Promise<PermissionAssignment | null> {
    const row = await this.db
      .prepare(`SELECT id, user_id, role_id, scope FROM user_role_assignments WHERE id = ? LIMIT 1`)
      .bind(assignmentId)
      .first<AssignmentRow>()
    return row ? rowToRecord(row) : null
  }

  async listAll(): Promise<PermissionAssignment[]> {
    const rows = await this.db
      .prepare(`SELECT id, user_id, role_id, scope FROM user_role_assignments`)
      .all<AssignmentRow>()
    return (rows.results ?? []).map(rowToRecord)
  }

  async listAllForUser(userId: string): Promise<PermissionAssignment[]> {
    const rows = await this.db
      .prepare(`SELECT id, user_id, role_id, scope FROM user_role_assignments WHERE user_id = ?`)
      .bind(userId)
      .all<AssignmentRow>()
    return (rows.results ?? []).map(rowToRecord)
  }

  async countActiveGlobalAdminsExcludingUser(userId: string): Promise<number> {
    const row = await this.db
      .prepare(
        `SELECT COUNT(DISTINCT a.user_id) AS total
         FROM user_role_assignments a
         JOIN role_permissions rp ON rp.role_id = a.role_id
         JOIN users u ON u.id = a.user_id
         WHERE a.scope = ? AND rp.permission = 'manage_users'
           AND u.is_active = 1 AND a.user_id != ?`
      )
      .bind(GLOBAL_SCOPE, userId)
      .first<{ total: number }>()
    return row?.total ?? 0
  }

  async countActiveGlobalAdminsExcludingRole(roleId: string): Promise<number> {
    const row = await this.db
      .prepare(
        `SELECT COUNT(DISTINCT a.user_id) AS total
         FROM user_role_assignments a
         JOIN role_permissions rp ON rp.role_id = a.role_id
         JOIN users u ON u.id = a.user_id
         WHERE a.scope = ? AND rp.permission = 'manage_users'
           AND u.is_active = 1 AND a.role_id != ?`
      )
      .bind(GLOBAL_SCOPE, roleId)
      .first<{ total: number }>()
    return row?.total ?? 0
  }
```

### 4.6 — `apps/api/src/shared/db/repositories/d1-user.repository.ts` (append)

Add to `UserRow`-adjacent types and the class:

```ts
type AccountRow = {
  id: string
  email: string
  name: string | null
  surname: string | null
  role: string
  is_active: number
  created_at: number
}

  async listAccounts(): Promise<AccountSummary[]> {
    const rows = await this.db
      .prepare(
        `SELECT id, email, name, surname, role, is_active, created_at
         FROM users ORDER BY created_at ASC`
      )
      .all<AccountRow>()

    return (rows.results ?? []).map(row => ({
      id: row.id,
      email: row.email,
      name: row.name,
      surname: row.surname,
      role: row.role,
      isActive: row.is_active === 1,
      createdAt: row.created_at,
    }))
  }

  async setActive(userId: string, isActive: boolean): Promise<boolean> {
    const result = await this.db
      .prepare('UPDATE users SET is_active = ? WHERE id = ?')
      .bind(isActive ? 1 : 0, userId)
      .run()
    return (result.meta.changes ?? 0) > 0
  }
```

Import `AccountSummary` as a type from `@beechcms/core`.

### 4.7 — `apps/api/src/middleware/permission.middleware.ts` (modify)

Import change: `import { GLOBAL_SCOPE, hasPermission, hasPermissionAnywhere, type Permission } from '@beechcms/core'`.

```ts
/**
 * What a route demands.
 * - `{ permission, scope }`     — a real RBAC check.
 * - `{ permissions }` (any-scope) — a COARSE gate for administration endpoints whose
 *                                 scope is not in the URL: the caller must hold at
 *                                 least one listed permission on at least one scope.
 *                                 The slice behind it MUST still make the exact
 *                                 per-scope decision (`hasPermission` / `canGrant`).
 * - `'authenticated'`           — any active account; self-service and dashboard chrome.
 * - `'legacy-admin'`            — deferred to the slice's own `users.role === 'admin'`
 *                                 guard. The developer axis (brief §2).
 */
export type RouteRequirement =
  | { kind: 'permission'; permission: Permission; scope: ScopeSource }
  | { kind: 'permission-any-scope'; permissions: readonly Permission[] }
  | { kind: 'authenticated' }
  | { kind: 'legacy-admin' }

const anyScope = (...permissions: Permission[]): RouteRequirement =>
  ({ kind: 'permission-any-scope', permissions })
```

Append to `PROTECTED_ROUTES` (a new block; no existing row is edited or reordered):

```ts
  // --- RBAC administration: coarse gate here, exact scope decided inside the slice ---
  { method: 'GET',    pattern: /^\/api\/rbac\/users$/,                     requirement: anyScope('manage_users') },
  { method: 'POST',   pattern: /^\/api\/rbac\/users$/,                     requirement: anyScope('manage_users') },
  { method: 'GET',    pattern: /^\/api\/rbac\/users\/[^/]+\/assignments$/, requirement: anyScope('manage_users') },
  { method: 'PATCH',  pattern: /^\/api\/rbac\/users\/[^/]+\/active$/,      requirement: anyScope('manage_users') },
  { method: 'GET',    pattern: /^\/api\/rbac\/users\/[^/]+$/,              requirement: anyScope('manage_users') },
  { method: 'GET',    pattern: /^\/api\/rbac\/roles$/,                     requirement: anyScope('manage_users', 'manage_roles') },
  { method: 'POST',   pattern: /^\/api\/rbac\/roles$/,                     requirement: anyScope('manage_roles') },
  { method: 'PUT',    pattern: /^\/api\/rbac\/roles\/[^/]+$/,              requirement: anyScope('manage_roles') },
  { method: 'DELETE', pattern: /^\/api\/rbac\/roles\/[^/]+$/,              requirement: anyScope('manage_roles') },
  { method: 'POST',   pattern: /^\/api\/rbac\/assignments$/,               requirement: anyScope('manage_users') },
  { method: 'DELETE', pattern: /^\/api\/rbac\/assignments\/[^/]+$/,        requirement: anyScope('manage_users') },
```

`GET /api/rbac/roles` accepts `manage_users` as well: assigning a role requires seeing the role
list, and a scoped user-manager is not guaranteed to hold `manage_roles`.

New branch inside `permissionMiddleware()`, placed immediately before the existing
`kind === 'permission'` check:

```ts
    if (rule.requirement.kind === 'permission-any-scope') {
      const effective = await resolveEffectivePermissions(c)
      const permitted = rule.requirement.permissions.some(permission =>
        hasPermissionAnywhere(effective, permission),
      )
      if (!permitted) {
        return forbidden(
          PERMISSION_ERRORS.FORBIDDEN,
          `This endpoint requires one of '${rule.requirement.permissions.join("', '")}' on any scope.`,
        )
      }
      await next()
      return
    }
```

`resolveRouteRule()` needs no change: its `scope` computation already falls back to
`GLOBAL_SCOPE` for every requirement whose kind is not `'permission'` with `'capture1'`.

### 4.8 — `apps/api/src/features/rbac/constants.ts` (new)

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Frozen error-code map for the RBAC administration slice, following the
 * `auth/constants.ts` / `oauth/constants.ts` convention: one map per slice, codes never
 * renamed once shipped (the dashboard branches on them from sprint 5 on).
 */
export const RBAC_ERRORS = {
  /** Request body is not valid JSON. */
  INVALID_JSON: 'invalid-json',
  /** Body failed schema validation. */
  VALIDATION_FAILED: 'validation-failed',
  /** Target does not exist, or the caller may not see it (deliberately indistinguishable). */
  NOT_FOUND: 'not-found',
  /** The caller holds administrative authority, but not over this target. */
  FORBIDDEN: 'forbidden',
  /** The operation would hand out authority the caller does not itself hold. */
  ESCALATION_REFUSED: 'escalation-refused',
  /** Email already registered to another account. */
  EMAIL_TAKEN: 'email-taken',
  /** `roles.name` is UNIQUE and already used. */
  ROLE_NAME_TAKEN: 'role-name-taken',
  /** System roles are seeded by migration and immutable at runtime. */
  SYSTEM_ROLE_IMMUTABLE: 'system-role-immutable',
  /** Refused: would leave the platform with no active global administrator. */
  LAST_GLOBAL_ADMIN: 'last-global-admin',
  /** Scope is neither `'*'` nor the slug of an active seed. */
  UNKNOWN_SCOPE: 'unknown-scope',
} as const

export type RbacErrorCode = (typeof RBAC_ERRORS)[keyof typeof RBAC_ERRORS]
```

### 4.9 — `apps/api/src/features/rbac/rbac.schema.ts` (new)

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { z } from 'zod'
import { PERMISSIONS } from '@beechcms/core'

/** Same shape check `POST /auth/setup` applies; kept literal to avoid a shared-regex import. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** bcrypt silently truncates past 72 bytes, so the byte length is validated, not the char count. */
const passwordSchema = z
  .string()
  .min(8)
  .max(128)
  .refine(value => new TextEncoder().encode(value).length <= 72, {
    message: 'Password must not exceed 72 bytes when UTF-8 encoded.',
  })

/** The closed vocabulary, reused verbatim. A permission outside it cannot be parsed. */
export const permissionSchema = z.enum(PERMISSIONS)

export const createUserSchema = z.object({
  email: z.string().trim().max(254).regex(EMAIL_RE),
  password: passwordSchema,
  name: z.string().trim().max(120).nullish(),
  surname: z.string().trim().max(120).nullish(),
})

export const setActiveSchema = z.object({
  isActive: z.boolean(),
})

export const roleBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(400).nullish(),
  /** At least one permission: a role granting nothing is a footgun, not a use case. */
  permissions: z.array(permissionSchema).min(1),
})

export const createAssignmentSchema = z.object({
  userId: z.string().min(1),
  roleId: z.string().min(1),
  /** `'*'` or a seeds.slug; existence is checked against the live registry in the handler. */
  scope: z.string().trim().min(1),
})
```

### 4.10 — `apps/api/src/features/rbac/guards.ts` (new)

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { Context } from 'hono'
import type { EffectivePermissions, Permission, PermissionAssignment } from '@beechcms/core'
import { hasPermission, permissionsHeldAnywhere } from '@beechcms/core'
import { publicProblem } from '../../public/problem-details'
import type { Env, Variables } from '../../types'
import { RBAC_ERRORS, type RbacErrorCode } from './constants'

export type AppContext = Context<{ Bindings: Env; Variables: Variables }>

/** Single RFC 7807 emitter for the slice, so every refusal has the same shape. */
export function rbacProblem(
  context: AppContext,
  type: RbacErrorCode,
  status: 400 | 403 | 404 | 409 | 422,
  title: string,
  detail: string,
) {
  return publicProblem(context, { type, title, status, detail })
}

/**
 * May the actor administer this account?
 *
 * A global `manage_users` holder may administer anyone. A scoped holder may administer
 * an account only when they hold `manage_users` on EVERY scope that account is assigned
 * to — administration (deactivation above all) is total, so partial authority over a
 * target must never be enough. An account with no assignment at all is administrable
 * only by a global holder, which keeps zero-trust accounts out of a scoped manager's
 * reach until they are deliberately assigned into that scope.
 */
export function canAdministerAccount(
  actor: EffectivePermissions,
  targetAssignments: readonly PermissionAssignment[],
): boolean {
  if (actor.global.has('manage_users')) return true
  if (targetAssignments.length === 0) return false
  return targetAssignments.every(assignment =>
    hasPermission(actor, 'manage_users', assignment.scope),
  )
}

/**
 * Whether the actor personally holds every listed permission somewhere.
 *
 * Gates role AUTHORING (a role is a global object, so it has no scope of its own):
 * an actor may never mint or edit a role carrying authority they do not hold. The
 * scope-precise anti-escalation rule stays `canGrant()`, applied at assignment time.
 */
export function holdsAll(actor: EffectivePermissions, permissions: readonly Permission[]): boolean {
  const held = permissionsHeldAnywhere(actor)
  return permissions.every(permission => held.has(permission))
}

/** Reads a JSON body, returning `undefined` when it is unparseable. */
export async function readJson(context: AppContext): Promise<unknown | undefined> {
  try {
    return await context.req.json()
  } catch {
    return undefined
  }
}
```

### 4.11 — `apps/api/src/features/rbac/users.ts` (new)

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { AccountSummary, PermissionAssignment } from '@beechcms/core'
import { resolveEffectivePermissions } from '../../shared/rbac/effective-permissions'
import { RBAC_ERRORS } from './constants'
import { canAdministerAccount, rbacProblem, readJson, type AppContext } from './guards'
import { createUserSchema, setActiveSchema } from './rbac.schema'

/**
 * The developer/owner axis (`users.role`) is NOT grantable from the dashboard: every
 * account minted here is an `'editor'`, so no RBAC path can ever produce an account that
 * clears `requireAdmin()` and reaches `/api/seeds/*` (brief §2). `POST /auth/setup`
 * remains the only producer of `role = 'admin'`.
 */
const CREATED_ACCOUNT_ROLE = 'editor'

type AccountView = AccountSummary & { assignments: PermissionAssignment[] }

/**
 * GET /api/rbac/users
 * Accounts the caller may administer, each with its raw (non-decayed) assignments.
 * The caller's own account is always included.
 */
export const listUsersHandler = async (context: AppContext) => {
  const actor = await resolveEffectivePermissions(context)
  const actorId = context.get('jwtPayload')?.sub ?? ''

  const accounts = await context.get('userRepository').listAccounts()
  const allAssignments = await context.get('roleAssignmentRepository').listAll()

  const byUser = new Map<string, PermissionAssignment[]>()
  for (const assignment of allAssignments) {
    const bucket = byUser.get(assignment.userId)
    if (bucket) bucket.push(assignment)
    else byUser.set(assignment.userId, [assignment])
  }

  const users: AccountView[] = []
  for (const account of accounts) {
    const assignments = byUser.get(account.id) ?? []
    if (account.id !== actorId && !canAdministerAccount(actor, assignments)) continue
    users.push({ ...account, assignments })
  }

  return context.json({ users })
}

/**
 * POST /api/rbac/users
 * Creates a ZERO-TRUST account: no role, no scope, no visibility until assigned
 * (brief §2). Any `manage_users` holder may create one; only assignment is scope-gated.
 */
export const createUserHandler = async (context: AppContext) => {
  const body = await readJson(context)
  if (body === undefined) {
    return rbacProblem(context, RBAC_ERRORS.INVALID_JSON, 400, 'Bad Request', 'Request body is not valid JSON.')
  }

  const parsed = createUserSchema.safeParse(body)
  if (!parsed.success) {
    return rbacProblem(context, RBAC_ERRORS.VALIDATION_FAILED, 422, 'Unprocessable Entity', parsed.error.message)
  }

  const email = parsed.data.email.toLowerCase()
  const userRepository = context.get('userRepository')

  if (await userRepository.findByEmail(email)) {
    return rbacProblem(context, RBAC_ERRORS.EMAIL_TAKEN, 409, 'Conflict', 'An account with this email already exists.')
  }

  const id = context.get('idGenerator').uuid()
  const passwordHash = await context.get('hashProvider').hash(parsed.data.password)

  try {
    await userRepository.create({
      id,
      email,
      passwordHash,
      role: CREATED_ACCOUNT_ROLE,
      name: parsed.data.name ?? null,
      surname: parsed.data.surname ?? null,
    })
  } catch (error) {
    // Race backstop: two concurrent creates with the same email.
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      return rbacProblem(context, RBAC_ERRORS.EMAIL_TAKEN, 409, 'Conflict', 'An account with this email already exists.')
    }
    throw error
  }

  return context.json(
    {
      id,
      email,
      name: parsed.data.name ?? null,
      surname: parsed.data.surname ?? null,
      role: CREATED_ACCOUNT_ROLE,
      isActive: true,
      assignments: [],
    },
    201,
  )
}

/**
 * GET /api/rbac/users/:userId
 * 404 (never 403) when the caller may not administer the target: an authorization
 * refusal here would be an enumeration oracle for accounts outside the caller's scope.
 */
export const getUserHandler = async (context: AppContext) => {
  const userId = context.req.param('userId')
  const actor = await resolveEffectivePermissions(context)
  const actorId = context.get('jwtPayload')?.sub ?? ''

  const notFound = () =>
    rbacProblem(context, RBAC_ERRORS.NOT_FOUND, 404, 'Not Found', 'No such account.')

  if (!context.get('idGenerator').isValid(userId)) return notFound()

  const account = (await context.get('userRepository').listAccounts()).find(a => a.id === userId)
  if (!account) return notFound()

  const assignments = await context.get('roleAssignmentRepository').listAllForUser(userId)
  if (account.id !== actorId && !canAdministerAccount(actor, assignments)) return notFound()

  return context.json({ ...account, assignments })
}

/**
 * PATCH /api/rbac/users/:userId/active
 * Reversible deactivation. On deactivation every refresh token of the account is revoked
 * in the same request, so the session dies with the flag rather than at the next refresh;
 * `permissionMiddleware()` already refuses the still-unexpired access JWT with 403
 * `account_disabled`.
 */
export const setUserActiveHandler = async (context: AppContext) => {
  const userId = context.req.param('userId')
  const idGenerator = context.get('idGenerator')

  const notFound = () =>
    rbacProblem(context, RBAC_ERRORS.NOT_FOUND, 404, 'Not Found', 'No such account.')

  if (!idGenerator.isValid(userId)) return notFound()

  const body = await readJson(context)
  if (body === undefined) {
    return rbacProblem(context, RBAC_ERRORS.INVALID_JSON, 400, 'Bad Request', 'Request body is not valid JSON.')
  }
  const parsed = setActiveSchema.safeParse(body)
  if (!parsed.success) {
    return rbacProblem(context, RBAC_ERRORS.VALIDATION_FAILED, 422, 'Unprocessable Entity', parsed.error.message)
  }

  const userRepository = context.get('userRepository')
  const assignmentRepository = context.get('roleAssignmentRepository')

  const target = await userRepository.findById(userId)
  if (!target) return notFound()

  const assignments = await assignmentRepository.listAllForUser(userId)
  const actor = await resolveEffectivePermissions(context)
  if (!canAdministerAccount(actor, assignments)) return notFound()

  // LAST-ADMIN GUARDRAIL. `countActiveGlobalAdminsExcludingUser` counts OTHER accounts
  // that can still administer the platform. Zero means this account is the last one, and
  // the refusal applies to everyone — the holder included (brief §4: no self-revocation).
  if (!parsed.data.isActive) {
    const others = await assignmentRepository.countActiveGlobalAdminsExcludingUser(userId)
    if (others === 0) {
      const isGlobalAdmin = await holdsGlobalManageUsers(context, userId)
      if (isGlobalAdmin) {
        return rbacProblem(
          context,
          RBAC_ERRORS.LAST_GLOBAL_ADMIN,
          409,
          'Conflict',
          'This is the last active account able to administer the platform; it cannot be deactivated.',
        )
      }
    }
  }

  const changed = await userRepository.setActive(userId, parsed.data.isActive)
  if (!changed) return notFound()

  if (!parsed.data.isActive) {
    await context.get('sessionRepository').revokeAllForUser(userId, context.get('clock').nowSeconds())
  }

  return context.json({ id: userId, isActive: parsed.data.isActive })
}

/** Whether a user currently holds `manage_users` at `'*'` through any live assignment. */
async function holdsGlobalManageUsers(context: AppContext, userId: string): Promise<boolean> {
  const assignments = await context.get('roleAssignmentRepository').listActiveForUser(userId)
  const globalRoleIds = [...new Set(assignments.filter(a => a.scope === '*').map(a => a.roleId))]
  if (globalRoleIds.length === 0) return false
  const roles = await context.get('roleRepository').findByIds(globalRoleIds)
  return roles.some(role => role.permissions.includes('manage_users'))
}
```

*(Import `GLOBAL_SCOPE` from `@beechcms/core` and use it in place of the `'*'` literal in
`holdsGlobalManageUsers`; the literal above is shown only for readability.)*

### 4.12 — `apps/api/src/features/rbac/roles.ts` (new)

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { GLOBAL_SCOPE } from '@beechcms/core'
import { resolveEffectivePermissions } from '../../shared/rbac/effective-permissions'
import { RBAC_ERRORS } from './constants'
import { holdsAll, rbacProblem, readJson, type AppContext } from './guards'
import { roleBodySchema } from './rbac.schema'

/** GET /api/rbac/roles — the full catalogue, system roles included (they are assignable). */
export const listRolesHandler = async (context: AppContext) => {
  const roles = await context.get('roleRepository').listAll()
  return context.json({ roles })
}

/**
 * POST /api/rbac/roles
 * A role is a GLOBAL object with no scope of its own, so authoring is gated on what the
 * actor holds anywhere: nobody may mint a role carrying authority they lack. The
 * scope-precise rule stays `canGrant()` at assignment time — minting a role is never, by
 * itself, an escalation.
 */
export const createRoleHandler = async (context: AppContext) => {
  const body = await readJson(context)
  if (body === undefined) {
    return rbacProblem(context, RBAC_ERRORS.INVALID_JSON, 400, 'Bad Request', 'Request body is not valid JSON.')
  }
  const parsed = roleBodySchema.safeParse(body)
  if (!parsed.success) {
    return rbacProblem(context, RBAC_ERRORS.VALIDATION_FAILED, 422, 'Unprocessable Entity', parsed.error.message)
  }

  const actor = await resolveEffectivePermissions(context)
  if (!holdsAll(actor, parsed.data.permissions)) {
    return rbacProblem(
      context,
      RBAC_ERRORS.ESCALATION_REFUSED,
      403,
      'Forbidden',
      'A role may not carry a permission the caller does not hold.',
    )
  }

  const roleRepository = context.get('roleRepository')
  const existing = await roleRepository.listAll()
  if (existing.some(role => role.name === parsed.data.name)) {
    return rbacProblem(context, RBAC_ERRORS.ROLE_NAME_TAKEN, 409, 'Conflict', 'A role with this name already exists.')
  }

  try {
    const id = await roleRepository.create({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      permissions: parsed.data.permissions,
    })
    return context.json({ id }, 201)
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      return rbacProblem(context, RBAC_ERRORS.ROLE_NAME_TAKEN, 409, 'Conflict', 'A role with this name already exists.')
    }
    throw error
  }
}

/**
 * PUT /api/rbac/roles/:roleId
 * Replaces name, description and the whole permission set. The actor must hold every
 * permission in BOTH the current and the incoming set: editing a role more powerful than
 * yourself is escalation whichever direction it moves.
 */
export const updateRoleHandler = async (context: AppContext) => {
  const roleId = context.req.param('roleId')
  const roleRepository = context.get('roleRepository')

  const notFound = () => rbacProblem(context, RBAC_ERRORS.NOT_FOUND, 404, 'Not Found', 'No such role.')
  if (!context.get('idGenerator').isValid(roleId)) return notFound()

  const body = await readJson(context)
  if (body === undefined) {
    return rbacProblem(context, RBAC_ERRORS.INVALID_JSON, 400, 'Bad Request', 'Request body is not valid JSON.')
  }
  const parsed = roleBodySchema.safeParse(body)
  if (!parsed.success) {
    return rbacProblem(context, RBAC_ERRORS.VALIDATION_FAILED, 422, 'Unprocessable Entity', parsed.error.message)
  }

  const role = await roleRepository.findById(roleId)
  if (!role) return notFound()

  if (role.isSystem) {
    return rbacProblem(
      context,
      RBAC_ERRORS.SYSTEM_ROLE_IMMUTABLE,
      409,
      'Conflict',
      'System roles are provisioned by migration and cannot be modified.',
    )
  }

  const actor = await resolveEffectivePermissions(context)
  if (!holdsAll(actor, role.permissions) || !holdsAll(actor, parsed.data.permissions)) {
    return rbacProblem(
      context,
      RBAC_ERRORS.ESCALATION_REFUSED,
      403,
      'Forbidden',
      'A role may not be edited by a caller who does not hold all of its permissions.',
    )
  }

  const refusal = await refuseIfLastAdminRole(context, roleId, role.permissions, parsed.data.permissions)
  if (refusal) return refusal

  const updated = await roleRepository.update(roleId, {
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    permissions: parsed.data.permissions,
  })
  if (!updated) return notFound()

  return context.json({ id: roleId })
}

/** DELETE /api/rbac/roles/:roleId — cascades to role_permissions and every assignment (FK). */
export const deleteRoleHandler = async (context: AppContext) => {
  const roleId = context.req.param('roleId')
  const roleRepository = context.get('roleRepository')

  const notFound = () => rbacProblem(context, RBAC_ERRORS.NOT_FOUND, 404, 'Not Found', 'No such role.')
  if (!context.get('idGenerator').isValid(roleId)) return notFound()

  const role = await roleRepository.findById(roleId)
  if (!role) return notFound()

  if (role.isSystem) {
    return rbacProblem(
      context,
      RBAC_ERRORS.SYSTEM_ROLE_IMMUTABLE,
      409,
      'Conflict',
      'System roles are provisioned by migration and cannot be deleted.',
    )
  }

  const actor = await resolveEffectivePermissions(context)
  if (!holdsAll(actor, role.permissions)) {
    return rbacProblem(
      context,
      RBAC_ERRORS.ESCALATION_REFUSED,
      403,
      'Forbidden',
      'A role may not be deleted by a caller who does not hold all of its permissions.',
    )
  }

  const refusal = await refuseIfLastAdminRole(context, roleId, role.permissions, [])
  if (refusal) return refusal

  const deleted = await roleRepository.delete(roleId)
  if (!deleted) return notFound()

  return context.body(null, 204)
}

/**
 * LAST-ADMIN GUARDRAIL, role edition.
 *
 * Refuses a mutation that would strip `manage_users` from a role currently assigned at
 * `'*'` when no OTHER role still carries an active global administrator. Deletion passes
 * `nextPermissions: []`, which is the same question.
 */
async function refuseIfLastAdminRole(
  context: AppContext,
  roleId: string,
  currentPermissions: readonly string[],
  nextPermissions: readonly string[],
) {
  const losesManageUsers =
    currentPermissions.includes('manage_users') && !nextPermissions.includes('manage_users')
  if (!losesManageUsers) return null

  const assignmentRepository = context.get('roleAssignmentRepository')
  const globalAssignments = (await assignmentRepository.listByRole(roleId))
    .filter(assignment => assignment.scope === GLOBAL_SCOPE)
  if (globalAssignments.length === 0) return null

  const others = await assignmentRepository.countActiveGlobalAdminsExcludingRole(roleId)
  if (others > 0) return null

  return rbacProblem(
    context,
    RBAC_ERRORS.LAST_GLOBAL_ADMIN,
    409,
    'Conflict',
    'This role carries the last global administrator; it cannot lose `manage_users` or be deleted.',
  )
}
```

### 4.13 — `apps/api/src/features/rbac/assignments.ts` (new)

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { GLOBAL_SCOPE, canGrant, hasPermission } from '@beechcms/core'
import { resolveEffectivePermissions } from '../../shared/rbac/effective-permissions'
import { RBAC_ERRORS } from './constants'
import { canAdministerAccount, rbacProblem, readJson, type AppContext } from './guards'
import { createAssignmentSchema } from './rbac.schema'

/**
 * GET /api/rbac/users/:userId/assignments
 * Raw rows plus an `active` flag: an assignment naming a deleted seed still exists and
 * must remain visible and removable, even though it currently grants nothing.
 */
export const listAssignmentsHandler = async (context: AppContext) => {
  const userId = context.req.param('userId')
  const notFound = () => rbacProblem(context, RBAC_ERRORS.NOT_FOUND, 404, 'Not Found', 'No such account.')
  if (!context.get('idGenerator').isValid(userId)) return notFound()

  const assignmentRepository = context.get('roleAssignmentRepository')
  const all = await assignmentRepository.listAllForUser(userId)

  const actor = await resolveEffectivePermissions(context)
  const actorId = context.get('jwtPayload')?.sub ?? ''
  if (userId !== actorId && !canAdministerAccount(actor, all)) return notFound()

  const activeIds = new Set((await assignmentRepository.listActiveForUser(userId)).map(a => a.id))
  const roleIds = [...new Set(all.map(a => a.roleId))]
  const roles = await context.get('roleRepository').findByIds(roleIds)
  const roleById = new Map(roles.map(role => [role.id, role]))

  return context.json({
    assignments: all.map(assignment => ({
      ...assignment,
      active: activeIds.has(assignment.id),
      roleName: roleById.get(assignment.roleId)?.name ?? null,
      permissions: roleById.get(assignment.roleId)?.permissions ?? [],
    })),
  })
}

/**
 * POST /api/rbac/assignments
 * The anti-escalation choke point (brief §2, §4). TWO independent conditions:
 *   1. the actor holds `manage_users` ON THE TARGET SCOPE — `hasPermission` refuses a
 *      seed-scoped actor targeting `'*'` by construction;
 *   2. `canGrant()` — every permission the role carries is already held by the actor at
 *      that scope.
 * Idempotent: the repository's `INSERT OR IGNORE` + read-back returns the existing id.
 */
export const createAssignmentHandler = async (context: AppContext) => {
  const body = await readJson(context)
  if (body === undefined) {
    return rbacProblem(context, RBAC_ERRORS.INVALID_JSON, 400, 'Bad Request', 'Request body is not valid JSON.')
  }
  const parsed = createAssignmentSchema.safeParse(body)
  if (!parsed.success) {
    return rbacProblem(context, RBAC_ERRORS.VALIDATION_FAILED, 422, 'Unprocessable Entity', parsed.error.message)
  }

  const { userId, roleId, scope } = parsed.data
  const idGenerator = context.get('idGenerator')
  if (!idGenerator.isValid(userId) || !idGenerator.isValid(roleId)) {
    return rbacProblem(context, RBAC_ERRORS.VALIDATION_FAILED, 422, 'Unprocessable Entity', 'Malformed id.')
  }

  // A scope is `'*'` or the slug of an ACTIVE seed. `getSeed` reads the registry hydrated
  // from `listActive()`, i.e. the exact predicate the assignment decay filter uses.
  if (scope !== GLOBAL_SCOPE && context.get('getSeed')(scope) === null) {
    return rbacProblem(context, RBAC_ERRORS.UNKNOWN_SCOPE, 422, 'Unprocessable Entity', 'Scope is not an active seed slug.')
  }

  const target = await context.get('userRepository').findById(userId)
  if (!target) return rbacProblem(context, RBAC_ERRORS.NOT_FOUND, 404, 'Not Found', 'No such account.')

  const role = await context.get('roleRepository').findById(roleId)
  if (!role) return rbacProblem(context, RBAC_ERRORS.NOT_FOUND, 404, 'Not Found', 'No such role.')

  const actor = await resolveEffectivePermissions(context)
  if (!hasPermission(actor, 'manage_users', scope)) {
    return rbacProblem(
      context,
      RBAC_ERRORS.FORBIDDEN,
      403,
      'Forbidden',
      `Assigning on scope '${scope}' requires 'manage_users' on that scope.`,
    )
  }
  if (!canGrant(actor, scope, role.permissions)) {
    return rbacProblem(
      context,
      RBAC_ERRORS.ESCALATION_REFUSED,
      403,
      'Forbidden',
      'The role carries permissions the caller does not hold on this scope.',
    )
  }

  const id = await context.get('roleAssignmentRepository').create({ userId, roleId, scope })
  return context.json({ id, userId, roleId, scope }, 201)
}

/**
 * DELETE /api/rbac/assignments/:assignmentId
 * Authorized on the assignment's OWN scope, then guarded against removing the platform's
 * last global administrator.
 */
export const deleteAssignmentHandler = async (context: AppContext) => {
  const assignmentId = context.req.param('assignmentId')
  const assignmentRepository = context.get('roleAssignmentRepository')

  const notFound = () => rbacProblem(context, RBAC_ERRORS.NOT_FOUND, 404, 'Not Found', 'No such assignment.')
  if (!context.get('idGenerator').isValid(assignmentId)) return notFound()

  const assignment = await assignmentRepository.findById(assignmentId)
  if (!assignment) return notFound()

  const actor = await resolveEffectivePermissions(context)
  if (!hasPermission(actor, 'manage_users', assignment.scope)) return notFound()

  if (assignment.scope === GLOBAL_SCOPE) {
    const role = await context.get('roleRepository').findById(assignment.roleId)
    if (role?.permissions.includes('manage_users')) {
      const others = await assignmentRepository.countActiveGlobalAdminsExcludingUser(assignment.userId)
      if (others === 0) {
        return rbacProblem(
          context,
          RBAC_ERRORS.LAST_GLOBAL_ADMIN,
          409,
          'Conflict',
          'This assignment carries the last active global administrator and cannot be removed.',
        )
      }
    }
  }

  const deleted = await assignmentRepository.delete(assignmentId)
  if (!deleted) return notFound()
  return context.body(null, 204)
}
```

> **Documented conservatism.** `countActiveGlobalAdminsExcludingUser` excludes the owner
> *entirely*, so removing one of two redundant global assignments from the sole administrator is
> refused even though authority would survive. Refusing a redundant removal is strictly safer
> than permitting a lockout; the operator's escape hatch is to assign another administrator first.

### 4.14 — `apps/api/src/features/rbac/index.ts` (new)

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import type { Env, Variables } from '../../types'
import { createUserHandler, getUserHandler, listUsersHandler, setUserActiveHandler } from './users'
import { createRoleHandler, deleteRoleHandler, listRolesHandler, updateRoleHandler } from './roles'
import { createAssignmentHandler, deleteAssignmentHandler, listAssignmentsHandler } from './assignments'

/**
 * RBAC administration feature router, mounted at `/api/rbac` under `apiProtected`.
 *
 * Authentication and the coarse "holds manage_users/manage_roles somewhere" gate are
 * applied upstream by `authMiddleware` + `permissionMiddleware`; this router never
 * registers a middleware of its own. Each handler then makes the exact per-scope
 * decision (`hasPermission` / `canGrant`), because the scope of an administrative
 * request lives in the BODY or in the target's assignments, not in the URL.
 *
 * NOT OAuth-reachable: `OAUTH_SCOPE_ROUTES` does not list `/api/rbac/*`, and
 * `oauthScopeMiddleware()` is fail-closed, so an access token is refused 403
 * `insufficient_scope` before reaching here.
 *
 * Route order matters for `/users/:userId`: the literal sub-paths are registered first.
 */
export const rbacApp = new Hono<{ Bindings: Env; Variables: Variables }>()

rbacApp.get('/users', listUsersHandler)
rbacApp.post('/users', createUserHandler)
rbacApp.get('/users/:userId/assignments', listAssignmentsHandler)
rbacApp.patch('/users/:userId/active', setUserActiveHandler)
rbacApp.get('/users/:userId', getUserHandler)

rbacApp.get('/roles', listRolesHandler)
rbacApp.post('/roles', createRoleHandler)
rbacApp.put('/roles/:roleId', updateRoleHandler)
rbacApp.delete('/roles/:roleId', deleteRoleHandler)

rbacApp.post('/assignments', createAssignmentHandler)
rbacApp.delete('/assignments/:assignmentId', deleteAssignmentHandler)
```

### 4.15 — `apps/api/src/factory.ts` (modify — exactly two lines)

```ts
import { rbacApp } from './features/rbac'
```
and, inside the `apiProtected` block, immediately after `apiProtected.route('/seeds', seedsApp)`:
```ts
  apiProtected.route('/rbac', rbacApp)
```

### 4.16 — Tests

**`packages/core/src/rbac/evaluate.test.ts`** — as listed in §4.1.

**`d1-role.repository.test.ts`** (real `D1TestDatabase`): updating the seeded `SuperAdmin`
returns `false` **and** its 7 `role_permissions` rows are byte-identical afterwards (the
regression the sprint-1 review asked for); updating a normal role returns `true` and replaces the
set; updating a missing id returns `false`.

**`d1-role-assignment.repository.test.ts`**: `findById` hit/miss; `listAll` returns rows for
several users; `listAllForUser` returns a row whose seed is `status = 'deleted'` while
`listActiveForUser` does not; `countActiveGlobalAdminsExcludingUser` returns 0 with a single
admin and 1 with two; `countActiveGlobalAdminsExcludingRole` likewise. Seed accounts via
`seedTestUsers(db, [{ ..., grantSuperAdmin: false }])` plus hand-built assignments.

**`d1-user.repository.test.ts`**: `listAccounts()` carries no `passwordHash` key and reflects
`is_active`; `setActive()` flips the column and returns `false` for an unknown id.

**`permission.middleware.test.ts`**: the completeness test now covers the 11 new rows
automatically (it walks `app.routes`); add explicit cases — a caller holding `manage_users` only
on seed `blog` reaches `GET /api/rbac/users` (200), while a caller holding only `content:read`
is refused 403 `forbidden`.

**`features/rbac/users.test.ts` / `roles.test.ts` / `assignments.test.ts`**: per-handler coverage
through `createBeechApp` + `D1TestDatabase` + real login, mirroring
`src/features/oauth/*.test.ts`. Must include: zero-trust creation (`role = 'editor'`, no
assignment); duplicate email 409; system-role update/delete 409; role authoring escalation 403;
`canGrant` refusal 403; unknown scope 422; `getSeed`-deleted scope refused; 404-not-403 on an
account outside the caller's scope.

**`apps/api/test/flow-rbac-admin.test.ts`** — the end-to-end lifecycle that must pass:
1. `POST /auth/setup` → SuperAdmin at `'*'` (existing behaviour).
2. SuperAdmin creates role `SeedEditor` (`content:read`, `content:update`) → 201.
3. SuperAdmin creates account `partner@…` → 201, zero-trust; `GET /api/schema` with that
   account's token → 403 `forbidden` (nothing granted yet).
4. SuperAdmin creates role `SeedManager` (`manage_users`, `content:read`) and assigns it to a
   second account at scope `blog`.
5. That scoped manager assigns `SeedEditor` to `partner` at `blog` → 201; `partner` now reads
   `/api/content/blog` (200) and is refused on another seed (403).
6. The scoped manager attempts: an assignment at `'*'` → 403 `forbidden`; assigning a role
   containing `content:delete` (which they lack) at `blog` → 403 `escalation-refused`; creating a
   role containing `manage_roles` → 403 `escalation-refused`. All three refused.
7. The scoped manager `GET /api/rbac/users` → sees `partner` and itself, **not** the SuperAdmin.
8. SuperAdmin deactivates `partner` → 200; `partner`'s still-unexpired access JWT → 403
   `account_disabled`; its refresh token is revoked (refresh → 401); reactivation restores access.
9. SuperAdmin deactivates itself → 409 `last-global-admin`; deleting its own `'*'` assignment →
   409 `last-global-admin`; `PUT /api/rbac/roles/<SuperAdmin id>` → 409
   `system-role-immutable`.
10. `POST /api/rbac/users` never produces `users.role = 'admin'` (asserted with a direct
    `SELECT role FROM users`).

### 4.17 — `ROADMAP.md` amendment (same commit)

Row 3: mark `**PLANNED, detail in output/RbacUserRoleAdminApi.md**`; delete the
"dropping the legacy `users.role` column (and with it `requireAdmin()` /
`requireLayoutEditPermission()`)" inheritance; keep the `is_system` gap note (now closed by §4.4).
The *"developer axis"* section gains: the column is **retained permanently** as the
developer/owner axis (VETO audit §5 of sprint 3), no later sprint inherits its removal.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

```bash
# 0. Local DB must already contain the sprint-1 RBAC tables. If the working copy predates
#    sprint 1, or `roles` is empty, reset (this sprint itself adds NO migration).
pnpm beech db:reset
npx wrangler d1 execute beech-db --local --command \
  "SELECT name, is_system FROM roles;"                       # -> exactly SuperAdmin | 1

# 1. Core builds (contracts changed)
pnpm --filter @beechcms/core run build                        # exit 0

# 2. Typecheck both apps — the API baseline on `devs` is 32 PRE-EXISTING errors.
#    Any 33rd error, or any error inside an RBAC file, is a regression.
cd apps/api && npx tsc --noEmit
cd apps/dashboard && npx tsc --noEmit                         # must stay 0 errors

# 3. Targeted suites first (fast signal)
cd apps/api && npx vitest run \
  src/features/rbac \
  src/middleware/permission.middleware.test.ts \
  src/shared/db/repositories/d1-role.repository.test.ts \
  src/shared/db/repositories/d1-role-assignment.repository.test.ts \
  src/shared/db/repositories/d1-user.repository.test.ts \
  test/flow-rbac-admin.test.ts test/flow-rbac-enforcement.test.ts
pnpm --filter @beechcms/core test -- run src/rbac

# 4. Full workspace
pnpm beech test
pnpm lint

# 5. Runtime verification against the real Worker + D1 (`pnpm beech dev`, port 8789)
#    - POST /auth/setup, then login -> token
#    - POST /api/rbac/roles      {"name":"SeedEditor","permissions":["content:read"]}   -> 201
#    - POST /api/rbac/users      {"email":"p@x.io","password":"password123"}            -> 201
#    - SELECT role, is_active FROM users WHERE email='p@x.io'                           -> editor | 1
#    - POST /api/rbac/assignments {"userId":"<id>","roleId":"<id>","scope":"blog"}      -> 201
#    - POST /api/rbac/assignments {... ,"scope":"does-not-exist"}                       -> 422 unknown-scope
#    - PATCH /api/rbac/users/<own id>/active {"isActive":false}                         -> 409 last-global-admin
#    - PUT   /api/rbac/roles/<SuperAdmin id>                                            -> 409 system-role-immutable
#    - SELECT permission FROM role_permissions rp JOIN roles r ON r.id=rp.role_id
#        WHERE r.name='SuperAdmin'                                                      -> still 7 rows
#    - GET /api/rbac/users with an OAuth access token                                   -> 403 insufficient_scope

# 6. Refresh the knowledge graph for the downstream stages
graphify update . --force
```

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

**Contracts / typing**
- [ ] `packages/core` gains no runtime dependency; `rbac/` and `auth/` stay free of D1, Hono and
      Cloudflare types.
- [ ] `IRoleRepository.update()` returns `Promise<boolean>`; every call site compiles.
- [ ] The 5 new `IRoleAssignmentRepository` methods and the 2 new `IUserRepository` methods are
      each implemented exactly once, in their D1 adapter.
- [ ] `AccountSummary` carries no `passwordHash`; no endpoint in the slice emits one.
- [ ] `permissionSchema` derives from `PERMISSIONS` — no hand-written permission literal list
      anywhere in `features/rbac/`.
- [ ] No `any` introduced; `pnpm --filter @beechcms/core run build` exits 0.

**Invariants (re-asserted from sprints 1–2)**
- [ ] `PERMISSIONS` still exactly 7 entries; `manage_seeds` absent from code, schema and tests.
- [ ] `apps/api/migrations/` untouched — no new file, no edit to `0000_v040_base.sql`.
- [ ] No file under `apps/dashboard/` touched.
- [ ] `users.role`, `JwtClaims.role`, `requireAdmin()`, `requireLayoutEditPermission()`,
      `AllowAllRoleGuard`, `PermissionRoleGuard`, `OAUTH_SCOPE_ROUTES` all unmodified.
- [ ] `features/rbac/*` imports nothing from another `features/` slice
      (`grep -rn "from '\.\./\(oauth\|seeds\|settings\|content\)" apps/api/src/features/rbac` → empty).
- [ ] `permission.middleware.ts` still imports nothing from `features/`.
- [ ] No new CSPRNG, hashing or token helper: `IHashProvider` and `IIdGenerator` are the only
      sources used.
- [ ] No RBAC repository extends `BaseD1Repository`.

**Gate**
- [ ] All 11 `/api/rbac/*` rows present; the route-completeness test passes with zero unmapped
      routes.
- [ ] No existing `PROTECTED_ROUTES` row was edited, reordered or removed.
- [ ] A caller holding `manage_users` only on one seed clears the `permission-any-scope` gate;
      a caller holding neither `manage_users` nor `manage_roles` is refused 403 `forbidden`.
- [ ] `/api/rbac/*` refused 403 `insufficient_scope` for an OAuth access token, with no edit to
      `OAUTH_SCOPE_ROUTES`.

**Anti-escalation (brief §2, §4)**
- [ ] A seed-scoped `manage_users` holder cannot create an assignment at `'*'` (403).
- [ ] Assigning a role containing a permission the actor lacks at that scope → 403
      `escalation-refused` (`canGrant`).
- [ ] Creating or editing a role containing a permission the actor holds nowhere → 403
      `escalation-refused`.
- [ ] Editing a role whose CURRENT permissions exceed the actor's → 403.
- [ ] `POST /api/rbac/users` always writes `users.role = 'editor'`; no request body field can
      change it (asserted against the database, not the response).
- [ ] A newly created account holds zero assignments and is refused on every `/api/*` route.

**Guardrails**
- [ ] Deactivating the last active global administrator → 409 `last-global-admin`, including when
      the caller is that administrator.
- [ ] Deleting the `'*'` assignment that carries the last administrator → 409.
- [ ] Updating or deleting the seeded `SuperAdmin` role → 409 `system-role-immutable`, and its
      7 `role_permissions` rows are provably unchanged afterwards.
- [ ] A role update that would strip `manage_users` from the last globally-assigned admin role →
      409.
- [ ] Deactivation revokes every refresh token of the account (`revokeAllForUser`, seconds
      timestamp) and the still-unexpired access JWT is refused 403 `account_disabled`.
- [ ] Reactivation restores access without any further action.

**Scope integrity**
- [ ] An assignment scope is accepted only when it is `'*'` or an ACTIVE seed slug, validated via
      the `getSeed` context variable — not by importing `features/seeds/`.
- [ ] `GET /api/rbac/users/:id/assignments` still lists an assignment whose seed is deleted,
      flagged `active: false`.
- [ ] An account the caller may not administer returns 404, never 403 (no enumeration oracle).

**Build / suite**
- [ ] `apps/api` `tsc --noEmit`: still 32 errors, the same pre-existing set, zero in RBAC files.
- [ ] `apps/dashboard` `tsc --noEmit`: 0 errors.
- [ ] `pnpm beech test` green (a failure in `@beechcms/mcp/src/auto-restart.test.ts` is the known
      pre-existing flake — re-run it in isolation and say so explicitly if it appears).
- [ ] `pnpm lint` clean.
- [ ] `test/flow-rbac-admin.test.ts` covers all 10 steps of §4.16.
- [ ] `ROADMAP.md` amended per §4.17.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executing agent MUST NOT:

1. **Touch `apps/dashboard/`.** Every users/roles/invites screen, permission-derived navigation
   and section visibility belongs to **roadmap entry 5 (`RbacDashboardSurfaces`)**.
2. **Build any invitation mechanism** — no `invitations` table, no token issue/regenerate/redeem
   endpoint, no email dispatch, no activation flow. **Roadmap entry 4 (`RbacInvitations`)**.
   Accounts here are created with an admin-supplied password.
3. **Drop `users.role`, or modify `requireAdmin()` / `requireLayoutEditPermission()` /
   `JwtClaims.role`.** Vetoed in this plan's VETO audit §5 and removed from the roadmap: the
   column is the developer/owner axis and is now permanent. `/api/seeds/*` and
   `/api/schema/:slug/layout` keep their `legacy-admin` classification.
4. **Add any RBAC permission, or gate any seed/schema route on one.** `manage_seeds` must not
   appear in code, schema, test or comment except as a documented prohibition.
5. **Narrow the coarse projections sprint 2 left global** — `GET /api/schema`,
   `GET /api/content/drafts`, `GET /api/search`, `/api/upload*`, `/api/automations*`,
   `/api/dashboard-layout` writes. Explicitly inherited by **roadmap entry 5**.
6. **Add a `/api/settings/me` permission payload.** **Roadmap entry 5**, with its consumer.
7. **Write any migration.** No new numbered file, no edit to `0000_v040_base.sql`. If a needed
   column appears to be missing, stop and report — it is not.
8. **Add account hard-deletion**, or an admin-edits-another-user's-profile endpoint. Brief §4
   settles the first; no user story asks for the second.
9. **Widen `ActivityLogEntry.entityType`** or log RBAC administration to the activity trail.
10. **Introduce a second authorization seam.** `IRoleGuard` / `PermissionRoleGuard` /
    `permissionMiddleware()` / `resolveEffectivePermissions()` are the only ones; no new
    middleware may be registered by the slice's own router.
11. **Import another `features/` slice from `features/rbac/`**, or reach `c.env.DB` from a
    handler. Storage goes through the core-declared repository interfaces, seed metadata through
    the `getSeed` context variable.
12. **Weaken production code to keep a test green.** Test authority is seeded through
    `seedTestUsers()` (`grantSuperAdmin: false` + hand-built assignments) — never through a second
    seeding path.
