# ROADMAP — Multi-Stakeholder RBAC / Multi-Tenant Portal

Feature brief: `stages/00_ideation/output/feature_brief.md`

The brief does not fit one sprint: it requires sequential merges across three tiers
(`@beechcms/core` contracts + D1 schema → `apps/api` enforcement → `apps/api` admin
surfaces → `apps/dashboard` UI). Each boundary must be validated independently before
the next lands. Detailed Task Details exist ONLY for the sprint currently in flight.

| # | Slug | Goal (one line) | Deliverables summary | Depends on |
|---|------|-----------------|----------------------|------------|
| 1 | `RbacCorePrimitives` | Land the closed permission vocabulary, the ABAC evaluator and the D1 tables, with zero behaviour change. | `packages/core/src/rbac/*` (enum, types, pure evaluator, repository interfaces), schema folded into `migrations/0000_v040_base.sql`, D1 repositories, `Variables` wiring. No routes, no UI, no enforcement. | — (first) |
| 2 | `RbacRequestEnforcement` | Turn the evaluator into the single authorization gate on every protected request. | `permission.middleware.ts` on `apiProtected`, scope resolution from the seed slug in the route, replacement of `requireAdmin`, real `IRoleGuard` adapter swapped for `AllowAllRoleGuard` (**widening `arbitrate()` — 1 production call site, `features/oauth/authorize.ts:222`**), `is_active` session revocation on the auth path, **and the SuperAdmin grant at `POST /auth/setup` (see lockout warning)**. May also drop the legacy `users.role` column outright. | Sprint 1 (evaluator + tables must exist and be queryable) |
| 3 | `RbacUserRoleAdminApi` | Expose account/role/assignment administration with anti-escalation and the last-SuperAdmin guardrail. | New VSA slice `apps/api/src/features/rbac/` (users CRUD, roles CRUD, assignment CRUD, activate/deactivate), `canGrant` enforcement, guardrail refusing revocation of the last active SuperAdmin. Route gating and `RBAC_ERRORS` follow the `features/oauth/index.ts` + `oauth/constants.ts` conventions. | Sprint 2 (endpoints must be gated by the middleware they configure) |
| 4 | `RbacInvitations` | Invite-only onboarding: single-use expiring tokens carrying a pre-assigned role+scope. | `invitations` table, invite issue/regenerate/redeem endpoints inside the `rbac` slice, email dispatch via `INotificationService`, activation flow setting credentials via the existing `IHashProvider`. Token handling reuses `generateOpaqueToken()` + `sha256hex()`; the repository mirrors `IPasswordResetTokenRepository`. | Sprint 3 (an invite pre-assigns a role that must already be creatable) |
| 5 | `RbacDashboardSurfaces` | Make the dashboard reflect exactly the caller's effective permissions. | `apps/dashboard/src/features/rbac/` (users, roles, invites screens), permission-derived navigation/section visibility, `/api/settings/me` permission payload consumption. | Sprint 4 (UI must be able to drive the full invite lifecycle) |

## Ordering rationale

- Schema and vocabulary first: every later sprint reads `Permission` and the assignment
  triple. Introducing them alongside enforcement would make the enforcement diff
  unreviewable.
- Enforcement before administration: an admin API that creates roles must itself be
  protected by the gate it feeds, otherwise sprint 3 ships a privilege hole that
  sprint 2 later closes.
- Invitations after administration: an invite is a deferred assignment. It cannot
  pre-assign a role+scope that no endpoint can create yet.
- UI last: the dashboard is a projection of the effective permission set. It has no
  independent contract to validate before the API emits one.

## Migration policy for this feature (beta)

The project is in beta and the database is disposable. **Schema changes are folded into
`apps/api/migrations/0000_v040_base.sql`, not added as new numbered migrations.** This
supersedes the "never edit an already-applied migration" rule still written in
`_config/database_workflow.md` — that file should be updated so the next planning stage
does not re-derive the old rule.

Consequences for every sprint here:
- `pnpm beech db:migrate` is a no-op against an edited `0000`. **`pnpm beech db:reset`
  is the only command that applies the change** — locally and in any deployed
  environment.
- Column changes are edits to the existing `CREATE TABLE`, never `ALTER TABLE`.
- Data backfills against pre-existing rows are meaningless: `0000` runs on an empty
  database. Anything a live account needs must be granted at runtime.
- Dropping a column (e.g. the legacy `users.role` in sprint 2) is just an edit plus a
  reset. No down-migration, no deprecation window.

> **Lockout warning.** `user_role_assignments` ships empty. When enforcement lands in
> sprint 2, nobody holds any permission until `POST /auth/setup` grants `SuperAdmin` at
> `'*'` to the account it creates. That grant MUST ship in the same PR as the gate.

## Reuse mandate (applies to every sprint)

The identity tier already exists. No sprint in this feature may re-implement any of it:

- **Entropy / bearer credentials** — `generateOpaqueToken()`
  (`apps/api/src/shared/utils/opaque-token.ts`) is the single CSPRNG source for every
  bearer credential in the API, by its own explicit contract. Invitation tokens go
  through it. No second helper, ever.
- **Hashing at rest** — `sha256hex()` (`packages/core/src/engine/policies.ts`). Every
  token table stores hash-only, like `oauth_tokens`, `refresh_tokens` and
  `password_reset_tokens` already do.
- **Password hashing** — the existing `IHashProvider` (`apps/api/src/auth/providers/`).
- **Single-use expiring token repository** — mirror `IPasswordResetTokenRepository`
  (`invalidatePending` / `create` / `findValidByHashWithEmail` / `markUsed`) and the
  `password_reset_tokens` DDL. It is already the invitation lifecycle.
- **Ids** — `IIdGenerator.uuid()`; validate with `isValid()`, never an inline regex.
- **Role arbitration** — extend the existing `IRoleGuard` seam
  (`packages/core/src/oauth/role-guard.ts`). Do not add a parallel authorization seam.
- **Slice conventions** — per-route gating as in `features/oauth/index.ts` (note:
  admin surfaces use bare `authMiddleware()`, never `acceptOAuth: true`), and a frozen
  error-code map per slice as in `auth/constants.ts` / `oauth/constants.ts`.
- **Test doubles** — `apps/api/src/auth/__fixtures__/` (`in-memory-hash-provider.ts`,
  `static-token-service.ts`), `shared/services/id-generator/sequential-id-generator.ts`,
  `shared/services/clock/fixed-clock.ts`, `test/mocks/` — instead of new ad-hoc doubles.
- **Database-backed tests** — `D1TestDatabase` (`test/helpers/d1-test-database.ts`)
  runs real SQLite with every numbered migration applied. Any test asserting SQL
  behaviour uses it; mocked `prepare`/`bind` stubs cannot verify a query.
- **Repository base class** — `BaseD1Repository` is content-tier
  (`getTableName` → `content_{slug}`, `SlugConflictError` mapping). System-table
  repositories do not extend it; RBAC repositories follow that split.
- **Migrations are globally applied in tests** — `D1TestDatabase` picks up every
  `^\d{4}_.+\.sql$` file, so a broken migration in any RBAC sprint fails the whole
  suite, not just its own specs.
