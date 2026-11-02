# Sprint Plan — LegacyRoleAxisRemoval (ROADMAP entry 9)

Feature brief: `stages/00_ideation/output/feature_brief.md` (rule 27, rule 32; §4 "Rimozione del legacy"; §5 "Compatibilità
con dati esistenti").
Roadmap: `stages/01_sprint_planning/output/backlog/ROADMAP.md`, entry 9.

Entries 1–7 are shipped. Entry 7 is commit `8a1cd718`. Entry 8 (`LegacyRoleGateReplacement`) passed review and is
archived in `docs/Sprints/LegacyRoleGateReplacement/`, but it is still **uncommitted** on
`feature/legacy-role-gate-replacement`. This sprint deletes storage that entry 8 stopped reading, so it starts from that
branch once entry 8 is committed. It is never based on `devs`/`master`.

### Pre-Computation Analysis

Graph refreshed with `graphify update . --force` (29 066 nodes, 41 867 edges) before any query.

**a) God nodes identified via the CLI**

| Node | Source | Reach | Why it matters here |
|------|--------|-------|---------------------|
| `seedUsers()` / `createTestHarness()` | `packages/testing/src/seeds/provision.ts:L78`, `harness.ts:L60` | every harness integration suite (`graphify affected "seedUsers()" --depth 2`: 25+ suites across content, draft, search, seeds, settings, upload, rbac) | Writes `users.role` and decides the SuperAdmin grant from it. One change here moves every integration suite, so this is the riskiest line of the sprint. |
| `seedTestUsers()` | `apps/api/test/helpers/seed-fixtures.ts:L22` | 30 files (unit + flow tiers: oauth, rbac, middleware, repositories, effective-permissions, 11 flow suites) | Same coupling: `grantSuperAdmin ?? role === 'admin'`, with `role` defaulting to `'admin'`. |
| `D1UserRepository` | `apps/api/src/shared/db/repositories/d1-user.repository.ts:L57` | every login, refresh, OAuth request, `/api/rbac/users*` | 4 SELECTs + 2 INSERTs name the column. After `0041`, each one throws `no such column: role`. |
| `JwtClaims` | `packages/core/src/auth/token-service.ts:L4` | every request (`authMiddleware` → `jwtPayload`) | `role?: string` leaves. The `[key: string]: unknown` index signature stays, so `jwtPayload.role` **still compiles**, typed `unknown`. For the propagation sites the compiler is not the oracle: grep is (T4). |
| `ActorContext` | `packages/core/src/engine/types.ts:L70` | `policies.ts` (`graphify affected --depth 1`: its only importer in core) | `policies.ts:L187` reads `actor.type` only. Removing `role` changes no privacy decision. |

**b) Architectural boundaries affected**

- `@beechcms/core` (pure, zero I/O): type deletions only, no logic.
  - `auth/user.repository.ts`: `UserRecord.role`, `AccountSummary.role`, `NewUserInput.role` and their JSDoc.
  - `auth/token-service.ts`: `JwtClaims.role`.
  - `engine/types.ts`: `ActorContext.role`.
  - `common/hooks.ts`: `HookActor.role`.
  - `content/content.repository.ts`: `RepositoryOptions.actor.role`.
- `apps/api`:
  - migration `0041_drop_users_role.sql` (new);
  - writers: `features/setup/index.ts`, `features/rbac/users.ts`, `features/rbac/invitations.public.ts`;
  - repositories: `shared/db/repositories/d1-user.repository.ts`, `d1-invitation.repository.ts`;
  - JWT issuance: `auth/auth.app.ts` (login, refresh), `middleware/auth.middleware.ts` (OAuth claims);
  - actor propagation: `features/content/handlers/{create,delete,update,trash,get,list,export}.ts`,
    `features/draft/draft.handler.ts`, `features/widget/widget.ts`;
  - test helpers and tests (T5, T6).
- `packages/testing`: `seeds/canonical.data.ts`, `seeds/provision.ts`, `harness.ts`.
- `apps/dashboard`: tests only. No source file reads `role` since entry 8 (grep, T7). `AccountView` is the Hono RPC
  inference of `/api/rbac/users` (`features/rbac/types/rbac.types.ts:L15`), so it loses `role` with no dashboard edit.

**c) `graphify affected` impact analysis**

```
graphify affected "ActorContext" --depth 1
- policies.ts [imports] packages/core/src/engine/privacy/policies.ts:L1
  → reads actor.type only (L174, L187). Not a reader of role.

graphify affected "NewUserInput" --depth 1
- invitation.repository.ts [imports]  packages/core/src/rbac/invitation.repository.ts:L1
- InvitationRedemption [references]   packages/core/src/rbac/invitation.repository.ts:L42
  → InvitationRedemption.user is a NewUserInput, so d1-invitation.repository.ts:L103-104 must drop the column (T3).

graphify affected "HookActor" --depth 1      → No affected nodes found.
graphify affected "AccountSummary" --depth 1 → No affected nodes found.
graphify affected "JwtClaims"                → No unique node match (type-level graph miss).
graphify affected "resolveActor()" --depth 2 → No affected nodes found (module-private, widget.ts:L85).
  → The graph is weak on type references. grep complements it below.

graphify affected "accountFromRow()" --depth 2
- .findAccountById() [calls] d1-user.repository.ts:L184   (and .listAccounts(), grep L172-181)

graphify affected "seedUsers()" --depth 2     → harness.ts, createTestHarness(), index.ts re-export, 25+ integration suites
graphify affected "seedTestUsers()" --depth 2 → 30 importers (oauth, rbac, middleware, repositories, shared/rbac, flow/*)
  → Both helpers keep their signatures. Only the grant default changes source, from `role` to an explicit flag (T5).
```

grep over `apps/` and `packages/` (excluding `node_modules`, `dist`, `.wrangler`, `graphify-out`, `migrations/_archive`)
finds every remaining non-test touch of the legacy value. **None of them branches on it:**

```
WRITERS
apps/api/src/features/setup/index.ts:270                  role: 'admin'           (createInitialAdmin input)
apps/api/src/features/rbac/users.ts:12-13, :76            CREATED_ACCOUNT_ROLE = 'editor'
apps/api/src/features/rbac/invitations.public.ts:120      role: 'editor'          (redeem input)
apps/api/src/shared/db/repositories/d1-user.repository.ts:14,25,37,50,69,77,85-86,95-96,175,187
apps/api/src/shared/db/repositories/d1-invitation.repository.ts:103-104
packages/testing/src/seeds/provision.ts:83-86
apps/api/test/helpers/seed-fixtures.ts:13,24-29
JWT ISSUANCE
apps/api/src/auth/auth.app.ts:154 (login), :212 (refresh)
apps/api/src/middleware/auth.middleware.ts:114            (OAuth resource-owner claims)
packages/testing/src/harness.ts:83                        (asUser)
ACTOR PROPAGATION (value copied, never read)
content/handlers/create.ts:113, delete.ts:36, update.ts:168, trash.ts:36, trash.ts:82, get.ts:39, get.ts:100,
list.ts:201, export.ts:139; draft/draft.handler.ts:109, :239; widget/widget.ts:90
```

`actor?.role`, `actor.role`, `options.actor` + role, `user.role ===`, `payload.role`: 0 readers in core policies, hooks,
automations, the dashboard, `packages/cli`, `packages/client`, `packages/api-client`, `packages/mcp/src`, `scripts`, `e2e`.
The two remaining mentions are docs (`docs/manage/roles-permissions.md:202` and its mirror in `packages/mcp/resources/`),
and they belong to entry 10.

**Migration facts checked:**
- `users.role` is declared at `0000_v040_base.sql:L31`: `TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('admin', 'editor'))`.
- No index names it. The only index on `users` is `idx_users_active` (`0032:L20`). No trigger or view names it: the only
  triggers are the FTS triggers of `0030_test_seeds.sql`, and there is no `CREATE VIEW`.
- The CHECK is the column's own. SQLite (≥ 3.35, which D1 runs) refuses `DROP COLUMN` only for a CHECK "not associated
  with the column being dropped". So `ALTER TABLE users DROP COLUMN role` works in place, as `0034` did for
  `seed_layouts.view_config`.
- `0035_backfill_legacy_role_assignments.sql` reads `users.role`, but it runs before `0041` in every database, fresh or
  upgraded.

**Fixture traps found during the mapping:**
1. `seedTestUsers` (`seed-fixtures.ts:L24-29`): `role ?? 'admin'` → grant iff `'admin'`. Every caller that omits `role`
   gets SuperAdmin today, including `test/fixtures.ts:L131 TEST_USERS`, which has no `role` key. The new default must
   be `grantSuperAdmin ?? true`, or 30 files silently lose authority.
2. `seedUsers` (`provision.ts:L86`): `grantSuperAdmin ?? role === 'admin'`. Only `CANONICAL_USERS.admin` omits the flag.
   The flag becomes **required** on `CanonicalUser`, so the compiler, not a default, decides every canonical account.
3. `JwtClaims` index signature (god-node table above): removing `role?: string` turns `jwtPayload.role` into `unknown`
   but does not break the build. `const actor = { id, role: jwtPayload.role, email }` (create/delete/update/trash) is
   not an excess-property site either. Only the `ActorContext`-annotated literals (get, list, export, trash:L82, draft,
   widget) fail to compile. T4 is therefore grep-driven.
4. `flow-rbac-upgrade.test.ts` inserts `role` into a **legacy** schema (`test/fixtures/legacy-migrations/0000_v040_base.sql`)
   **before** it replays the pending migrations, so those inserts stay valid. The suite is the natural proof that `0041`
   applies on an upgraded database (T6).

### VETO Audit

- **Botanical invariant.**
  - The one schema change touches the `users` system table. It is not a `content_*` table, has no Branch ID, and does
    not go through `apiToDb`/`dbToApi`.
  - It runs through the strict migration workflow (`0041`, applied by `pnpm beech db:migrate`). It is not an ad-hoc
    `ALTER`.
  - No D1 query bypasses `@beechcms/core`: the repositories keep their `IUserRepository` / `IInvitationRepository`
    contracts and lose one column.
  - **PASS.**
- **VSA.**
  - The sprint adds no import statement anywhere. It only deletes fields, SQL columns and object properties.
  - The test helpers stay where they are: `@beechcms/testing` for harness suites, `apps/api/test/helpers` for unit/flow.
  - Nothing crosses a slice. **PASS.**
- **Cloudflare purity.** `DROP COLUMN` in place, with no table rebuild and no new binding. **PASS.**
- **YAGNI cuts applied before drafting:**
  1. **No replacement field.**
     - Brief rule 32: the developer is recognisable only because `POST /auth/setup` grants SuperAdmin.
     - No `is_owner`, no `created_by_setup` marker (brief §5).
  2. **No `role` stripper for stale tokens.**
     - Access JWTs live 15 minutes, and a pre-`0041` token keeps a `role` claim until it expires.
     - Nothing reads the claim after this sprint, and `JwtClaims` keeps its index signature for arbitrary claims, so an
       unknown claim is inert.
     - One existing regression test already proves it (`flow-media-assets.test.ts:L373`, kept in T6). No middleware is
       added to delete it.
  3. **No new harness API** (for example `asUser(user, { extraClaims })`). The stale-claim guard lives in the flow tier,
     which already signs its own tokens. The two integration-tier "users.role 'admin' without a grant" guards are
     deleted, not ported: after `0041` that account shape cannot exist, and the neighbouring "editor without
     manage_seeds" cases cover the same 403 (T6).
  4. **No data migration** and no compatibility shim (brief §5: the DB is test-only).
  5. **`setup/index.ts` `isDeveloper` env flag untouched** (brief §2 "Confini invalicabili").

No violation remains. HANDOFF → executor.

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

After entry 8 nothing **decides** anything from `users.role` or the JWT `role` claim. The axis is still **stored,
issued and copied** everywhere, though:
- every account creation writes it (setup, `POST /api/rbac/users`, invitation redemption, both test helpers);
- every login, refresh and OAuth request puts it in the claims;
- eleven content, draft and widget call sites copy it into the actor;
- the core types advertise it to hook and repository authors as if it meant something.

Brief rule 27 requires a single authorization model, and "nessuna lettura di `users.role` né del claim `role`" is a
cross-cutting acceptance criterion (§4). Keeping a dead axis that looks authoritative invites a future reader to branch
on it again, which is exactly the class of bug entries 7–8 removed.

This sprint is last-but-one because it can only be a pure deletion once every reader is gone. Entry 8 removed them and
proved each replacement rule with tests. Here the type checker finds every typed leftover. A short, explicit grep list
covers the propagation sites the index signature hides (trap 3). Docs follow in entry 10, so they describe the
final model only once.

Architecture:
- `@beechcms/core` stays the single source of the contracts. It loses fields, gains nothing, and imports nothing.
- `apps/api` slices change only their own files, and no slice imports another.
- `apps/dashboard` source is untouched. Its RPC types follow the API automatically.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Middleware order** (unchanged): `authMiddleware` verifies the bearer token (JWT, or OAuth access token resolved to the
resource owner's claims at `auth.middleware.ts:L104-117`) and sets `jwtPayload`. Then `permissionMiddleware()` resolves
`resolveActiveAccount` → route rule → RBAC evaluation through `resolveEffectivePermissions` + core `hasPermission`.
Neither step reads `role`.

**Account creation paths** (all must keep working without the column):
- `POST /auth/setup` (`setup/index.ts:L263-280`) → `userRepository.createInitialAdmin(user, roleGrant)`. A D1 batch
  inserts `setup_completed`, `users` and the SuperAdmin `user_role_assignments` row (`d1-user.repository.ts:L90-103`).
  This grant is what keeps the setup account administrable (brief rule 32).
- `POST /api/rbac/users` (`rbac/users.ts:L68-80`) → `userRepository.create` with `CREATED_ACCOUNT_ROLE`, then zero
  assignments (zero-trust).
- `POST /auth/invitations/accept` (`rbac/invitations.public.ts:L112-126`) → `invitationRepository.redeem`. A batch
  inserts the user and its assignment, both guarded `WHERE EXISTS (… used_at IS NULL)`
  (`d1-invitation.repository.ts:L98-110`).

**Account reads:** `findById` / `findByEmail` (`UserRow` → `rowToRecord`), `listAccounts` / `findAccountById`
(`AccountRow` → `accountFromRow`). `AccountSummary` goes on the wire through `/api/rbac/users*`, and the dashboard
infers `AccountView` from that response.

**Claims:** `JwtClaims` (`token-service.ts:L4-11`) = `sub`, `email?`, `name?`, `surname?`, `role?`, plus the index
signature. `FakeTokenService` (`packages/testing/src/services/fake-token.service.ts`) and `JoseTokenService` accept any
`JwtClaims`.

**Test harness facts:**
- `CANONICAL_USERS` (`canonical.data.ts:L24-54`): `admin` (`role 'admin'`, no flag → SuperAdmin@*); `editor` and
  `viewer` (`role 'editor'`, `grantSuperAdmin: false`).
- `createTestHarness` seeds all three by default (`harness.ts:L68`). `asUser` issues `{ sub, email, name, role }`
  (`L83`).
- `seedTestUsers` (`seed-fixtures.ts`): see trap 1.
- Integration DBs apply every file in `apps/api/migrations/` (`vitest.workers.config.ts:L11`, `readD1Migrations`).
  Unit/flow `D1TestDatabase` applies the same directory (`test/helpers/d1-test-database.ts:L12`), skipping data-only
  migrations. `0041` is picked up with no config change.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

Create:
- `apps/api/migrations/0041_drop_users_role.sql`

Edit (source):
- `packages/core/src/auth/user.repository.ts`
- `packages/core/src/auth/token-service.ts`
- `packages/core/src/engine/types.ts`
- `packages/core/src/common/hooks.ts`
- `packages/core/src/content/content.repository.ts`
- `apps/api/src/features/setup/index.ts`
- `apps/api/src/features/rbac/users.ts`
- `apps/api/src/features/rbac/invitations.public.ts`
- `apps/api/src/shared/db/repositories/d1-user.repository.ts`
- `apps/api/src/shared/db/repositories/d1-invitation.repository.ts`
- `apps/api/src/auth/auth.app.ts`
- `apps/api/src/middleware/auth.middleware.ts`
- `apps/api/src/features/content/handlers/create.ts`, `delete.ts`, `update.ts`, `trash.ts`, `get.ts`, `list.ts`,
  `export.ts`
- `apps/api/src/features/draft/draft.handler.ts`
- `apps/api/src/features/widget/widget.ts`
- `packages/testing/src/seeds/canonical.data.ts`, `seeds/provision.ts`, `harness.ts`
- `apps/api/test/helpers/seed-fixtures.ts`

Edit (tests), see T6 and T7 for each change:
- `apps/api/src/auth/auth.app.test.ts`, `auth/jwt-claims-passthrough.test.ts`, `auth/providers/jwt-token.service.test.ts`
- `apps/api/src/factory.custom-routes.test.ts`
- `apps/api/src/features/content/handlers/list.test.ts`, `update.test.ts`
- `apps/api/src/features/content/test/integration/content-export.integration.test.ts` (comment only)
- `apps/api/src/features/rbac/users.test.ts`, `users.get.test.ts`, `assignments.test.ts`
- `apps/api/src/features/rbac/test/integration/last-admin.integration.test.ts` (comment only)
- `apps/api/src/features/schema/test/integration/seed-layout.integration.test.ts`
- `apps/api/src/features/seeds/seeds.test.ts`
- `apps/api/src/features/seeds/test/integration/seed-access.integration.test.ts`
- `apps/api/src/features/settings/settings.handler.test.ts`
- `apps/api/src/shared/db/repositories/d1-user.repository.test.ts`, `d1-invitation.repository.test.ts`
- `apps/api/test/flow/flow-rbac-admin.test.ts`, `flow-rbac-invitations.test.ts`, `flow-rbac-upgrade.test.ts`,
  `flow-media-assets.test.ts` (comment only)
- `apps/dashboard/src/features/rbac/components/users-tab.test.tsx`
- `apps/dashboard/src/features/rbac/api/rbac.api.test.ts`
- `apps/dashboard/src/features/dashboard/test/unit/dashboard-page.test.tsx`
- `apps/dashboard/src/lib/api-jwt-decode.test.ts`

Any further test file the compiler or the T7 grep flags gets the same mechanical treatment. List it in the execution
log.

API contract change:
- `AccountSummary` responses (`GET /api/rbac/users`, `GET /api/rbac/users/:userId`, `POST /api/rbac/users`) lose `role`.
- Issued access tokens no longer carry `role`.

Nothing else changes: no status code, no error code, no route.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### T1 — Migration `0041`: drop `users.role`

Approach: in-place `DROP COLUMN`. The CHECK is the column's own and nothing indexes or triggers on it (Pre-Computation,
"Migration facts"), so no table-copy rebuild is needed, unlike `0040`.

File `apps/api/migrations/0041_drop_users_role.sql`. Header comment in the style of `0034_drop_seed_layouts_view_config.sql`:
it states that the legacy axis leaves (brief rule 27), that no data is kept (brief §5), and why no rebuild is needed.
DDL, verbatim:

```sql
ALTER TABLE users DROP COLUMN role;
```

Rules:
- Do not edit `0000_v040_base.sql`, `0035` or the legacy fixture `test/fixtures/legacy-migrations/0000_v040_base.sql`.
  Migrations are append-only, and the upgrade test needs the legacy shape.
- If `pnpm beech db:migrate` refuses the statement on local D1, stop and report it. Do not fall back to a rebuild
  without updating this plan. The only expected cause is a CHECK the mapping missed.

### T2 — Core contracts lose `role`

Approach: delete the field and its JSDoc. Do not mark it deprecated or optional (brief rule 27: no compatibility).

- `packages/core/src/auth/user.repository.ts`:
  - `UserRecord`: delete `role` and its JSDoc (`L12-18`);
  - `AccountSummary`: delete `role` and its JSDoc (`L38-43`);
  - `NewUserInput`: delete `role` (`L52`).
  - `InitialRoleGrant` and the `createInitialAdmin` JSDoc speak of the RBAC grant and stay.
- `packages/core/src/auth/token-service.ts:L9`: delete `role?: string`. Keep the index signature, because OAuth and
  provider claims rely on it.
- `packages/core/src/engine/types.ts:L73`: delete `role?: string` from `ActorContext`.
- `packages/core/src/common/hooks.ts:L11`: delete `role?: string` from `HookActor`.
- `packages/core/src/content/content.repository.ts:L187`: `RepositoryOptions.actor` becomes `{ id: string; email?: string }`.
- `packages/core/src/rbac/permissions.ts:L12-16` (JSDoc): it says `manage_seeds` "replaces the former developer axis
  (`users.role = 'admin'`)". The sentence stays true and stays as history. Do not edit it.

Resulting exported shapes (other modules and entry 10 depend on these):

```ts
export interface JwtClaims {
  sub: string
  email?: string
  name?: string
  surname?: string
  [key: string]: unknown
}

export interface ActorContext {
  type: 'public' | 'authenticated' | 'system'
  userId?: string
}

export interface HookActor {
  id: string
  email?: string
}

// RepositoryOptions
actor?: { id: string; email?: string }

export interface NewUserInput {
  id: string
  email: string
  passwordHash: string
  name: string | null
  surname: string | null
}
```

`UserRecord` and `AccountSummary` keep every other field in its current order.

Rebuild core (`pnpm run build` in `packages/core`) before touching `apps/api`. Both apps consume `dist/`.

### T3 — API writers and JWT issuance

Approach: delete the property or column at each site. No value is computed in its place.

- `features/setup/index.ts:L270`: drop `role: 'admin'` from the `createInitialAdmin` user. The SuperAdmin grant
  (`roleAssignmentId`, same call) is untouched. It is now the only marker of the setup account (brief rule 32).
- `features/rbac/users.ts`:
  - delete `CREATED_ACCOUNT_ROLE` and its JSDoc (`L12-13`);
  - drop `role: CREATED_ACCOUNT_ROLE` from `userRepository.create` (`L76`);
  - the "ZERO-TRUST account: no role, no scope" JSDoc (`L55`) means the RBAC role and stays.
- `features/rbac/invitations.public.ts:L120`: drop `role: 'editor'` from the redeemed user.
- `shared/db/repositories/d1-user.repository.ts`:
  - `AccountRow` / `accountFromRow` (`L14`, `L25`) and `UserRow` / `rowToRecord` (`L37`, `L50`): drop `role`;
  - SELECTs `findById` (`L69`), `findByEmail` (`L77`), `listAccounts` (`L175`), `findAccountById` (`L187`): drop
    `role` from the column list;
  - INSERTs `create` (`L85-86`) and `createInitialAdmin` (`L95-96`): column list
    `(id, email, password_hash, name, surname)`, 5 placeholders, bind without `user.role`.
  - Placeholder count and bind count must match exactly. A mismatch is a runtime D1 error, not a type error.
- `shared/db/repositories/d1-invitation.repository.ts:L103-104`: same column list, 5 value placeholders, then the
  unchanged `WHERE ${pending}` binding `input.invitationId`. Bind order:
  `user.id, user.email, user.passwordHash, user.name, user.surname, input.invitationId`.
- `auth/auth.app.ts:L154` (login) and `L212` (refresh): drop `role: user.role` from `tokenService.issue`.
- `middleware/auth.middleware.ts:L114`: drop `role: user.role` from the OAuth `claims`. The comment above (`L101-103`,
  "the SAME shape as a JWT request") stays true.

### T4 — Actor propagation

Approach: drop the `role` property where it is copied. This is a grep-driven task, because of trap 3: the
`ActorContext` literals fail to compile, but the four untyped `{ id, role, email }` objects do not.

Exact sites, all of the same edit (delete the `role: jwtPayload…role` entry, keep `id`/`userId` and `email`):
- `features/content/handlers/create.ts:L113`, `delete.ts:L36`, `update.ts:L168`, `trash.ts:L36` (`actorFrom`):
  `{ id, role, email }` → `{ id, email }`;
- `features/content/handlers/get.ts:L39`, `get.ts:L100`, `list.ts:L201`, `export.ts:L139`, `trash.ts:L82`,
  `features/draft/draft.handler.ts:L109`, `L239`, `features/widget/widget.ts:L90` (`resolveActor`):
  `ActorContext` literals → `{ type: 'authenticated', userId: jwtPayload?.sub }`.

Invariants:
- `context.get('actor') ?? …` fallbacks keep their precedence.
- `toEntryEnvelope` and the privacy policies receive the same `type`, so field visibility is byte-identical (privacy
  reads `actor.type` only, `policies.ts:L187`).
- Hooks receive `actor` without `role`. No hook in the repo reads it (grep: 0).

Done when `grep -rnE "jwtPayload\??\.role" apps/api/src` returns 0.

### T5 — Test helpers: grant decided by an explicit flag

Approach: the SuperAdmin grant stops being derived from `role`. For canonical users the flag becomes required, so the
compiler decides. For the legacy helper the default becomes `true`, which keeps the semantics of every current
caller (trap 1).

- `packages/testing/src/seeds/canonical.data.ts`:
  - `CanonicalUser`: delete `role` and its JSDoc (`L14-15`). `grantSuperAdmin` becomes required, with JSDoc "Grants
    `SuperAdmin` at `GLOBAL_SCOPE`.":

    ```ts
    readonly grantSuperAdmin: boolean
    ```
  - `admin`: replace `role: 'admin'` with `grantSuperAdmin: true`. `editor`, `viewer`: delete `role: 'editor'` and keep
    `grantSuperAdmin: false`.
  - Rewrite the `viewer` comment (`L42-44`): it is an account deliberately given no RBAC assignment, for
    permission-denial and non-owner assertions. Drop the `users.role` CHECK sentence.
- `packages/testing/src/seeds/provision.ts`:
  - `seedUsers` (`L82-86`): INSERT `(id, email, password_hash, name)`, 4 placeholders, bind without `user.role`.
    Grant iff `user.grantSuperAdmin`.
  - Update the `seedUsers` JSDoc (`L74-77`) if it mentions the role-derived default.
- `packages/testing/src/harness.ts:L83`: `asUser` issues `{ sub, email, name }`.
- `apps/api/test/helpers/seed-fixtures.ts`:
  - `TestUser`: delete `role`. `grantSuperAdmin?: boolean` stays optional, defaulting to `true`. Rewrite the JSDoc
    (`L14-18`): it grants the seeded `SuperAdmin` role at `'*'` unless `false`, which is what every pre-RBAC suite
    assumes, and `false` builds an account with no authority.
  - `seedTestUsers`: INSERT `(id, email, password_hash, name)`; `grant = u.grantSuperAdmin ?? true`.

Rebuild `packages/testing` (`pnpm run build`) after this task. Harness suites consume `dist/`.

### T6 — API tests

Each change below is the minimum that keeps the test meaningful once the column, claim and fields are gone. Tier and
fixture source are unchanged unless stated. Follow `_config/testing_conventions.md`: status first, writes assert state,
rejections assert nothing changed, why-comments only.

**Fixture-only cleanups.** Delete the `role` key or argument and change nothing else:
- `auth/auth.app.test.ts:L24`: `UserRecord` mock.
- `factory.custom-routes.test.ts:L24`: user row.
- `features/content/handlers/list.test.ts:L47`, `update.test.ts:L57`: `jwtPayload` stubs.
- `features/rbac/users.get.test.ts:L15`: `AccountSummary` fixture.
- `features/settings/settings.handler.test.ts:L35`, `L310`: `UserRecord` fixtures. Retitle `L306` to "emits a global
  manage_seeds grant in permissions.global and no isDeveloper key".
- `shared/db/repositories/d1-user.repository.test.ts`:
  - rows (`L13`, `L57`, `L217-218`, `L244`), inputs (`L88`, `L96`, `L110`, `L126`, `L137`) and expected records
    (`L224-225`, `L249`): delete `role`;
  - wherever the file asserts SQL text or a `bind` argument list, update it to the 5-column INSERT and the role-less
    SELECT.
- `shared/db/repositories/d1-invitation.repository.test.ts:L37`: redemption input.

**`features/seeds/seeds.test.ts`** (unit, local `buildApp`):
- the `role?: string` option (`L91`) only toggles "authenticated or not" (`L117-119`). Rename it to
  `authenticated?: boolean`;
- the stub payload becomes `{ sub: 'u1', email: 'a@b.com' }`;
- replace all 105 `buildApp({ role: 'admin' })` call sites with `buildApp({ authenticated: true })`. This is
  mechanical: no assertion changes.

**`auth/jwt-claims-passthrough.test.ts`** (unit):
- rewrite the file docblock (`L5-12`) around `surname` only;
- `L45`: retitle "the surname claim survives the authMiddleware round-trip". Drop `role` from `claims` and the
  `body.role` assertion;
- `L71`: retitle "a token without surname returns undefined for it". Drop the `body.role` assertion.

**`auth/providers/jwt-token.service.test.ts:L94-97`** (unit, tamper detection): the tampered claim is arbitrary. Issue
`{ sub: 'user-1' }` and forge `{ ...decoded, sub: 'user-2' }`. The expected `null` is unchanged.

**`features/rbac/users.test.ts`** (unit tier, real `D1TestDatabase`, `seedTestUsers`):
- `L49` → "creates a zero-trust account with no assignments and no role key":
  - body typed `{ id: string; assignments: unknown[] }`;
  - assert 201, `body` not to have property `role`, `assignments` `[]`;
  - zone 4: `SELECT COUNT(*) FROM user_role_assignments WHERE user_id = ?` = 0, which replaces the deleted `SELECT role`.
- `L81` → "a role field in the request body grants nothing":
  - same request, still sending `role: 'admin'`. This is deliberate malformed input (rule 3.5) and needs a
    regression-guard comment: zod strips unknown keys, and a future schema must not turn the field into authority;
  - assert 201, then the assignment count for the new id = 0.
- `L127` → "deactivating a global administrator succeeds with 200 while another global administrator exists". Drop
  `role: 'editor'` from the co-admin row (`L132`). The body is unchanged.

**`features/rbac/assignments.test.ts:L167`** → "DELETE of a global administrator's SuperAdmin assignment succeeds with 204
while another global administrator exists". Drop `role: 'editor'` (`L173`). The body is unchanged.

**`features/schema/test/integration/seed-layout.integration.test.ts:L169-178`**: delete the test "users.role 'admin'
without a manage_seeds grant is refused 403 on PUT and nothing is stored". After `0041` the arrangement is identical to
the canonical editor case above it (`L155-167`). The stale-claim variant is covered once, in the flow tier
(`flow-media-assets.test.ts:L373`).

**`features/seeds/test/integration/seed-access.integration.test.ts`**:
- delete `L107-115` for the same reason;
- rewrite the file docblock `L8` so it no longer mentions the `users.role` axis.

**`test/flow/flow-rbac-admin.test.ts:L205-209`** (step 10): replace the `SELECT DISTINCT role` loop with one assertion:
`PRAGMA table_info(users)` lists no column named `role`. Keep the step comment, reworded: accounts created through
`POST /api/rbac/users` carry no legacy axis.

**`test/flow/flow-rbac-invitations.test.ts:L112-114`** (step 7): delete the `SELECT role` assertion and its comment. The
redeemed account's authority is already asserted by step 6 (200 on `posts`, 403 on `pages`). Renumber the step comments
`8.`–`10.` (`L116`, `L125`, `L146`) to `7.`–`9.`.

**`test/flow/flow-rbac-upgrade.test.ts`**:
- `L45`: `issue({ sub: user.id, email: user.email })`. The `role` entry of `it.each` stays: it names the legacy row
  inserted at `L35`, not a claim;
- add to the first `it.each` body, after the migrations replay: `PRAGMA table_info(users)` has no `role` column. This
  proves `0041` applies on an upgraded database that holds data;
- add one `it` to the suite: "a fresh database built from every migration has no users.role column". Use the same
  arrangement as `L95-98`, then assert the `PRAGMA` result;
- the `L41-42` row titles ("preserves $role content access …") stay.

**`test/flow/flow-media-assets.test.ts:L373-391`**: keep the test. It is the stale-token guard: a pre-`0041` access JWT
still carries `role: 'admin'` for up to 15 minutes. Rewrite the two comment lines (`L378-379`):
- the regression guard is that a legacy `role` claim on a still-valid token must never grant the override;
- the `JwtClaims` type no longer declares it, so it rides the index signature.
This is the only test token in the repo that keeps a `role` claim (T7 grep exception).

**Comment-only:**
- `content-export.integration.test.ts:L232-233`: the refusal comes from the permission gate. Drop "not from the
  users.role CHECK".
- `last-admin.integration.test.ts:L55`: "The canonical admin is the setup account (SuperAdmin@*)". Drop "Developer".

### T7 — Dashboard tests and the final sweep

Dashboard source needs no edit (grep: 0 `role` reads). Tests:
- `features/rbac/components/users-tab.test.tsx` (`L36-37`, `L63-65`, `L79-80`): delete `role` from the `AccountView`
  fixtures. The RPC type no longer has it, so `tsc` flags each one.
  - The entry-8 regression test at `L76` ("an account whose role is 'admin' that is not the caller has an enabled
    status switch") loses its subject. Retitle it "every active account other than the caller has an enabled status
    switch" and keep its two rows (`L79-80`, minus `role`) and its assertions.
- `features/rbac/api/rbac.api.test.ts:L15`: delete `role` from `account()`.
- `features/dashboard/test/unit/dashboard-page.test.tsx:L28`: delete `role` from the mocked `useAuth` user.
- `lib/api-jwt-decode.test.ts:L27`, `L34`: the decoded payload's claims are arbitrary. Replace `role: "admin"` with
  `surname: "Lovelace"`, and update the matching expectation if one names `role`.

Final sweep (record each result in the execution log). Exclude `node_modules`, `dist`, `.wrangler`, `graphify-out`,
`docs`, `stages` and `migrations` from every grep:
- `jwtPayload\??\.role|user\??\.role\b|actor\??\.role` in `apps/` and `packages/` → 0.
- `CREATED_ACCOUNT_ROLE` → 0.
- `role: '(admin|editor)'|role: "(admin|editor)"` → only `flow-media-assets.test.ts` (the stale-claim token) and
  `flow-rbac-upgrade.test.ts` (legacy rows and `it.each` labels). `packages/forms-react/src/test/conditional-logic.test.ts`
  is an unrelated form value and is allowed.
- `password_hash, role` → 0.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run in order. Expected results in brackets. Before T1, measure the API `tsc` baseline on the branch (50 after entry 8).

1. `packages/core`: `pnpm run build` [exit 0].
2. `packages/core`: `npx vitest run` [green].
3. `packages/testing`: `pnpm run build` [exit 0].
4. `pnpm beech db:reset`, then `pnpm beech db:migrate` [`0041_drop_users_role.sql` applied, no error].
5. `apps/api`: `npx tsc --noEmit | grep -c "error TS"` [≤ baseline]. Grep the error list for `d1-user`, `d1-invitation`,
   `auth.app`, `auth.middleware`, `setup/index`, `rbac/users`, `invitations.public`, `content/handlers`, `draft.handler`,
   `widget.ts`, `seed-fixtures` [0 hits].
6. `apps/api`: `npx vitest run --project unit` [green]. The whole project runs because `seedTestUsers` feeds 30 files.
7. `apps/api`: `npx vitest run --config vitest.workers.config.ts` [green]. The whole tier runs because `seedUsers`
   feeds every harness suite.
8. `apps/api`: `npx vitest run --project flow` [green]. `flow-media-assets` needs the Docker MinIO stack: run
   `pnpm beech dev`, or start Docker Desktop if the daemon is down. `flow-rbac-upgrade` must show the new
   fresh-database case.
9. `apps/dashboard`: `npx tsc --noEmit` [no errors].
10. `apps/dashboard`: `npx vitest run src/features/rbac src/features/dashboard src/lib` [green].
11. `pnpm beech test --diff` [PASS; changed-line coverage met].
12. `pnpm beech lint` [all tasks successful].
13. The T7 greps [as listed there].
14. Manual (`pnpm beech dev`, fresh DB from step 4). If not run, say so in the log:
    - complete `/auth/setup` → the setup account logs in, opens the Seed Builder, and sees Users & Roles;
    - create a second account from Users & Roles → it logs in and sees nothing until assigned;
    - accept an invitation → the new account reaches only its invited scope.
15. `graphify update . --force`.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `0041_drop_users_role.sql` is a single in-place `ALTER TABLE users DROP COLUMN role`. A fresh DB and an upgraded
      legacy DB both end without the column (flow-rbac-upgrade). No earlier migration is edited.
- [ ] Core: `UserRecord`, `AccountSummary`, `NewUserInput`, `JwtClaims`, `ActorContext`, `HookActor` and
      `RepositoryOptions.actor` declare no `role`. `JwtClaims` keeps its index signature. Core gains no dependency and no
      logic.
- [ ] No SQL in `apps/` or `packages/` (outside migrations) names `users.role`. Every INSERT's placeholder count equals
      its bind count (proved by green unit, workers and flow tiers).
- [ ] Access tokens issued by login, refresh, OAuth resolution and the test harness carry no `role` claim.
- [ ] No content, draft or widget handler copies a `role` into an actor. Privacy projection output is unchanged.
- [ ] `POST /auth/setup` still creates the first account with a SuperAdmin@* assignment in the same batch.
      `POST /api/rbac/users` and invitation redemption still create zero-trust and invited accounts.
- [ ] `/api/rbac/users*` responses carry no `role` key. The dashboard compiles with no source edit.
- [ ] `CanonicalUser.grantSuperAdmin` is required. `seedTestUsers` grants SuperAdmin unless `grantSuperAdmin: false`.
      No suite's authority changed (full unit, workers and flow tiers green).
- [ ] The only test token carrying `role` is the stale-claim guard in `flow-media-assets.test.ts`, and it still
      expects 403.
- [ ] No new import between `apps/api/src/features/*` or `apps/dashboard/src/features/*` slices.
- [ ] API `tsc` error count ≤ the measured baseline; dashboard `tsc` clean; `beech test --diff` and `beech lint` pass.
- [ ] Every touched test follows `_config/testing_conventions.md`, with no `any` in new code.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executor MUST NOT touch the following:

- **ROADMAP entry 10 (`RbacDashboardDocs`):** every file under `docs/` (including the generated
  `docs/api/@beechcms/core/interfaces/JwtClaims.md`), `packages/mcp/resources/**` (including
  `manage/roles-permissions.md:202` and `reference/dashboard-layout.md:12`), `packages/mcp/resources/manifest.json`, and
  `packages/mcp/README.md:72`.
- **Not touched:**
  - `setup/index.ts` `isDeveloper` env flag, `SetupPage.tsx` `environment.isDeveloper` and the `track: 'developer'`
    setup flows (brief §2);
  - `migrations/0000_v040_base.sql`, `0035_backfill_legacy_role_assignments.sql` and
    `test/fixtures/legacy-migrations/0000_v040_base.sql`;
  - `packages/core/src/rbac/permissions.ts` JSDoc (historical, still true);
  - `worker-configuration.d.ts` (`role` there is the Workers AI chat-message field).
- **Not added:**
  - no replacement owner/developer marker;
  - no claim-stripping middleware;
  - no `asUser` extra-claims option;
  - no data migration;
  - no new permission or route.
- **Product logic not touched:** RBAC evaluation, route table, last-global-admin invariant, anti-escalation, and every
  entry-8 gate (`manage_seeds@*`, owner-or-`manage_users@*`).
