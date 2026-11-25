# Sprint Plan — ManageSeedsPermission (ROADMAP entry 7)

Feature brief: `stages/00_ideation/output/feature_brief.md` (rules 28–30; §3 user stories on `manage_seeds`; §4 "Vincoli sui
permessi", "Rimozione del legacy").
Roadmap: `stages/01_sprint_planning/output/backlog/ROADMAP.md`, entry 7. Entries 1–6 are shipped (`30473871`, `b64a39d9`,
`185b13d1`, `9e47d33c`, `5441a90d`, `26aa6880`) and archived in `docs/Sprints/DashboardDataScopeClosure/`,
`DashboardTabAudienceApi/`, `DashboardTabAudienceUi/`, `WidgetPermissionRequirements/`, `ManageLayoutPermissionApi/` and
`ManageLayoutPermissionUi/`.

### Pre-Computation Analysis

Graph refreshed with `graphify update . --force` (29 075 nodes, 41 868 edges) before any query.

**a) God nodes identified via the CLI**

| Node | Source | Degree / reach | Why it matters here |
|------|--------|----------------|---------------------|
| `hasPermission()` | `packages/core/src/rbac/evaluate.ts:L64` | 20 (`graphify explain`) | The one evaluator. The new route gate, the OAuth guard and the dashboard gate all ask it the same question (`manage_seeds` at `'*'`). No second evaluator is added. |
| `usePermissions()` | `apps/dashboard/src/features/shared/hooks/use-permissions.ts:L62` | 58 (`graphify explain`) | Loses `isDeveloper`. Its only reader is `SettingsDialog` (`settings-dialog.tsx:L110`); the other 57 dependents never read the field (grep). |
| `seedsApp` | `apps/api/src/features/seeds/seeds.handler.ts:L44` | `factory.ts`, `routes.ts`, `index.ts`, `seeds.test.ts` | Its router-wide `requireAdmin` middleware (`L48-51`) is removed. Mounting and route types are unchanged. |
| `PROTECTED_ROUTES` / `resolveRouteRule()` | `apps/api/src/middleware/permission.middleware.ts:L69`, `L202` | every `/api/*` request | The five `/api/seeds` rows move from `LEGACY_ADMIN` to `perm('manage_seeds', 'global')`. |
| `PERMISSIONS` | `packages/core/src/rbac/permissions.ts:L23` | `permissions.test.ts`, `dashboard-layout.test.ts` | Gains `manage_seeds`. The graph misses the exhaustive consumers (see c). |

**b) Architectural boundaries affected**

- `@beechcms/core` (`packages/core/src/`), pure, zero I/O:
  - `rbac/permissions.ts`: vocabulary entry, plus the rewrite of the "never add `manage_seeds`" paragraph;
  - `oauth/role-guard.ts`: `PermissionRoleGuard` delegates on `manage_seeds@*` instead of `manage_users@*`.
- `apps/api`:
  - migration `0040`;
  - `middleware/permission.middleware.ts`: 5 route rows + doc comments;
  - `features/seeds/seeds.handler.ts`, `seeds.helpers.ts`: `requireAdmin` deleted;
  - `features/settings/settings.handler.ts`: `isDeveloper` removed from `GET /api/settings/me`;
  - comment-only edits: `middleware/auth.middleware.ts:L101`, `features/rbac/users.ts:L18-19`;
  - tests in those places, plus `features/rbac/test/integration/`, `shared/db/repositories/`, `test/flow/`.
- `apps/dashboard`:
  - `features/settings/components/settings-dialog.tsx`: Data Models gate;
  - `features/shared/hooks/use-permissions.ts`, `use-me.ts`: `isDeveloper` removed;
  - `features/rbac/components/permission-metadata.ts`, `permission-groups.ts`, `locales/{en,it}.json`: new permission;
  - tests: `settings-dialog.test.tsx`, `shared/test/unit/use-permissions.test.ts`, `rbac/components/users-tab.test.tsx`
    (mock only), `src/test/me-payload.ts`.
- `docs/reference/seed-builder.md`: the contract line of the routes this sprint re-gates.

**c) `graphify affected` impact analysis**

```
graphify affected "requireAdmin" --depth 2
- seeds.handler.ts [imports]   apps/api/src/features/seeds/seeds.handler.ts:L1
- index.ts [re_exports]        apps/api/src/features/seeds/index.ts:L1
- seeds.test.ts [imports_from] apps/api/src/features/seeds/seeds.test.ts:L1
  → `index.ts` re-exports only `seedsApp` (read: L5), so that edge is the barrel, not the guard.
    grep confirms seeds.handler.ts:L24/L49 is the only caller. The schema slice has its OWN guard
    (`requireLayoutEditPermission`, `schema.handler.ts:L20`, via core `canEditLayout`) and is untouched.
    `seeds.test.ts` loses its seven in-slice 403 tests (T4).

graphify affected "seedsApp" --depth 1
- factory.ts, routes.ts [imports]; index.ts [re_exports]; seeds.test.ts [imports]
  → the export and its method chain stay; only the first `.use('*')` link is removed. `AppType` is unchanged.

graphify affected "PermissionRoleGuard" --depth 2
- role-guard.test.ts [imports]
  → graph miss: `apps/api/src/middleware/repository.middleware.ts:L177` binds it in production (grep).
    Every OAuth flow test mints tokens as the setup admin (SuperAdmin), who gains `manage_seeds` in 0040,
    so `flow-oauth-*.test.ts` keep passing. grep finds no OAuth test with a non-SuperAdmin `manage_users` grantor.

graphify affected "rbac_permissions_permissions" --depth 2
- dashboard-layout.test.ts, permissions.test.ts
  → the graph misses every exhaustive consumer of the vocabulary. grep finds them:
      apps/dashboard/src/features/rbac/components/permission-metadata.ts:L15  Record<Permission, …>  (type error until filled)
      apps/api/src/features/rbac/rbac.schema.ts:L18  z.enum(PERMISSIONS)  (accepts manage_seeds automatically)
      apps/dashboard/src/test/me-payload.ts:L15  FULL_AUTHORITY = [...PERMISSIONS]  (widens automatically)
      packages/core/src/rbac/permissions.test.ts:L8-26                asserts 8 entries + rejects manage_seeds
      apps/api/src/shared/db/repositories/d1-role.repository.test.ts:L100-140  SuperAdmin has 8 + CHECK rejects manage_seeds
      apps/api/test/flow/flow-rbac-upgrade.test.ts:L65              SuperAdmin list after migrations
      apps/api/test/flow/flow-rbac-projections.test.ts:L156         SuperAdmin `/me` global list

graphify affected "hooks_use_permissions_usepermissions" --depth 1
- 58 dependents; the only one that reads `isDeveloper` is SettingsDialog() (settings-dialog.tsx:L103)
  → grep `isDeveloper` in apps/dashboard/src: besides the hook, its test and the settings dialog, the hits are
    `users-tab.tsx` / `assignments-dialog.tsx` (an ACCOUNT field, ROADMAP entry 8) and `SetupPage.tsx`
    (`environment.isDeveloper`, the env flag that brief §2 says is never touched). Neither reads the hook's field.
```

**Pre-existing red test.** `npx vitest run test/flow/flow-rbac-projections.test.ts` in `apps/api/` fails today at `L156`.
Sprint 5 did not add `manage_layout` to the expected SuperAdmin `/me` list. T5 edits this test anyway (it asserts
`isDeveloper`), so T5 also fixes the list.

`graphify path "seedsApp" "rbacApp"` returns 2 hops through `routes.ts`, the composition root
(`seedsApp ← routes.ts → rbacApp`). The seeds slice never imports the `rbac` slice, and it still won't when this sprint
ships, because the gate moves into the shared middleware.

### VETO Audit

- **Botanical invariant.**
  - The only SQL touched is the `role_permissions` rebuild in the migration, a system table with no engine representation.
  - No `content_*` table, Branch ID, `apiToDb` or `dbToApi` path is involved. The seeds slice keeps its schema-mutation code
    unchanged; only its entry guard disappears.
  - **PASS.**
- **VSA.**
  - Authorization moves out of the seeds slice into the shared `permissionMiddleware`, which already gates every other
    slice.
  - The dashboard gate goes through the existing shared `usePermissions` → core `hasPermission` path.
  - No new import between `apps/api/src/features/*` or `apps/dashboard/src/features/*`. The existing
    `settings → seed-builder` import (`settings-dialog.tsx:L37`) predates this sprint and is not touched.
  - **PASS.**
- **Cloudflare purity.** One numbered migration, a copy of `0039_manage_layout_permission.sql` widened by one value.
  **PASS.**
- **YAGNI cuts applied before drafting:**
  1. **No new route-requirement kind.** `perm('manage_seeds', 'global')` already expresses "global only", and the
     `legacy-admin` kind stays for the two `/api/schema/:slug/layout` rows (brief §5).
  2. **No refusal of seed-scoped `manage_seeds` assignments.** A seed-scoped grant confers nothing, because every gate
     checks `'*'`. This is the same decision sprint 5 took for `manage_layout`.
  3. **No replacement field in `/api/settings/me`** (brief §5). The dashboard derives the gate from `permissions`.
- **Roadmap items pulled forward from entry 8, each because leaving it would contradict this entry's own goal:**
  1. **`requireAdmin` is deleted now.** Keeping the in-slice guard behind the new route row would AND the two axes. A
     `manage_seeds` holder without `users.role = 'admin'` would still be refused, which breaks the brief §3 user story
     "accedere … senza dipendere da un'identità legacy".
  2. **`isDeveloper` leaves `/api/settings/me` now** (brief rule 30, one rule). Once the Data Models gate reads
     `manage_seeds`, the field has no reader left. Its tests assert the legacy semantics the brief tells us to rewrite on
     the new permission.
- **Coherence fix, not new scope.**
  - `PermissionRoleGuard`'s documented premise is "there is deliberately no `manage_seeds` permission to map onto"
    (`role-guard.ts:L54-59`). Brief rule 29 revokes that premise.
  - Its two OAuth scopes drive only `/api/seeds/*` + `GET /api/schema` (`oauth-scope.middleware.ts:L42-46`).
  - So the guard now asks "does the owner hold `manage_seeds@*`", the same question the route gate asks. A one-line
    decision change in core.
- **Single source of truth.** `manage_seeds@*` is evaluated only by core `hasPermission`, in three places:
  - the route row;
  - the OAuth guard;
  - the dashboard, through `canGlobally`.

  No caller reads `users.role` for seeds any more.

No violation remains. HANDOFF → executor.

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Schema mutation is the last surface still gated by the legacy axis:
- `/api/seeds/*` is a `legacy-admin` route (`permission.middleware.ts:L92-98`), decided by `users.role === 'admin'` in
  the slice (`seeds.helpers.ts:L32`);
- the dashboard shows Data Models only when `/api/settings/me` says `isDeveloper` (`settings-dialog.tsx:L149`).

ROADMAP entry 8 deletes `users.role`, the JWT `role` claim and the `legacy-admin` machinery. It can only do that once
`/api/seeds/*` has an RBAC replacement. This sprint provides that replacement:
- `manage_seeds` exists and is assignable (vocabulary + migration + SuperAdmin + roles UI);
- the route table gates on it;
- the dashboard derives Data Models from it;
- the OAuth delegation guard asks the same question.

Brief rule 29's revocation of the "never `manage_seeds`" invariant is written into the vocabulary, the migration header
and the comments that asserted it.

VSA and Botanical Engine: the permission is a core vocabulary entry evaluated by core `hasPermission`. Enforcement lives
in the shared API middleware that already gates every slice, and no feature slice gains an import. Nothing touches seed
storage or the engine.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Middleware order on `apiProtected`** (`apps/api/src/factory.ts:L227-237`):
1. `authMiddleware({ acceptOAuth: true })`;
2. `oauthScopeMiddleware()`;
3. `permissionMiddleware()`;
4. `apiProtected.route('/', protectedRoutes)`.

For an OAuth token, step 1 hydrates `jwtPayload` with the resource owner's own claims (`auth.middleware.ts:L101-117`).
Step 3 then evaluates the owner's effective permissions exactly as for a JWT.

**Route table** (`permission.middleware.ts`)
- Requirement kinds (`L37-41`): `permission`, `permission-any-scope`, `authenticated`, `legacy-admin`.
- `legacy-admin` is passed through to the slice (`L297-300`). Its doc comments (`L33-36`, `L280-282`) say schema
  mutation "must never" become a permission.
- Rows that use it:
  - `PUT` / `DELETE /api/schema/[^/]+/layout` (`L88-89`), guarded in-slice by `requireLayoutEditPermission`
    (`schema.handler.ts:L20`);
  - `GET` / `POST` / `PUT` / `PATCH` / `DELETE /^\/api\/seeds(\/.*)?$/` (`L92-98`), guarded in-slice by `requireAdmin`.
- A refusal from the gate is `403 { error: 'forbidden', … }` (`forbidden()`, asserted as `toMatchObject({ error: … })`
  in `permission.middleware.test.ts:L110`).

**Seeds slice.** `seedsApp` opens with `.use('*', …requireAdmin…)` (`seeds.handler.ts:L44-51`), then mounts
`destructiveApp` and `mcpApp`. `requireAdmin` (`seeds.helpers.ts:L26-43`) reads `jwtPayload.role` and answers a
problem+json 403. `actorFromContext` (`L51`) also reads `jwtPayload`, for audit logging only, and is kept.

**Vocabulary**
- `PERMISSIONS` has 8 entries, `manage_layout` last (`permissions.ts:L23-32`). The doc paragraph at `L12-14` forbids
  `manage_seeds`.
- The latest migration is `0039_manage_layout_permission.sql`. It rebuilds the `role_permissions` CHECK with 8 values and
  grants SuperAdmin by name.
- Migrations are discovered by directory: wrangler `migrations_dir`, the workers pool (`vitest.workers.config.ts:L11`)
  and `D1TestDatabase` (`apps/api/test/helpers/d1-test-database.ts:L37`). There is no list to edit.
- Anti-escalation is vocabulary-agnostic:
  - `canGrant` (`evaluate.ts:L86`);
  - 403 `escalation-refused` on assignments (`features/rbac/assignments.ts:L82-89`);
  - `permissionsHeldAnywhere` bound on role create/update (`features/rbac/guards.ts:L66`).

**OAuth.** `PermissionRoleGuard.arbitrate` grants all requested scopes iff `effective.global.has('manage_users')`
(`role-guard.ts:L64-74`). It is bound in `repository.middleware.ts:L177`.

**`/api/settings/me`.** The response carries `isDeveloper: currentUser.role === 'admin'`, with a comment that cites the
revoked invariant (`settings.handler.ts:L222-225`). The dashboard type `MeResponse` is inferred from the route
(`use-me.ts:L18`), so removing the field updates it.

**Dashboard**
- `usePermissions()` exposes `isDeveloper` (`use-permissions.ts:L48-49`, `L72`). Its sole reader is `SettingsDialog`
  (`settings-dialog.tsx:L110`), whose `models` group shows `content-types` iff `isDeveloper` (`L146-152`).
- `canGlobally` is `hasPermission(effective, p, GLOBAL_SCOPE)` (`use-permissions.ts:L71`).
- Roles UI:
  - `PERMISSION_GROUPS.system` = `manage_users`, `manage_roles`, `manage_layout`, `view_analytics` (`permission-groups.ts:L21-26`);
  - `PERMISSION_METADATA: Record<Permission, …>` (`permission-metadata.ts:L15-24`);
  - labels at `locales/en.json:L1780-1788`, `it.json` same lines;
  - a checkbox for a permission the editor does not hold is disabled generically (`role-form-dialog.tsx:L222`).

**Docs.** `docs/reference/seed-builder.md:L3` says the routes require `requireAdmin`. `packages/mcp/resources/` is a
gitignored copy made by `packages/mcp/scripts/bundle-resources.mjs`, so only `docs/` is edited.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

Create:
- `apps/api/migrations/0040_manage_seeds_permission.sql`
- `apps/api/src/features/seeds/test/integration/seed-access.integration.test.ts`

Modify (core):
- `packages/core/src/rbac/permissions.ts`, `permissions.test.ts`
- `packages/core/src/oauth/role-guard.ts`, `role-guard.test.ts`

Modify (API):
- `apps/api/src/middleware/permission.middleware.ts` (5 rows + 3 comments), `permission.middleware.test.ts`
- `apps/api/src/features/seeds/seeds.handler.ts`, `seeds.helpers.ts`, `seeds.test.ts`
- `apps/api/src/features/settings/settings.handler.ts`, `settings.handler.test.ts`
- `apps/api/src/middleware/auth.middleware.ts` (comment at `L101` only)
- `apps/api/src/features/rbac/users.ts` (comment at `L18-19` only)
- `apps/api/src/features/rbac/test/integration/roles.integration.test.ts`, `assignments.integration.test.ts`
- `apps/api/src/shared/db/repositories/d1-role.repository.test.ts`
- `apps/api/test/flow/flow-rbac-upgrade.test.ts`, `flow-rbac-projections.test.ts`, `flow-oauth-resource-server.test.ts`
  (comment at `L133` only)

Modify (dashboard):
- `apps/dashboard/src/features/settings/components/settings-dialog.tsx`, `settings-dialog.test.tsx`
- `apps/dashboard/src/features/shared/hooks/use-permissions.ts`, `use-me.ts`
- `apps/dashboard/src/features/shared/test/unit/use-permissions.test.ts`
- `apps/dashboard/src/features/rbac/components/permission-metadata.ts`, `permission-groups.ts`, `users-tab.test.tsx`
  (mock object only)
- `apps/dashboard/src/test/me-payload.ts`
- `apps/dashboard/src/locales/en.json`, `it.json`

Modify (docs): `docs/reference/seed-builder.md` (`L3` only).

No seed-builder UI, schema slice or `users.role` change.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### T1 — `manage_seeds` in the vocabulary (core + migration)

**Vocabulary.** Append `'manage_seeds'` as the **last** element of `PERMISSIONS` (`permissions.ts:L23-32`). Appending keeps
every existing index, as sprint 5 did. Replace the paragraph at `L12-14` with this decision, worded as prose in the
existing JSDoc style:
- `manage_seeds` gates seed-schema mutation (`/api/seeds/*`, the dashboard Data Models group);
- it is evaluated at the global scope only, so a seed-scoped grant confers nothing;
- it replaces the former developer axis (`users.role = 'admin'`) as a deliberate decision: whoever holds it (SuperAdmin
  by default) may change the schema, bounded by the anti-escalation rule.

Keep the `manage_layout` paragraph.

**Migration** `apps/api/migrations/0040_manage_seeds_permission.sql`. Copy `0039`'s header shape (`L1-5`), stating:
- why the table is rebuilt (SQLite cannot alter a CHECK);
- that nothing references `role_permissions`;
- that this migration deliberately revokes the exclusion that `0032` and `0039` recorded (brief rule 29).

Do not edit `0032` or `0039`: applied migrations are immutable. Verbatim body:

```sql
CREATE TABLE IF NOT EXISTS role_permissions_dg_tmp (
    role_id    TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission TEXT NOT NULL CHECK (permission IN (
                   'content:read',
                   'content:create',
                   'content:update',
                   'content:delete',
                   'manage_users',
                   'manage_roles',
                   'view_analytics',
                   'manage_layout',
                   'manage_seeds'
               )),
    PRIMARY KEY (role_id, permission)
);

INSERT INTO role_permissions_dg_tmp (role_id, permission)
SELECT role_id, permission FROM role_permissions;

DROP TABLE role_permissions;

ALTER TABLE role_permissions_dg_tmp RENAME TO role_permissions;

INSERT OR IGNORE INTO role_permissions (role_id, permission)
SELECT r.id, 'manage_seeds' FROM roles r WHERE r.name = 'SuperAdmin';
```

### T2 — OAuth delegation guard (core, `oauth/role-guard.ts`)

**Approach.** `PermissionRoleGuard.arbitrate` grants every requested scope iff
`hasPermission(effective, 'manage_seeds', GLOBAL_SCOPE)`, and denies all of them otherwise. The decision stays
all-or-nothing, with no partial grant. Import `hasPermission` from `../rbac/evaluate.js`. `GLOBAL_SCOPE` is already
imported (`L5`).

Reason: the guard's premise is revoked by brief rule 29, and both OAuth scopes drive only seed-schema routes, which the
route gate now refuses to anyone without `manage_seeds@*`. Delegation then requires the authority it delegates.

Rewrite the class JSDoc (`L50-63`):
- the marker is now `manage_seeds` held at `GLOBAL_SCOPE`, the same question the `/api/seeds/*` route rows ask;
- `manage_users@*` alone no longer suffices;
- a seed-scoped collaborator still cannot mint a token.

`IRoleGuard`, `AllowAllRoleGuard` and `ScopeGrantDecision` are unchanged.

### T3 — Route gate (API, `permission.middleware.ts`)

- **Rows `L92-98`.** Replace `LEGACY_ADMIN` with `perm('manage_seeds', 'global')` on all five `/api/seeds` rows. Patterns
  and methods are unchanged.
- **Section comment (`L92`).** It becomes: "`--- seeds: schema mutation, manage_seeds at the global scope only ---`".
- **Schema rows (`L87-89`).** They keep `LEGACY_ADMIN` (entry-editor gate, brief §5). Rewrite their section comment
  (`L87`) so it no longer calls this "the developer axis": "layout writes keep the entry-editor gate (brief §5)".
- **`RouteRequirement` JSDoc (`L33-36`).** `'legacy-admin'` is deferred to the slice's own `users.role` guard, and only
  the entry-editor layout rows still use it. Drop "must never become one".
- **`permissionMiddleware` JSDoc (`L280-282`).** Same rewrite.

The runtime branch at `L297` is unchanged, since the kind still exists.

### T4 — Seeds slice drops its legacy guard (API)

- `seeds.handler.ts`:
  - delete the `.use('*', …)` link and its JSDoc (`L45-51`), so the chain starts at `.route('/', destructiveApp)`;
  - remove `requireAdmin` from the import list (`L24`);
  - the module JSDoc (`L5-14`) keeps its text;
  - the two "Admin-only." remarks in the `GET /` and `GET /:slug` JSDocs (`L64`, `L81`) become "Requires
    `manage_seeds` at the global scope (route table)."
- `seeds.helpers.ts`: delete `requireAdmin` and its JSDoc (`L26-43`). `publicProblem` stays imported (used by
  `parseJsonBody` and others).

Invariant: the slice performs no authorization. Every `/api/seeds/*` request reaching it has cleared `manage_seeds@*`
in `permissionMiddleware`. That includes OAuth requests, which also cleared `oauthScopeMiddleware`.

The refusal still happens before the body is read, because the middleware runs before the slice. T6 proves this.

**Comment-only follow-through** (statements that become false):
- `auth.middleware.ts:L101`: "The in-slice gates (`requireAdmin`, `actorFromContext`) read `jwtPayload`" → "In-slice
  code (`actorFromContext`, the schema layout gate) and `permissionMiddleware` read `jwtPayload`". The rest of the comment
  stays.
- `features/rbac/users.ts:L18-19`: delete the clause "so no RBAC path can produce an account that clears
  `requireAdmin()` and reaches `/api/seeds/*`". End the sentence after "receives CREATED_ACCOUNT_ROLE ('editor')".
- `test/flow/flow-oauth-resource-server.test.ts:L133`: "Regression: the `manage_seeds@*` route gate is satisfied by the
  resource owner's permissions — not a 403."

### T5 — `/api/settings/me` loses `isDeveloper` (API)

`settings.handler.ts`: delete the `isDeveloper` property and its comment (`L222-225`). No other field changes. The
handler keeps reading `currentUser.role` elsewhere (`L425`, ROADMAP entry 8).

Rule: the payload carries no developer marker. The dashboard derives every gate from `permissions` (brief rule 30).

### T6 — Dashboard Data Models gate + roles UI (dashboard)

- `settings-dialog.tsx`: destructure `canGlobally, canAnywhere` only (`L110`). The `models` group's items are
  `canGlobally('manage_seeds') ? [content-types item] : []` (`L149-151`). The empty-group filter (`L153`) already hides the
  group title.
- `use-permissions.ts`: delete `isDeveloper` from `PermissionsApi` (`L48-49`) and from the returned object (`L72`).
- `use-me.ts:L13-17`: the `MeResponse` JSDoc drops the `isDeveloper` sentence and keeps "Full `GET /api/settings/me`
  payload, read off the route."
- `permission-metadata.ts`: add the entry below, and add `Layers` to the import from `@/components/icons`. It is the icon
  of the Content Types nav item, already exported (`settings-dialog.tsx:L13`).

  ```ts
  "manage_seeds": { icon: Layers, translationKey: "rbac.permissions.manage_seeds", defaultLabel: "Manage content types" },
  ```

- `permission-groups.ts`: the `system` group's permissions become
  `"manage_users", "manage_roles", "manage_layout", "manage_seeds", "view_analytics"`.
- Locales, after `manage_layout` under `rbac.permissions`:
  - `en.json`: `"manage_seeds": "Manage content types"`;
  - `it.json`: `"manage_seeds": "Gestisci tipi di contenuto"`.

  The wording matches `seedBuilder.page.navTitle` (`L1428` in both files).
- `src/test/me-payload.ts`: delete `isDeveloper: false` (`L27`).
- `rbac/components/users-tab.test.tsx:L18`: delete `isDeveloper: false` from the mocked `usePermissions` object only.

The disabled-when-not-held behaviour of the role checkbox needs no code (`role-form-dialog.tsx:L222`). This is the
brief §4 "disabilitati per chi non li detiene" rule.

### T7 — Tests

Fixture sources:
- **integration**: `createTestHarness` + `CANONICAL_USERS` from `@beechcms/testing`. Custom roles are seeded by direct
  SQL into `roles` / `role_permissions` / `user_role_assignments` (structural tables, testing_conventions rule 3.8), with
  UUIDv4 ids. Copy the `beforeEach` of `features/rbac/test/integration/assignments.integration.test.ts:L18-28`, including
  `DELETE FROM roles WHERE is_system = 0`, and its batch arrangement (`L42-49`).
- **unit**: existing local factories.

**New, integration** `apps/api/src/features/seeds/test/integration/seed-access.integration.test.ts`
- `describe('seeds slice — manage_seeds access (real D1)')`.
- `users: [CANONICAL_USERS.admin, CANONICAL_USERS.editor]`.
- Helper `grantEditor(scope)`: inserts a custom role holding only `manage_seeds` and assigns it to the canonical editor
  (`users.role = 'editor'`) at `scope`.
- `it()` list:
  - `the canonical editor holding manage_seeds at '*' lists seeds with 200` (`GET /api/seeds`). It proves that the legacy
    role is no longer required.
  - `the canonical editor holding manage_seeds at '*' creates a seed with 201 and the seeds row exists`. Body: copy
    `seed-ownership.integration.test.ts:L39-43`; zone 4 is a `SELECT COUNT(*) FROM seeds WHERE slug = ?` = 1.
  - `manage_seeds held only on seed 'posts' is refused 403 forbidden on GET /api/seeds` (`{ error: 'forbidden' }`).
  - `the canonical editor without manage_seeds is refused 403 forbidden on POST /api/seeds and no seed row is written`.
    Zone 4: count = 0.
  - `a caller without manage_seeds sending a non-JSON body to PUT /api/seeds/:slug receives 403, not 400`. This proves the
    gate runs before the body is read; it replaces the deleted unit test from `seeds.test.ts:L1694-1704`.
  - `users.role 'admin' without a manage_seeds grant is refused 403 forbidden on GET /api/seeds`. Arrange: delete the
    canonical admin's `user_role_assignments` row by SQL. This proves the legacy axis no longer grants.
  - `the canonical admin (SuperAdmin) lists seeds with 200`. This proves the 0040 grant end to end.

**Edit, unit** `apps/api/src/features/seeds/seeds.test.ts`. Delete the seven tests whose subject was the removed
in-slice guard:
- `L151-155`, `L194-198`, `L308-312`, `L456-460` (`403 for non-admin`);
- `L1462-1470`, `L1629-1637` (`403 for a non-admin`);
- `L1472-1480` (`403 with no jwtPayload`);
- the whole `describe('admin gate')` block at `L1694-1704`.

`buildApp` keeps its `role` option, because `actorFromContext` reads `jwtPayload`.

**Edit, unit** `apps/api/src/middleware/permission.middleware.test.ts`
- Replace the `legacy-admin` test at `L113-116` with a `describe('resolveRouteRule — seeds routes')` driven by an array,
  copying the shape of the dashboard-layout block (`L51-63`):
  - `it('every /api/seeds route resolves to manage_seeds at the global scope')`: all five methods on `/api/seeds` plus
    `GET /api/seeds/x` and `POST /api/seeds/x/mcp-apply`. Each resolves to
    `{ kind: 'permission', permission: 'manage_seeds', scope: 'global' }`.
  - `it('the entry-editor layout routes still resolve to legacy-admin')`: `PUT` and `DELETE /api/schema/x/layout` resolve
    to `{ kind: 'legacy-admin' }`.

**Edit, unit** `packages/core/src/rbac/permissions.test.ts`
- `L8`: `lists exactly the nine permissions of the closed vocabulary, manage_seeds last`. Length 9, full `toEqual`.
- `L24-26` becomes `accepts manage_seeds, which brief rule 29 admits to the vocabulary`.
- Add `rejects a name outside the vocabulary` (`'seeds:write'` → false).

**Edit, unit** `packages/core/src/oauth/role-guard.test.ts`
- Fixtures: `GLOBAL_SEEDS_MANAGER` (global `manage_seeds`), `GLOBAL_USER_MANAGER` (global `manage_users`) and
  `SCOPED_SEEDS_MANAGER` (`manage_seeds` on `posts`), all hand-rolled `EffectivePermissions`, the shape already used at
  `L11-16`.
- `it()` list:
  - `grants all when global authority contains manage_seeds`;
  - `denies all for a global manage_users holder without manage_seeds`;
  - `denies all for a caller holding manage_seeds only at a seed scope`;
  - `denies all for an empty authority` (kept).

**Edit, integration** `apps/api/src/shared/db/repositories/d1-role.repository.test.ts`
- `L100`: `the migration-seeded SuperAdmin role has exactly the 9 permissions, manage_seeds included, and isSystem true`.
  Add `'manage_seeds'` to the set.
- Replace `L131-140` with two tests:
  - `the CHECK constraint accepts manage_seeds for a custom role`: copy `L123-129`;
  - `the CHECK constraint rejects an unknown permission`: the raw `INSERT` of `'manage_everything'` rejects. This is a
    deliberately malformed value (rule 3.5).

**Edit, integration** `apps/api/src/features/rbac/test/integration/roles.integration.test.ts`
- Add `lets SuperAdmin create a role carrying manage_seeds, persisted in role_permissions`, copying `L34-44`.

**Edit, integration** `apps/api/src/features/rbac/test/integration/assignments.integration.test.ts`
- Add `refuses a manage_users@* + manage_roles@* holder assigning a manage_seeds role at * with escalation-refused`,
  copying `L39-61` with fresh UUIDv4 role ids. Zone 4: assignment count = 0.

**Edit, flow**
- `test/flow/flow-rbac-upgrade.test.ts:L65`: the admin list becomes `['content:create', 'content:delete', 'content:read',
  'content:update', 'manage_layout', 'manage_roles', 'manage_seeds', 'manage_users', 'view_analytics']`.
- `test/flow/flow-rbac-projections.test.ts`:
  - delete `isDeveloper` from the two typed `json<…>()` shapes and the two assertions (`L145-148`, `L154-155`);
  - the SuperAdmin `global` list (`L156-157`) gains `'manage_layout'` and `'manage_seeds'` (this fixes the pre-existing
    red test);
  - add `expect(superMe).not.toHaveProperty('isDeveloper')`;
  - the header comment (`L17`) says "emits the raw authority" without "+ isDeveloper".

**Edit, unit** `apps/api/src/features/settings/settings.handler.test.ts`
- `L280`: `emits the caller's serialized permissions for a seed-scoped reader`. Drop the `isDeveloper` assertion.
- `L307-321` is rewritten as `emits a global manage_seeds grant in permissions.global and no isDeveloper key, even for
  users.role admin`:
  - keep the admin user mock;
  - set `effectivePermissions.global = ['manage_seeds']`;
  - assert `permissions.global` equals `['manage_seeds']` and `body` has no `isDeveloper` property.

  `manageableScopes` is not asserted here, since it is covered by the test at `L295`.

**Edit, unit (dashboard)** `apps/dashboard/src/features/settings/components/settings-dialog.test.tsx`
- `basePermissions()` drops `isDeveloper` (`L41`).
- Replace `L115-123` with:
  - `a global manage_seeds holder sees the Data Models group with Content Types` (`canGlobally: p => p === 'manage_seeds'`);
  - `every RBAC permission except a global manage_seeds hides Content Types`. Use `canGlobally: p => p !== 'manage_seeds'`
    and `canAnywhere: () => true`, which covers a seed-scoped `manage_seeds`.

**Edit, unit (dashboard)** `apps/dashboard/src/features/shared/test/unit/use-permissions.test.ts`
- Delete `isDeveloper` from both mocked payloads (`L59`, `L76`) and the assertion at `L94`.
- Add `canGlobally('manage_seeds') is false for a manage_seeds grant held only on a seed`: payload
  `byScope: { articles: ['manage_seeds'] }`.

### T8 — Docs (route contract only)

`docs/reference/seed-builder.md:L3` becomes: "All routes under `/api/seeds` require JWT (or OAuth) authentication and the
`manage_seeds` permission at the global scope; callers without it receive `403 forbidden` from the permission gate."
Nothing else in `docs/` changes (ROADMAP entry 9).

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Before T1, rebuild core and record the API `tsc` baseline:
`pnpm run build` in `packages/core/`, then `npx tsc --noEmit | grep -c "error TS"` in `apps/api/`.

1. `pnpm run build` in `packages/core/`: exit 0.
2. `npx vitest run src/rbac src/oauth` in `packages/core/`: all pass.
3. `npx tsc --noEmit | grep -c "error TS"` in `apps/api/`: equal to the baseline, and 0 errors in `seeds.*`,
   `settings.handler*` and `permission.middleware*`.
4. `npx vitest run --project unit src/middleware/permission.middleware.test.ts src/features/seeds/seeds.test.ts src/features/settings src/shared/db/repositories`
   in `apps/api/`.
5. `npx vitest run --project flow test/flow/flow-rbac-upgrade.test.ts test/flow/flow-rbac-projections.test.ts test/flow/flow-oauth-resource-server.test.ts test/flow/flow-oauth-authorization.test.ts test/flow/flow-oauth-connected-apps.test.ts`
   in `apps/api/`: all pass. `flow-rbac-projections` was red before this sprint.
6. `npx vitest run --config vitest.workers.config.ts src/features/seeds src/features/rbac` in `apps/api/`.
7. `npx tsc --noEmit` in `apps/dashboard/`: no errors.
8. `npx vitest run src/features/settings src/features/shared src/features/rbac` in `apps/dashboard/`: all pass.
9. `pnpm beech db:reset`, then
   `npx wrangler d1 execute beech-db --local --command "SELECT p.permission FROM role_permissions p JOIN roles r ON r.id = p.role_id WHERE r.name = 'SuperAdmin' ORDER BY 1"`
   in `apps/api/`: 9 rows, `manage_seeds` included.
10. `pnpm beech test --diff`: PASS, including changed-line coverage.
11. `pnpm beech lint`: all tasks successful.
12. Invariant greps (excluding `dist/`, `assets/`, `docs/Sprints/`, `stages/` and `migrations/`), each expecting 0 matches:
    - `requireAdmin` in `apps/` and `packages/`;
    - `isDeveloper` in `apps/api/src/features/settings` and `apps/dashboard/src/features/shared`;
    - `isDeveloper` in `apps/dashboard/src/features/settings`;
    - `must never|deliberately absent|deliberately no .manage_seeds` in `packages/core/src` and `apps/api/src`;
    - `features/rbac` in `apps/api/src/features/seeds`.
13. `graphify update . --force`.

Manual check (`pnpm beech dev`):
- as SuperAdmin, Settings shows Data Models → Content Types, and the roles UI lists "Manage content types" in the System
  group;
- create a role with only `manage_seeds`, assign it at `*` to a fresh invited account (`users.role = 'editor'`), and log
  in as that account: Content Types opens and creating a seed succeeds;
- remove the assignment and reload: the Data Models group is gone, and `GET /api/seeds` answers 403.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `PERMISSIONS` has 9 entries, `manage_seeds` last; the vocabulary JSDoc states the rule-29 decision and no longer
      forbids it.
- [ ] `0040_manage_seeds_permission.sql` widens the CHECK to exactly the 9 values and grants SuperAdmin `manage_seeds`;
      `0032` and `0039` are byte-identical to `master`.
- [ ] The five `/api/seeds` rows are `perm('manage_seeds', 'global')`; the two `/api/schema/:slug/layout` rows are still
      `LEGACY_ADMIN`; no new `RouteRequirement` kind.
- [ ] `requireAdmin` no longer exists anywhere in `apps/` or `packages/` source.
- [ ] A `manage_seeds@*` holder with `users.role = 'editor'` reads and creates seeds; a seed-scoped holder, a non-holder,
      and a `users.role = 'admin'` account without the grant are refused 403 `forbidden`, with nothing written.
- [ ] A non-holder's non-JSON body to a seeds route gets 403, never 400.
- [ ] `PermissionRoleGuard` grants iff `manage_seeds` at `'*'`; `manage_users@*` alone is denied.
- [ ] `GET /api/settings/me` has no `isDeveloper` key; `usePermissions()` has no `isDeveloper` member.
- [ ] The Data Models group renders iff `canGlobally('manage_seeds')`.
- [ ] Roles UI: `manage_seeds` in the System group with en/it labels; `PERMISSION_METADATA` type-checks.
- [ ] Anti-escalation proven for `manage_seeds` (assignment refused with `escalation-refused`, count 0).
- [ ] `flow-rbac-projections.test.ts` is green.
- [ ] No new import between feature slices (API or dashboard); `@beechcms/core` gains no dependency.
- [ ] API `tsc` error count ≤ baseline; dashboard `tsc` clean; `pnpm beech test --diff` and `pnpm beech lint` pass.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

- **Legacy axis** (ROADMAP entry 8). The executor must not touch:
  - `users.role` and its CHECK, the JWT `role` claim, `role` in `ActorContext` / `resolveActor`;
  - the `legacy-admin` kind and the two `/api/schema/:slug/layout` rows, plus `canEditLayout` / `requireLayoutEditPermission`
    (entry-editor gate, brief §5);
  - the `role === 'admin'` checks in `features/upload/index.ts:L271/L305`, `settings.handler.ts:L425`,
    `features/rbac/assignments.ts:L118` and `users.ts:L152`;
  - the Developer-account protection in `users-tab.tsx` / `assignments-dialog.tsx` (including their `isDeveloper` account
    field and props), `features/rbac/constants.ts:L27`, and `role` in `@beechcms/testing` canonical users.
- **The env flag** `isDeveloper` in `features/setup/index.ts:L80` and `SetupPage.tsx` (brief §2: never touched).
- **Docs beyond the route line** (ROADMAP entry 9): `docs/manage/roles-permissions.md`, `docs/reference/rbac-api.md`,
  `docs/api-reference.md`, `06-role-based-dashboards.md`.
- **Applied migrations.** Their comments are history and are not edited, including `0032`'s and `0039`'s
  "`manage_seeds` absent" lines. `0040` records the revocation.
- **No per-seed `manage_seeds`.** No refusal to assign it on a seed scope, and no seed-scoped schema mutation (brief §5).
- **No new OAuth scope** and no change to `OAUTH_SCOPE_ROUTES`.
- **No seed-builder UI change** beyond its entry gate. No change to `settings.types.ts` or the `content-types` tab id.
- **Pre-existing `settings → seed-builder` dashboard import** (`settings-dialog.tsx:L37`): noted, not refactored here.
