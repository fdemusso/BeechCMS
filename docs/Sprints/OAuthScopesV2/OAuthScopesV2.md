# Sprint Plan — OAuthScopesV2 (`@beechcms/mcp` 2.0 Agent Control Plane, sprint 04)

Roadmap: `stages/01_sprint_planning/output/backlog/ROADMAP.md`, §6 row 04 (deliverables, acceptance), §4.6
(scope vocabulary, consent templates, "the agent does what the user does"), §5 (security), and the
"Decisioni della pianificazione dello sprint 04" note under §3 (written by this planning run).
Feature brief: `stages/00_ideation/output/feature_brief.md` is empty on purpose; the ROADMAP is the source.
Previous sprint shipped: **03 OperationCatalog** (`docs/Sprints/OperationCatalog/`, review PASS). It is in the
working tree of `feature/operation-catalog`, not yet committed: `packages/core/src/operations/{types,catalog,match}.ts`
(+ tests), `apps/api/src/factory.operations-parity.test.ts`, three `export *` lines in `packages/core/src/index.ts`.
This sprint builds on those files as they are on disk. Nothing in them is released yet (`core@0.10.0` predates them).

---

### Pre-Computation Analysis

Graph refreshed with `graphify update .` before mapping.

**a) God nodes on the path (via `graphify explain` / `affected`)**

| Node | Source | Role here |
|------|--------|-----------|
| `createBeechApp()` | `apps/api/src/factory.ts:L225-237` | Mounts `apiProtected`: `authMiddleware({acceptOAuth})` L227 → `oauthScopeMiddleware()` L230 → `permissionMiddleware()` L234 → `protectedRoutes` L237. **Not edited**; every app-building suite runs through it. |
| `oauthScopeMiddleware()` | `apps/api/src/middleware/oauth-scope.middleware.ts:L96` | Today a 5-row allowlist (`OAUTH_SCOPE_ROUTES`, L41-47). **Rewritten** onto the catalog. |
| `OAUTH_SCOPES` / `OAuthScope` | `packages/core/src/oauth/scopes.ts:L15-17` | 1.x vocabulary (2 scopes). **Widened** to the 14 v2 scopes. Read by every OAuth repository, `role-guard.ts`, token/consent handlers. |
| `PermissionRoleGuard` | `packages/core/src/oauth/role-guard.ts:L63` | All-or-nothing on `manage_seeds@*`. **Rewritten** to a per-scope partial grant. Bound in `repository.middleware.ts:L187`. |
| `resolveRouteRule()` | `apps/api/src/middleware/permission.middleware.ts:L203` | RBAC lookup over `PROTECTED_ROUTES` (L68). Read by the parity tests; one regex fixed (L159). |
| `ConsentScreen()` | `apps/dashboard/src/features/oauth-consent/components/consent-screen.tsx:L40` | Degree 19. Gains the template picker. Only caller: `ConsentPage()` (`pages/consent-page.tsx:L70`). |
| `OPERATION_CATALOG` / `matchOperation()` | `packages/core/src/operations/{catalog,match}.ts` | First runtime consumer arrives in this sprint (the scope middleware). |

**b) Architectural boundaries affected**

- `@beechcms/core`
  - `oauth/scopes.ts` — `OAUTH_SCOPES` becomes the v2 list (single vocabulary).
  - `oauth/role-guard.ts` — `SCOPE_GRANT_REQUIREMENTS` + new `PermissionRoleGuard` rule.
  - `operations/types.ts`, `operations/catalog.ts`, `operations/catalog.test.ts` — drop `OPERATION_SCOPES` /
    `OperationScope`, use `OAuthScope`.
- `apps/api`
  - `middleware/oauth-scope.middleware.ts` — catalog lookup + interim risk ceiling.
  - `middleware/permission.middleware.ts` — dead `kanban-position` branch removed (one regex).
  - `features/oauth/authorize.ts` — `deniedScopes` in the consent-screen metadata; `newScopes` ignores denied scopes.
  - `migrations/0045_oauth_scopes_v2.sql` — widen both seeded clients.
  - tests: `oauth-scope.middleware.test.ts`, `factory.operations-parity.test.ts`, `features/oauth/authorize.test.ts`,
    `test/flow/flow-oauth-resource-server.test.ts`.
- `apps/dashboard` — `features/oauth-consent/` only (new `lib/consent-templates.ts`, `consent-screen.tsx`, tests)
  + 5 locale files.
- `docs/reference/mcp-server.md`, `docs/reference/rbac-api.md` — two paragraphs that would become false.
- `packages/mcp`, `packages/cli`, `packages/api-client`: **no edit** (their default request stays `schema:read schema:write`).

**c) `graphify affected` impact analysis**

```
graphify affected "oauthScopeMiddleware()" --depth 2
- createBeechApp() [calls] factory.ts:L230; buildApp() [calls] oauth-scope.middleware.test.ts:L17
- buildApp()/adminFor()/bootWithBrokenTable() [calls] factory.csp, factory.custom-routes, repository.middleware,
  upload-proxy-gate, upload-validation, public-error-redaction tests; mountedRouteKeys() [calls]
  factory.operations-parity.test.ts:L33
- docs: "Permission Model & Known Limitations" mcp-server.md:L354; "Authorization Layers" rbac-api.md:L34
  → behaviour for JWT requests is untouched (grant === null passes first), so every JWT-driven suite is
    unaffected. Only OAuth-driven suites change: oauth-scope.middleware.test.ts and the flow-oauth-* files.

graphify affected "packages_core_src_oauth_scopes_oauth_scopes" --depth 2
- catalog.test.ts [imports] packages/core/src/operations/catalog.test.ts:L7
  (+ by grep: all D1 OAuth repositories parse stored scope strings with parseScopeString(...) ?? [])
  → widening is additive: every stored 1.x string still parses. A narrowing would silently empty rows.

graphify affected "PermissionRoleGuard" --depth 2
- role-guard.test.ts [imports]; docs/api (generated); mcp-server.md:L356
  → semantics change is intended and documented (Task 3, Task 9).

graphify explain "ConsentScreen()"  → used only by ConsentPage(); imports only @/components/ui/* + slice hooks.
graphify path "consent-screen.tsx" "scopes.ts" → no directed path today; this sprint adds a type-only import
  of OAuthScope/OAUTH_SCOPES from @beechcms/core (dashboard already depends on core, package.json:L19).
```

Breaking-change result: **intended behaviour changes only, all OAuth-side**: (1) OAuth tokens reach the 106 `agent`
operations by scope instead of 5 routes; (2) the consent guard grants per scope instead of all-or-nothing;
(3) publish/destructive requests with an OAuth token get `403 confirmation_required`. JWT behaviour is byte-identical.

**Facts established during research (the executor does not need to re-check these):**

1. `OPERATION_SCOPES` / `OperationScope` are referenced only in `operations/types.ts`, `operations/catalog.ts`
   (import + `agent()` constructor) and `operations/catalog.test.ts` (L6, L52-66). Nothing outside core.
2. Every D1 OAuth repository maps stored scope strings with `parseScopeString(row.x) ?? []`
   (`d1-oauth-client.repository.ts:L30`, `d1-oauth-consent.repository.ts:L24`, `d1-oauth-authorization-code.repository.ts:L32`,
   token repo likewise). An unknown scope empties the row, so the migration may only run with the widened code.
3. Seeded clients `beech-mcp` and `beech-mcp-cli` carry `allowed_scopes = 'schema:read schema:write'`
   (`migrations/0000_v040_base.sql:L431-446`). No other code inserts `oauth_clients` (only `_archive/` and the frozen
   `test/fixtures/legacy-migrations/`). Migrations are discovered from `migrations_dir` (`wrangler.jsonc:L25`), no
   per-file registration. `D1TestDatabase` applies every `NNNN_*.sql` (`test/helpers/d1-test-database.ts:L36-46`).
4. `validateAuthorizationRequest` checks `scopes ⊆ client.allowedScopes` only (`authorization-request.ts:L171-172`);
   the consent POST re-sends the scope string chosen by the dashboard, so a narrower string from the template
   picker is honoured with no server change. Partial grants already work end-to-end (`authorize.test.ts:L177-200`)
   and the token response echoes the granted scope (`token.ts:L150`).
5. `consentHandler` arbitrates with `resolveEffectivePermissions(context)` + `roleGuard.arbitrate` (`authorize.ts:L213-214`);
   `authorizeRequestHandler` (L112) can do the same (same JWT-only mount).
6. Hono caches parsed bodies (`HonoRequest.bodyCache`), and `zodJson` reads with `context.req.json()`
   (`shared/utils/zod-json.ts:L30`); content handlers read `context.req.valid('json')` (`content/handlers/create.ts:L44`,
   `update.ts:L53`). No handler under `apiProtected` reads `c.req.raw` body. So a middleware may call `c.req.json()`
   before the handler without consuming the stream.
7. `permissionsHeldAnywhere(effective)` exists (`packages/core/src/rbac/evaluate.ts:L107`) and is the documented
   "could this actor ever use X somewhere" primitive — exactly the consent-time question.
8. Hono stores each route as `[handler, RouterRoute]` in the router (`hono/dist/hono-base.js:#addRoute`, L241-251,
   hono 4.13.16). `app.router.match(method, path)[0]` is the ordered list of matches; each item's first element is that
   tuple, and `RouterRoute` has `method` and the full `path`. The first item whose `method` equals the request method is
   the handler Hono dispatches (middleware entries are `ALL`).
9. The sprint 03 review (`review_report.md`, finding 1) found 3 ghost collisions where `matchOperation` and Hono disagree
   (`GET /api/content/x/by-slug/draft`, `DELETE /api/content/x/views/draft`, `GET /api/content/x/by-slug/backrefs`);
   all scope- and risk-equivalent. It asked sprint 04 for a guard that fails if a future pair differs.
10. `PROTECTED_ROUTES` L159 matches `kanban-(move|position)`; only `kanban-move` is mounted.
11. Dashboard locales: `de, en, es, fr, it` (`apps/dashboard/src/locales/`); `locales.test.ts` enforces that every locale
    has every `en.json` key and keys are at most 5 segments deep. Scope copy lives under `oauth.consent.scopes.<scope>`.
12. Integration helpers: `seedTestUsers` grants `SuperAdmin@*` unless `grantSuperAdmin: false`
    (`test/helpers/seed-fixtures.ts:L13-35`); a seed-scoped user is built with `D1RoleRepository` +
    `D1RoleAssignmentRepository` as in `test/flow/flow-rbac-enforcement.test.ts:L27-42`.
13. Headers: core files MIT (`oauth/scopes.ts:L1-2`), everything else BUSL; core tests keep the MIT header
    (64 existing core test files; sprint 03 review note 4).
14. Core resolves through `dist` in `apps/api` and `apps/dashboard` tests: build core first.

---

### VETO Audit

Evaluated against `_config/ponytail_arch.md`.

| Rule | Verdict | Evidence |
|------|---------|----------|
| 1. YAGNI | PASS (adjusted) | Every deliverable is on ROADMAP row 04 or is required to make it safe. Adjustments: **(a)** one vocabulary, not two: `OPERATION_SCOPES` is deleted instead of aliased (unreleased, 3 references). **(b)** consent templates live in the dashboard slice, not core: no API, CLI or MCP code reads them. **(c)** no new scope (`agent:*` waits for its routes in 05). **(d)** no server-side check that the consent scope ⊆ the original request: the request is not stored server-side and the user may only grant within `client.allowedScopes` (fact 4); recorded as accepted. **(e)** Added, not on the row: an interim `403 confirmation_required` for publish/destructive OAuth requests. Without it, merging 04 before 05 lets any OAuth token hard-delete seeds, purge trash or change roles with no human in the loop (ROADMAP §5 row 2). It is ~20 lines in the file sprint 05 rewrites anyway. |
| 2. Botanical invariant | PASS | No content data, no D1 query outside repositories, no Branch ID. The migration touches only the system table `oauth_clients`. Scope and grant knowledge stays in `@beechcms/core`; `apps/api` reads it. |
| 3. VSA | PASS | API: only `middleware/*`, the `oauth` slice and factory-level tests change; no `features/*` cross-import (middleware imports core only). Dashboard: only `features/oauth-consent/` changes; templates are slice-local. |
| 4. Cloudflare purity | PASS | One numbered, data-only migration through the standard workflow. Middleware stays stateless; the compiled matcher is the isolate-safe constant from sprint 03. Reading the JSON body uses Hono's per-request cache, no stream tee. |
| 5. Minimal blueprint | PASS | core (vocabulary + guard) → api (gate + metadata field + migration) → dashboard (picker). |

**Deliberate divergences from the ROADMAP text, recorded in the ROADMAP note under §3:**
- Template contents: "Lettura" holds every `*:read` scope, `schema:read` included (an agent working on content must
  read the schema snapshot); the ROADMAP listed `schema:*` only under "Developer".
- Migration `0045` is taken here; `agent_intents` moves to `0046` (ROADMAP §4.5 updated).
- Interim `confirmation_required` (VETO 1e); ROADMAP row 05 now lists its removal.

---

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Sprint 03 classified all 142 routes but nothing reads the catalog: an OAuth token still reaches 5 schema routes, the
consent guard still refuses anyone without `manage_seeds@*`, and the seeded clients may only request `schema:*`.
Every later sprint assumes an agent can be *authorized* for content, media, users and settings: 05 gates the risky
subset of those calls, 06/07 call them from scripts, 08 reports the effective scope. So the authorization surface must
widen first, alone, and be reviewed as such: it is the single most security-relevant change of the 2.0 roadmap.

The sprint keeps the 1.x guarantees intact: fail-closed (a catalog miss or an `excluded` operation is refused),
JWT requests untouched, 1.x `schema:*` tokens working unchanged, RBAC still the final authority
(`effective agent permission = granted scopes ∩ the user's RBAC`, ROADMAP §4.6). Because sprint 05's human
confirmation does not exist yet, risky calls are refused rather than executed until it does.

- **Botanical Engine:** untouched; no content storage, query or Branch ID involved.
- **VSA:** shared vocabulary and grant policy in core; the gate is cross-cutting middleware; the consent UI stays in
  its slice.
- **Order:** the gate depends on the catalog (03); the intent gate (05) depends on this gate's lookup and on tokens
  that actually carry v2 scopes.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**`apiProtected` middleware order** (`apps/api/src/factory.ts`, unchanged by this sprint):
1. `authMiddleware({ acceptOAuth: true })` — L227; sets `jwtPayload` and `oauthGrant`
   (`Variables.oauthGrant: OAuthGrantContext | null`, `OAuthGrantContext = { clientId, userId, scope: OAuthScope[] }`,
   `apps/api/src/types.ts`).
2. `oauthScopeMiddleware()` — L230; JWT passes; OAuth must hit `OAUTH_SCOPE_ROUTES` and hold its scope, else
   `403 insufficient_scope` + RFC 6750 `WWW-Authenticate` (`insufficientScopeResponse`, oauth-scope.middleware.ts:L67-80).
3. `permissionMiddleware()` — L234; active account → `resolveRouteRule` (fail-closed) → RBAC.
4. `protectedRoutes` — L237.

**OAuth consent flow** (`apps/api/src/features/oauth/`):
- `GET /oauth/authorize/request` → `authorizeRequestHandler` (`authorize.ts:L112`) returns
  `AuthorizationRequestMetadata` (`authorize.ts:L32-45`: `client`, `requestedScopes`, `newScopes`, `consentRequired`,
  `redirectUri`, `state`). `newScopes = requested − active consent` (L134-135).
- `POST /oauth/authorize/consent` → `consentHandler` (L165): re-validates, `roleGuard.arbitrate(effective, scopes)`
  (L214), `access_denied` when nothing is granted (L215-219), stores consent + code with `decision.grantedScopes`.
- Dashboard: `ConsentPage` (`pages/consent-page.tsx`) fetches the metadata; when `consentRequired` is false it posts a
  silent approval with the URL `scope` (L30-44); otherwise renders `ConsentScreen`, which lists every requested scope
  as a disabled checked `Checkbox` with a "Required"/"Already granted" badge (L96-132) and posts the URL `scope`
  unchanged (`buildConsentBody`, L22-33). Types come from the RPC client (`types/oauth.types.ts`), so a new response
  field reaches the dashboard without a hand-written type.

**Grant guard today:** `PermissionRoleGuard.arbitrate` (`role-guard.ts:L63-76`) grants everything iff
`hasPermission(effective, 'manage_seeds', '*')`, else denies everything. Test double `AllowAllRoleGuard` (L41).

**Patterns to copy:**
- Local constructor-style table data: `perm()/anyScope()` (`permission.middleware.ts:L49-55`).
- Route ↔ table parity: `factory.operations-parity.test.ts` (`mountedRouteKeys`, L31-39; concrete paths via
  `toConcretePath`).
- RadioGroup choice cards: `features/settings/components/appearance-tab.tsx:L49-61`.
- Migration header comment: `migrations/0044_users_ui_prefs.sql:L1-10`.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

Create:
- `apps/api/migrations/0045_oauth_scopes_v2.sql`
- `apps/dashboard/src/features/oauth-consent/lib/consent-templates.ts`
- `apps/dashboard/src/features/oauth-consent/lib/consent-templates.test.ts` (unit)

Edit (source):
- `packages/core/src/oauth/scopes.ts` — v2 list + TSDoc.
- `packages/core/src/oauth/role-guard.ts` — `SCOPE_GRANT_REQUIREMENTS`, new `PermissionRoleGuard` rule.
- `packages/core/src/operations/types.ts`, `packages/core/src/operations/catalog.ts` — vocabulary swap.
- `apps/api/src/middleware/oauth-scope.middleware.ts` — catalog lookup + interim risk ceiling.
- `apps/api/src/middleware/permission.middleware.ts` — L159 regex only.
- `apps/api/src/features/oauth/authorize.ts` — `deniedScopes`, `newScopes` rule.
- `apps/dashboard/src/features/oauth-consent/components/consent-screen.tsx` — template picker, row states, scope body.
- `apps/dashboard/src/locales/{en,it,de,fr,es}.json` — new keys.
- `docs/reference/mcp-server.md` (§ "Permission Model & Known Limitations"), `docs/reference/rbac-api.md` (L34).

Edit (tests):
- `packages/core/src/oauth/scopes.test.ts`, `packages/core/src/oauth/role-guard.test.ts`,
  `packages/core/src/operations/catalog.test.ts`
- `apps/api/src/middleware/oauth-scope.middleware.test.ts`, `apps/api/src/factory.operations-parity.test.ts`,
  `apps/api/src/features/oauth/authorize.test.ts`, `apps/api/test/flow/flow-oauth-resource-server.test.ts`
- `apps/dashboard/src/features/oauth-consent/components/consent-screen.test.tsx`

Already done by this planning run (executor does not edit): `stages/01_sprint_planning/output/backlog/ROADMAP.md`
(row 03 → DONE, row 04 → PLANNED, sprint 04 note under §3, §4.5 migration renumbered, row 05 amended).

Explicitly excluded: no new route, no new middleware registration in `factory.ts`, no change to token/revoke/consents
handlers, no change to `packages/mcp`, `packages/cli`, `packages/api-client` defaults.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### Task 1 — One scope vocabulary (`packages/core/src/oauth/scopes.ts`, `operations/types.ts`, `operations/catalog.ts`)

Approach: `OAUTH_SCOPES` becomes the v2 list and is the only definition; the operation types use `OAuthScope`.
Reason: two lists that must stay equal are a drift bug waiting to happen, and the sprint 03 names were never released.

Verbatim building block (replaces `scopes.ts:L4-17`; helpers `isOAuthScope`, `parseScopeString`, `formatScopes`,
`isScopeSubset` keep their signatures and bodies):

```ts
/**
 * OAuth scope vocabulary (v2). Each scope gates a family of operations in
 * `OPERATION_CATALOG`; RBAC still decides what the token's owner may do.
 * `schema:read` / `schema:write` keep their 1.x meaning, so 1.x tokens stay valid.
 * Publish/destructive is not a scope: it is decided per request by risk.
 */
export const OAUTH_SCOPES = [
  'schema:read', 'schema:write',
  'content:read', 'content:write', 'content:delete',
  'media:read', 'media:write',
  'automations:read', 'automations:write',
  'users:read', 'users:write',
  'settings:read', 'settings:write',
  'analytics:read',
] as const

export type OAuthScope = (typeof OAUTH_SCOPES)[number]
```

- `operations/types.ts`: delete `OPERATION_SCOPES` and `OperationScope`; `AgentOperationSpec.scope` becomes
  `OAuthScope` (type-only import from `../oauth/scopes.js`). Nothing else in the file changes.
- `operations/catalog.ts`: the `agent()` constructor's `scope` parameter becomes `OAuthScope`; import list adjusted.
  No catalog row changes.
- The comment on `seeds.plan` being `schema:read` (dry-run) moves from the old `scopes.ts` docblock to nowhere: it is
  already documented on the catalog row and in `catalog.test.ts:L100`.

### Task 2 — Interim-safe scope gate (`apps/api/src/middleware/oauth-scope.middleware.ts`)

Approach: replace the 5-row table with `matchOperation()`, then refuse publish/destructive risks until sprint 05.
Reason: the catalog is the one classification the parity suite keeps in sync with the router.

Delete `OAuthScopeRoute`, `OAUTH_SCOPE_ROUTES` and their docblock. Keep `insufficientScopeResponse` (L67-80) unchanged.

Verbatim exports:

```ts
/** Error code of the interim risk ceiling; removed by the intent gate (ROADMAP sprint 05). */
export const CONFIRMATION_REQUIRED_ERROR = 'confirmation_required'

/**
 * Scope an OAuth token needs for `method` + `path`: the catalog scope of an `agent`
 * operation, or `null` when the request is uncatalogued or `excluded` (never reachable).
 */
export function resolveRequiredScope(method: string, path: string): OAuthScope | null

export function oauthScopeMiddleware(): (c: Context<{ Bindings: Env; Variables: Variables }>, next: Next) => Promise<Response | void>
```

Middleware rules, in order:
1. `oauthGrant` null (JWT) → `next()`. Unchanged; must stay first.
2. `operation = matchOperation(c.req.method, c.req.path)`. Miss or `exposure === 'excluded'` →
   `insufficientScopeResponse(null)` (403, no `scope=` in the challenge). This is what keeps password, sessions,
   profile, `rotate-field`, direct seed writes and `POST /api/rbac/users` human-only.
3. `grant.scope` lacks `operation.scope` → `insufficientScopeResponse(operation.scope)`.
4. Risk: `resolveOperationRisk(operation, { query: c.req.query(), body })`. `body` is read only when
   `typeof operation.risk === 'function'` **and** the `Content-Type` header contains `application/json`; it is
   `await c.req.json()` with any parse error mapped to `undefined` (never throws, never a 500; the handler's own
   validator then answers the malformed body as today). Otherwise `body` is `undefined`. Fact 6: the parsed body stays
   cached for `zodJson`.
5. Risk `publish` or `destructive` → 403 JSON `{ error: CONFIRMATION_REQUIRED_ERROR, error_description: 'This
   operation needs human confirmation, which is not available to OAuth clients yet. Perform it from the dashboard.' }`,
   `Content-Type: application/json`, no `WWW-Authenticate` (not a token problem). Applies in every `ENV`:
   the dev/prod policy is sprint 05's.
6. Otherwise `next()`.

Update the file and `oauthScopeMiddleware` docblocks: allowlist → catalog, add the interim rule with a pointer to
ROADMAP sprint 05. `resolveRequiredScope` stays exported for tests and docs (rules 2-3 only, no risk).

Consequences the tests pin (no code beyond the rules above):
- The five 1.x routes keep their scopes (`seeds.list/get/plan` → `schema:read`, `schema.snapshot` → `schema:read`,
  `seeds.apply` → `schema:write`), trailing-slash tolerance included (sprint 03 matcher).
- `seeds.apply` is `write` and passes; `DELETE /api/seeds/:slug` is `destructive` and is refused with
  `confirmation_required` even with `schema:write`.

### Task 3 — Per-scope consent guard (`packages/core/src/oauth/role-guard.ts`)

Approach: a static map from scope to the RBAC permissions that make it usable; grant each requested scope whose
requirement the user meets anywhere. Reason: "delegation requires the authority it delegates" (the 1.x rule) applied
per scope, so an editor can now authorize an agent for content without ever getting `schema:write`.

Verbatim building block (new, exported through the existing `export * from './oauth/role-guard.js'`):

```ts
/**
 * RBAC authority that makes each OAuth scope usable, derived from the route rules of the
 * scope's `agent` operations: `'authenticated'` when at least one of them is open to any
 * active account, otherwise the permissions (any one, at any scope) those routes demand.
 * Kept in sync with PROTECTED_ROUTES by apps/api/src/factory.operations-parity.test.ts.
 */
export const SCOPE_GRANT_REQUIREMENTS: Readonly<Record<OAuthScope, readonly Permission[] | 'authenticated'>> = {
  'schema:read': 'authenticated',
  'schema:write': ['manage_seeds'],
  'content:read': 'authenticated',
  'content:write': 'authenticated',
  'content:delete': ['content:delete'],
  'media:read': ['content:read'],
  'media:write': ['content:create', 'content:delete'],
  'automations:read': ['content:read'],
  'automations:write': ['content:delete', 'content:update'],
  'users:read': ['manage_roles', 'manage_users'],
  'users:write': ['manage_roles', 'manage_users'],
  'settings:read': 'authenticated',
  'settings:write': 'authenticated',
  'analytics:read': 'authenticated',
}
```

`PermissionRoleGuard.arbitrate` rules:
- `held = permissionsHeldAnywhere(effective)` (fact 7). A requested scope is granted iff its requirement is
  `'authenticated'` or `held` contains at least one listed permission; otherwise denied.
- `grantedScopes` and `deniedScopes` partition `requestedScopes`, each in request order; never grants an unrequested
  scope; never throws; empty request → both empty.
- Rewrite the class docblock: per-scope partial grant, RBAC remains the runtime authority
  (`permissionMiddleware`), the guard only refuses scopes the owner could never use. Drop the "seed-scoped
  collaborator cannot mint an MCP token" sentence (no longer true; that collaborator now gets `schema:read` and the
  `authenticated` scopes, and every `/api/seeds` call still answers `403 forbidden`).
- `IRoleGuard`, `ScopeGrantDecision`, `AllowAllRoleGuard`: unchanged.

`consentHandler` needs no change: it already stores and issues `decision.grantedScopes` and answers `access_denied`
when the list is empty (fact 4).

### Task 4 — Denied scopes on the consent metadata (`apps/api/src/features/oauth/authorize.ts`)

Approach: run the same arbitration at `GET /oauth/authorize/request` so the screen shows what will be refused.
Reason: with partial grants, approving must not silently drop scopes.

Verbatim (added to `AuthorizationRequestMetadata`, `authorize.ts:L32-45`):

```ts
  /** Requested scopes the role guard will refuse for this user; never part of the grant. */
  deniedScopes: OAuthScope[]
```

Rules in `authorizeRequestHandler`, after validation (L131 onward):
- `deniedScopes = (await roleGuard.arbitrate(await resolveEffectivePermissions(context), request.scopes)).deniedScopes`
  (same calls as `consentHandler` L213-214).
- `newScopes = request.scopes` minus the active consent's scopes **minus `deniedScopes`**; `consentRequired` keeps
  `newScopes.length > 0`. Reason: a scope that can never be granted must not force a prompt on every authorization.
  Consequence (accepted): if every requested scope is denied, `consentRequired` is false, the dashboard's silent
  approval runs and the client receives `access_denied` from `consentHandler` — the same outcome as clicking Allow.
- Field order in the JSON: after `newScopes`.

### Task 5 — Widen the seeded clients (`apps/api/migrations/0045_oauth_scopes_v2.sql`)

Approach: one data-only `UPDATE`. Reason: `allowed_scopes` caps what a client may request (fact 4); without it no
client can request a v2 scope. Header comment in the style of `0044_users_ui_prefs.sql:L1-10`: what changes, that it
must ship together with the widened `OAUTH_SCOPES` (fact 2), and that `agent:approve` will be added to `beech-mcp` only
by a later migration (ROADMAP §4.5).

Verbatim SQL:

```sql
UPDATE oauth_clients
SET allowed_scopes = 'schema:read schema:write content:read content:write content:delete media:read media:write automations:read automations:write users:read users:write settings:read settings:write analytics:read'
WHERE client_id IN ('beech-mcp', 'beech-mcp-cli');
```

Existing consents and tokens are not touched: 1.x grants stay exactly as they were. No `wrangler.jsonc` change (fact 3).

### Task 6 — Remove the dead kanban branch (`apps/api/src/middleware/permission.middleware.ts:L159`)

`kanban-(move|position)` → `kanban-move` in the pattern; nothing else. The existing completeness test
(`permission.middleware.test.ts:L14-21`) and the operations parity suite keep covering the row.

### Task 7 — Consent templates (`apps/dashboard/src/features/oauth-consent/lib/consent-templates.ts`)

Approach: a slice-local constant plus two pure helpers the screen calls. Reason: only the consent screen uses them
(VETO 1b); pure functions keep the component thin and testable without rendering.

Verbatim building blocks (BUSL header):

```ts
import type { OAuthScope } from '@beechcms/core'

export type ConsentTemplateId = 'read' | 'editor' | 'admin' | 'developer'

export interface ConsentTemplate {
  readonly id: ConsentTemplateId
  /** Ceiling of scopes this template delegates; always intersected with the client's request. */
  readonly scopes: readonly OAuthScope[]
}

/** Cumulative, smallest first: each template contains the previous one. */
export const CONSENT_TEMPLATES: readonly ConsentTemplate[]

/** Scopes the consent will grant: `requested ∩ template − denied`, in request order. */
export function templateScopes(
  template: ConsentTemplate,
  requested: readonly OAuthScope[],
  denied: readonly OAuthScope[],
): OAuthScope[]

/** The smallest template whose scopes cover every grantable requested scope; `developer` when none does. */
export function defaultTemplate(
  requested: readonly OAuthScope[],
  denied: readonly OAuthScope[],
): ConsentTemplate
```

Template contents (exact):
- `read`: `schema:read`, `content:read`, `media:read`, `automations:read`, `users:read`, `settings:read`, `analytics:read`.
- `editor`: `read` + `content:write`, `content:delete`, `media:write`.
- `admin`: `editor` + `automations:write`, `users:write`, `settings:write`.
- `developer`: every entry of `OAUTH_SCOPES` (build it from the constant, so a future scope lands here by default).

Rules: templates only narrow, never widen (a template scope the client did not request is never sent). A 1.x request
(`schema:read schema:write`) defaults to `developer` and sends both scopes, so the 1.x consent outcome is unchanged.

### Task 8 — Template picker on the consent screen (`components/consent-screen.tsx`)

Approach: a `RadioGroup` of the four templates above the scope list; the list previews the outcome; the consent body
carries the template's scopes. Reason: the user chooses how much to delegate in one decision, not 14 checkboxes.
Read `_config/design_system.html` `#rules` and `#lookup` before editing; run
`node scripts/check-design-tokens.mjs --format agent <file>` on the file after editing.

Props unchanged (`ConsentScreenProps`). Behaviour:
- State: the selected `ConsentTemplateId`, initialised from `defaultTemplate(metadata.requestedScopes, metadata.deniedScopes)`.
- Picker: `RadioGroup` + `RadioGroupItem` (`@/components/ui/radio-group`), labelled by a visible heading
  `t('oauth.consent.template.legend')` via `aria-labelledby`, one item per template in `CONSENT_TEMPLATES` order with
  `t('oauth.consent.template.<id>.label')` (`text-sm font-medium`) and `.description` (`text-xs text-muted-foreground`),
  in the shape of `appearance-tab.tsx:L49-61` (two columns on `sm`, one below). An item whose `templateScopes(...)` is
  empty is `disabled`.
- Scope rows (L96-132): still one row per requested scope, still a disabled display-only `Checkbox`. State per row:
  - in the selected template and not denied → checked; badge as today ("Required" / "Already granted").
  - denied → unchecked; `Badge variant="outline"` with `t('oauth.consent.scope.denied.badge')`; description stays.
  - requested but outside the selected template → unchecked, no badge.
  Badges stay `outline`/`secondary` (no status, signal or category colour: this is not a status).
- `buildConsentBody(params, approved)` gains the scope list to send: on Allow, `scope = formatScopes(templateScopes(...))`
  (space-joined, `formatScopes` from `@beechcms/core`); on Deny, the URL `scope` as today. Every other field unchanged.
- Allow (`Button` default variant, still the only filled button) is disabled when the selected template yields no
  scope or a submit is pending. Deny stays `outline`.
- `ConsentPage`'s silent approval (L30-44) is unchanged: it fires only when nothing new is grantable (Task 4).

Locale keys (all five locales; `en` and `it` written with care, `de/fr/es` translated, glossary terms respected):
- `oauth.consent.scopes.<scope>` for the 12 new scopes, one sentence each saying what the agent may do,
  e.g. `content:delete` → "Move entries to the trash or delete them permanently, when you confirm".
- `oauth.consent.template.legend` ("Access level").
- `oauth.consent.template.{read,editor,admin,developer}.label` / `.description` (4 × 2).
- `oauth.consent.scope.denied.badge` ("Not available for your role").
- Update `oauth.consent.disclaimer`: drop "required for the MCP integration"; say the agent never exceeds the user's
  own role and that access can be revoked in Settings > Connected apps.

### Task 9 — Docs that would become false

- `docs/reference/mcp-server.md` § "Permission Model & Known Limitations" (L352-366): replace `OAUTH_SCOPE_ROUTES` with
  the catalog rule (uncatalogued/excluded → 403; scope from the operation), state the per-scope guard
  (`SCOPE_GRANT_REQUIREMENTS`; RBAC still decides), the interim `403 confirmation_required` for publish/destructive,
  and keep the five-row table as "the routes the 1.x tools use". Add `confirmation_required` to the failure matrix
  (L370+) with remediation "perform it from the dashboard".
- `docs/reference/rbac-api.md:L34`: `/api/rbac/*` is OAuth-reachable with `users:read`/`users:write`; RBAC administration
  rights still apply; role/assignment/deactivation calls are `destructive` and refused with `confirmation_required`.
- Do not edit `docs/api/**` (generated in CI) or `docs/Sprints/**`.

### Task 10 — Tests (behaviour lists; bodies follow `_config/testing_conventions.md`)

**`packages/core/src/oauth/scopes.test.ts`** — unit, MIT header, fixture: literals.
- `it('lists the 14 v2 scopes with the 1.x pair first')` — exact array; comment: 1.x tokens are stored as
  `'schema:read schema:write'` and must keep parsing (fact 2).
- `it('parses a v2 scope string')` — `'content:read media:write'` → both.
- `it('returns null for a scope outside the vocabulary')` — matrix `'agent:read'`, `'content:*'`, `'Content:read'`;
  comment: unknown scopes are `invalid_scope`, never silently dropped.
- Existing tests unchanged.

**`packages/core/src/oauth/role-guard.test.ts`** — unit, MIT header, fixture: hand-built `EffectivePermissions`
(as the file does today). Replace the four `PermissionRoleGuard` cases:
- `it('grants every requested scope to a holder of every permission at the global scope')`.
- `it('grants only the authenticated scopes to an account with no permission')` — request all 14; granted =
  the 7 `'authenticated'` scopes, denied = the other 7, both in request order.
- `it('grants schema:write only to a holder of manage_seeds')` — matrix: `manage_seeds@*` → granted; `manage_users@*`
  → denied; regression comment: schema writes were the only 1.x delegation and must stay gated.
- `it('counts a seed-scoped permission towards the scope')` — `content:read@posts` → `media:read` and
  `automations:read` granted; `content:delete` denied.
- `it('never grants a scope that was not requested')` — request `['content:read']` with full authority → exactly that.
- `AllowAllRoleGuard` test unchanged.

**`packages/core/src/operations/catalog.test.ts`** — unit, MIT header. Replace the `OPERATION_SCOPES` references
(L6, L52-66): `it('keeps every 1.x OAuth scope in the v2 vocabulary')` is deleted (now trivially true);
`it('uses every OAuth scope on at least one agent operation')` iterates `OAUTH_SCOPES`.

**`apps/api/src/middleware/oauth-scope.middleware.test.ts`** — unit (stub Hono app, `buildApp`, L11-20), BUSL.
Keep the existing cases (they pin 1.x behaviour). `buildApp` gains a second variant whose terminal handler returns
`c.req.json()` for one route, to prove the body is still readable. Add:
- `it('allows a v2 scope on its catalogued operation')` — matrix: `content:read` `GET /api/content/posts`;
  `media:read` `GET /api/upload/download-url/a.png`; `users:read` `GET /api/rbac/users` → 200.
- `it('refuses a write with a read-only content grant and names the missing scope')` — `content:read` on
  `POST /api/content/posts` (draft body) → 403 `insufficient_scope`, challenge `scope="content:write"`.
- `it('refuses an excluded operation whatever the grant')` — all 14 scopes on `PUT /api/settings/password`,
  `POST /api/content/posts/e1/rotate-field`, `POST /api/rbac/users` → 403 `insufficient_scope`, challenge without `scope=`.
- `it('refuses a destructive operation with confirmation_required')` — `schema:write` on `DELETE /api/seeds/articles`;
  `content:delete` on `POST /api/content/posts/trash/bulk-purge` → 403, `error: 'confirmation_required'`, no
  `WWW-Authenticate`; comment: interim until the intent gate, so nothing risky runs unconfirmed.
- `it('refuses a static publish operation with confirmation_required')` — `settings:write` `PUT /api/settings`.
- `it('applies the request-dependent risk of content.create and content.update')` — matrix: body
  `{status:'published'}` → 403 `confirmation_required`; `{status:'draft'}` → 200; for both POST create and PUT update.
- `it('applies the purge rule of content.delete')` — `?purge=true` → 403 `confirmation_required`; no query → 200.
- `it('keeps the JSON body readable by the handler after reading it for risk')` — draft body on create reaches the
  echo handler intact; regression comment: a consumed stream would turn every agent create into a 400 (fact 6).
- `it('treats a malformed JSON body as a plain write')` — `content:write`, body `'{'`, JSON content type → 200 from the
  stub (the real handler answers 400); comment: the gate must never 500.
- `describe('resolveRequiredScope')`: existing matrix kept; add `it('returns null for an excluded operation')` —
  `PUT /api/settings/password`; and update `it('returns null for unlisted routes')` to paths that are truly
  uncatalogued (`GET /api/nope`, `PUT /api/schema`) — `GET /api/seeds/articles/orphans` is now `schema:read`.

**`apps/api/src/factory.operations-parity.test.ts`** — unit, BUSL. Changes:
- `it('keeps the scope of the five 1.x OAuth routes')` (L66-82): compare `resolveRequiredScope` against the literal
  expected scopes of the five routes (the matrix in `oauth-scope.middleware.test.ts:L33-38`), no longer against itself.
- `it('derives SCOPE_GRANT_REQUIREMENTS from the RBAC rule of every agent operation')` — for each `agent` operation,
  take `resolveRouteRule(method, concretePath).requirement`; fold per scope: any `authenticated` → `'authenticated'`;
  else the sorted union of `permission` / `permissions`. Expect the fold to equal `SCOPE_GRANT_REQUIREMENTS` with
  arrays compared sorted. Comment: a route whose RBAC rule changes must move the consent guard with it.
- `it('agrees with Hono on every ghost collision, or both operations share scope, exposure and risk')` — probes: each
  operation path with each param replaced by `x`, plus by every literal segment that occurs at that position anywhere in
  the catalog (sprint 03 review method). For each probe, Hono's route = first item of
  `app.router.match(method, path)[0]` whose stored `RouterRoute.method` equals `method` (fact 8); the catalog's =
  `matchOperation(method, path)`. Collect probes where both exist and the paths differ; expect every such pair to have
  equal `exposure`, equal `scope` and the same `risk` (strict equality, so a rule function must be the same function).
  Comment: the gate classifies with the catalog matcher while Hono dispatches by registration order (fact 9).
- Reuse the file's `toConcretePath` / app construction; no new helper file.

**`apps/api/src/features/oauth/authorize.test.ts`** — unit, BUSL, existing app construction with a `roleGuard` override
(pattern L177-185). Add under `GET /oauth/authorize/request`:
- `it('lists the scopes the role guard refuses in deniedScopes')` — partial guard denying `schema:write` →
  `deniedScopes: ['schema:write']`.
- `it('leaves denied scopes out of newScopes so they never force a prompt')` — active consent covers `schema:read`, guard
  denies `schema:write` → `newScopes: []`, `consentRequired: false`.

**`apps/api/test/flow/flow-oauth-resource-server.test.ts`** — integration (real D1 via `D1TestDatabase`, real
migrations, real middleware), BUSL. Reuse `requestConsent` / `exchangeCode` / `issueToken` / `createTargetSeed`
(L26-83); add a local `login(email)` helper inside the `describe` if a second user logs in. Fixture source: `TEST_USERS`;
the seed-scoped user is built as in `flow-rbac-enforcement.test.ts:L27-42` on the `articles` seed created by
`createTargetSeed`.
- `it('seeded clients allow every v2 scope after the migrations')` — `SELECT client_id, allowed_scopes FROM
  oauth_clients` → both rows equal the `0045` string.
- `it('a content:read token reads content and is refused content writes')` — after `createTargetSeed`,
  `GET /api/content/articles` → 200; `POST /api/content/articles` → 403 `insufficient_scope` naming `content:write`;
  `GET /api/content/articles` afterwards still returns zero entries (nothing written).
- `it('a token wider than the owner's role is still limited by RBAC')` — seed-scoped user (`content:read` on `articles`)
  consents to all 14 scopes; token `scope` equals the 7 `authenticated` scopes + `media:read` + `automations:read`;
  `GET /api/seeds` with it → 403 `forbidden` (RBAC), not `insufficient_scope`; `PUT /api/settings` → 403
  (`confirmation_required` fires before RBAC; assert that code and that settings are unchanged via admin JWT).
- `it('a destructive call with the right scope is refused until confirmed')` — admin, `schema:write` token,
  `DELETE /api/seeds/articles` → 403 `confirmation_required`; admin JWT `GET /api/seeds/articles` → 200 (seed intact).
- `it('an excluded operation is refused for a maximal token')` — all 14 scopes, `PUT /api/settings/password` → 403
  `insufficient_scope`; admin can still log in with the old password.
- Update `it('default deny: even the maximal token is refused on unlisted API routes')` (L181-190): rename to
  `it('a 1.x schema token is refused outside the schema operations')`; assert the 403 body names `content:read`
  for `/api/content/articles` and `settings:read` for `/api/settings`. Every other existing case stays as is
  (they are the "1.x tokens keep working" acceptance).

**`apps/dashboard/src/features/oauth-consent/lib/consent-templates.test.ts`** — unit, BUSL, fixture: literals.
- `it('builds cumulative templates, smallest first, ending with every OAuth scope')` — each template ⊂ the next;
  `developer` equals `OAUTH_SCOPES`.
- `it('narrows the request to the template and drops denied scopes, in request order')`.
- `it('never adds a scope the client did not request')` — request `['content:read']`, template `admin` → `['content:read']`.
- `it('defaults to the smallest template covering the grantable request')` — matrix: `['content:read']` → `read`;
  `['content:read','content:write']` → `editor`; `['schema:read','schema:write']` → `developer`;
  `['users:write','schema:write']` with `schema:write` denied → `admin`.

**`apps/dashboard/src/features/oauth-consent/components/consent-screen.test.tsx`** — unit, BUSL, existing mocks
(L1-54); the metadata fixture gains `deniedScopes: []`. Keep the four existing cases. Add:
- `it('preselects the smallest template that covers the request')` — `content:read content:write` request → "Editor"
  checked.
- `it('posts only the selected template scopes on Allow')` — request all 14, pick "Read" → posted `scope` is the 7 read
  scopes space-joined.
- `it('posts the original scope string on Deny')`.
- `it('marks a denied scope as not available and never posts it')` — `deniedScopes: ['schema:write']`, Developer
  selected → badge visible; posted `scope` lacks `schema:write`.
- `it('disables templates and Allow when nothing would be granted')` — request `['schema:write']`, denied → every
  template disabled, Allow disabled.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

```bash
pnpm --filter @beechcms/core build          # api and dashboard tests resolve core through dist (fact 14)
pnpm --filter @beechcms/core type-check
pnpm --filter @beechcms/core test
pnpm --filter @beechcms/api type-check
pnpm --filter @beechcms/api test:unit
pnpm --filter @beechcms/api test:flow       # flow-oauth-* run against D1TestDatabase with 0045 applied
pnpm --filter @beechcms/dashboard type-check
pnpm --filter @beechcms/dashboard test:unit
node scripts/check-design-tokens.mjs --format agent apps/dashboard/src/features/oauth-consent/components/consent-screen.tsx
pnpm beech db:migrate                       # 0045 applies cleanly on the local D1
pnpm beech lint
pnpm beech test --diff
graphify update .
```

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `OAUTH_SCOPES` is the 14-scope list of Task 1 and is the only scope vocabulary; `OPERATION_SCOPES` and
      `OperationScope` no longer exist anywhere (`grep -rn OPERATION_SCOPES packages apps` is empty).
- [ ] `OAUTH_SCOPE_ROUTES` is gone; `oauthScopeMiddleware` follows Task 2 rules 1-6 exactly; JWT requests pass first.
- [ ] A `content:read` token reads content and gets `403 insufficient_scope` (`scope="content:write"`) on writes.
- [ ] A token wider than its owner's RBAC is refused by `permissionMiddleware` (`403 forbidden`), proven in the flow suite.
- [ ] 1.x `schema:read` / `schema:write` tokens behave exactly as before on the five 1.x routes (existing unit and
      flow cases green, unmodified except the renamed default-deny case).
- [ ] Every publish/destructive request made with an OAuth token answers `403 confirmation_required` and changes
      nothing; read/write requests are unaffected; JSON bodies stay readable downstream.
- [ ] Uncatalogued and `excluded` operations answer `403 insufficient_scope` without a `scope=` challenge.
- [ ] `SCOPE_GRANT_REQUIREMENTS` equals the parity-test derivation; `PermissionRoleGuard` grants per scope, partitions
      the request, never adds a scope.
- [ ] `GET /oauth/authorize/request` returns `deniedScopes`; denied scopes are not in `newScopes`.
- [ ] `0045_oauth_scopes_v2.sql` is data-only, applies cleanly, and only `beech-mcp` / `beech-mcp-cli` change.
- [ ] `PROTECTED_ROUTES` matches `kanban-move` only.
- [ ] The ghost-collision guard test exists and passes on today's catalog.
- [ ] Consent screen: template picker per Task 8, one filled button, no raw colour/off-scale size; the design-token
      check reports nothing; all new keys exist in the five locales (`locales.test.ts` green).
- [ ] `docs/reference/mcp-server.md` and `rbac-api.md` no longer mention `OAUTH_SCOPE_ROUTES` or the all-or-nothing guard.
- [ ] No `any` in new or edited code and tests; TSDoc on every new or changed export; headers per fact 13.
- [ ] `packages/mcp`, `packages/cli`, `packages/api-client`, `factory.ts`, `routes.ts` and every handler outside
      `features/oauth/authorize.ts` are unchanged.
- [ ] All Section 5 commands exit 0.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

- `agent:read` / `agent:approve` scopes, `agent_intents` (`0046`), `agentIntentGate`, the dev/prod policy, the `202`
  intent response and the removal of `confirmation_required` → **ROADMAP sprint 05 (AgentIntents)**.
- Changing the default `BEECH_OAUTH_SCOPE` of `@beechcms/api-client`, `packages/cli/src/lib/control-plane.ts:L91`
  or `@beechcms/mcp`; a separate CLI client for `beech run` → **sprints 06-08**.
- `beech_whoami` / `beech_search` and the permission-filtered catalog view → **sprint 08 (Mcp2)**.
- Rewriting the MCP guides (`docs/start/mcp.md`, `docs/reference/mcp-server.md` beyond Task 9, `packages/mcp/README.md`)
  → **sprint 09 (DocsEvals)**.
- Showing granted scopes in "Connected apps" with template names; editing a consent after it is given.
- Server-side storage of the original authorization request to forbid widening at consent (VETO 1d).
- Any change to token, refresh, revoke or consent-listing handlers, to RBAC rules other than L159, to the catalog
  rows, or to `factory.ts` middleware order.
- `customOperations` for `/api/custom/*` (ROADMAP §3.11) and public API exposure (ROADMAP §7 decision 8).
