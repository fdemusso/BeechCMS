# Sprint 4 — `RbacInvitations`

Feature: Multi-Stakeholder RBAC / Multi-Tenant Portal
Roadmap entry: `output/backlog/ROADMAP.md` row 4 (depends on sprint 3 `RbacUserRoleAdminApi`, merged at `983419a`).

---

### Pre-Computation Analysis

Graph refreshed before planning (`graphify update . --force` → 12204 nodes, 21512 edges, 995 communities; the pre-refresh graph did not yet contain the sprint-3 `features/rbac/` slice).

**a) God Nodes identified via the CLI** (degree from `graphify explain`)

| Node | Degree | Source | Why it matters here |
|---|---|---|---|
| `createBeechApp()` | 53 | `apps/api/src/factory.ts:108` | Single composition root. The public invitation router must be mounted here, alongside `passwordResetApp`, i.e. BEFORE `app.route('/api', apiProtected)`. |
| `D1TestDatabase` | 38 | `apps/api/test/helpers/d1-test-database.ts:19` | Applies every `^\d{4}_.+\.sql$` migration. A malformed `invitations` DDL breaks the entire API suite, not just the new specs. |
| `seedTestUsers()` | 28 | `apps/api/test/helpers/seed-fixtures.ts:22` | Single choke point hydrating users in all authenticated suites. This sprint does NOT modify it (invitation tests mint their accounts through the redeem endpoint itself). |
| `resolveEffectivePermissions()` | 19 | `apps/api/src/shared/rbac/effective-permissions.ts:27` | Request-memoized authority resolver. Usable for the ISSUER (JWT-bound); NOT usable at redeem time, which is unauthenticated — see SECTION 4.6. |
| `permissionMiddleware()` / `PROTECTED_ROUTES` | 25 reverse-dependents (all test files) | `apps/api/src/middleware/permission.middleware.ts:70` | Fail-closed allowlist. Every new `/api/rbac/invitations*` route needs a row or it 403s `route_not_registered`. |
| `generateOpaqueToken()` | 11 | `apps/api/src/shared/utils/opaque-token.ts:19` | Mandated single CSPRNG source for the invitation token. |

**b) Architectural boundaries affected**

| Tier | Touched | Nature |
|---|---|---|
| `@beechcms/core` | YES | Contracts only: `rbac/invitation.repository.ts` (types + `IInvitationRepository`), re-exported from `src/index.ts`. Zero runtime dependency, zero D1. |
| `apps/api` | YES | (1) `migrations/0000_v040_base.sql` — new section 21 `invitations` (edit, per beta migration policy); (2) `shared/db/repositories/d1-invitation.repository.ts`; (3) `middleware/repository.middleware.ts` + `types.ts` wiring; (4) `middleware/permission.middleware.ts` — 4 new route rows; (5) `middleware/rate-limit.middleware.ts` — 1 new limiter name; (6) `shared/email/` — one template + one service function; (7) `features/rbac/` — `invitations.ts`, `invitations.public.ts`, extended `constants.ts` / `rbac.schema.ts` / `index.ts`, new `public.ts` router; (8) `factory.ts` — one `app.route()` line. |
| `apps/dashboard` | **NO** | Zero files. The `/admin/accept-invite` page is sprint 5 (`RbacDashboardSurfaces`). |

**c) `graphify affected` impact analysis (breaking-change proof)**

```
$ graphify affected "permissionMiddleware" --depth 2
25 reverse-dependents — ALL of them test files importing createBeechApp/factory
(permission.middleware.test.ts, public-add.test.ts, client-sdk-e2e.test.ts,
 draft-relation.test.ts, e2e-file-signatures.test.ts, flow-admin-auth.test.ts,
 flow-background-queues, flow-backrefs, flow-bulk-edit, flow-content-management,
 flow-draft-management, flow-guest-access, flow-media-assets, flow-oauth-*,
 flow-rbac-admin, flow-rbac-enforcement, flow-relations, flow-setup-race,
 flow-stats, flow-system-schema, public-anti-bot, public-edit, public-routes)
→ zero PRODUCTION reverse-dependents. Appending rows to PROTECTED_ROUTES is additive;
  no existing row's pattern is touched, so no existing route changes class.

$ graphify affected "rbacApp" --depth 2
Same 25 test files via factory. No slice imports rbacApp (VSA intact).

$ graphify affected "IUserRepository" --depth 2
No affected nodes.
→ CONFIRMS the design decision in SECTION 4.6: the redeem path reuses the EXISTING
  `create()` + `findByEmail()`, so `IUserRepository` is NOT widened and none of its
  implementors (D1UserRepository + test doubles) change.

$ graphify affected "sendPasswordResetEmail" --depth 2
- requestPasswordReset()            apps/api/src/features/password-reset/request.ts:104
- email/index.ts [re_exports]       apps/api/src/shared/email/index.ts:23
- send-mail.executor.ts             apps/api/src/features/automations/executors/send-mail.executor.ts:7
- password-reset/reset.ts, request.test.ts
→ `shared/email` is already consumed by TWO different slices (password-reset,
  automations). Adding `sendInvitationEmail` alongside it is the established seam,
  not a new one. Purely additive: no existing export signature changes.

$ graphify affected "INotificationService" --depth 2
No affected nodes found.
→ The roadmap's "email dispatch via INotificationService" is WRONG about the seam:
  that interface (packages/core/src/notifications/notification-service.ts:25, degree 2,
  single method .notify()) backs in-dashboard notification rows and has zero API
  call sites. The real email seam is `apps/api/src/shared/email`. Corrected here;
  ROADMAP row 4 amended accordingly.

$ graphify path "rbac/index.ts" "INotificationService"
No directed path found  → confirms the above.
```

---

### VETO Audit

Proposed boundaries evaluated against `_config/ponytail_arch.md`.

**1. THE BOTANICAL INVARIANT — respected.**
`invitations` is a SYSTEM table, exactly like `password_reset_tokens`, `oauth_tokens` and `user_role_assignments`. It holds no content, has no Branch, no `br_XX` field ids, and is never routed through `apiToDb`/`dbToApi`. `D1InvitationRepository` does NOT extend `BaseD1Repository` (content-tier: `getTableName` → `content_{slug}`, `SlugConflictError`), matching the split already established by `D1RoleRepository` / `D1PasswordResetTokenRepository`. No handler in this sprint touches a `content_{slug}` table or issues raw D1 outside a repository. Every column name lives in the repository file only; nothing above the repository knows SQL.

**2. VSA ENFORCEMENT — respected, one point audited explicitly.**
`apps/api/src/features/rbac/` imports: `@beechcms/core`, `../../shared/rbac/effective-permissions`, `../../shared/email`, `../../shared/utils/opaque-token`, `../../shared/utils/request-utils`, `../../public/problem-details`, `./*`. **Zero imports from another `features/*` slice** — verified by the sprint-3 grep gate, which stays green (`grep -rn "from '\.\./\(oauth\|seeds\|settings\|content\|password-reset\)" apps/api/src/features/rbac` must print nothing).

The audited point: the redeem endpoint is UNAUTHENTICATED and therefore cannot live under `apiProtected`. Two options were considered:
- **(rejected)** put it in `features/password-reset/` next to the other public credential route — that would make an RBAC concern live in an unrelated slice, and force `password-reset` to import the invitation repository and the RBAC evaluator. Cross-domain leak.
- **(chosen)** the `rbac` slice exports a SECOND router, `rbacPublicApp` (`features/rbac/public.ts`), which `factory.ts` mounts at the root next to `passwordResetApp`. The composition root is allowed to know about both routers of a slice; a slice is still never imported by another slice. This mirrors how `authApp` / `setupApp` / `passwordResetApp` / `oauthApp` are all mounted unprotected from the same root.

**3. CLOUDFLARE PURITY — respected.** Edge-native only: D1 + `crypto.getRandomValues` + `sha256hex` (WebCrypto) + `executionCtx.waitUntil` for the email, copied verbatim from `password-reset/request.ts:102-126` including its non-Workers fallback. No ORM, no background job, no scheduler, no cron. Schema change is deterministic DDL folded into `0000_v040_base.sql` per the feature's beta migration policy.

**4. YAGNI — three features cut here, before drafting.**
- **No pending `users` row at invite time.** The invited account is materialised only at redeem. This kills the whole class of "ghost account with a sentinel `password_hash`" problems (`users.password_hash` is `NOT NULL`, `users.email` is `UNIQUE`, and a ghost row would collide with a later legitimate `POST /api/rbac/users`). Brief §4's "regenerate keeping the same role+scope pre-assignment without recreating the account from scratch" is satisfied because the PRE-ASSIGNMENT lives on the `invitations` row, which regeneration reuses — nothing is recreated.
- **No `invitations.status` column.** Status is derived: `used_at IS NOT NULL` → accepted; `expires_at <= now` → expired; else pending. Same shape as `password_reset_tokens`, which the reuse mandate names as "already the invitation lifecycle".
- **No invitation for an EXISTING account** (adding a scope to someone who already has credentials). That is `POST /api/rbac/assignments`, which shipped in sprint 3. An invite whose email already resolves to an account is refused `409 email-taken`.

**5. Anti-escalation over time — the one place this sprint ADDS a rule.**
An invite is a DEFERRED grant, so the sprint-3 checks (`hasPermission(actor,'manage_users',scope)` + `canGrant(actor, scope, role.permissions)`) are not sufficient on their own: they authorize the issuer at issue time, but the grant lands up to 72 h later, when the issuer's own authority may have been reduced or their account deactivated. The redeem handler therefore RE-EVALUATES the issuer's live authority before creating the assignment (SECTION 4.6). This closes the window without inventing a new authorization seam — it calls the same `hasPermission`/`canGrant`/`buildEffectivePermissions` core functions, just with the issuer's id instead of a JWT subject.

**6. `users.role` — unchanged.** Redeemed accounts are minted `role = 'editor'`, exactly like `POST /api/rbac/users` (sprint 3). `POST /auth/setup` stays the sole producer of `role = 'admin'`. No invite at any privilege level can produce an account that clears `requireAdmin()` and reaches `/api/seeds/*` (brief §2). No `manage_seeds` permission is introduced, referenced, or made representable.

Plan adjusted where audits demanded it (points 2, 4, 5, and the `INotificationService` correction in the pre-computation). No remaining violation.

HANDOFF -> caveman_coder

---

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Sprint 3 shipped the administration surface, but it can only onboard someone whose password the administrator types in themselves (`POST /api/rbac/users` takes a plaintext `password`). That is the last remaining path in the feature where a credential for a third party is chosen by, and known to, another human. For a portal whose entire premise is hosting partners and B2B customers alongside the owner, that path cannot be the onboarding story: brief §2 defines the system as "chiuso a invito, nessuna auto-registrazione", and brief §3's first user story is the BeechAdmin inviting an account with a pre-assigned role+scope via an expiring link.

This sprint must come after sprint 3 and before sprint 5 for two structural reasons:

- **After 3:** an invitation pre-assigns a (role, scope) pair. Both must already be creatable and validatable — `roles` CRUD, the active-seed scope check (`getSeed`), `canGrant`, and the `permission-any-scope` gate kind all landed in sprint 3. Building invites first would have meant inventing a second, weaker copy of each.
- **Before 5:** the dashboard's invite screens are a projection of this API. There is no UI contract to design until the lifecycle (issue → email → preview → redeem → regenerate → revoke) emits its final error codes, which this sprint freezes in `RBAC_ERRORS`.

**VSA adherence.** All feature code lands inside the existing `apps/api/src/features/rbac/` slice — the invitation IS an RBAC concern (it carries a role and a scope, and its redemption writes a `user_role_assignments` row). The slice grows a second, unprotected router that the composition root mounts publicly; it does not grow an import of any other slice. Shared machinery it needs already exists in `shared/` (`email`, `rbac/effective-permissions`, `utils/opaque-token`, `utils/request-utils`) precisely because sprints 2 and 3 pushed it there instead of into a slice.

**Botanical adherence.** `invitations` is a system table reached only through `IInvitationRepository`. The contract lives in `@beechcms/core` with zero dependencies; the D1 implementation lives in `apps/api` and is the only file in the sprint that spells a column name. No handler bypasses `@beechcms/core` for a decision: `hasPermission`, `canGrant`, `buildEffectivePermissions`, `sha256hex`, `GLOBAL_SCOPE` and `PERMISSIONS` all come from the engine.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Middleware registration order** (`apps/api/src/factory.ts:120-236`, unchanged by this sprint):

```
app.use('*')  → repositoryMiddleware   (sets every repository Variable)      :120
              → seedRegistryMiddleware (hydrates getSeed from D1)            :134
              → storageMiddleware, queueMiddleware                           :137,141
              → authProvidersMiddleware (hashProvider, tokenService)         :143
              → rateLimiterMiddleware   (sets `rateLimiters`)                :144
              → observabilityMiddleware, CORS, security headers              :145-196

UNPROTECTED routers, mounted at the root BEFORE apiProtected:
  app.route('/', authApp)            :221
  app.route('/', setupApp)           :222
  app.route('/', passwordResetApp)   :223   ← the invitation public router goes here
  app.route('/', oauthApp)           :224

apiProtected (mounted at '/api', :282):
  authMiddleware({ acceptOAuth:true })  :229
  oauthScopeMiddleware()                :232   (fail-closed; /api/rbac/* is NOT in
                                                OAUTH_SCOPE_ROUTES → OAuth tokens 403)
  permissionMiddleware()                :236   (fail-closed allowlist)
  ...
  apiProtected.route('/rbac', rbacApp)  :242
```

**Existing single-use-token lifecycle to mirror** (`password_reset_tokens`):
`IPasswordResetTokenRepository` (`packages/core/src/auth/password-reset-token.repository.ts:16`) = `invalidatePending` / `create` / `findValidByHashWithEmail` / `markUsed`; D1 impl at `apps/api/src/shared/db/repositories/d1-password-reset-token.repository.ts`; DDL at `apps/api/migrations/0000_v040_base.sql:70-80`. Note the one deviation this sprint makes on purpose: `request.ts:86` mints its token with `crypto.randomUUID()`, which predates the `generateOpaqueToken()` mandate. Invitations use `generateOpaqueToken()` (256 bits) as the reuse mandate requires. `requestPasswordReset` is NOT refactored — out of scope.

**Email seam** (`apps/api/src/shared/email/`): `index.ts` is the only importable entry point (`email.service.ts`, `templates/`, `providers/` are private). Pattern per message = one `templates/<name>.ts` exporting `build<Name>Email(...)` with a `Record<EmailLocale, {...}>` COPY object + `buildEmailShell`, plus one `send<Name>Email(params)` in `email.service.ts` that calls `createProvider()`. Dispatch is fire-and-forget through `executionCtx.waitUntil` with a `try/catch` fallback (`request.ts:102-126`) and never fails the request.

**RBAC slice as it stands after sprint 3** (`apps/api/src/features/rbac/`): `index.ts` (11 routes, no middleware of its own), `users.ts`, `roles.ts`, `assignments.ts`, `guards.ts` (`rbacProblem`, `canAdministerAccount`, `holdsAll`, `readJson`, `AppContext`), `constants.ts` (`RBAC_ERRORS`, frozen), `rbac.schema.ts` (zod; `EMAIL_RE`, `passwordSchema`, `permissionSchema`, `createUserSchema`, `setActiveSchema`, `roleBodySchema`, `createAssignmentSchema`).

**Context Variables available** (`apps/api/src/types.ts:151-239`): `getSeed`, `userRepository`, `sessionRepository`, `passwordResetTokenRepository`, `hashProvider`, `idGenerator`, `clock`, `rateLimiters`, `roleRepository`, `roleAssignmentRepository`, `effectivePermissions`, `jwtPayload`. **`invitationRepository` does not exist yet** — added by this sprint.

**Core RBAC contracts** (`packages/core/src/rbac/`): `PERMISSIONS` (7 entries, closed), `GLOBAL_SCOPE = '*'`, `SUPER_ADMIN_ROLE_NAME = 'SuperAdmin'`, `Permission`, `Scope`, `RoleRecord`, `PermissionAssignment`, `EffectivePermissions`, `IRoleRepository`, `IRoleAssignmentRepository`, and the pure evaluator `buildEffectivePermissions` / `hasPermission` / `hasPermissionAnywhere` / `permissionsHeldAnywhere` / `canGrant`. Exported from `packages/core/src/index.ts:42-44`.

**Rate limiter registry** (`apps/api/src/middleware/rate-limit.middleware.ts:10-39`): `RateLimiterName` union of 10 names; `buildDefaultRegistry` maps each to a `TokenBucketRateLimiter`. `resetPassword` = `{ capacity: 5, refillRatePerSecond: 0.1 }`.

**Account creation precedents:** `POST /auth/setup` (`features/setup/index.ts:200-243`) — hash → `createInitialAdmin` → resolve `SuperAdmin` BY NAME (`roles.name` is UNIQUE; ids are minted per-database by the migration and must never be hardcoded) → `roleAssignmentRepository.create`. `POST /api/rbac/users` (`features/rbac/users.ts:57-107`) — `findByEmail` conflict check → `idGenerator.uuid()` → `hashProvider.hash` → `userRepository.create({ role: 'editor' })` → `UNIQUE constraint failed` race backstop.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

**`packages/core` (contracts only, zero dependencies, zero runtime logic)**
1. `packages/core/src/rbac/invitation.repository.ts` — NEW. `InvitationRecord`, `NewInvitationInput`, `ValidatedInvitation`, `IInvitationRepository`.
2. `packages/core/src/index.ts` — MODIFIED. One line: `export * from './rbac/invitation.repository.js'`.

**`apps/api` — schema**
3. `apps/api/migrations/0000_v040_base.sql` — MODIFIED (edit, not a new numbered migration; beta policy). New section 21: `invitations` table + 3 indexes. Applies only via `pnpm beech db:reset`.

**`apps/api` — storage**
4. `apps/api/src/shared/db/repositories/d1-invitation.repository.ts` — NEW. `D1InvitationRepository implements IInvitationRepository`. Does NOT extend `BaseD1Repository`.
5. `apps/api/src/shared/db/repositories/d1-invitation.repository.test.ts` — NEW. Runs against `D1TestDatabase` (real SQLite), never a `prepare` stub.

**`apps/api` — wiring**
6. `apps/api/src/types.ts` — MODIFIED. Import `IInvitationRepository`; add `invitationRepository: IInvitationRepository` to `Variables`.
7. `apps/api/src/middleware/repository.middleware.ts` — MODIFIED. Optional override + `context.set('invitationRepository', ...)`.
8. `apps/api/src/middleware/permission.middleware.ts` — MODIFIED. 4 rows appended to `PROTECTED_ROUTES`.
9. `apps/api/src/middleware/rate-limit.middleware.ts` — MODIFIED. `'acceptInvitation'` added to `RateLimiterName` + `buildDefaultRegistry`.
10. `apps/api/src/factory.ts` — MODIFIED. Import `rbacPublicApp`; one `app.route('/', rbacPublicApp)` next to `passwordResetApp`.

**`apps/api` — email**
11. `apps/api/src/shared/email/templates/invitation.ts` — NEW. `buildInvitationEmail(inviteUrl, roleName, scopeLabel, locale)`.
12. `apps/api/src/shared/email/email.types.ts` — MODIFIED. `InvitationEmailParams`.
13. `apps/api/src/shared/email/email.service.ts` — MODIFIED. `sendInvitationEmail`.
14. `apps/api/src/shared/email/index.ts` — MODIFIED. Re-export the function + type.

**`apps/api` — RBAC slice**
15. `apps/api/src/features/rbac/constants.ts` — MODIFIED. 4 new frozen error codes.
16. `apps/api/src/features/rbac/rbac.schema.ts` — MODIFIED. `createInvitationSchema`, `acceptInvitationSchema`.
17. `apps/api/src/features/rbac/invitations.ts` — NEW. Admin handlers (issue / list / regenerate / revoke).
18. `apps/api/src/features/rbac/invitations.public.ts` — NEW. Unauthenticated preview + accept handlers.
19. `apps/api/src/features/rbac/public.ts` — NEW. `rbacPublicApp` (2 routes, no middleware of its own).
20. `apps/api/src/features/rbac/index.ts` — MODIFIED. 4 admin routes registered.
21. `apps/api/src/features/rbac/invitations.test.ts` — NEW. Handler-level specs.

**`apps/api` — end-to-end**
22. `apps/api/test/flow-rbac-invitations.test.ts` — NEW. Full lifecycle against a real Hono app + `D1TestDatabase`.

**Explicitly NOT produced:** any file under `apps/dashboard/`, any change to `seedTestUsers`, `IUserRepository`, `D1UserRepository`, `permissionMiddleware()`'s body, or the sprint-3 handlers.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### 4.1 D1 schema — `apps/api/migrations/0000_v040_base.sql`

Append as section 21, AFTER the section-20 RBAC block (the `roles` FK requires `roles` to exist first; the SuperAdmin `INSERT OR IGNORE` at the tail of section 20 stays where it is). Beta policy: this is an EDIT to `0000`, never a new numbered migration, and it lands only through `pnpm beech db:reset`.

```sql
-- =============================================================================
-- 21. RBAC — INVITATIONS
--
--     Single-use, expiring onboarding tokens carrying a PRE-ASSIGNED (role, scope)
--     pair. Hash-only at rest, exactly like password_reset_tokens and oauth_tokens:
--     the plaintext exists once, inside the email that carries it.
--
--     No `users` row is created at invite time. The account is materialised at
--     redemption, which is why regeneration (brief §4) reuses this row and never
--     "recreates the account": the pre-assignment lives HERE, not on a ghost user.
--
--     Status is derived, not stored:
--       used_at IS NOT NULL          -> accepted
--       used_at IS NULL AND expired  -> expired (regenerable)
--       otherwise                    -> pending
-- =============================================================================

CREATE TABLE IF NOT EXISTS invitations (
    id          TEXT    NOT NULL PRIMARY KEY,
    -- Lowercased at the handler boundary, like users.email. NOT UNIQUE: an accepted
    -- or revoked invite may legitimately be followed by another one for the same
    -- address. One-pending-per-email is enforced by invalidatePending(), mirroring
    -- IPasswordResetTokenRepository.
    email       TEXT    NOT NULL,
    token_hash  TEXT    NOT NULL,
    -- The pre-assignment. ON DELETE CASCADE: deleting the role destroys every
    -- invitation that would have granted it, which is the same guarantee
    -- user_role_assignments already gives.
    role_id     TEXT    NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    -- '*' or a seeds.slug. No FK, for the same reason as user_role_assignments:
    -- the '*' sentinel is not a slug. Validity is re-checked at redemption.
    scope       TEXT    NOT NULL,
    -- The issuer. Their LIVE authority is re-evaluated at redemption, so this is a
    -- load-bearing column, not an audit field.
    invited_by  TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at  INTEGER NOT NULL,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    used_at     INTEGER DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_invitations_hash  ON invitations(token_hash);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_role  ON invitations(role_id);
```

### 4.2 Core contract — `packages/core/src/rbac/invitation.repository.ts` (NEW)

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { Scope } from './permissions.js'

/** One invitation row. `tokenHash` is deliberately absent: nothing above the storage
 *  boundary ever needs it, and an administration listing must not carry credential
 *  material (same rule as AccountSummary omitting passwordHash). */
export interface InvitationRecord {
  id: string
  email: string
  roleId: string
  scope: Scope
  invitedBy: string
  expiresAt: number
  createdAt: number
  /** Non-null once redeemed. Single-use is enforced by {@link IInvitationRepository.markUsed}. */
  usedAt: number | null
}

export interface NewInvitationInput {
  email: string
  tokenHash: string
  roleId: string
  scope: Scope
  invitedBy: string
  expiresAt: number
}

/** A live invitation resolved from a bearer token, with the pre-assignment it carries. */
export interface ValidatedInvitation {
  id: string
  email: string
  roleId: string
  scope: Scope
  invitedBy: string
}

/**
 * Storage contract for onboarding invitations.
 *
 * Deliberately shaped after {@link IPasswordResetTokenRepository}: a single-use,
 * expiring, hash-only bearer credential is the same lifecycle, and the codebase keeps
 * exactly one shape for it.
 */
export interface IInvitationRepository {
  /** Consumes every pending invitation for an email before a new one is issued, so at
   *  most one live token per address exists at any time. */
  invalidatePending(email: string, nowTimestamp: number): Promise<void>

  /** Stores a new invitation. Only the hash is persisted, never the plaintext.
   *  Returns the new invitation id. */
  create(input: NewInvitationInput): Promise<string>

  /** Resolves a live (unused, unexpired) invitation by token hash. Null otherwise —
   *  expired, already used and unknown are deliberately indistinguishable. */
  findValidByHash(tokenHash: string, nowTimestamp: number): Promise<ValidatedInvitation | null>

  /**
   * Consumes an invitation. Returns TRUE only when THIS call performed the transition
   * (`used_at IS NULL` at write time), which is what makes redemption single-use under
   * concurrency. A second concurrent redeem gets false and must be refused.
   */
  markUsed(invitationId: string, nowTimestamp: number): Promise<boolean>

  /** One invitation by id, regardless of state. Null when absent. */
  findById(invitationId: string): Promise<InvitationRecord | null>

  /** Every invitation, newest first. Administration tables are small by nature. */
  listAll(): Promise<InvitationRecord[]>

  /** Replaces the token and expiry of an existing PENDING-or-EXPIRED invitation,
   *  preserving its (role, scope, email) pre-assignment. Returns false when the row is
   *  absent or already used — a consumed invitation is never re-armed. */
  regenerate(invitationId: string, tokenHash: string, expiresAt: number): Promise<boolean>

  /** Revokes (hard-deletes) an invitation. Returns false when it did not exist. */
  delete(invitationId: string): Promise<boolean>
}
```

`packages/core/src/index.ts` — add next to lines 42-44:

```ts
export * from './rbac/invitation.repository.js'
```

### 4.3 D1 repository — `apps/api/src/shared/db/repositories/d1-invitation.repository.ts` (NEW)

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type {
  IInvitationRepository,
  InvitationRecord,
  NewInvitationInput,
  ValidatedInvitation,
  IIdGenerator,
} from '@beechcms/core'

type InvitationRow = {
  id: string
  email: string
  role_id: string
  scope: string
  invited_by: string
  expires_at: number
  created_at: number
  used_at: number | null
}

function rowToRecord(row: InvitationRow): InvitationRecord {
  return {
    id: row.id,
    email: row.email,
    roleId: row.role_id,
    scope: row.scope,
    invitedBy: row.invited_by,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    usedAt: row.used_at,
  }
}

/**
 * D1-backed invitation storage.
 *
 * A system table: no Branch, no `br_XX`, never routed through `apiToDb`/`dbToApi`,
 * and NOT a `BaseD1Repository` (that base is content-tier: `content_{slug}` +
 * `SlugConflictError`). Same split as `D1RoleRepository`.
 */
export class D1InvitationRepository implements IInvitationRepository {
  constructor(
    private readonly db: D1Database,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async invalidatePending(email: string, nowTimestamp: number): Promise<void> {
    await this.db
      .prepare('UPDATE invitations SET used_at = ? WHERE email = ? AND used_at IS NULL')
      .bind(nowTimestamp, email)
      .run()
  }

  async create(input: NewInvitationInput): Promise<string> {
    const id = this.idGenerator.uuid()
    await this.db
      .prepare(
        `INSERT INTO invitations (id, email, token_hash, role_id, scope, invited_by, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(id, input.email, input.tokenHash, input.roleId, input.scope, input.invitedBy, input.expiresAt)
      .run()
    return id
  }

  async findValidByHash(tokenHash: string, nowTimestamp: number): Promise<ValidatedInvitation | null> {
    const row = await this.db
      .prepare(
        `SELECT id, email, role_id, scope, invited_by
         FROM invitations
         WHERE token_hash = ? AND expires_at > ? AND used_at IS NULL`
      )
      .bind(tokenHash, nowTimestamp)
      .first<Pick<InvitationRow, 'id' | 'email' | 'role_id' | 'scope' | 'invited_by'>>()

    if (!row) return null
    return {
      id: row.id,
      email: row.email,
      roleId: row.role_id,
      scope: row.scope,
      invitedBy: row.invited_by,
    }
  }

  /** `WHERE used_at IS NULL` makes the consume atomic: exactly one concurrent redeem
   *  sees `changes === 1`; the loser is refused. */
  async markUsed(invitationId: string, nowTimestamp: number): Promise<boolean> {
    const result = await this.db
      .prepare('UPDATE invitations SET used_at = ? WHERE id = ? AND used_at IS NULL')
      .bind(nowTimestamp, invitationId)
      .run()
    return (result.meta?.changes ?? 0) > 0
  }

  async findById(invitationId: string): Promise<InvitationRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT id, email, role_id, scope, invited_by, expires_at, created_at, used_at
         FROM invitations WHERE id = ?`
      )
      .bind(invitationId)
      .first<InvitationRow>()
    return row ? rowToRecord(row) : null
  }

  async listAll(): Promise<InvitationRecord[]> {
    const rows = await this.db
      .prepare(
        `SELECT id, email, role_id, scope, invited_by, expires_at, created_at, used_at
         FROM invitations ORDER BY created_at DESC`
      )
      .all<InvitationRow>()
    return (rows.results ?? []).map(rowToRecord)
  }

  async regenerate(invitationId: string, tokenHash: string, expiresAt: number): Promise<boolean> {
    const result = await this.db
      .prepare(
        'UPDATE invitations SET token_hash = ?, expires_at = ? WHERE id = ? AND used_at IS NULL'
      )
      .bind(tokenHash, expiresAt, invitationId)
      .run()
    return (result.meta?.changes ?? 0) > 0
  }

  async delete(invitationId: string): Promise<boolean> {
    const result = await this.db
      .prepare('DELETE FROM invitations WHERE id = ?')
      .bind(invitationId)
      .run()
    return (result.meta?.changes ?? 0) > 0
  }
}
```

### 4.4 Wiring

**`apps/api/src/types.ts`** — add `IInvitationRepository` to the `@beechcms/core` type import on line 13, then inside `Variables`, next to `roleAssignmentRepository` (line ~239):

```ts
  /** Repository for single-use onboarding invitations (hash-only). */
  invitationRepository: IInvitationRepository
```

**`apps/api/src/middleware/repository.middleware.ts`** — mirror the `roleAssignmentRepository` pair exactly (overrides interface ~line 77, setter ~line 153):

```ts
  invitationRepository?: IInvitationRepository            // in the overrides interface
```
```ts
  context.set('invitationRepository', overrides?.invitationRepository ?? new D1InvitationRepository(database, resolvedIdGenerator))
```

**`apps/api/src/middleware/permission.middleware.ts`** — append to `PROTECTED_ROUTES`, immediately AFTER the existing `/api/rbac/assignments/:id` row (order is safe: no earlier pattern matches `/api/rbac/invitations*`; the literal `regenerate` row precedes nothing that could swallow it):

```ts
  { method: 'GET',    pattern: /^\/api\/rbac\/invitations$/,                         requirement: anyScope('manage_users') },
  { method: 'POST',   pattern: /^\/api\/rbac\/invitations$/,                         requirement: anyScope('manage_users') },
  { method: 'POST',   pattern: /^\/api\/rbac\/invitations\/[^/]+\/regenerate$/,      requirement: anyScope('manage_users') },
  { method: 'DELETE', pattern: /^\/api\/rbac\/invitations\/[^/]+$/,                  requirement: anyScope('manage_users') },
```

The two public routes (`/auth/invitations/...`) are NOT added: they never pass through `apiProtected`, and adding them would be dead configuration.

**`apps/api/src/middleware/rate-limit.middleware.ts`** — one name, one bucket:

```ts
  | 'acceptInvitation'       // in RateLimiterName, after 'resetPassword'
```
```ts
    acceptInvitation: new TokenBucketRateLimiter({ capacity: 5, refillRatePerSecond: 0.1 }), // IP burst: 5, 1 token/10s
```

**`apps/api/src/factory.ts`** — import next to line 29 and mount next to line 223:

```ts
import { rbacApp } from './features/rbac'
import { rbacPublicApp } from './features/rbac/public'
...
  app.route('/', passwordResetApp)
  app.route('/', rbacPublicApp)   // unauthenticated invite preview + redeem
```

### 4.5 Email

**`apps/api/src/shared/email/templates/invitation.ts` (NEW)** — same shape as `templates/password-reset.ts`:

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { EmailLocale } from '../email.types'
import { buildEmailShell } from './shell'

const COPY: Record<EmailLocale, {
  subject: string
  title: string
  body: (roleName: string, scopeLabel: string) => string
  ctaLabel: string
  footer: string
}> = {
  en: {
    subject: 'You have been invited to Beech CMS',
    title: 'Activate your account',
    body: (roleName, scopeLabel) =>
      `You have been invited to Beech CMS as <strong>${roleName}</strong> on <strong>${scopeLabel}</strong>. Click the button below to set your password and activate your account. This link expires in 72 hours and can be used once.`,
    ctaLabel: 'Activate account',
    footer: "If you weren't expecting this invitation, you can safely ignore this email.",
  },
  it: {
    subject: 'Sei stato invitato su Beech CMS',
    title: 'Attiva il tuo account',
    body: (roleName, scopeLabel) =>
      `Sei stato invitato su Beech CMS come <strong>${roleName}</strong> su <strong>${scopeLabel}</strong>. Clicca il pulsante qui sotto per impostare la password e attivare il tuo account. Questo link scade tra 72 ore e può essere usato una sola volta.`,
    ctaLabel: 'Attiva account',
    footer: 'Se non ti aspettavi questo invito, puoi ignorare questa email in tutta sicurezza.',
  },
}

/**
 * @param inviteUrl  `${APP_URL}/admin/accept-invite?token=<opaque hex>` — built by the
 *                   caller and embedded verbatim in the CTA; the token is generated
 *                   internally by `generateOpaqueToken()` (hex only).
 * @param roleName   `roles.name` of the pre-assigned role.
 * @param scopeLabel The seed slug, or a localized label for `'*'`.
 */
export function buildInvitationEmail(
  inviteUrl: string,
  roleName: string,
  scopeLabel: string,
  locale: EmailLocale,
): { subject: string; html: string } {
  const c = COPY[locale]
  return {
    subject: c.subject,
    html: buildEmailShell(locale, {
      title: c.title,
      body: c.body(roleName, scopeLabel),
      cta: { label: c.ctaLabel, href: inviteUrl },
      footer: c.footer,
    }),
  }
}
```

`roleName` and `scopeLabel` come from D1 (`roles.name` is validated by `roleBodySchema` at authoring time; `scope` is either `'*'` or a slug that passed `getSeed`), so both are constrained values, not free user input. Do not add an HTML escaper for them — none of the existing templates has one and the values cannot carry markup.

**`email.types.ts`** — append:

```ts
/** Parameters for the invitation email — adds the activation URL and what it grants. */
export interface InvitationEmailParams extends BaseEmailParams {
  /** Complete activation URL, `?token=<opaque hex>`. */
  inviteUrl: string
  /** `roles.name` of the pre-assigned role. */
  roleName: string
  /** Seed slug, or the localized label for the global scope. */
  scopeLabel: string
  provider?: 'smtp' | 'resend'
  smtpBaseUrl?: string
}
```

**`email.service.ts`** — append (import `buildInvitationEmail` and `InvitationEmailParams` at the top):

```ts
export async function sendInvitationEmail(params: InvitationEmailParams): Promise<void> {
  const provider = createProvider({
    provider: params.provider,
    apiKey: params.apiKey,
    smtpBaseUrl: params.smtpBaseUrl,
    isDev: params.isDev ?? false,
  })
  const { subject, html } = buildInvitationEmail(
    params.inviteUrl,
    params.roleName,
    params.scopeLabel,
    params.locale,
  )
  await provider.send({
    from: params.from ?? DEFAULT_FROM,
    to: [params.to],
    subject,
    html,
  })
}
```

**`email/index.ts`** — extend the two export lines and the doc block:

```ts
export { sendPasswordResetEmail, sendPasswordChangedEmail, sendAutomationMail, sendInvitationEmail } from './email.service'
export type { EmailLocale, PasswordResetEmailParams, PasswordChangedEmailParams, AutomationMailParams, InvitationEmailParams } from './email.types'
```

### 4.6 RBAC slice

**`constants.ts`** — append to `RBAC_ERRORS` (existing codes are frozen; these four are new and become frozen on merge):

```ts
  /** Email service is not configured, so no invitation can be delivered. */
  EMAIL_UNAVAILABLE: 'email-unavailable',
  /** Token is unknown, expired or already redeemed (deliberately indistinguishable). */
  INVITATION_INVALID: 'invitation-invalid',
  /** The issuer no longer holds the authority the invitation would grant. */
  INVITATION_REVOKED: 'invitation-revoked',
  /** A consumed invitation cannot be regenerated. */
  INVITATION_ALREADY_USED: 'invitation-already-used',
```

**`rbac.schema.ts`** — append (reuses the existing `EMAIL_RE` and `passwordSchema`):

```ts
export const createInvitationSchema = z.object({
  email: z.string().trim().max(254).regex(EMAIL_RE),
  roleId: z.string().min(1),
  /** `'*'` or a seeds.slug; existence is checked against the live registry in the handler. */
  scope: z.string().trim().min(1),
  /** Email language. Anything unknown falls back to 'en' via resolveEmailLocale. */
  locale: z.string().trim().max(8).optional(),
})

export const acceptInvitationSchema = z.object({
  token: z.string().min(1).max(128),
  password: passwordSchema,
  name: z.string().trim().max(120).nullish(),
  surname: z.string().trim().max(120).nullish(),
})
```

**`invitations.ts` (NEW)** — admin handlers. Shared constants at the top:

```ts
/** 72 hours (brief §3: "link di invito con scadenza"; §4: an expired one is regenerable). */
const INVITATION_TTL_SECONDS = 72 * 60 * 60
```

Every handler returns through `rbacProblem` and imports only from `@beechcms/core`, `../../shared/*`, `./*`.

**`POST /api/rbac/invitations` — `createInvitationHandler`**
1. `readJson` → `INVALID_JSON` 400 on failure. `createInvitationSchema.safeParse` → `VALIDATION_FAILED` 422.
2. Email delivery must be configured, otherwise the invite is unusable by construction: `const useSmtp = context.env.EMAIL_PROVIDER === 'smtp'; if (!useSmtp && !context.env.RESEND_API_KEY)` → `EMAIL_UNAVAILABLE` 409 (`'Email delivery is not configured; an invitation cannot be sent.'`). Same guard shape as `request.ts:24-27`, different status because this caller is authenticated and the condition is a server misconfiguration the admin can fix.
3. `const email = parsed.data.email.toLowerCase()`. If `await userRepository.findByEmail(email)` → `EMAIL_TAKEN` 409 (an existing account gets an ASSIGNMENT, not an invite — see the VETO audit §4).
4. `idGenerator.isValid(parsed.data.roleId)` → `VALIDATION_FAILED` 422. `roleRepository.findById` → `NOT_FOUND` 404 (`'No such role.'`).
5. Scope check, copied verbatim from `assignments.ts:71-73`:
   `if (scope !== GLOBAL_SCOPE && context.get('getSeed')(scope) === null)` → `UNKNOWN_SCOPE` 422.
6. **Anti-escalation, identical to `createAssignmentHandler`** (the invitation IS a deferred assignment, so the rule must be the same rule, not a similar one):
   `const actor = await resolveEffectivePermissions(context)`
   `if (!hasPermission(actor, 'manage_users', scope))` → `FORBIDDEN` 403.
   `if (!canGrant(actor, scope, role.permissions))` → `ESCALATION_REFUSED` 403.
7. `const now = context.get('clock').nowSeconds()`; `await invitationRepository.invalidatePending(email, now)`.
8. `const token = generateOpaqueToken()` (`../../shared/utils/opaque-token`); `const tokenHash = await sha256hex(token)`; `const expiresAt = now + INVITATION_TTL_SECONDS`.
9. `const id = await invitationRepository.create({ email, tokenHash, roleId, scope, invitedBy: context.get('jwtPayload')?.sub ?? '', expiresAt })`.
10. Dispatch via the shared helper in 4.7, then `return context.json({ id, email, roleId, scope, expiresAt }, 201)`. **The plaintext token is never in the response body** — it exists only inside the email. (Sprint 5's UI shows status, never a link.)

**`GET /api/rbac/invitations` — `listInvitationsHandler`**
`const now = clock.nowSeconds()`; `listAll()`; resolve role names in one round trip with `roleRepository.findByIds([...new Set(rows.map(r => r.roleId))])`.
Visibility filter — a scoped `manage_users` holder must not enumerate invitations outside their perimeter:
`const actor = await resolveEffectivePermissions(context)` then keep a row only when `hasPermission(actor, 'manage_users', row.scope)`.
Return `{ invitations: [{ id, email, roleId, roleName, scope, invitedBy, expiresAt, createdAt, status }] }` where
`status = row.usedAt !== null ? 'accepted' : row.expiresAt <= now ? 'expired' : 'pending'`.

**`POST /api/rbac/invitations/:invitationId/regenerate` — `regenerateInvitationHandler`** (brief §4)
1. `idGenerator.isValid` → 404 `NOT_FOUND` (`'No such invitation.'`). `findById` → 404.
2. `if (row.usedAt !== null)` → `INVITATION_ALREADY_USED` 409. A consumed invite is never re-armed; issue a new one.
3. Email-configured guard (step 2 of create) → `EMAIL_UNAVAILABLE` 409.
4. Re-run BOTH authorization checks against the row's own `roleId`/`scope` (the caller regenerating may differ from the issuer, and the role's permissions may have changed since): role must still exist (`NOT_FOUND` 404), scope must still be `'*'` or an active seed (`UNKNOWN_SCOPE` 422), `hasPermission(actor,'manage_users',row.scope)` → `FORBIDDEN` 403, `canGrant(actor, row.scope, role.permissions)` → `ESCALATION_REFUSED` 403.
5. New `generateOpaqueToken()` + `sha256hex` + `expiresAt = now + INVITATION_TTL_SECONDS`; `regenerate(id, tokenHash, expiresAt)` → false means it was consumed between read and write: `INVITATION_ALREADY_USED` 409.
6. Dispatch the email again (same helper) and return `context.json({ id, expiresAt })`. `email`, `roleId` and `scope` are untouched — that IS the "same pre-assignment" requirement.

**`DELETE /api/rbac/invitations/:invitationId` — `revokeInvitationHandler`**
`isValid` → 404; `findById` → 404; `hasPermission(actor, 'manage_users', row.scope)` → **404, not 403** (same enumeration-oracle reasoning as `deleteAssignmentHandler`, `assignments.ts:121`); `delete(id)` → false → 404; else `context.body(null, 204)`. Deleting an accepted invitation is allowed and removes only the historical row — the account and its assignment are untouched.

**`invitations.public.ts` (NEW)** — unauthenticated. There is no `jwtPayload`, no `effectivePermissions` and no `permissionMiddleware` on this path, so every check is explicit.

```ts
/** Issuer authority resolved WITHOUT a JWT: the redeem path has no authenticated
 *  subject, so `resolveEffectivePermissions` (which reads `jwtPayload`) cannot be used.
 *  Same core evaluator, different subject. */
async function resolveIssuerAuthority(
  context: AppContext,
  issuerId: string,
): Promise<EffectivePermissions> {
  const assignments = await context.get('roleAssignmentRepository').listActiveForUser(issuerId)
  if (assignments.length === 0) return { global: new Set(), byScope: new Map() }
  const roles = await context.get('roleRepository').findByIds([...new Set(assignments.map(a => a.roleId))])
  return buildEffectivePermissions(assignments, roles)
}
```

**`GET /auth/invitations/:token` — `previewInvitationHandler`** (lets the sprint-5 activation screen render "you were invited as X on Y" before asking for a password)
1. IP rate limit: `const ip = getClientIp(context.req); const limit = await context.get('rateLimiters').getLimiter('acceptInvitation').checkLimit(ip)`; on refusal return 429 with `Retry-After` when present — same block as `reset.ts:31-38`, emitted through `rbacProblem(..., 429)`. Note: `rbacProblem`'s `status` union must be widened to include `429` (and `500` is not needed).
2. `const tokenHash = await sha256hex(context.req.param('token'))`; `findValidByHash(tokenHash, clock.nowSeconds())` → null → `INVITATION_INVALID` 404. Unknown, expired and used are one single answer.
3. `roleRepository.findById(invitation.roleId)` → null → `INVITATION_INVALID` 404.
4. Return `context.json({ email: invitation.email, roleName: role.name, scope: invitation.scope })`. Nothing else — no invitation id, no issuer, no permission list.

**`POST /auth/invitations/accept` — `acceptInvitationHandler`**
1. Rate limit as above.
2. `readJson` → `INVALID_JSON` 400; `acceptInvitationSchema.safeParse` → `VALIDATION_FAILED` 422.
3. `const now = clock.nowSeconds()`; `findValidByHash(await sha256hex(parsed.data.token), now)` → null → `INVITATION_INVALID` 404.
4. `roleRepository.findById(invitation.roleId)` → null → `INVITATION_INVALID` 404 (role deleted since issue; the FK cascade normally removes the row first, this is the belt-and-braces read).
5. **Scope still valid:** `if (invitation.scope !== GLOBAL_SCOPE && context.get('getSeed')(invitation.scope) === null)` → `UNKNOWN_SCOPE` 422. A seed deleted after issue must not resurrect as a grant.
6. **Issuer still authorized (VETO audit §5).** `const issuer = await userRepository.findById(invitation.invitedBy)`; refuse `INVITATION_REVOKED` 409 when `!issuer || !issuer.isActive`. Then `const authority = await resolveIssuerAuthority(context, invitation.invitedBy)` and refuse `INVITATION_REVOKED` 409 unless BOTH `hasPermission(authority,'manage_users',invitation.scope)` and `canGrant(authority, invitation.scope, role.permissions)` still hold. This is the only new authorization rule in the sprint; everything else reuses sprint 3's.
7. **Consume FIRST, atomically:** `if (!await invitationRepository.markUsed(invitation.id, now))` → `INVITATION_INVALID` 404. Ordering is deliberate — a token that reaches account creation is already burned, so two concurrent redeems can never both create. The cost is that a failure after this point burns the invite and the admin must regenerate; that is the correct trade for a credential-bearing endpoint.
8. `if (await userRepository.findByEmail(invitation.email))` → `EMAIL_TAKEN` 409 (an account for that address appeared after the invite was issued).
9. Create the account, mirroring `createUserHandler` exactly:
   `const userId = idGenerator.uuid()`; `const passwordHash = await hashProvider.hash(parsed.data.password)`;
   `await userRepository.create({ id: userId, email: invitation.email, passwordHash, role: 'editor', name: parsed.data.name ?? null, surname: parsed.data.surname ?? null })`
   inside the same `UNIQUE constraint failed` → `EMAIL_TAKEN` 409 backstop used at `users.ts:87-93`.
   `role: 'editor'` is not negotiable — see VETO audit §6.
10. `await roleAssignmentRepository.create({ userId, roleId: invitation.roleId, scope: invitation.scope })`.
11. `return context.json({ id: userId, email: invitation.email }, 201)`. **No token, no session:** the account then logs in through `POST /auth/login` like any other. Minting a session here would duplicate the login path's rate limiting and refresh-token issuance for no gain.

**`public.ts` (NEW)**

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import type { Env, Variables } from '../../types'
import { acceptInvitationHandler, previewInvitationHandler } from './invitations.public'

/**
 * UNAUTHENTICATED half of the RBAC slice, mounted at the root by `factory.ts` next to
 * `passwordResetApp` — an invitee has no account and therefore no JWT, so redemption
 * cannot live under `apiProtected`.
 *
 * Paths deliberately sit under `/auth/`, NOT under `/api/`: anything under `/api/` that
 * is not in `PROTECTED_ROUTES` is refused by the fail-closed gate, and adding a public
 * path to that table would weaken the table's meaning.
 *
 * Both handlers rate-limit by IP themselves; there is no middleware on this router.
 */
export const rbacPublicApp = new Hono<{ Bindings: Env; Variables: Variables }>()

rbacPublicApp.get('/auth/invitations/:token', previewInvitationHandler)
rbacPublicApp.post('/auth/invitations/accept', acceptInvitationHandler)
```

**`index.ts`** — append after the assignments routes (literal `regenerate` before nothing that could swallow it; Hono matches `/invitations/:id/regenerate` and `/invitations/:id` unambiguously by segment count):

```ts
rbacApp.get('/invitations', listInvitationsHandler)
rbacApp.post('/invitations', createInvitationHandler)
rbacApp.post('/invitations/:invitationId/regenerate', regenerateInvitationHandler)
rbacApp.delete('/invitations/:invitationId', revokeInvitationHandler)
```

### 4.7 Email dispatch helper (in `invitations.ts`, used by create and regenerate)

Copied structurally from `password-reset/request.ts:96-126`, including the `executionCtx` fallback that keeps tests working outside a Workers runtime:

```ts
function dispatchInvitationEmail(
  context: AppContext,
  args: { to: string; token: string; roleName: string; scope: string; locale: EmailLocale },
): void {
  const { env, req } = context
  const baseUrl = (env.APP_URL ?? new URL(req.url).origin).replace(/\/$/, '')
  const inviteUrl = `${baseUrl}/admin/accept-invite?token=${args.token}`
  const smtpBaseUrl = env.SMTP_HOST ? `http://${env.SMTP_HOST}:${env.SMTP_PORT ?? '8025'}` : undefined
  const scopeLabel = args.scope === GLOBAL_SCOPE ? 'all content' : args.scope

  const send = async () => {
    try {
      await sendInvitationEmail({
        to: args.to,
        inviteUrl,
        roleName: args.roleName,
        scopeLabel,
        locale: args.locale,
        apiKey: env.RESEND_API_KEY ?? '',
        from: env.EMAIL_FROM,
        isDev: env.ENV !== 'production',
        provider: env.EMAIL_PROVIDER as 'smtp' | 'resend' | undefined,
        smtpBaseUrl,
      })
    } catch (error) {
      if (env.ENV !== 'production') console.error('[rbac-invitations] Failed to send email:', error)
    }
  }

  try {
    context.executionCtx.waitUntil(send())
  } catch {
    void send()
  }
}
```

`locale` comes from `resolveEmailLocale(parsed.data.locale)` (create) or `resolveEmailLocale(undefined)` → `'en'` (regenerate, whose body is empty). Delivery failure never fails the request: the row exists, and the admin can regenerate.

### 4.8 Tests

**`d1-invitation.repository.test.ts`** — against `D1TestDatabase` (real SQLite, every migration applied), following `d1-role-assignment.repository.test.ts`:
- `create` + `findValidByHash` round-trip; hash-only (`SELECT token_hash` never equals the plaintext).
- `findValidByHash` returns null for: expired (`expires_at <= now`), already used, unknown hash.
- `markUsed` returns true once and **false on the second call** (single-use under concurrency).
- `invalidatePending` consumes only rows for that email with `used_at IS NULL`.
- `regenerate` swaps hash+expiry, preserves `email`/`role_id`/`scope`, and returns false for a used row.
- Deleting the role cascades the invitation away (FK).

**`invitations.test.ts`** (handler level, `D1TestDatabase` + `createBeechApp`) — the refusals that carry the security properties:
- scoped `manage_users` holder invites on ANOTHER scope → 403 `forbidden`;
- scoped holder invites with a role carrying a permission they lack on that scope → 403 `escalation-refused`;
- invite for an email that already has an account → 409 `email-taken`;
- invite on a non-existent / inactive seed slug → 422 `unknown-scope`;
- `GET /invitations` as a seed-scoped holder lists only that seed's invitations;
- regenerate on an accepted invitation → 409 `invitation-already-used`;
- revoke by a caller without `manage_users` on the row's scope → **404**, not 403.

**`apps/api/test/flow-rbac-invitations.test.ts`** (e2e, modelled on `flow-rbac-admin.test.ts`): `POST /auth/setup` → login → create role `SeedEditor` → `POST /api/rbac/invitations` (scope `posts`) → read the plaintext token from the repository seam (the test injects a capturing `invitationRepository`, or reads `token_hash` and drives the flow through a token it hashed itself — the plaintext is deliberately not in the response) → `GET /auth/invitations/:token` returns email+roleName+scope → `POST /auth/invitations/accept` → 201 → the new account logs in via `/auth/login` → it can `GET /api/content/posts` and is refused 403 on another seed → **replay `accept` with the same token → 404 `invitation-invalid`** → issue a second invite, revoke the ISSUER's global assignment, then accept → 409 `invitation-revoked` → expired invite (fabricated by writing `expires_at` in the past) → `GET` preview 404, regenerate → new token works.

Use the existing doubles rather than new ones: `apps/api/src/auth/__fixtures__/in-memory-hash-provider.ts`, `shared/services/id-generator/sequential-id-generator.ts`, `shared/services/clock/fixed-clock.ts`, `test/mocks/`.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

```bash
# 1. Schema — 0000 was EDITED, so migrate is a no-op; only reset applies it.
pnpm beech db:reset

# 2. Core contracts build (zero-dependency check is the build itself).
pnpm --filter @beechcms/core run build

# 3. Typecheck both apps. api has a documented pre-existing baseline of 32 errors
#    (search/, rate-limit.middleware.test.ts, api-key-middleware.test.ts,
#    d1-vector.repository.test.ts, packages/client/src/types.ts) — the count must not
#    grow, and zero errors may appear in any file this sprint touches.
cd apps/api && npx tsc --noEmit | grep -c "error TS"
cd apps/dashboard && npx tsc --noEmit

# 4. VSA boundary — must print NOTHING.
grep -rn "from '\.\./\(oauth\|seeds\|settings\|content\|password-reset\|setup\)" apps/api/src/features/rbac

# 5. The forbidden permission must remain unrepresentable — only comments/tests may match.
grep -rn "manage_seeds" packages/core apps/api

# 6. Reuse mandate — the invitation token must come from the single CSPRNG source.
grep -rn "randomUUID\|getRandomValues" apps/api/src/features/rbac apps/api/src/shared/db/repositories/d1-invitation.repository.ts
#    (expected: no match — entropy only via generateOpaqueToken())

# 7. The plaintext token must never leave through an admin response.
grep -rn "token" apps/api/src/features/rbac/invitations.ts
#    (expected: only tokenHash / generateOpaqueToken / dispatch args — never in context.json)

# 8. Targeted suites.
cd apps/api && npx vitest run \
  src/features/rbac \
  src/shared/db/repositories/d1-invitation.repository.test.ts \
  src/middleware/permission.middleware.test.ts \
  test/flow-rbac-invitations.test.ts \
  test/flow-rbac-admin.test.ts \
  test/flow-rbac-enforcement.test.ts

pnpm --filter @beechcms/core test

# 9. Full workspace gate. `@beechcms/mcp#test` has a documented pre-existing flake
#    (passes in isolation: cd packages/mcp && npx vitest run src/auto-restart.test.ts).
pnpm lint
pnpm beech test

# 10. Manual delivery check (Mailpit is part of the dev stack).
pnpm beech dev
#    POST /api/rbac/invitations as the SuperAdmin, then open Mailpit and confirm the
#    activation link renders and points at /admin/accept-invite?token=...
pnpm beech logs mailpit
```

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

**Contracts & typing**
- [ ] `packages/core/src/rbac/invitation.repository.ts` contains ONLY types and the `IInvitationRepository` interface — no runtime code, no import outside `./permissions.js`, no D1 or Cloudflare type reference.
- [ ] `packages/core` builds clean (`tsc`, exit 0) and the new module is exported from `src/index.ts`.
- [ ] `apps/api` `tsc --noEmit` error count is still 32, with zero errors in any file this sprint adds or modifies.
- [ ] `apps/dashboard` `tsc --noEmit` exits 0 — and no dashboard file is in the diff at all.
- [ ] No `any` in new code; every repository method's return type is the core-declared one.

**Schema**
- [ ] `invitations` exists as an EDIT to `0000_v040_base.sql` (section 21). `git diff` shows no new numbered migration file and no `ALTER TABLE`.
- [ ] Table carries FKs to `roles(id)` and `users(id)` with `ON DELETE CASCADE`, no FK on `scope`, and the three declared indexes.
- [ ] `pnpm beech db:reset` applies cleanly; the whole API suite (which re-applies every migration through `D1TestDatabase`) still passes.

**Invariants**
- [ ] `D1InvitationRepository` does not extend `BaseD1Repository` and issues no query against a `content_{slug}` table.
- [ ] No column name of `invitations` appears outside `d1-invitation.repository.ts`.
- [ ] No file under `features/rbac/` imports from another `features/*` slice (validation step 4 prints nothing).
- [ ] `manage_seeds` is still absent from `PERMISSIONS` (7 entries) and from the `role_permissions` CHECK list.
- [ ] Accounts created by redemption have `users.role = 'editor'`; `POST /auth/setup` remains the only producer of `'admin'` (asserted in the e2e test).

**Token handling**
- [ ] The invitation token is produced by `generateOpaqueToken()` and by nothing else; no second entropy helper is introduced.
- [ ] Only `sha256hex(token)` is persisted — `invitations` has no plaintext column, and a repository test asserts the stored value differs from the token.
- [ ] The plaintext token appears in exactly one outbound channel: the invitation email. `POST /api/rbac/invitations` and `.../regenerate` responses do not contain it.
- [ ] `markUsed` is atomic (`WHERE used_at IS NULL`) and returns false on the second call; the accept handler consumes BEFORE creating the account.
- [ ] Both public endpoints rate-limit by IP through `rateLimiters.getLimiter('acceptInvitation')` and answer 429 with `Retry-After` when the bucket reports one.

**Authorization**
- [ ] All four admin routes have a `PROTECTED_ROUTES` row with `anyScope('manage_users')`; neither public route is added to that table.
- [ ] Issuing an invite applies the SAME two checks as `createAssignmentHandler`: `hasPermission(actor,'manage_users',scope)` and `canGrant(actor, scope, role.permissions)`.
- [ ] Redemption re-evaluates the ISSUER's live authority (account active + both checks) and refuses `409 invitation-revoked` otherwise — asserted by an e2e case that revokes the issuer between issue and accept.
- [ ] Redemption refuses `422 unknown-scope` when the scope's seed was deleted or deactivated after issue.
- [ ] Unknown, expired and already-used tokens are indistinguishable: all three answer `404 invitation-invalid` on both public endpoints.
- [ ] `GET /api/rbac/invitations` returns only rows whose scope the caller holds `manage_users` on; `DELETE` on a row outside that perimeter answers 404, not 403.
- [ ] An invite for an email that already has an account is refused `409 email-taken` at issue AND at redemption.

**Lifecycle (brief §4)**
- [ ] Regeneration preserves `email`, `role_id` and `scope`, swaps token and expiry, and is refused `409 invitation-already-used` for a consumed invitation.
- [ ] Issuing a new invitation for an address consumes any pending one for it (`invalidatePending`), so at most one live token per address exists.

**Build & suite**
- [ ] `pnpm lint` passes.
- [ ] `pnpm beech test` shows no new failure (only the documented `@beechcms/mcp` flake, verified green in isolation).
- [ ] `apps/api/test/flow-rbac-invitations.test.ts` covers the full lifecycle including single-use replay, issuer revocation, expiry + regeneration, and post-activation scope isolation.
- [ ] Mailpit shows the invitation email with a working `/admin/accept-invite?token=` link in both `en` and `it`.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

**Deferred to sprint 5 `RbacDashboardSurfaces`** (roadmap row 5):
- The `/admin/accept-invite` activation page and every other dashboard screen. This sprint writes ZERO files under `apps/dashboard/`; the email link points at a route that does not render yet, which is expected and is exactly what sprint 5 delivers.
- The invites list/issue/revoke UI, and permission-derived navigation.
- The coarse projections sprint 2 left global and sprint 5 inherits (`GET /api/schema`, `/api/content/drafts`, `/api/search`, `/api/upload*`, `/api/automations*`, `/api/dashboard-layout`). Untouched here.

**Not built, by decision (VETO audit §4):**
- Any `users` row created at invite time, any `pending`/`invited` account state, any sentinel `password_hash`.
- An `invitations.status` column — status is derived from `used_at` + `expires_at`.
- Inviting an account that already exists (adding a scope to an existing user). That is `POST /api/rbac/assignments`, shipped in sprint 3.
- Bulk invites, invite resend throttling per invitee, invite acceptance analytics, an admin-visible copyable invite link.
- Auto-login or session minting at redemption. The activated account logs in through `POST /auth/login`.

**Must not be touched:**
- `seedTestUsers()` — 19 authenticated suites depend on it; invitation tests mint their accounts through the redeem endpoint itself.
- `IUserRepository` and `D1UserRepository` — `create()` + `findByEmail()` already cover redemption (`graphify affected "IUserRepository"`: no affected nodes, and that must stay true).
- `permissionMiddleware()`'s body, `resolveRouteRule`, or any existing `PROTECTED_ROUTES` row. This sprint only APPENDS rows.
- The sprint-3 handlers (`users.ts`, `roles.ts`, `assignments.ts`) and `guards.ts`, except widening `rbacProblem`'s `status` union to admit `429`.
- `features/password-reset/` — including its legacy `crypto.randomUUID()` token. Migrating it to `generateOpaqueToken()` is a separate, unrelated cleanup.
- `users.role`, `requireAdmin()`, `requireLayoutEditPermission()`, `/api/seeds/*`, `/api/schema/:slug/layout` — retained permanently (roadmap "developer axis", sprint 3 VETO audit §5).
- `_config/database_workflow.md`'s stale "never edit an applied migration" rule — flagged in the roadmap, but rewriting project config is not this sprint's job.
