# Sprint: RbacCorePrimitives

Roadmap entry 1/5 — see `output/backlog/ROADMAP.md`.

### Pre-Computation Analysis

**a) God Nodes identified via the CLI**

| Node | Source | Degree / evidence | Why it is a God Node here |
|------|--------|-------------------|---------------------------|
| `repositoryMiddleware()` | `apps/api/src/middleware/repository.middleware.ts` | `graphify affected "repositoryMiddleware" --depth 2` → `createBeechApp()` + `apps/api/src/index.ts` + 25+ test entry points | Single dependency-injection seam for the whole API. Every repository reaches a handler only through it; a new RBAC repository has exactly one legal insertion point. |
| `authMiddleware()` | `apps/api/src/middleware/auth.middleware.ts` L80 | `graphify explain "AuthMiddleware"` → degree 11; consumers `factory.ts:L16/L227`, `features/oauth/index.ts:L8`, `features/search/search.ts:L18` | Sole producer of `jwtPayload`. Any identity/permission material must be derived downstream of it, never re-parsed. |
| `createBeechApp()` | `apps/api/src/factory.ts` L115–L275 | calls `repositoryMiddleware` (L118), `authMiddleware({acceptOAuth:true})` (L227), `oauthScopeMiddleware()` (L230) | Owns the one and only middleware registration order for the process. |
| `AllowAllRoleGuard` | `packages/core/src/oauth/role-guard.ts` L35 | `graphify explain "AllowAllRoleGuard"` → degree 4, community `OAuthScope`, `implements IRoleGuard` | Documented placeholder ("When the roles feature lands, replace this binding"). It is the pre-declared swap point for this feature — but its swap belongs to sprint 2, not here. |
| `requireAdmin()` | `apps/api/src/features/seeds/seeds.helpers.ts` L31 | `graphify affected "requireAdmin" --depth 2` → `seeds.handler.ts:L22`, `seeds/index.ts:L5` (re_export), `seeds.test.ts:L8` | The only binary role check in the codebase today. Small blast radius (3 nodes), confirming there is no diffuse role logic to untangle. |

**b) Architectural boundaries affected**

- `@beechcms/core` — **ADDITIVE ONLY.** New leaf module `src/rbac/`: closed permission
  vocabulary, records, pure ABAC evaluator, repository interfaces. Exported from
  `packages/core/src/index.ts` alongside the existing `./oauth/*.js` and `./auth/*.js`
  lines (L30–L41). Zero runtime dependencies, zero imports from `apps/*`. Existing core
  modules are **not** modified: `packages/core/src/auth/user.repository.ts` and
  `packages/core/src/oauth/role-guard.ts` stay byte-identical this sprint.
- `apps/api` — Two boundaries touched: (1) `migrations/0000_v040_base.sql` is edited in
  place (beta reset policy — no new numbered migration);
  (2) `shared/db/repositories/` gains two D1 adapters, wired in
  `middleware/repository.middleware.ts` and declared in `src/types.ts` `Variables`.
  **No `features/` slice is created or modified.** `factory.ts` is untouched — no new
  route, no new middleware registration.
- `apps/dashboard` — **UNTOUCHED.** No file in `apps/dashboard/src/features/*` is
  produced or modified. `graphify explain "AuthMiddleware"` shows no dashboard node
  in its neighbourhood; the dashboard consumes identity exclusively via HTTP, so a
  server-side vocabulary addition cannot reach it until sprint 2 emits it on the wire.

**c) `graphify affected` impact analysis (breaking-change proof)**

```
$ graphify affected "requireAdmin" --depth 2
- seeds.handler.ts   [imports]     apps/api/src/features/seeds/seeds.handler.ts:L22
- seeds/index.ts     [re_exports]  apps/api/src/features/seeds/index.ts:L5
- seeds.test.ts      [imports_from] apps/api/src/features/seeds/seeds.test.ts:L8

$ graphify affected "authMiddleware" --depth 2
- createBeechApp()   [calls]   apps/api/src/factory.ts:L227
- src/factory.ts     [imports] apps/api/src/factory.ts:L16
- oauth/index.ts     [imports] apps/api/src/features/oauth/index.ts:L8
- search.ts          [imports] apps/api/src/features/search/search.ts:L18
- (remainder: test entry points only — auth.middleware.test.ts, jwt-claims-passthrough.test.ts,
   factory.*.test.ts, features/oauth/*.test.ts, public-add.test.ts, apps/api/test/flow-*.test.ts)

$ graphify affected "repositoryMiddleware" --depth 2
- createBeechApp()   [calls]   apps/api/src/factory.ts:L118
- src/factory.ts     [imports] apps/api/src/factory.ts:L40
- api/src/index.ts   [imports] apps/api/src/index.ts:L5
- (remainder: 25+ test entry points, all via buildApp())

$ graphify explain "AllowAllRoleGuard"
- IRoleGuard         [implements] packages/core/src/oauth/role-guard.ts:L35
- role-guard.test.ts [imports]    packages/core/src/oauth/role-guard.test.ts:L5
```

**Reading.** The only production nodes this sprint can perturb are `createBeechApp()`
(via `repositoryMiddleware` gaining two `context.set(...)` lines) and the `Variables`
interface in `apps/api/src/types.ts`. Both changes are strictly additive: no existing
key is renamed or removed, so no consumer in the `affected` sets above can break.
`requireAdmin`'s three-node blast radius is deliberately **not** entered this sprint —
it is sprint 2's work. `AllowAllRoleGuard` keeps its binding, so `oauth/*.test.ts`
remains green by construction.

### VETO Audit

Proposed boundaries from the Pre-Computation Analysis, audited against
`_config/ponytail_arch.md`.

**1. YAGNI / Ruthless Veto.** Every artifact traces to a stated brief requirement:
the closed enum to §4 ("L'enum dei permessi è chiuso"), the assignment triple to §2
("Assegnazione (Utente ↔ Ruolo ↔ Scope)"), the additive evaluator to §2 ("Modello
puramente additivo"), `canGrant` to §2 ("Regola anti-escalation"), `is_active` to §3
("disattivare/riattivare un account"). Nothing speculative is built: no negative
permissions, no role hierarchy, no plugin-extensible enum, no per-scope role objects —
all four are in the brief's §5 Out of Scope and all four are absent from this schema.
**No veto.**

**2. Botanical Invariant — no D1 bypass of `@beechcms/core`.** RBAC tables are
**system tables**, not `content_{slug}` tables. They carry no Branch, no alias, no
`br_XX` id, and therefore never pass through `apiToDb`/`dbToApi`. This is the same
treatment already granted to `users`, `oauth_tokens`, `activity_logs` and
`seed_layouts`: their D1 adapters live in `apps/api/src/shared/db/repositories/` and
implement an interface declared in `@beechcms/core` (see `D1OAuthConsentRepository
implements IOAuthConsentRepository`). This sprint follows that precedent exactly —
the contract (`IRoleRepository`, `IRoleAssignmentRepository`) and the decision logic
(`buildPermissionSet`, `hasPermission`, `canGrant`) live in core; only SQL execution
lives in the API. **No handler queries D1 directly; no content table is read or
written by this sprint at all.** Zero hardcoded Branch field names are introduced.
**Invariant respected.**

**3. VSA Enforcement — zero cross-feature imports.** This sprint creates no file under
`apps/api/src/features/` and no file under `apps/dashboard/src/features/`. The two new
D1 adapters land in `apps/api/src/shared/db/repositories/`, which is already the shared
tier every slice reads through context — the exact remedy Ponytail mandates ("If two
slices need the same logic, mandate moving it to `@beechcms/core` or shared libs").
Sprint 2 will consume `hasPermission` from `@beechcms/core`, never from a sibling
slice. `apps/api/src/features/seeds/seeds.helpers.ts` is left untouched, so no slice
gains a new inbound edge. **Zero cross-slice imports introduced.**

**4. Cloudflare Purity.** Plain D1 `prepare()`/`bind()` — no ORM, no query builder, no
new dependency in either `package.json`. No background job, no stateful process. The
schema change is one numbered, deterministic migration file under the strict workflow
in `_config/database_workflow.md`. Scope decay on seed deletion is resolved with a
`LEFT JOIN seeds` predicate at read time rather than a trigger or an `ON DELETE`
cascade, keeping the schema deterministic and the decay reversible when a seed is
restored. **Pure.**

**5. Minimalist Blueprint.** 3 new core files + 1 core export line + 1 migration +
2 D1 adapters + 2 `Variables` keys + 2 `context.set` lines. Tier 3 (dashboard) is not
entered. This is the minimum node count that makes the vocabulary and the schema
mergeable and testable on their own.

**Adjustments forced by this audit (applied before drafting):**
- `AllowAllRoleGuard` is **not** swapped this sprint. Swapping it would put live
  authorization behaviour into a sprint whose stated contract is "zero behaviour
  change", and would drag `features/oauth/*` into the diff. Moved to sprint 2.
- `requireAdmin()` is **not** touched. Same reason; its 3 affected nodes belong to
  sprint 2.
- The permission enum is duplicated as a SQL `CHECK` constraint. This is intentional
  redundancy, not over-engineering: it makes `manage_seeds` unrepresentable at the
  storage layer, satisfying the brief's categorical exclusion even against a future
  handler bug or a direct `wrangler d1 execute`.

Verdict: **APPROVED.** HANDOFF -> caveman_coder.

### Reuse Audit — `apps/api/src/auth/` and `apps/api/src/features/oauth/`

The identity tier is not greenfield. Both slices were inventoried before any new
primitive was specified; nothing below may be re-implemented in this feature.

**Reused in THIS sprint:**

| Existing asset | Location | How this sprint reuses it |
|---|---|---|
| `IIdGenerator.uuid()` / `isValid()` | `packages/core/src/common/id-generator.ts` | Sole id source for both new repositories, injected exactly as `D1OAuthConsentRepository` and `D1PasswordResetTokenRepository` do. The interface exposes `uuid()`, **not** `generate()` — and `isValid()` is documented as "the ONLY place in the codebase that knows the id format", so the `SuperAdmin` seed in `0000` mints a v4-shaped id rather than a readable slug. |
| `D1OAuthConsentRepository` shape | `apps/api/src/shared/db/repositories/d1-oauth-consent.repository.ts` | Copied verbatim as the adapter template: BUSL header, workers-types reference, local snake_case row type, `rowToRecord` mapper, raw `prepare().bind()`, core interface `implements`. |
| `D1TestDatabase` | `apps/api/test/helpers/d1-test-database.ts` | Real in-memory `node:sqlite` that auto-applies every `^\d{4}_.+\.sql$` migration. Both new repository tests run against it — see §4.10 and the correction note below. Precedent for a colocated `src/` repository test using it: `d1-notification.repository.test.ts`. |
| `SequentialIdGenerator` | `apps/api/src/shared/services/id-generator/sequential-id-generator.ts` | The project's `IIdGenerator` test double (`test-id-0001`, …). Used instead of an inline `{ uuid: () => 'x' }` literal. Already coverage-excluded in `vitest.config.ts`. |
| `seedTestUsers` / `TEST_USERS` | `apps/api/test/helpers/seed-fixtures.ts`, `apps/api/test/fixtures.ts` | User rows for the assignment tests, satisfying the `REFERENCES users(id)` FK. |
| System-table placement precedent | `oauth_clients`, `oauth_tokens`, `users` in `0000_v040_base.sql` | Establishes that identity tables live outside the Botanical Engine. RBAC tables inherit that ruling instead of inventing a new one — see VETO Audit §2. |
| `IRoleGuard` / `ScopeGrantDecision` | `packages/core/src/oauth/role-guard.ts` | The role seam already exists and already carries the "replace when roles land" contract. This sprint adds no second, parallel authorization seam; it fills the one that is there. |

**Reserved for later sprints — MUST be reused, never re-implemented:**

| Existing asset | Location | Sprint that consumes it |
|---|---|---|
| `generateOpaqueToken()` | `apps/api/src/shared/utils/opaque-token.ts` | Sprint 4 (invitations). Its own docblock declares it "the single entropy source for every bearer credential in the API… so that changing the length or the encoding is a one-line change that cannot silently leave a second copy behind". An invitation token is a bearer credential; a second CSPRNG helper is forbidden. |
| `sha256hex()` | `packages/core/src/engine/policies.ts` | Sprint 4. Invitations store hash-only, exactly as `oauth_tokens`, `refresh_tokens` and `password_reset_tokens` already do. |
| `IPasswordResetTokenRepository` | `packages/core/src/auth/password-reset-token.repository.ts` | Sprint 4. Its four-method shape — `invalidatePending` / `create` (hash-only) / `findValidByHashWithEmail` / `markUsed` — is already single-use + expiring + regenerable-without-recreating-the-row. That is the brief's invitation requirement verbatim; `IInvitationRepository` mirrors it, and the `password_reset_tokens` DDL (`0000_v040_base.sql:66–76`) is the table template. |
| `issueTokenPair()` | `apps/api/src/features/oauth/token-issuance.ts` | Sprint 4, as the worked example of generate → hash → persist-hash-only. |
| `oauthApp` per-route gating | `apps/api/src/features/oauth/index.ts` | Sprint 3, for a slice that mixes gates per route. Note the deliberate choice there: consent/connected-apps routes use bare `authMiddleware()` (never `acceptOAuth: true`) "so a leaked access token cannot list the user's other clients". RBAC administration endpoints inherit that same rule. |
| `AUTH_ERRORS` / `OAUTH_ERRORS` constants | `apps/api/src/auth/constants.ts`, `features/oauth/constants.ts` | Sprint 3. The `rbac` slice gets one `constants.ts` with a frozen `RBAC_ERRORS` map, matching the convention; error strings are never inlined in handlers. |
| `login-helpers.ts`, `hash.provider.ts`, `jwt-token.service.ts` | `apps/api/src/auth/` | Sprint 4 activation flow sets credentials through the existing `IHashProvider`; no new hashing path is introduced. |
| `__fixtures__/in-memory-hash-provider.ts`, `static-token-service.ts` | `apps/api/src/auth/__fixtures__/` | Sprints 2–4 test setup reuses these fixtures rather than writing new doubles. |

**Deliberately NOT reused — `BaseD1Repository`.**
`apps/api/src/shared/db/repositories/base.repository.d1.ts` exists, so an executing
agent may be tempted to extend it. Do not. Its two members are content-tier:
`getTableName(slug)` builds `content_{slug}` / `content_{slug}_drafts`, and `mapError`
special-cases `SlugConflictError`. Neither applies to a system table. Adoption confirms
the boundary: only `content.repository.d1.ts`, `idempotency.repository.d1.ts` and
`time-trap-token.repository.d1.ts` extend it, while **every** identity/system-table
repository — `d1-user`, `d1-session`, `d1-password-reset-token`, and all four
`d1-oauth-*` — takes a plain `private readonly db: D1Database`. The RBAC repositories
follow the system-table half of that split.

**Correction this audit forced — the test strategy in §4.10.**
The first draft of this plan specified mock-DB unit tests in the style of
`d1-oauth-consent.repository.test.ts`, which hand-rolls `makeMockDb()` with
`vi.fn()` stubs. Against that harness **the SQL string is never executed** — the mock
returns whatever the test feeds it. The load-bearing artifact of this sprint is the
`LEFT JOIN seeds … status = 'active'` predicate in `listActiveForUser`, and a mock
proves exactly nothing about it. §4.10 is therefore rewritten around `D1TestDatabase`,
which runs the real statement against real SQLite with the real migration applied.

**Suite-wide blast radius of the `0000` edit.**
`D1TestDatabase`'s constructor reads `apps/api/migrations/`, filters on
`^\d{4}_.+\.sql$`, and `exec()`s every file containing `CREATE` or `ALTER TABLE`.
`0000_v040_base.sql` is applied in **all 17+ test files that construct a
`D1TestDatabase`**, so a syntax error or a constraint violation in the new section
fails the entire suite rather than one spec. Editing `0000` rather than adding `0031`
does not change this — it is the same file set either way. Two consequences:
- `PRAGMA foreign_keys = ON` is set in that harness, so the `REFERENCES users(id)` and
  `REFERENCES roles(id)` constraints are genuinely enforced in tests.
- `user_role_assignments` ships empty, so every existing test keeps exactly its current
  authority. Any test needing an assignment must create it explicitly.

**Known breaking change this audit surfaced, scheduled for sprint 2.**
`IRoleGuard.arbitrate(role: string | undefined, scopes)` takes a role *string*. Under
RBAC, arbitration needs the subject's effective permissions, not a legacy role label.
The signature must widen. `grep` confirms the blast radius is one production call site
— `apps/api/src/features/oauth/authorize.ts:222`
(`context.get('roleGuard').arbitrate(context.get('jwtPayload').role, request.scopes)`)
— plus `packages/core/src/oauth/role-guard.test.ts` and
`apps/api/src/features/oauth/authorize.test.ts`. It is cheap, but it is a core
interface change and therefore belongs with the `AllowAllRoleGuard` swap in sprint 2,
not here. This sprint leaves the signature untouched.

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Every later sprint in this feature reads the same three things: the `Permission`
vocabulary, the `(user, role, scope)` assignment triple, and the additive evaluation
rule that turns them into a yes/no answer. If those landed inside the sprint that also
rewires `authMiddleware` and replaces `requireAdmin`, the resulting diff would mix a
new vocabulary with a live change to the single gate protecting the whole API — the
one diff in this feature that must be reviewable line by line.

This sprint therefore ships the vocabulary, the storage and the decision function, and
enforces **nothing**. `graphify affected` proves the containment: the only production
nodes perturbed are `createBeechApp()` (two additional `context.set` lines inside
`repositoryMiddleware`) and the `Variables` interface, both strictly additive. No
existing request path changes shape.

**VSA adherence.** No `features/` slice is created. The evaluator is pure logic with no
I/O, so it belongs in `@beechcms/core` where sprints 2–5 can all import it without any
slice importing a sibling. The D1 adapters land in `shared/db/repositories/`, the tier
every slice already reaches through context — the same placement as
`D1OAuthConsentRepository` and `D1UserRepository`.

**Botanical adherence.** RBAC tables are system tables, like `users` and `oauth_tokens`.
They carry no Branch and no `br_XX` id, so they are outside `apiToDb`/`dbToApi` by
construction — exactly as the existing system-table repositories are. No handler in
this sprint touches D1 directly, and no `content_{slug}` table is read or written.

Building it first also fixes the hardest decision cheaply: **scope decay**. The brief
requires that scopes on a deleted or deactivated Seed stop granting anything. Resolving
that with a `LEFT JOIN seeds` predicate at read time — rather than a trigger or a
cascade — means every consumer from sprint 2 onward inherits correct decay for free,
and a restored seed silently restores its assignments. Discovering this after
enforcement shipped would mean reworking live authorization code.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Identity today is a single string column.**

`apps/api/migrations/0000_v040_base.sql:27–37`:

```sql
CREATE TABLE IF NOT EXISTS users (
    id                  TEXT    NOT NULL PRIMARY KEY,
    email               TEXT    NOT NULL UNIQUE,
    password_hash       TEXT    NOT NULL,
    role                TEXT    NOT NULL DEFAULT 'editor' CHECK (role IN ('admin', 'editor')),
    name                TEXT,
    surname             TEXT,
    avatar_url          TEXT,
    notification_prefs  TEXT    NOT NULL DEFAULT '{}',
    created_at          INTEGER NOT NULL DEFAULT (unixepoch())
);
```

There is **no** `is_active` column, no `roles` table, no assignment table, and no
notion of a scope anywhere in the schema. `apps/api/migrations/` currently contains
exactly `0000_v040_base.sql` and `0030_test_seeds.sql` (plus `_archive/`).
`apps/api/wrangler.jsonc:25` declares `"migrations_dir": "migrations"` — there is no
explicit migrations array to maintain.

`0000_v040_base.sql` describes itself as the single migration for fresh installations
and already seeds static rows at its tail (two `oauth_clients` `INSERT OR IGNORE`
statements, L365+). Its last banner is `-- 19. OAUTH 2.1 AUTHORIZATION SERVER`.
**The project is in beta and the database is disposable, so schema changes are folded
into `0000` rather than appended as new numbered migrations** — this supersedes the
"never edit an applied migration" rule still written in
`_config/database_workflow.md`.

**The only role check in production code** (`graphify affected "requireAdmin" --depth 2`
→ 3 nodes) is `apps/api/src/features/seeds/seeds.helpers.ts:31`:

```ts
export function requireAdmin(context: AppContext) {
  const role = context.get('jwtPayload')?.role
  if (role !== 'admin') { /* 403 problem+json */ }
  return null
}
```

Consumed only by `seeds.handler.ts:40`, re-exported by `seeds/index.ts:L5`.

**Existing context variables** (`apps/api/src/types.ts`, `Variables`) — the full list is
long; the entries relevant to this sprint are:

```ts
actor?: ActorContext                          // { type: 'public'|'authenticated'|'system', userId?, role? }
jwtPayload: JwtClaims                         // { sub, email?, name?, surname?, role?, [k]: unknown }
oauthGrant: OAuthGrantContext | null
userRepository: IUserRepository
sessionRepository: ISessionRepository
seedRegistry: ISeedRegistry
getSeed: (slug: string) => Seed | null
seedRepository: ISeedRepository
clock: IClock
idGenerator: IIdGenerator
roleGuard: IRoleGuard                         // bound to AllowAllRoleGuard
```

**Exact middleware registration order** (`apps/api/src/factory.ts`, verified line by line):

```
app.use('*', repositoryMiddleware({...}))          L118   <- DI seam; sets every repository
app.use('*', seedRegistryMiddleware())             L132
app.use('*', storageMiddleware({...}))             L135
app.use('*', queueMiddleware(...))                 L139
app.use('*', authProvidersMiddleware())            L141
app.use('*', rateLimiterMiddleware(...))           L142
app.use('*', observabilityMiddleware())            L143
app.use('*', <inline>)                             L145, L186
app.use('/api/*', <inline>)                        L197
app.route('/', authApp | setupApp | passwordResetApp | oauthApp)   L219–L222

const apiProtected = new Hono<...>()               L225
apiProtected.use('*', authMiddleware({ acceptOAuth: true }))       L227
apiProtected.use('*', oauthScopeMiddleware())      L230   // must stay immediately after authMiddleware
apiProtected.route('/settings' | '/schema' | '/dashboard-layout' | '/seeds'
                  | '/content' x5 | '/widget' | '/automations' | '/search' | '/')  L232–L245

const apiPublic = new Hono<...>()                  L248   // publicRateLimit + apiKey
app.route('/api/v1/public', apiPublic)             L255
app.route('/api/webhooks', webhooksApp)            L258
app.route('/api/custom/public' | '/api/custom', ...)               L271–L272
app.route('/api', apiProtected)                    L275
```

**This sprint modifies none of the above.** It only adds two `context.set(...)` calls
inside `repositoryMiddleware` (alongside L147 where `roleGuard` is set).

**Existing role seam in core.** `packages/core/src/oauth/role-guard.ts:35`
(`graphify explain "AllowAllRoleGuard"` → degree 4, `implements IRoleGuard`) carries an
explicit in-code note: *"When the roles feature lands, replace this binding with a real
adapter; the behaviour change will then be visible as a failing test here, by design."*
Bound at `repository.middleware.ts:147` as `new AllowAllRoleGuard()`. **Left untouched
this sprint** — see VETO Audit.

**Existing system-table repository precedent.** `D1OAuthConsentRepository`
(`apps/api/src/shared/db/repositories/d1-oauth-consent.repository.ts`) is the shape to
copy: `implements` a core interface, private `db: D1Database` + injected `IIdGenerator`,
a local `snake_case` row type, a `rowToRecord` mapper, raw `prepare().bind()`.

**Seeds table** (`0000_v040_base.sql:287–298`) — the join target for scope decay:

```sql
CREATE TABLE IF NOT EXISTS seeds (
    slug TEXT NOT NULL PRIMARY KEY,
    definition TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
    source TEXT NOT NULL DEFAULT 'runtime' CHECK (source IN ('code', 'runtime')),
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

**Created — `@beechcms/core` (pure, zero runtime dependencies):**

1. `packages/core/src/rbac/permissions.ts` — closed `PERMISSIONS` tuple, `Permission`
   type, `isPermission`, `GLOBAL_SCOPE`.
2. `packages/core/src/rbac/types.ts` — `RoleRecord`, `PermissionAssignment`,
   `NewRoleInput`, `NewAssignmentInput`, `EffectivePermissions`, `IRoleRepository`,
   `IRoleAssignmentRepository`.
3. `packages/core/src/rbac/evaluate.ts` — `buildEffectivePermissions`,
   `permissionsForScope`, `hasPermission`, `canGrant`. Pure functions, no I/O.
4. `packages/core/src/rbac/evaluate.test.ts` — unit tests for the evaluator.
5. `packages/core/src/rbac/permissions.test.ts` — vocabulary closure tests
   (asserts `manage_seeds` is not a `Permission`).

**Created — `apps/api`:**

6. `apps/api/src/shared/db/repositories/d1-role.repository.ts` — `D1RoleRepository`.
7. `apps/api/src/shared/db/repositories/d1-role-assignment.repository.ts` —
   `D1RoleAssignmentRepository`.
8. `apps/api/src/shared/db/repositories/d1-role.repository.test.ts` — real DB via
   `D1TestDatabase`.
9. `apps/api/src/shared/db/repositories/d1-role-assignment.repository.test.ts` — real
   DB; must cover scope decay against a `status = 'deleted'` seed.

**Modified:**

10. `apps/api/migrations/0000_v040_base.sql` — `is_active` added inline to the `users`
    CREATE TABLE; new trailing section 20 with `roles`, `role_permissions`,
    `user_role_assignments` and the `SuperAdmin` role seed. **No new migration file.**
11. `packages/core/src/index.ts` — three `export * from './rbac/*.js'` lines.
12. `apps/api/src/types.ts` — two new `Variables` keys + their type imports.
13. `apps/api/src/middleware/repository.middleware.ts` — imports, two optional
    `overrides` fields, two `context.set(...)` calls.

**Explicitly excluded from this sprint (contracts + storage only, no enforcement):**
no middleware, no route, no handler, no `features/` file, no `factory.ts` change, no
`AllowAllRoleGuard` swap, no `requireAdmin` change, no dashboard file.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

## 4.1 — `apps/api/migrations/0000_v040_base.sql` (MODIFIED IN PLACE)

**Project is in beta and the database is disposable.** The schema change is folded
into the existing base migration rather than added as `0031`. `0000_v040_base.sql`
already declares itself "Single migration for fresh installations… Creates all system
tables", and already carries static seed rows at its tail (the two `oauth_clients`
`INSERT OR IGNORE` statements), so both the DDL and the seed belong there.

> `_config/database_workflow.md` still says "Never edit an already-applied migration
> file. Create a new one instead." That rule is written for a post-GA database and is
> **superseded here by the beta reset policy.** Worth updating that file so the next
> planning stage does not re-derive the wrong rule.

Consequences the executing agent must respect:

- **Do NOT create `0031_rbac_foundation.sql`.** No new migration file at all.
- `apps/api/wrangler.jsonc` uses `"migrations_dir": "migrations"` (L25) with no explicit
  array — **no wrangler.jsonc edit is required**; do not add one.
- **`pnpm beech db:migrate` is NOT sufficient.** An edited `0000` is already recorded as
  applied, so only `pnpm beech db:reset` picks the change up. Same for any deployed
  environment: it must be reset, not migrated.
- `is_active` is added **inline to the `users` CREATE TABLE**, not via `ALTER TABLE`.
- **The admin backfill disappears.** On a fresh database no user exists when the
  migration runs, so there is nothing to promote. The `SuperAdmin` *role* is still
  seeded (static data, like `oauth_clients`), but granting it to the first account
  becomes runtime work on the `POST /auth/setup` path — see the lockout warning in
  SECTION 7.

### Edit 1 — `users` table (replaces L27–L37)

```sql
CREATE TABLE IF NOT EXISTS users (
    id                  TEXT    NOT NULL PRIMARY KEY,
    email               TEXT    NOT NULL UNIQUE,
    password_hash       TEXT    NOT NULL,
    role                TEXT    NOT NULL DEFAULT 'editor' CHECK (role IN ('admin', 'editor')),
    name                TEXT,
    surname             TEXT,
    avatar_url          TEXT,
    notification_prefs  TEXT    NOT NULL DEFAULT '{}',
    -- Reversible deactivation (brief §4: no hard-delete split in this iteration).
    is_active           INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at          INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);
```

The legacy `role` column stays exactly as it is. It is still read by
`authMiddleware`, `requireAdmin`, `roleGuard.arbitrate` and `seedTestUsers`; removing
it is sprint 2's job.

### Edit 2 — new trailing section

Appended after section `19. OAUTH 2.1 AUTHORIZATION SERVER` (the current last section),
so no existing section number shifts.

```sql
-- =============================================================================
-- 20. RBAC — ROLES, PERMISSIONS, ASSIGNMENTS
--
--     Runtime-composable roles over a CLOSED atomic permission vocabulary,
--     applied through (user, role, scope) triples. Scope is either '*' or a
--     seeds.slug: isolation is per-seed, never row-level.
--
--     `manage_seeds` is deliberately ABSENT from the role_permissions CHECK
--     list. Schema mutation stays a developer-only, out-of-dashboard
--     capability; making the permission unrepresentable at rest is the
--     strongest guarantee available.
-- =============================================================================

-- Reusable, runtime-composable named permission bundles.
CREATE TABLE IF NOT EXISTS roles (
    id          TEXT    NOT NULL PRIMARY KEY,
    name        TEXT    NOT NULL UNIQUE,
    description TEXT,
    is_system   INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- The closed atomic vocabulary, enforced at rest.
-- Extending this CHECK list is a developer-only schema edit, never a runtime write.
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id    TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission TEXT NOT NULL CHECK (permission IN (
                   'content:read',
                   'content:create',
                   'content:update',
                   'content:delete',
                   'manage_users',
                   'manage_roles',
                   'view_analytics'
               )),
    PRIMARY KEY (role_id, permission)
);

-- The (user, role, scope) triple.
-- `scope` is either '*' (global) or a seeds.slug. No FK to seeds(slug): the '*'
-- sentinel is not a slug. Decay of scopes pointing at a deleted or missing seed
-- is resolved at READ time by a LEFT JOIN predicate, which keeps the row
-- recoverable if the seed is restored.
CREATE TABLE IF NOT EXISTS user_role_assignments (
    id         TEXT    NOT NULL PRIMARY KEY,
    user_id    TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id    TEXT    NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    scope      TEXT    NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE (user_id, role_id, scope)
);

CREATE INDEX IF NOT EXISTS idx_ura_user  ON user_role_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_ura_role  ON user_role_assignments(role_id);
CREATE INDEX IF NOT EXISTS idx_ura_scope ON user_role_assignments(scope);

-- SYSTEM ROLE SEED
--    Static data, seeded exactly like the `oauth_clients` rows at the tail of
--    this file. No user exists yet on a fresh database, so there is nothing to
--    backfill: granting SuperAdmin to the first account is runtime work on the
--    `POST /auth/setup` path, owned by the enforcement sprint.
--
--    Ids are RFC 4122 v4-shaped, matching `SystemIdGenerator.uuid()`
--    (`packages/core/src/common/id-generator.ts`). `IIdGenerator.isValid()` is the
--    ONLY id-format authority in the codebase and later sprints will run route
--    params through it, so a migration must not mint a differently shaped id.
--    `roles.name` is UNIQUE, so `INSERT OR IGNORE` keeps the seed idempotent and
--    every downstream statement resolves the id by name rather than assuming it.
INSERT OR IGNORE INTO roles (id, name, description, is_system)
VALUES (
    lower(
        hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' ||
        substr(hex(randomblob(2)), 2) || '-' ||
        substr('89ab', abs(random()) % 4 + 1, 1) ||
        substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))
    ),
    'SuperAdmin',
    'Full platform control across every scope. Cannot manage schema.',
    1
);

INSERT OR IGNORE INTO role_permissions (role_id, permission)
SELECT r.id, p.permission
FROM roles r
CROSS JOIN (
    SELECT 'content:read'   AS permission UNION ALL
    SELECT 'content:create' UNION ALL
    SELECT 'content:update' UNION ALL
    SELECT 'content:delete' UNION ALL
    SELECT 'manage_users'   UNION ALL
    SELECT 'manage_roles'   UNION ALL
    SELECT 'view_analytics'
) p
WHERE r.name = 'SuperAdmin';
```

No `user_role_assignments` row is seeded. The table ships empty by design.

## 4.2 — `packages/core/src/rbac/permissions.ts`

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * The closed atomic permission vocabulary.
 *
 * This tuple is the single source of truth for what a role may contain. It is
 * CLOSED BY DESIGN: new permissions arrive only as a developer code change plus a
 * migration widening the `role_permissions` CHECK constraint. Nothing at runtime —
 * no API, no plugin, no dashboard screen — may extend it.
 *
 * `manage_seeds` (or any schema-mutation permission) is deliberately absent and must
 * never be added. Seed schema mutation stays a developer capability exercised outside
 * the dashboard, via CLI and migrations.
 *
 * Each non-CRUD dashboard surface owns one dedicated permission (`view_analytics` is
 * the first). Absence of the permission hides the surface; there is no default-visible
 * exception.
 */
export const PERMISSIONS = [
  'content:read',
  'content:create',
  'content:update',
  'content:delete',
  'manage_users',
  'manage_roles',
  'view_analytics',
] as const

/** A single atomic permission drawn from the closed vocabulary. */
export type Permission = (typeof PERMISSIONS)[number]

/**
 * The sentinel scope granting a permission across every seed, present and future.
 * Reserved for cross-cutting coordination roles (e.g. SuperAdmin).
 */
export const GLOBAL_SCOPE = '*'

/**
 * A permission perimeter: either {@link GLOBAL_SCOPE} or a `seeds.slug`.
 * Isolation is per-seed, never row-level.
 */
export type Scope = string

/** Narrows an arbitrary string to a known permission. */
export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value)
}
```

## 4.3 — `packages/core/src/rbac/types.ts`

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { Permission, Scope } from './permissions.js'

/** A named, reusable bundle of atomic permissions. */
export interface RoleRecord {
  id: string
  name: string
  description: string | null
  /** System roles (e.g. SuperAdmin) are seeded by migration and may not be deleted. */
  isSystem: boolean
  /** Always a subset of `PERMISSIONS`; unknown values are dropped at the storage boundary. */
  permissions: Permission[]
  createdAt: number
  updatedAt: number
}

/** One (user, role, scope) triple. A user may hold N independent assignments. */
export interface PermissionAssignment {
  id: string
  userId: string
  roleId: string
  scope: Scope
}

export interface NewRoleInput {
  name: string
  description: string | null
  permissions: readonly Permission[]
}

export interface NewAssignmentInput {
  userId: string
  roleId: string
  scope: Scope
}

/**
 * A caller's resolved authority, computed once per request from their active
 * assignments. Purely additive: there is no negative permission and no conflict
 * resolution between roles.
 */
export interface EffectivePermissions {
  /** Permissions held at {@link GLOBAL_SCOPE}; they apply to every seed. */
  global: ReadonlySet<Permission>
  /** Permissions held at a specific seed slug, keyed by that slug. */
  byScope: ReadonlyMap<Scope, ReadonlySet<Permission>>
}

/** Storage contract for roles and their permission bundles. */
export interface IRoleRepository {
  /** Retrieves a role with its permissions, or null when it does not exist. */
  findById(roleId: string): Promise<RoleRecord | null>

  /** Retrieves several roles in one round trip. Missing ids are simply absent. */
  findByIds(roleIds: readonly string[]): Promise<RoleRecord[]>

  /** Lists every role, system roles included, ordered by name. */
  listAll(): Promise<RoleRecord[]>

  /** Creates a role and its permission rows atomically. Returns the new role id. */
  create(input: NewRoleInput): Promise<string>

  /** Replaces a role's name, description and full permission set atomically. */
  update(roleId: string, input: NewRoleInput): Promise<void>

  /**
   * Deletes a non-system role and, by cascade, its permissions and assignments.
   * Returns false when the role does not exist or is a system role.
   */
  delete(roleId: string): Promise<boolean>
}

/** Storage contract for (user, role, scope) assignments. */
export interface IRoleAssignmentRepository {
  /**
   * Lists a user's assignments that currently grant anything.
   *
   * An assignment is skipped when its scope names a seed that is absent or
   * `status != 'active'`, so scopes decay with their seed and revive with it.
   * {@link GLOBAL_SCOPE} assignments are always returned.
   */
  listActiveForUser(userId: string): Promise<PermissionAssignment[]>

  /** Lists every assignment referencing a role, decay filter NOT applied. */
  listByRole(roleId: string): Promise<PermissionAssignment[]>

  /** Creates an assignment. Returns its id; an existing identical triple is a no-op. */
  create(input: NewAssignmentInput): Promise<string>

  /** Removes one assignment. Returns false when it did not exist. */
  delete(assignmentId: string): Promise<boolean>

  /**
   * Counts accounts holding `manage_users` at {@link GLOBAL_SCOPE} and still active.
   * Backs the last-SuperAdmin guardrail consumed by a later sprint.
   */
  countActiveGlobalAdmins(): Promise<number>
}
```

## 4.4 — `packages/core/src/rbac/evaluate.ts`

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { GLOBAL_SCOPE, type Permission, type Scope } from './permissions.js'
import type { EffectivePermissions, PermissionAssignment, RoleRecord } from './types.js'

/**
 * Folds a user's active assignments into their effective authority.
 *
 * The model is strictly additive: every assignment can only widen the result, and
 * assignments referencing an unknown role are ignored rather than treated as an error.
 *
 * @param assignments - Active assignments, already decay-filtered by the repository.
 * @param roles - The roles those assignments reference; extra roles are harmless.
 */
export function buildEffectivePermissions(
  assignments: readonly PermissionAssignment[],
  roles: readonly RoleRecord[],
): EffectivePermissions {
  const rolesById = new Map(roles.map(role => [role.id, role]))
  const global = new Set<Permission>()
  const byScope = new Map<Scope, Set<Permission>>()

  for (const assignment of assignments) {
    const role = rolesById.get(assignment.roleId)
    if (!role) continue

    if (assignment.scope === GLOBAL_SCOPE) {
      for (const permission of role.permissions) global.add(permission)
      continue
    }

    let bucket = byScope.get(assignment.scope)
    if (!bucket) {
      bucket = new Set<Permission>()
      byScope.set(assignment.scope, bucket)
    }
    for (const permission of role.permissions) bucket.add(permission)
  }

  return { global, byScope }
}

/**
 * Returns everything the caller may do within one scope: the union of their global
 * permissions and the permissions granted on that specific seed.
 */
export function permissionsForScope(
  effective: EffectivePermissions,
  scope: Scope,
): ReadonlySet<Permission> {
  if (scope === GLOBAL_SCOPE) return effective.global
  const scoped = effective.byScope.get(scope)
  if (!scoped) return effective.global
  return new Set<Permission>([...effective.global, ...scoped])
}

/**
 * The single authorization question: may this caller perform `permission` on `scope`?
 *
 * A global grant satisfies any scope. A scoped grant satisfies only its own seed and
 * never {@link GLOBAL_SCOPE} — that asymmetry is what stops horizontal escalation.
 */
export function hasPermission(
  effective: EffectivePermissions,
  permission: Permission,
  scope: Scope,
): boolean {
  if (effective.global.has(permission)) return true
  if (scope === GLOBAL_SCOPE) return false
  return effective.byScope.get(scope)?.has(permission) === true
}

/**
 * The anti-escalation rule: an actor may only hand out authority they already hold.
 *
 * A grant is legal only when the actor holds every permission being granted, at the
 * scope it is being granted on. Consequently an actor scoped to seed X can never mint
 * a global assignment, and can never include a permission absent from their own set —
 * regardless of what the role itself contains.
 *
 * @param actor - The granting user's effective authority.
 * @param targetScope - The scope the new assignment would apply to.
 * @param targetPermissions - The permissions carried by the role being assigned.
 */
export function canGrant(
  actor: EffectivePermissions,
  targetScope: Scope,
  targetPermissions: readonly Permission[],
): boolean {
  if (targetScope === GLOBAL_SCOPE) {
    return targetPermissions.every(permission => actor.global.has(permission))
  }
  const held = permissionsForScope(actor, targetScope)
  return targetPermissions.every(permission => held.has(permission))
}
```

## 4.5 — `packages/core/src/index.ts` (modify)

Append immediately after the existing OAuth export block (currently ending at L41,
`export * from './oauth/consent.repository.js'`):

```ts
export * from './rbac/permissions.js'
export * from './rbac/types.js'
export * from './rbac/evaluate.js'
```

## 4.6 — `apps/api/src/shared/db/repositories/d1-role.repository.ts`

Follows the `D1OAuthConsentRepository` shape exactly: BUSL header, workers-types
reference, local snake_case row type, `rowToRecord` mapper, raw `prepare().bind()`.

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { IRoleRepository, RoleRecord, NewRoleInput, IIdGenerator, Permission } from '@beechcms/core'
import { isPermission } from '@beechcms/core'

type RoleRow = {
  id: string
  name: string
  description: string | null
  is_system: number
  created_at: number
  updated_at: number
}

type RolePermissionRow = { role_id: string; permission: string }

/**
 * D1-backed role storage.
 *
 * `roles` is a system table: it carries no Branch and no `br_XX` id, so it never
 * passes through the Botanical Engine — the same treatment as `users` and
 * `oauth_clients`. Unknown permission strings surviving in storage are dropped here
 * rather than widening the `Permission` union.
 */
export class D1RoleRepository implements IRoleRepository {
  constructor(
    private readonly db: D1Database,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async findById(roleId: string): Promise<RoleRecord | null> {
    const roles = await this.findByIds([roleId])
    return roles[0] ?? null
  }

  async findByIds(roleIds: readonly string[]): Promise<RoleRecord[]> {
    if (roleIds.length === 0) return []
    const placeholders = roleIds.map(() => '?').join(', ')

    const roleRows = await this.db
      .prepare(
        `SELECT id, name, description, is_system, created_at, updated_at
         FROM roles WHERE id IN (${placeholders}) ORDER BY name`
      )
      .bind(...roleIds)
      .all<RoleRow>()

    const permissionRows = await this.db
      .prepare(`SELECT role_id, permission FROM role_permissions WHERE role_id IN (${placeholders})`)
      .bind(...roleIds)
      .all<RolePermissionRow>()

    return this.assemble(roleRows.results ?? [], permissionRows.results ?? [])
  }

  async listAll(): Promise<RoleRecord[]> {
    const roleRows = await this.db
      .prepare(
        `SELECT id, name, description, is_system, created_at, updated_at
         FROM roles ORDER BY name`
      )
      .all<RoleRow>()

    const permissionRows = await this.db
      .prepare(`SELECT role_id, permission FROM role_permissions`)
      .all<RolePermissionRow>()

    return this.assemble(roleRows.results ?? [], permissionRows.results ?? [])
  }

  async create(input: NewRoleInput): Promise<string> {
    const roleId = this.idGenerator.uuid()
    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(`INSERT INTO roles (id, name, description, is_system) VALUES (?, ?, ?, 0)`)
        .bind(roleId, input.name, input.description),
      ...this.permissionInserts(roleId, input.permissions),
    ]
    await this.db.batch(statements)
    return roleId
  }

  async update(roleId: string, input: NewRoleInput): Promise<void> {
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
  }

  async delete(roleId: string): Promise<boolean> {
    const result = await this.db
      .prepare(`DELETE FROM roles WHERE id = ? AND is_system = 0`)
      .bind(roleId)
      .run()
    return (result.meta.changes ?? 0) > 0
  }

  private permissionInserts(roleId: string, permissions: readonly Permission[]): D1PreparedStatement[] {
    return [...new Set(permissions)].map(permission =>
      this.db
        .prepare(`INSERT OR IGNORE INTO role_permissions (role_id, permission) VALUES (?, ?)`)
        .bind(roleId, permission)
    )
  }

  private assemble(roleRows: RoleRow[], permissionRows: RolePermissionRow[]): RoleRecord[] {
    const byRole = new Map<string, Permission[]>()
    for (const row of permissionRows) {
      if (!isPermission(row.permission)) continue
      const bucket = byRole.get(row.role_id)
      if (bucket) bucket.push(row.permission)
      else byRole.set(row.role_id, [row.permission])
    }

    return roleRows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      isSystem: row.is_system === 1,
      permissions: byRole.get(row.id) ?? [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  }
}
```

## 4.7 — `apps/api/src/shared/db/repositories/d1-role-assignment.repository.ts`

The `listActiveForUser` query is the load-bearing part of this sprint: the
`LEFT JOIN seeds` predicate is what makes scopes decay with their seed.

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type {
  IRoleAssignmentRepository,
  PermissionAssignment,
  NewAssignmentInput,
  IIdGenerator,
} from '@beechcms/core'
import { GLOBAL_SCOPE } from '@beechcms/core'

type AssignmentRow = {
  id: string
  user_id: string
  role_id: string
  scope: string
}

function rowToRecord(row: AssignmentRow): PermissionAssignment {
  return { id: row.id, userId: row.user_id, roleId: row.role_id, scope: row.scope }
}

/**
 * D1-backed storage for the (user, role, scope) triple.
 *
 * A system table: no Branch, no `br_XX`, never routed through `apiToDb`/`dbToApi`.
 */
export class D1RoleAssignmentRepository implements IRoleAssignmentRepository {
  constructor(
    private readonly db: D1Database,
    private readonly idGenerator: IIdGenerator,
  ) {}

  /**
   * Scope decay lives in this predicate, not in a trigger: a scope naming a seed that
   * is missing or `status != 'active'` grants nothing, and starts granting again if
   * the seed is restored. Global assignments bypass the join entirely.
   */
  async listActiveForUser(userId: string): Promise<PermissionAssignment[]> {
    const rows = await this.db
      .prepare(
        `SELECT a.id, a.user_id, a.role_id, a.scope
         FROM user_role_assignments a
         LEFT JOIN seeds s ON s.slug = a.scope
         WHERE a.user_id = ?
           AND (a.scope = ? OR (s.slug IS NOT NULL AND s.status = 'active'))`
      )
      .bind(userId, GLOBAL_SCOPE)
      .all<AssignmentRow>()

    return (rows.results ?? []).map(rowToRecord)
  }

  async listByRole(roleId: string): Promise<PermissionAssignment[]> {
    const rows = await this.db
      .prepare(`SELECT id, user_id, role_id, scope FROM user_role_assignments WHERE role_id = ?`)
      .bind(roleId)
      .all<AssignmentRow>()

    return (rows.results ?? []).map(rowToRecord)
  }

  async create(input: NewAssignmentInput): Promise<string> {
    const assignmentId = this.idGenerator.uuid()
    await this.db
      .prepare(
        `INSERT OR IGNORE INTO user_role_assignments (id, user_id, role_id, scope)
         VALUES (?, ?, ?, ?)`
      )
      .bind(assignmentId, input.userId, input.roleId, input.scope)
      .run()

    const existing = await this.db
      .prepare(
        `SELECT id FROM user_role_assignments WHERE user_id = ? AND role_id = ? AND scope = ?`
      )
      .bind(input.userId, input.roleId, input.scope)
      .first<{ id: string }>()

    return existing?.id ?? assignmentId
  }

  async delete(assignmentId: string): Promise<boolean> {
    const result = await this.db
      .prepare(`DELETE FROM user_role_assignments WHERE id = ?`)
      .bind(assignmentId)
      .run()
    return (result.meta.changes ?? 0) > 0
  }

  /**
   * Counts the accounts that could still administer the platform. Read by the
   * last-SuperAdmin guardrail in a later sprint; exposed here so the guardrail does
   * not have to introduce its own SQL.
   */
  async countActiveGlobalAdmins(): Promise<number> {
    const row = await this.db
      .prepare(
        `SELECT COUNT(DISTINCT a.user_id) AS total
         FROM user_role_assignments a
         JOIN role_permissions rp ON rp.role_id = a.role_id
         JOIN users u ON u.id = a.user_id
         WHERE a.scope = ? AND rp.permission = 'manage_users' AND u.is_active = 1`
      )
      .bind(GLOBAL_SCOPE)
      .first<{ total: number }>()

    return row?.total ?? 0
  }
}
```

## 4.8 — `apps/api/src/types.ts` (modify)

Add to the existing `@beechcms/core` type import list on the `import type { ... }` line:

```ts
IRoleRepository, IRoleAssignmentRepository
```

Add to `interface Variables`, immediately after the existing `roleGuard` entry:

```ts
  /** Storage for roles and their permission bundles. Read by RBAC enforcement from the next sprint on. */
  roleRepository: IRoleRepository
  /** Storage for (user, role, scope) assignments, decay-filtered on read. */
  roleAssignmentRepository: IRoleAssignmentRepository
```

## 4.9 — `apps/api/src/middleware/repository.middleware.ts` (modify)

Three surgical edits; the middleware's position at `factory.ts:L118` is unchanged.

1. Add to the existing `import type { ... } from '@beechcms/core'` list (L34):
   `IRoleRepository, IRoleAssignmentRepository`.
2. Add local imports next to the other repository imports:

```ts
import { D1RoleRepository } from '../shared/db/repositories/d1-role.repository'
import { D1RoleAssignmentRepository } from '../shared/db/repositories/d1-role-assignment.repository'
```

3. Add two optional override fields to the overrides interface (next to
   `roleGuard?: IRoleGuard` at L73):

```ts
  roleRepository?: IRoleRepository
  roleAssignmentRepository?: IRoleAssignmentRepository
```

4. Add two `context.set(...)` calls immediately after the `roleGuard` line (L147),
   reusing the already-resolved `resolvedIdGenerator`:

```ts
    context.set('roleRepository', overrides?.roleRepository ?? new D1RoleRepository(database, resolvedIdGenerator))
    context.set('roleAssignmentRepository', overrides?.roleAssignmentRepository ?? new D1RoleAssignmentRepository(database, resolvedIdGenerator))
```

**Do not** modify `context.set('roleGuard', ... new AllowAllRoleGuard())`. Swapping it
belongs to the enforcement sprint.

## 4.10 — Tests

`packages/core/src/rbac/permissions.test.ts`
- `PERMISSIONS` has exactly 7 members and matches the documented list verbatim.
- `isPermission('manage_seeds')` is `false`. **This assertion is the executable form of
  the brief's categorical exclusion — it must never be deleted or relaxed.**
- `isPermission('content:read')` is `true`; `isPermission('')` is `false`.

`packages/core/src/rbac/evaluate.test.ts`
- Two roles on the same scope union additively.
- An assignment whose `roleId` matches no supplied role is ignored, not thrown on.
- `hasPermission` with a global grant returns `true` for an arbitrary seed slug.
- `hasPermission` with a scope-`postsOnly` grant returns `false` for scope `pages` and
  `false` for `GLOBAL_SCOPE`.
- `permissionsForScope` returns the union of global and scoped permissions.
- `canGrant` rejects a global target when the actor holds the permission only on a seed.
- `canGrant` rejects a target permission the actor lacks entirely, even at the actor's
  own scope.
- `canGrant` accepts a target that is a strict subset of what the actor holds there.

**Repository tests run against a real database, not a mock.** Use `D1TestDatabase`
(`apps/api/test/helpers/d1-test-database.ts`), following the colocated-`src/`
precedent in `d1-notification.repository.test.ts`. Do **not** copy the `makeMockDb()`
pattern from `d1-oauth-consent.repository.test.ts`: it stubs `prepare/bind/all/first`,
so the SQL never executes and the scope-decay predicate would go unverified.

Shared harness for both files:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { D1TestDatabase } from '../../../../test/helpers/d1-test-database'
import { SequentialIdGenerator } from '../../services/id-generator/sequential-id-generator'

let db: D1TestDatabase          // constructor auto-applies migrations, edited 0000 included
let ids: SequentialIdGenerator

beforeEach(() => {
  db = new D1TestDatabase()
  ids = new SequentialIdGenerator()
})
```

Note `PRAGMA foreign_keys = ON`: insert the `users` row before any assignment
referencing it, or the FK rejects the write.

`apps/api/src/shared/db/repositories/d1-role.repository.test.ts`
- `create` then `findById` round-trips name, description, `isSystem: false` and the
  exact permission set.
- `update` fully replaces the permission set (removed permissions are gone from
  `role_permissions`).
- `delete` on a system role returns `false` and leaves the row present — assert against
  the migration-seeded `SuperAdmin` role, looked up by name.
- The migration-seeded `SuperAdmin` role has exactly the 7 permissions and
  `isSystem: true`.
- An unknown permission string is dropped by `assemble`: insert one directly with
  `db.exec(...)` — bypassing the `CHECK` is not possible, so instead assert that the
  `CHECK` itself rejects `'manage_seeds'`, i.e. the insert throws.
- `findByIds([])` returns `[]` without preparing a statement with an empty `IN ()`.

`apps/api/src/shared/db/repositories/d1-role-assignment.repository.test.ts`
- `listActiveForUser` returns a `GLOBAL_SCOPE` assignment even though no `seeds` row
  matches `'*'`.
- **Scope decay (the load-bearing assertion):** insert a seed with
  `status = 'active'` and an assignment scoped to its slug → returned. `UPDATE seeds
  SET status = 'deleted'` → NOT returned. Set it back to `'active'` → returned again.
- An assignment scoped to a slug with no row in `seeds` at all is NOT returned.
- `create` twice with the same `(user, role, scope)` triple yields the same id and
  leaves exactly one row (`UNIQUE` + `INSERT OR IGNORE`).
- `countActiveGlobalAdmins` ignores users with `is_active = 0`, ignores global
  assignments whose role lacks `manage_users`, and counts a user holding it twice once
  (`COUNT(DISTINCT a.user_id)`).

`apps/api/migrations/0000_v040_base.sql` — covered implicitly by every existing test
(the harness applies it everywhere), plus explicitly in the role test:
- `roles.id` for `SuperAdmin` satisfies `SystemIdGenerator.isValid()`.
- `user_role_assignments` is empty on a fresh database.
- `users.is_active` defaults to `1` for a row inserted without it (proves
  `seedTestUsers` and `createInitialAdmin` keep working unmodified).
- Re-running the file is idempotent (`CREATE TABLE IF NOT EXISTS` + `INSERT OR IGNORE`
  + `UNIQUE(name)`): applying it twice leaves one `SuperAdmin` row and 7 permission
  rows.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

```bash
# 1. Core builds and typechecks first — apps/api consumes its emitted types.
pnpm --filter @beechcms/core run build

# 2. API typecheck: proves the new Variables keys and repository generics line up.
cd apps/api && npx tsc --noEmit && cd ../..

# 3. MANDATORY. `0000` is already recorded as applied, so `db:migrate` is a no-op
#    and would silently leave the local database on the old schema. Only a full
#    reset picks up an edited base migration.
pnpm beech db:reset

# 4. Test suite. Also the real regression gate for the migration: D1TestDatabase
#    applies the edited 0000 in every one of the 17+ files that construct one.
pnpm beech test

# 5. Scoped re-run while iterating.
pnpm beech test --diff

# 6. Lint (noopParser bypass for .ts/.tsx is expected — see CLAUDE.md).
pnpm lint
```

Manual schema verification after the reset:

```bash
npx wrangler d1 execute beech-db --local --command \
  "SELECT rp.permission FROM role_permissions rp JOIN roles r ON r.id = rp.role_id \
   WHERE r.name = 'SuperAdmin' ORDER BY rp.permission;"
# Expect exactly 7 rows. 'manage_seeds' MUST NOT appear.

npx wrangler d1 execute beech-db --local --command \
  "SELECT id FROM roles WHERE name = 'SuperAdmin';"
# Expect a v4-shaped UUID, i.e. accepted by SystemIdGenerator.isValid().

npx wrangler d1 execute beech-db --local --command \
  "SELECT COUNT(*) AS n FROM user_role_assignments;"
# Expect 0. The table ships empty; granting SuperAdmin to the first account is
# runtime work owned by the enforcement sprint.

npx wrangler d1 execute beech-db --local --command \
  "SELECT name, type, dflt_value FROM pragma_table_info('users') WHERE name = 'is_active';"
# Expect one row: is_active | INTEGER | 1 — proves the inline column edit landed.
```

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `PERMISSIONS` contains exactly the 7 documented permissions; `manage_seeds` is
      absent from the tuple AND from the `role_permissions` SQL `CHECK` list.
- [ ] `packages/core/src/rbac/` imports nothing outside `packages/core/src/rbac/` — no
      `apps/*` import, no runtime dependency added to `packages/core/package.json`.
- [ ] `evaluate.ts` contains zero I/O: no `D1Database`, no `fetch`, no `Date.now()`.
      Every export is a pure function of its arguments.
- [ ] No file under `apps/api/src/features/` is created or modified.
- [ ] No file under `apps/dashboard/` is created or modified.
- [ ] `apps/api/src/factory.ts` is unchanged; `git diff --stat` does not list it.
- [ ] `packages/core/src/oauth/role-guard.ts` is unchanged and
      `repository.middleware.ts` still binds `new AllowAllRoleGuard()`.
- [ ] `apps/api/src/features/seeds/seeds.helpers.ts` is unchanged; `requireAdmin` keeps
      its current behaviour.
- [ ] **No new migration file exists.** `apps/api/migrations/` still contains exactly
      `0000_v040_base.sql` and `0030_test_seeds.sql`; the schema change lives inside
      `0000` (inline `users.is_active` + trailing section 20).
- [ ] `0000` contains no `ALTER TABLE users` statement, and no
      `user_role_assignments` seed row.
- [ ] Section banners `1.`–`19.` in `0000` keep their existing numbers; RBAC is
      appended as `20.`.
- [ ] `apps/api/wrangler.jsonc` is unchanged (it uses `migrations_dir`, not an array).
- [ ] The two new D1 repositories `implements` their core interface explicitly and
      execute raw `prepare()`/`bind()` — no ORM, no query builder, no new dependency.
- [ ] Every id is produced by `IIdGenerator.uuid()` (never `generate()`, never an
      inline `crypto.randomUUID()`), and the `SuperAdmin` id seeded in `0000` is
      v4-shaped, i.e. accepted by `SystemIdGenerator.isValid()`.
- [ ] No new CSPRNG, hashing, or token-generation helper is added anywhere. This sprint
      issues no bearer credential; sprint 4 must reuse `generateOpaqueToken()` and
      `sha256hex()`.
- [ ] Nothing under `apps/api/src/auth/` or `apps/api/src/features/oauth/` is modified;
      `git diff --stat` lists no file from either directory.
- [ ] `Variables` additions are purely additive: no existing key renamed or removed.
- [ ] `listActiveForUser` excludes assignments scoped to a deleted or missing seed, and
      a dedicated test asserts the revive-on-restore behaviour.
- [ ] Both repository tests execute real SQL via `D1TestDatabase`. Neither file
      contains a `makeMockDb`-style `vi.fn()` stub of `prepare`/`bind` — a mocked
      statement cannot verify the scope-decay predicate.
- [ ] Neither new repository extends `BaseD1Repository`; both take a plain
      `private readonly db: D1Database`, matching every other system-table repository.
- [ ] Test doubles come from `shared/services/` (`SequentialIdGenerator`, `FixedClock`)
      and `test/helpers/` (`seedTestUsers`) — no new ad-hoc double is introduced.
- [ ] `0000` is idempotent when applied twice, and every pre-existing test that
      constructs a `D1TestDatabase` still passes with the edited file applied.
- [ ] `pnpm beech db:reset` was run (not `db:migrate` — an edited `0000` is already
      recorded as applied and `db:migrate` would be a silent no-op).
- [ ] `pnpm --filter @beechcms/core run build` succeeds.
- [ ] `npx tsc --noEmit` in `apps/api/` reports zero errors.
- [ ] `pnpm beech db:reset` completes and the two manual verification queries in
      SECTION 5 return the expected rows.
- [ ] `pnpm beech test` is green, including every pre-existing `flow-*.test.ts` and
      `features/oauth/*.test.ts` — proof that behaviour did not change.
- [ ] `pnpm lint` is clean.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executing agent MUST NOT build or modify the following.

> **Lockout warning — hand this to sprint 2.** Dropping the admin backfill (there are
> no users to backfill on a fresh beta database) means `user_role_assignments` ships
> empty. The moment enforcement goes live, **nobody holds any permission and the
> dashboard is unreachable.** Sprint 2 therefore MUST, in the same PR as the gate,
> grant `SuperAdmin` at `'*'` to the account created by `POST /auth/setup`
> (`apps/api/src/features/setup/`, via `IUserRepository.createInitialAdmin`), in the
> same transaction that creates it. This is a hard prerequisite of enforcement, not a
> follow-up.

**Deferred to `RbacRequestEnforcement` (roadmap entry 2):**
- Any permission-checking middleware, and any registration of one in `factory.ts`.
- Resolution of a request's scope from its route's seed slug.
- Replacing or altering `requireAdmin()` in `apps/api/src/features/seeds/seeds.helpers.ts`.
- Replacing `AllowAllRoleGuard` with a real `IRoleGuard` adapter, in core or in
  `repository.middleware.ts`.
- Enforcing `users.is_active` on the login/refresh path, and revoking live sessions on
  deactivation.
- Adding permission or scope claims to `JwtClaims` / `ActorContext`.
- Widening the `IRoleGuard.arbitrate()` signature (see Reuse Audit) and updating its
  single production call site at `apps/api/src/features/oauth/authorize.ts:222`.

**Deferred to `RbacUserRoleAdminApi` (roadmap entry 3):**
- The `apps/api/src/features/rbac/` slice and every route in it.
- Account create/update/deactivate endpoints.
- Role and assignment CRUD endpoints.
- Wiring `canGrant` into a request path, and the last-active-SuperAdmin guardrail
  (`countActiveGlobalAdmins` ships here as storage only, with no caller).

**Deferred to `RbacInvitations` (roadmap entry 4):**
- The `invitations` table, invite tokens, expiry, single-use redemption, regeneration.
  When built, it MUST reuse `generateOpaqueToken()` + `sha256hex()` and mirror
  `IPasswordResetTokenRepository` / the `password_reset_tokens` DDL — see Reuse Audit.
- Invite emails and any `INotificationService` usage.
- Any new token, entropy, or hashing helper. There must remain exactly one of each.

**Deferred to `RbacDashboardSurfaces` (roadmap entry 5):**
- Every dashboard file: user/role/invite screens, permission-derived navigation and
  section visibility, `/api/settings/me` payload changes.

**Excluded from the feature entirely (brief §5 — do not build in any sprint):**
- Negative permissions or any conflict hierarchy between roles.
- Runtime extension of the permission enum (plugin or API driven).
- Per-scope duplicated role objects (`Editor-SeedA`, `Editor-SeedB`).
- Hard-delete of accounts with differentiated historical-data handling.
- A `content:publish` permission distinct from `content:update`.
- Row-level isolation filters within a shared table.
- **`manage_seeds`, or any dashboard-reachable schema-mutation permission, under any
  name, at any privilege level.**

**Also out of scope:** removing the legacy `users.role` column. It stays in place with
its `CHECK (role IN ('admin','editor'))` constraint until the enforcement sprint has
replaced its readers (`authMiddleware`, `requireAdmin`, `roleGuard.arbitrate`,
`seedTestUsers`, `createInitialAdmin`). Because `0000` is now edited in place, sprint 2
can delete the column outright rather than deprecating it — no down-migration is
needed, only a `pnpm beech db:reset`.
