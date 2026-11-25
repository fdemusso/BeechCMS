# Sprint Plan — OperationCatalog (`@beechcms/mcp` 2.0 Agent Control Plane, sprint 03)

Roadmap: `stages/01_sprint_planning/output/backlog/ROADMAP.md`, §6 row 03 (deliverables), §3 (inventory),
§4.4 (catalog contract), §4.6 (scope vocabulary and human-only exceptions).
Feature brief: `stages/00_ideation/output/feature_brief.md` is empty on purpose; the ROADMAP is the source.
Previous sprints shipped: none for this feature. `docs/Sprints/mcp-server/01-*` and `02-*` are the 1.x MCP
sprints (tools + docs bundle); they left the OAuth allowlist at 5 routes and the scope vocabulary at
`schema:read`/`schema:write`, which is the state this sprint starts from.

---

### Pre-Computation Analysis

Graph rebuilt first with `graphify update . --force` → 19703 nodes, 46645 edges, 1057 communities.
Route inventory taken from the running factory (`createBeechApp({ seeds: TEST_SEEDS }).routes`, deduped on
`method + path`, `ALL` handlers and `/admin*` dropped): **142 routes — 62 GET · 38 POST · 15 PUT · 10 PATCH ·
17 DELETE**, which matches ROADMAP §3 exactly.

**a) God nodes on the path (via `graphify explain`)**

| Node | Source | Degree | Role here |
|------|--------|--------|-----------|
| `createBeechApp()` | `apps/api/src/factory.ts:L105` | 174 | Mounts every route. Its `.routes` is the parity test's ground truth. **Not edited.** |
| `scopes.ts` (`OAUTH_SCOPES`, `OAuthScope`) | `packages/core/src/oauth/scopes.ts:L15-17` | 15 | 1.x scope vocabulary, referenced by every OAuth repository, `role-guard.ts`, consent and token records. **Not edited** (see VETO, rule 1). |
| `oauthScopeMiddleware()` | `apps/api/src/middleware/oauth-scope.middleware.ts:L96` | 9 | Today's 5-route OAuth allowlist (`OAUTH_SCOPE_ROUTES`, L41). Sprint 04 swaps it onto the catalog. **Not edited**; its `resolveRequiredScope()` (L56) is read by the parity test. |
| `resolveRouteRule()` | `apps/api/src/middleware/permission.middleware.ts:L203` | 3 | RBAC lookup over `PROTECTED_ROUTES` (L68). **Not edited**; read by the parity test to prove every `agent` operation sits behind the RBAC gate. |
| `factory.docs-parity.test.ts` | `apps/api/src/factory.docs-parity.test.ts:L1` | 7 | Existing `app.routes` parity suite. The new parity test copies its app construction (L32-35). |

**b) Architectural boundaries affected**

- `@beechcms/core` (new module, metadata only, no zod, no I/O):
  - `packages/core/src/operations/types.ts` — scope vocabulary v2 + operation types.
  - `packages/core/src/operations/catalog.ts` — `OPERATION_CATALOG`, the 142 entries.
  - `packages/core/src/operations/match.ts` — `matchOperation()`, `resolveOperationRisk()`.
  - `packages/core/src/index.ts` — three star-exports after the `oauth/*` block (L41-47).
- `apps/api`: **one new test file only** (`src/factory.operations-parity.test.ts`). No middleware, router,
  handler or migration change. The catalog is not consulted at runtime in this sprint.
- `apps/dashboard`: **no edit**.

**c) `graphify affected` impact analysis**

```
graphify affected "packages_core_src_oauth_scopes_oauthscope" --depth 2
- NewAuthorizationCode, OAuthClientRecord, ConsentRecord, ScopeGrantDecision,
  AuthorizedClientSummary, NewOAuthToken [references]      packages/core/src/oauth/*.repository.ts, role-guard.ts
- authorization-code / client / consent / token repositories, role-guard(.test) [imports]
- .grant() / .arbitrate() [references]                     consent.repository.ts:L25, role-guard.ts:L29-64
  → widening OAUTH_SCOPES changes what consent, token issuance and the role guard accept: that is sprint 04.

graphify affected "oauthScopeMiddleware()" --depth 2
- createBeechApp() [calls] factory.ts:L230; oauth-scope.middleware.test.ts; factory.csp / custom-routes /
  repository.middleware tests and several integration suites [calls via buildApp/adminFor]
  → untouched here; any edit would ripple into every app-building suite.

graphify affected "resolveRouteRule()" --depth 2
- permissionMiddleware() [calls] permission.middleware.ts:L286; permission.middleware.test.ts [imports];
  createBeechApp() [calls] factory.ts:L234
  → read-only use from the new test; no ripple.

graphify path "scopes.ts" "createBeechApp()"
- No directed path: core never reaches apps/api (dependency direction holds).
```

Breaking-change result: **none**. The sprint adds exports to `@beechcms/core` and one test file in
`apps/api`. No existing symbol changes shape. The only way this sprint turns CI red is the intended one:
the new parity test fails when a route and the catalog disagree.

**Facts established during research (the executor does not need to re-check these):**

1. `app.routes` contains duplicates and `ALL` entries (`ALL /*`, `ALL /api/*`, `ALL /oauth/authorize/request`,
   `ALL /oauth/authorize/consent`, `ALL /oauth/consents`, `ALL /oauth/consents/:clientId`,
   `ALL /api/v1/public/*`, `ALL /api/search/*`) plus `GET /admin` and `GET /admin/*`. After dropping those and
   deduping on `method path`, exactly the 142 rows of Task 3 remain.
2. Paths in `app.routes` are Hono patterns, e.g. `/api/content/:slug/:id`, `/api/media/:key{.+}`,
   `/api/content/:schema_slug/by-slug/:entry_slug`. The catalog stores the **same literal string**, so parity
   is a plain set comparison.
3. `/api/custom/*` routes mount only when `config.customRoutes` is passed (`factory.ts:L256-267`). The parity
   app is built without them; `matchOperation` returns `null` for them (fail-closed, ROADMAP §3.11).
4. Mount order: `publicAuthRoutes` (`factory.ts:L222`), `/api/v1/public` (L248), `/api/webhooks` (L251),
   `/api/media/:key{.+}` (L253), custom (L265-266), `apiProtected` at `/api` (L269), `/admin` (L272-273).
   Only `apiProtected` accepts OAuth tokens.
5. `POST /api/content/:slug` and `PUT /api/content/:slug/:id` read `status` through `cleanStr`
   (`apps/api/src/shared/utils/query-utils.ts:L53`: non-empty **trimmed** string), so `" published "` publishes
   (`handlers/create.ts:L47`, `handlers/update.ts:L69`). Valid values: `draft`, `review`, `published`
   (`packages/core/src/engine/validation/index.ts:L485`).
6. `DELETE /api/content/:slug/:id` purges only when `query.purge === 'true'` exactly
   (`handlers/delete.ts:L38`); anything else trashes.
7. `PATCH /api/content/:slug/bulk` writes seed branches by alias only and refuses unknown aliases
   (`handlers/bulk.handler.ts:L78-86`); `status` is a system column, not a branch, so bulk can never publish.
8. `PATCH /:slug/:id/kanban-move` moves along a branch axis (`axisBranchId`), never the system `status`.
9. `POST /api/content/:slug/import` creates rows with the file's `status` column (`jobs/import-chunk.worker.ts:L174-208`,
   `packages/core/src/transfer/row-mapping.ts:L99`). The request body (`{ objectKey, format }`) cannot reveal it.
10. Core resolves through `dist` in `apps/api` tests (Turbo `test` depends on `^build`): build core before
    running the api suite.
11. Core files carry the MIT header (`packages/core/src/oauth/scopes.test.ts:L1-2`), not the BUSL one;
    `apps/api` files carry BUSL (`factory.docs-parity.test.ts:L1-3`).
12. Reference docs that exist today: `auth-endpoints.md`, `public-api.md`, `internal-content.md`,
    `media-engine.md`, `widget-api.md`, `automations-api.md`, `seed-builder.md`, `dashboard-layout.md`,
    `rbac-api.md`, `mcp-server.md` (all under `docs/reference/`).

---

### VETO Audit

Evaluated against `_config/ponytail_arch.md`.

| Rule | Verdict | Evidence |
|------|---------|----------|
| 1. YAGNI | PASS (adjusted) | Metadata only: 3 source files, 3 test files. No runtime consumer yet, by design (ROADMAP §6: 04, 05, 06 and 08 all read it). Adjustments made here: **(a)** the v2 vocabulary is a separate `OPERATION_SCOPES` constant, not a widening of `OAUTH_SCOPES` — widening would change consent/token behaviour (see `affected` above) a sprint early; sprint 04 merges them. **(b)** `agent:read` / `agent:approve` are **not** added: no route uses them until sprint 05; a test forbids unused scopes. **(c)** the ROADMAP's "bulk becomes publish above a configurable threshold" is dropped from the catalog: bulk cannot change `status` (fact 7), so the threshold is a gate policy for sprint 05, not route metadata. **(d)** no `getOperation(id)`, no params capture, no per-domain files. |
| 2. Botanical invariant | PASS | No D1 access, no content data, no Branch IDs touched. The catalog lives in `@beechcms/core`, the single source of truth that sprints 04-08 read. `core` imports nothing from `apps/*` (`graphify path` above). |
| 3. VSA | PASS | No feature slice is edited. The catalog is shared knowledge, so it goes to core (rule 3). The only `apps/api` file is a factory-level test beside `factory.docs-parity.test.ts`, importing `factory.ts` and two `middleware/*` exports — no `features/*` import. |
| 4. Cloudflare purity | PASS | Pure, deterministic module data. The compiled matcher is a lazily built module-level array derived only from the constant (isolate-safe, no mutable request state). No migration. |
| 5. Minimal blueprint | PASS | core → (test-only) api. Dashboard untouched. |

**Deliberate divergences from ROADMAP §3, recorded in the ROADMAP note under §3:**
- `GET /auth/features`, the 9 `/api/v1/public/*` routes and `GET /api/media/:key{.+}` are `excluded`.
  Invariant chosen: **`exposure: 'agent'` ⇔ the route lives under `apiProtected`** (the only OAuth-gated
  mount). The ROADMAP had marked them R, but none of them can be reached with an OAuth token today, and the
  public API is deferred (ROADMAP §7 decision 8). This keeps the sprint 04 lookup rule simple:
  catalog miss or `excluded` → 403.
- `content.import` is statically `publish` (fact 9); `content.bulkUpdate` is statically `write` (fact 7).

---

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Every later sprint of the 2.0 roadmap asks the same question of a request: *which operation is this, what
scope does it need, how risky is it, may an agent call it at all?* Today that knowledge is split between a
5-row OAuth allowlist (`oauth-scope.middleware.ts:L41`) and the RBAC table (`permission.middleware.ts:L68`),
and neither knows about risk or agent exposure. Sprint 04 (scope middleware), 05 (intent gate), 06 (SDK
parity) and 08 (`beech_search`) each need one answer, from one place, that cannot drift from the router.

So the catalog lands first and alone: a pure data module in `@beechcms/core` plus a parity test that fails
CI when the router and the catalog disagree in either direction. Landing it before any consumer means the
classification of all 142 routes is reviewed once, as data, without being entangled with middleware changes.

- **Botanical Engine:** untouched. The catalog describes HTTP operations, not content storage; no query,
  no DDL, no Branch ID. It lives in core because core is the shared source of truth that `apps/api` (04, 05),
  `packages/cli` (06) and `packages/mcp` (08) all depend on, and core may not import from `apps/*`.
- **VSA:** no slice changes. Cross-cutting knowledge goes to core instead of being copied into slices.
- **Fail-closed preserved:** nothing reads the catalog at runtime yet, so OAuth behaviour is byte-identical
  to today. The parity test brings the same fail-closed discipline to the catalog itself: an uncatalogued
  route breaks the build.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Middleware order on `apiProtected`** (`apps/api/src/factory.ts`):
1. `authMiddleware({ acceptOAuth: true })` — L227; sets `jwtPayload` and `oauthGrant`
   (`Variables.oauthGrant: OAuthGrantContext | null`, `apps/api/src/types.ts:L156,L178`;
   `OAuthGrantContext = { clientId, userId, scope: OAuthScope[] }`).
2. `oauthScopeMiddleware()` — L230; JWT passes, OAuth must hit `OAUTH_SCOPE_ROUTES` (5 rows) and hold the scope.
3. `permissionMiddleware()` — L234; active account → `resolveRouteRule` (fail-closed) → RBAC at the route scope.
4. `protectedRoutes` — L237; order of feature routers in `apps/api/src/routes.ts:L63-82` (literal `/content`
   sub-apps — notifications, stats, rotate-field, draft, backrefs, transfer, views, trash — before
   `contentCrudApp`, so Hono resolves literals before `:slug`).

**Scope vocabulary today:** `OAUTH_SCOPES = ['schema:read', 'schema:write']` (`packages/core/src/oauth/scopes.ts:L15`),
helpers `isOAuthScope`, `parseScopeString`, `formatScopes`, `isScopeSubset`. Exported via
`packages/core/src/index.ts:L41`.

**OAuth allowlist today** (`oauth-scope.middleware.ts:L41-47`): `GET /api/seeds`, `GET /api/seeds/:slug`,
`GET /api/schema` → `schema:read`; `POST /api/seeds/:slug/mcp-plan` → `schema:read` (dry-run);
`POST /api/seeds/:slug/mcp-apply` → `schema:write`. Patterns tolerate one trailing slash on the list routes.

**Existing parity patterns to copy:**
- Route-table completeness: `permission.middleware.test.ts:L14-21` (filters `app.routes`, replaces `:param`
  with `x`, expects the unmapped list to equal `[]`).
- App construction without D1: `factory.docs-parity.test.ts:L32-35`
  (`createBeechApp({ seeds: [], seedRepository: new InMemorySeedRepository([]) })`).
- Literal table data with helper constructors: `PROTECTED_ROUTES` + `perm()/anyScope()` (`permission.middleware.ts:L49-55,L68`).

**Known dead row (not fixed here):** `PROTECTED_ROUTES` matches `kanban-(move|position)` (L159) but only
`kanban-move` exists. The catalog lists only `kanban-move`.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

Create:
- `packages/core/src/operations/types.ts`
- `packages/core/src/operations/catalog.ts`
- `packages/core/src/operations/match.ts`
- `packages/core/src/operations/catalog.test.ts` (unit)
- `packages/core/src/operations/match.test.ts` (unit)
- `apps/api/src/factory.operations-parity.test.ts` (unit)

Edit:
- `packages/core/src/index.ts` — three `export *` lines.
- `stages/01_sprint_planning/output/backlog/ROADMAP.md` — already updated by this planning run (row 03 →
  `PLANNED`, reclassification note under §3). The executor does not edit it.

Explicitly excluded: no middleware, router, handler, migration, dashboard, CLI or MCP change. Nothing calls
`matchOperation` outside tests in this sprint.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### Task 1 — Types and scope vocabulary v2 (`packages/core/src/operations/types.ts`)

Approach: one file holding the v2 scope list and the operation types; separate from `oauth/scopes.ts` so
OAuth consent/token behaviour cannot change this sprint (VETO 1a). Header: MIT, copy `oauth/scopes.ts:L1-2`.
TSDoc on every export, in the style of `oauth/scopes.ts`.

Verbatim building blocks:

```ts
/**
 * OAuth scope vocabulary v2, as used by the operation catalog. Superset of the 1.x
 * `OAUTH_SCOPES`; sprint 04 makes `OAUTH_SCOPES` this list. Every entry is used by at
 * least one `agent` operation (enforced by catalog.test.ts).
 */
export const OPERATION_SCOPES = [
  'schema:read', 'schema:write',
  'content:read', 'content:write', 'content:delete',
  'media:read', 'media:write',
  'automations:read', 'automations:write',
  'users:read', 'users:write',
  'settings:read', 'settings:write',
  'analytics:read',
] as const

export type OperationScope = (typeof OPERATION_SCOPES)[number]

export type OperationMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/** `publish` = externally visible effect; `destructive` = irreversible or privilege-changing. */
export type OperationRisk = 'read' | 'write' | 'publish' | 'destructive'

/** What a request-dependent risk rule may inspect. `body` is the parsed JSON body, or `undefined`. */
export interface OperationRiskInput {
  query: Readonly<Record<string, string>>
  body: unknown
}

export type OperationRiskRule = OperationRisk | ((input: OperationRiskInput) => OperationRisk)

interface OperationBase {
  /** Stable `domain.camelCaseVerb` id, e.g. `content.bulkUpdate`. Never reused. */
  id: string
  method: OperationMethod
  /** Hono route pattern, byte-identical to `createBeechApp().routes[].path`. */
  path: string
  /** One English sentence, imperative, no trailing period. */
  summary: string
  /** File under `docs/reference/`, e.g. `internal-content.md`. */
  docs?: string
}

export interface AgentOperationSpec extends OperationBase {
  exposure: 'agent'
  scope: OperationScope
  risk: OperationRiskRule
}

export interface ExcludedOperationSpec extends OperationBase {
  exposure: 'excluded'
  /** Why no agent may call this, one sentence. Required: an exclusion without a reason is a finding. */
  excludedReason: string
}

export type OperationSpec = AgentOperationSpec | ExcludedOperationSpec

export type OperationExposure = OperationSpec['exposure']
```

`OperationBase` stays unexported (implementation detail of the union).

### Task 2 — Matcher (`packages/core/src/operations/match.ts`)

Verbatim signatures:

```ts
export function matchOperation(method: string, path: string): OperationSpec | null
export function resolveOperationRisk(operation: AgentOperationSpec, input: OperationRiskInput): OperationRisk
```

`matchOperation` rules:
- `path` is a pathname (callers pass `c.req.path`); no query string handling.
- `method` compared exactly against `OperationMethod` values; anything else (`HEAD`, `OPTIONS`, lowercase)
  returns `null`. Fail-closed: a miss is never upgraded to a guess.
- One trailing slash is ignored (`/api/seeds/` ≡ `/api/seeds`), except for `/`. Reason: the 1.x allowlist
  already tolerates it (`/^\/api\/seeds\/?$/`, `oauth-scope.middleware.ts:L42`), so sprint 04's swap keeps
  behaviour.
- Pattern compilation, per segment of `operation.path`: literal → escaped literal; `:name` → one segment
  (`[^/]+`); `:name{re}` → `(?:re)` (only `/api/media/:key{.+}` uses this, and it spans segments). Anchored
  `^…$`.
- **Precedence is by specificity, not by array order:** candidates are compared segment by segment from the
  left; at the first position where one has a literal and the other a parameter, the literal wins. This is
  what Hono achieves through registration order (`routes.ts:L69-78`) for every real collision; the matcher
  must not depend on the order the executor writes the catalog in.
- Compiled matchers are built lazily on first call into a module-level array, already sorted by specificity;
  pure derivation of a constant, so isolate-safe. Same input → same result. Never throws.

`resolveOperationRisk` rules: a static `risk` is returned as is; a function is called with `input`. Risk
functions never throw for any `body` (including `undefined`, `null`, strings, arrays): a body that is not a
plain object is treated as having no `status`.

### Task 3 — The catalog (`packages/core/src/operations/catalog.ts`)

Verbatim export:

```ts
export const OPERATION_CATALOG: readonly OperationSpec[]
```

Approach: one file, one entry per route, grouped by domain section comments in the order of the table
below, with two small local constructors (`agent(...)`, `excluded(...)`) in the shape of `perm()` /
`anyScope()` (`permission.middleware.ts:L49-55`) so each entry fits one line. A file-level constant per
docs file (e.g. `const DOCS_CONTENT = 'internal-content.md'`). The two request-dependent risk rules are
named local functions (`publishWhenStatusPublished`, `destructiveWhenPurge`), not inline lambdas, so the
tests and sprint 05 read the same names.

`summary` texts are the executor's (one English imperative sentence each). Everything else below is decided
and must be copied exactly. `docs` column: file name under `docs/reference/`; `—` means omit the field.

**Request-dependent risk rules (exact):**
- `publishWhenStatusPublished` (content.create, content.update): `publish` iff `body` is a plain object whose
  `status` is a string that equals `'published'` **after trim** (mirrors `cleanStr`, fact 5); else `write`.
- `destructiveWhenPurge` (content.delete): `destructive` iff `query.purge === 'true'` (exact, fact 6); else `write`.

**Exclusion reasons (use these exact strings, by key):**
- `SESSION` — "Interactive dashboard session or first-admin bootstrap; human only."
- `PASSWORD` — "Password and reset credentials never pass through an agent."
- `INVITE_REDEEM` — "Invitation redemption is the invitee's own action."
- `OAUTH_FLOW` — "OAuth authorization and token endpoints are driven by the host, not by agent code."
- `OAUTH_GRANTS` — "An agent never manages its own OAuth grants."
- `PRE_AUTH` — "Pre-authentication endpoint outside apiProtected; not OAuth-gated."
- `PUBLIC_API` — "Public API authenticates with API keys, not OAuth; deferred (ROADMAP §7 decision 8)."
- `INTERNAL` — "Internal callback or binary serving; not an agent operation."
- `SCHEMA_DIRECT` — "Direct schema writes; agents use seeds.plan and seeds.apply, the single audited path."
- `IDENTITY` — "Changes account identity or sessions; human only (lock-out risk)."
- `SECRET` — "Carries a secret's current and next value through the model."
- `ACCOUNT_PASSWORD` — "Creates an account with a password; agents use invitations."

**The 142 operations.** Columns: id · method · path · scope · risk (`fn:` = rule above) · docs. Excluded rows
show the reason key instead of scope/risk.

*Auth & OAuth — 17, all excluded, docs `auth-endpoints.md` (oauth rows: `mcp-server.md`)*

| id | method | path | exclusion |
|---|---|---|---|
| auth.login | POST | /auth/login | SESSION |
| auth.refresh | POST | /auth/refresh | SESSION |
| auth.logout | POST | /auth/logout | SESSION |
| auth.setupStatus | GET | /auth/setup | SESSION |
| auth.setup | POST | /auth/setup | SESSION |
| auth.features | GET | /auth/features | PRE_AUTH |
| auth.forgotPassword | POST | /auth/forgot-password | PASSWORD |
| auth.resetPassword | POST | /auth/reset-password | PASSWORD |
| auth.invitationGet | GET | /auth/invitations/:token | INVITE_REDEEM |
| auth.invitationAccept | POST | /auth/invitations/accept | INVITE_REDEEM |
| oauth.authorize | GET | /oauth/authorize | OAUTH_FLOW |
| oauth.authorizeRequest | GET | /oauth/authorize/request | OAUTH_FLOW |
| oauth.consent | POST | /oauth/authorize/consent | OAUTH_FLOW |
| oauth.token | POST | /oauth/token | OAUTH_FLOW |
| oauth.revoke | POST | /oauth/revoke | OAUTH_FLOW |
| oauth.consentsList | GET | /oauth/consents | OAUTH_GRANTS |
| oauth.consentRevoke | DELETE | /oauth/consents/:clientId | OAUTH_GRANTS |

*Public & internal — 11, all excluded (public: `public-api.md`; internal: `media-engine.md` for media, `—` for qstash)*

| id | method | path | exclusion |
|---|---|---|---|
| public.health | GET | /api/v1/public/health | PUBLIC_API |
| public.timetrapToken | GET | /api/v1/public/timetrap/token | PUBLIC_API |
| public.searchEmbed | GET | /api/v1/public/search/embed | PUBLIC_API |
| public.searchIndex | GET | /api/v1/public/search/index/:seedSlug/:file | PUBLIC_API |
| public.schema | GET | /api/v1/public/:seed/schema | PUBLIC_API |
| public.list | GET | /api/v1/public/:seed | PUBLIC_API |
| public.create | POST | /api/v1/public/:seed/add | PUBLIC_API |
| public.replace | PUT | /api/v1/public/:seed/edit/:id | PUBLIC_API |
| public.update | PATCH | /api/v1/public/:seed/edit/:id | PUBLIC_API |
| internal.qstashCallback | POST | /api/webhooks/qstash | INTERNAL |
| internal.mediaServe | GET | /api/media/:key{.+} | INTERNAL |

*Settings — 15 (docs `—` except storage rows: `media-engine.md`)*

| id | method | path | scope | risk |
|---|---|---|---|---|
| settings.get | GET | /api/settings | settings:read | read |
| settings.update | PUT | /api/settings | settings:write | publish |
| settings.me | GET | /api/settings/me | settings:read | read |
| settings.profileUpdate | PUT | /api/settings/profile | IDENTITY | — |
| settings.passwordUpdate | PUT | /api/settings/password | PASSWORD | — |
| settings.avatarUpdate | PUT | /api/settings/avatar | settings:write | write |
| settings.sessionsList | GET | /api/settings/sessions | settings:read | read |
| settings.sessionRevoke | DELETE | /api/settings/sessions/:id | IDENTITY | — |
| settings.activity | GET | /api/settings/activity | settings:read | read |
| settings.storage | GET | /api/settings/storage | analytics:read | read |
| settings.storageOrphansDelete | POST | /api/settings/storage/orphans/delete | media:write | destructive |
| settings.notificationPrefsGet | GET | /api/settings/notifications | settings:read | read |
| settings.notificationPrefsUpdate | PUT | /api/settings/notifications | settings:write | write |
| settings.uiPreferencesGet | GET | /api/settings/ui-preferences | settings:read | read |
| settings.uiPreferencesUpdate | PUT | /api/settings/ui-preferences | settings:write | write |

*Schema layout & dashboard layout — 7 (schema: `seed-builder.md`; layout: `dashboard-layout.md`)*

| id | method | path | scope | risk |
|---|---|---|---|---|
| schema.snapshot | GET | /api/schema | schema:read | read |
| schema.layoutUpdate | PUT | /api/schema/:slug/layout | schema:write | write |
| schema.layoutReset | DELETE | /api/schema/:slug/layout | schema:write | write |
| layout.get | GET | /api/dashboard-layout | settings:read | read |
| layout.roles | GET | /api/dashboard-layout/roles | settings:read | read |
| layout.update | PUT | /api/dashboard-layout | settings:write | write |
| layout.reset | DELETE | /api/dashboard-layout | settings:write | destructive |

*Seeds — 16 (docs `seed-builder.md`)*

| id | method | path | scope | risk |
|---|---|---|---|---|
| seeds.list | GET | /api/seeds | schema:read | read |
| seeds.get | GET | /api/seeds/:slug | schema:read | read |
| seeds.create | POST | /api/seeds | SCHEMA_DIRECT | — |
| seeds.update | PUT | /api/seeds/:slug | SCHEMA_DIRECT | — |
| seeds.addBranch | POST | /api/seeds/:slug/branches | SCHEMA_DIRECT | — |
| seeds.plan | POST | /api/seeds/:slug/mcp-plan | schema:read | read |
| seeds.apply | POST | /api/seeds/:slug/mcp-apply | schema:write | write |
| seeds.ftsRebuild | POST | /api/seeds/:slug/fts/rebuild | schema:write | write |
| seeds.orphansList | GET | /api/seeds/:slug/orphans | schema:read | read |
| seeds.purgeStatus | GET | /api/seeds/purges/:id | schema:read | read |
| seeds.delete | DELETE | /api/seeds/:slug | schema:write | destructive |
| seeds.hardDelete | DELETE | /api/seeds/:slug/hard | schema:write | destructive |
| seeds.branchDrop | DELETE | /api/seeds/:slug/branches/:branchId | schema:write | destructive |
| seeds.branchRename | PATCH | /api/seeds/:slug/branches/:branchId/rename | schema:write | destructive |
| seeds.branchRetype | PATCH | /api/seeds/:slug/branches/:branchId/retype | schema:write | destructive |
| seeds.orphanDrop | DELETE | /api/seeds/:slug/orphans/:column | schema:write | destructive |

*Users, roles, assignments, invitations — 15 (docs `rbac-api.md`)*

| id | method | path | scope | risk |
|---|---|---|---|---|
| users.list | GET | /api/rbac/users | users:read | read |
| users.create | POST | /api/rbac/users | ACCOUNT_PASSWORD | — |
| users.get | GET | /api/rbac/users/:userId | users:read | read |
| users.assignments | GET | /api/rbac/users/:userId/assignments | users:read | read |
| users.setActive | PATCH | /api/rbac/users/:userId/active | users:write | destructive |
| roles.list | GET | /api/rbac/roles | users:read | read |
| roles.create | POST | /api/rbac/roles | users:write | write |
| roles.update | PUT | /api/rbac/roles/:roleId | users:write | destructive |
| roles.delete | DELETE | /api/rbac/roles/:roleId | users:write | destructive |
| assignments.create | POST | /api/rbac/assignments | users:write | destructive |
| assignments.delete | DELETE | /api/rbac/assignments/:assignmentId | users:write | destructive |
| invitations.list | GET | /api/rbac/invitations | users:read | read |
| invitations.create | POST | /api/rbac/invitations | users:write | publish |
| invitations.regenerate | POST | /api/rbac/invitations/:invitationId/regenerate | users:write | publish |
| invitations.delete | DELETE | /api/rbac/invitations/:invitationId | users:write | write |

*Content literal prefixes — notifications 5, stats 9 (docs `—`; `stats.mediaLibrary`, `stats.unusedMedia`, `stats.storageSync`: `media-engine.md`)*

| id | method | path | scope | risk |
|---|---|---|---|---|
| notifications.list | GET | /api/content/notifications | content:read | read |
| notifications.markRead | PATCH | /api/content/notifications/:id/read | content:write | write |
| notifications.markUnread | PATCH | /api/content/notifications/:id/unread | content:write | write |
| notifications.delete | DELETE | /api/content/notifications/:id | content:write | write |
| notifications.markAllRead | POST | /api/content/notifications/mark-all-read | content:write | write |
| stats.mediaLibrary | GET | /api/content/stats/media-library | media:read | read |
| stats.unusedMedia | GET | /api/content/stats/unused-media | media:read | read |
| stats.setupChecklist | GET | /api/content/stats/setup-checklist | settings:read | read |
| stats.total | GET | /api/content/stats/total | analytics:read | read |
| stats.recentActivity | GET | /api/content/stats/recent-activity | analytics:read | read |
| stats.health | GET | /api/content/stats/health | analytics:read | read |
| stats.cloudflare | GET | /api/content/stats/cloudflare | analytics:read | read |
| stats.breakdown | GET | /api/content/stats/breakdown | analytics:read | read |
| stats.storageSync | POST | /api/content/stats/storage/sync | settings:write | write |

*Content per seed — 29 (docs `internal-content.md`)*

| id | method | path | scope | risk |
|---|---|---|---|---|
| content.rotateField | POST | /api/content/:slug/:id/rotate-field | SECRET | — |
| drafts.list | GET | /api/content/drafts | content:read | read |
| drafts.save | PUT | /api/content/:slug/:id/draft | content:write | write |
| drafts.get | GET | /api/content/:slug/:id/draft | content:read | read |
| drafts.publish | POST | /api/content/:slug/:id/draft/publish | content:write | publish |
| drafts.discard | DELETE | /api/content/:slug/:id/draft | content:write | write |
| content.backrefs | GET | /api/content/:targetSlug/:targetId/backrefs | content:read | read |
| content.importStatus | GET | /api/content/import-jobs/:id | content:read | read |
| content.export | GET | /api/content/:slug/export | content:read | read |
| content.import | POST | /api/content/:slug/import | content:write | publish |
| views.list | GET | /api/content/:slug/views | content:read | read |
| views.create | POST | /api/content/:slug/views | content:write | write |
| views.reorder | PUT | /api/content/:slug/views/order | content:write | write |
| views.update | PATCH | /api/content/:slug/views/:viewId | content:write | write |
| views.delete | DELETE | /api/content/:slug/views/:viewId | content:write | write |
| trash.list | GET | /api/content/:slug/trash | content:read | read |
| trash.bulkRestore | POST | /api/content/:slug/trash/bulk-restore | content:write | write |
| trash.bulkPurge | POST | /api/content/:slug/trash/bulk-purge | content:delete | destructive |
| trash.reconcile | POST | /api/content/:slug/trash/reconcile | content:delete | destructive |
| trash.restore | POST | /api/content/:slug/:id/restore | content:write | write |
| content.kanbanMove | PATCH | /api/content/:slug/:id/kanban-move | content:write | write |
| content.list | GET | /api/content/:slug | content:read | read |
| content.facets | GET | /api/content/:slug/facets | content:read | read |
| content.get | GET | /api/content/:slug/:id | content:read | read |
| content.getBySlug | GET | /api/content/:schema_slug/by-slug/:entry_slug | content:read | read |
| content.create | POST | /api/content/:slug | content:write | fn: publishWhenStatusPublished |
| content.update | PUT | /api/content/:slug/:id | content:write | fn: publishWhenStatusPublished |
| content.bulkUpdate | PATCH | /api/content/:slug/bulk | content:write | write |
| content.delete | DELETE | /api/content/:slug/:id | content:delete | fn: destructiveWhenPurge |

*Widgets, search, automations, media — 18 (widgets `widget-api.md`; automations `automations-api.md`; media `media-engine.md`; search `—`)*

| id | method | path | scope | risk |
|---|---|---|---|---|
| widgets.aggregate | GET | /api/widget/aggregate/:seed | content:read | read |
| widgets.growth | GET | /api/widget/growth/:seed | content:read | read |
| widgets.leaderboard | GET | /api/widget/leaderboard/:seed | content:read | read |
| widgets.list | GET | /api/widget/list/:seed | content:read | read |
| widgets.timeseries | GET | /api/widget/timeseries/:seed | content:read | read |
| widgets.distribution | GET | /api/widget/distribution/:seed | content:read | read |
| search.query | GET | /api/search | content:read | read |
| automations.list | GET | /api/automations | automations:read | read |
| automations.get | GET | /api/automations/:id | automations:read | read |
| automations.create | POST | /api/automations | automations:write | publish |
| automations.update | PUT | /api/automations/:id | automations:write | publish |
| automations.toggle | PATCH | /api/automations/:id/toggle | automations:write | publish |
| automations.delete | DELETE | /api/automations/:id | automations:write | destructive |
| media.upload | POST | /api/upload | media:write | write |
| media.presign | POST | /api/upload/presign | media:write | write |
| media.confirm | POST | /api/upload/confirm | media:write | write |
| media.downloadUrl | GET | /api/upload/download-url/:key | media:read | read |
| media.delete | DELETE | /api/upload/:key | media:write | destructive |

Totals: 142 operations — **106 `agent`, 36 `excluded`**. Classification notes the executor must not
"fix": `seeds.plan` is a POST with `schema:read` (1.x dry-run contract, `oauth-scope.middleware.ts:L35-37`);
soft `content.delete` needs `content:delete` even though its risk is `write`; `trash.restore` /
`trash.bulkRestore` are `write` because they reverse a trash, restoring the prior status.

### Task 4 — Core exports (`packages/core/src/index.ts`)

Add, directly after `export * from './oauth/consent.repository.js'` (L47):
`export * from './operations/types.js'`, `export * from './operations/catalog.js'`,
`export * from './operations/match.js'`. No sub-barrel (the package has none). The local risk-rule
functions and exclusion-reason constants stay unexported.

### Task 5 — Tests

**`packages/core/src/operations/catalog.test.ts`** — unit tier, fixture source: `OPERATION_CATALOG`,
`OPERATION_SCOPES`, `OAUTH_SCOPES` themselves (no hand-rolled shapes). MIT header. `describe('OPERATION_CATALOG', …)`.
- `it('gives every operation a unique id in domain.camelCaseVerb form')` — ids unique and match `^[a-z]+\.[a-z][a-zA-Z]*$`.
- `it('lists every method and path pair exactly once')` — no duplicate `method path`.
- `it('gives every excluded operation a non-empty reason')`.
- `it('exposes to agents only routes under apiProtected')` — every `agent` path starts with `/api/` and none
  starts with `/api/v1/public`, `/api/webhooks`, `/api/media`, `/api/custom`.
- `it('keeps every 1.x OAuth scope in the v2 vocabulary')` — each `OAUTH_SCOPES` member is in `OPERATION_SCOPES`
  (regression guard: 1.x tokens must keep working after sprint 04).
- `it('uses every v2 scope on at least one agent operation')` — YAGNI guard; comment why (no speculative scopes).
- `it('excludes every human-only operation')` — matrix over `settings.passwordUpdate`, `settings.profileUpdate`,
  `settings.sessionRevoke`, `content.rotateField`, `users.create`, `oauth.consentsList`, `oauth.consentRevoke`
  (ROADMAP §4.6 exceptions).
- `it('classifies every agent GET as a static read')`.
- `it('requires a write-side scope on every mutating agent operation except the seeds.plan dry-run')` — every
  non-GET `agent` op has a scope not ending in `:read`, with the single allowed exception `seeds.plan`
  (comment the 1.x dry-run contract).
- `it('keeps the three request-dependent risk rules on content.create, content.update and content.delete only')`.

**`packages/core/src/operations/match.test.ts`** — unit tier, fixture source: `OPERATION_CATALOG`. MIT header.
`describe('matchOperation', …)`:
- `it('resolves literal /api/content prefixes before the :slug patterns')` — matrix: `GET /api/content/drafts` →
  `drafts.list`; `GET /api/content/stats/total` → `stats.total`; `GET /api/content/import-jobs/j1` →
  `content.importStatus`; `GET /api/content/posts/trash` → `trash.list`; `GET /api/seeds/purges/p1` → `seeds.purgeStatus`.
- `it('resolves DELETE /api/content/notifications/:id to notifications.delete, not content.delete')` — regression
  guard comment: misclassifying it would make sprint 05 gate a notification dismissal as a content delete.
- `it('ignores one trailing slash')` — `GET /api/seeds/` → `seeds.list`.
- `it('matches the multi-segment media key')` — `GET /api/media/a/b/c.png` → `internal.mediaServe`.
- `it('returns null for an uncatalogued path, a custom route and an unsupported method')` — matrix:
  `GET /api/nope`, `GET /api/custom/anything`, `PATCH /api/content/posts/e1`, `HEAD /api/seeds`.
- `it('maps every catalogued operation back to itself from a concrete path')` — replace each `:param` /
  `:param{re}` with `x`; proves no operation is shadowed by precedence.

`describe('resolveOperationRisk', …)`:
- `it('returns publish for content.create when status is published, trimmed like the handler')` — matrix
  `'published'`, `' published '`; comment: handler trims via `cleanStr` (fact 5), a non-trimming rule would let
  a padded status skip the production gate.
- `it('returns write for content.create when status is absent, another value, or the body is not an object')` —
  matrix: `{}`, `{ status: 'draft' }`, `{ status: 'PUBLISHED' }`, `null`, `undefined`, `'published'`, `[]`.
- `it('applies the same status rule to content.update')`.
- `it('returns destructive for content.delete only when purge is exactly true')` — matrix: `purge: 'true'` →
  destructive; `{}`, `purge: '1'`, `purge: 'false'` → write (handler parity, fact 6).
- `it('returns the static risk of an operation without a rule')` — `trash.bulkPurge` → destructive,
  `content.list` → read.

**`apps/api/src/factory.operations-parity.test.ts`** — unit tier (forks pool, no D1), fixture source: the real
factory built as in `factory.docs-parity.test.ts:L32-35`; route filtering as in `permission.middleware.test.ts:L14-21`
(drop `ALL`, `/admin`, `/admin/*`; dedupe on `method path`). BUSL header. File docblock (2-4 lines): this is the
catalog ↔ router fail-closed guard; custom routes are not catalogued by design.
`describe('OPERATION_CATALOG ↔ createBeechApp parity', …)`:
- `it('catalogues every route the factory mounts')` — list of `method path` missing from the catalog equals `[]`.
- `it('mounts every catalogued operation')` — list of catalog entries with no mounted route equals `[]`.
- `it('places every agent operation behind the RBAC route table')` — `resolveRouteRule(method, concretePath)`
  is non-null for every `agent` op (concrete path: params → `x`).
- `it('keeps the scope of the five 1.x OAuth routes')` — matrix over the five paths of
  `oauth-scope.middleware.test.ts:L33-38`: `matchOperation(...).scope` equals `resolveRequiredScope(...)`.
  Comment: sprint 04 replaces the allowlist with this lookup; this proves the swap is behaviour-preserving.
- `it('points every docs reference at an existing file under docs/reference')` — `existsSync` as in
  `factory.docs-parity.test.ts:L12-28`.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

```bash
pnpm --filter @beechcms/core build          # api tests resolve core through dist (fact 10)
pnpm --filter @beechcms/core type-check
pnpm --filter @beechcms/core test
pnpm --filter @beechcms/api type-check
pnpm --filter @beechcms/api test:unit
pnpm beech lint
pnpm beech test --diff
```

No migration, so no `pnpm beech db:migrate`. No dashboard build needed.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `OPERATION_CATALOG` has exactly 142 entries: 106 `agent`, 36 `excluded`, matching Task 3 row by row
      (id, method, path, scope, risk, docs, exclusion reason).
- [ ] `factory.operations-parity.test.ts` passes, and fails when a route is added to any router without a
      catalog entry, or a catalog entry is left for a removed route (check once locally by commenting one
      catalog row out, then restore).
- [ ] Every `excluded` entry has a non-empty `excludedReason`; the type makes it required.
- [ ] `matchOperation` is precedence-by-specificity, never throws, returns `null` on any miss; every operation
      self-matches from a concrete path.
- [ ] `resolveOperationRisk` mirrors the handlers: trimmed `status === 'published'`, exact `purge === 'true'`.
- [ ] `OPERATION_SCOPES` ⊇ `OAUTH_SCOPES`; every v2 scope is used; no `agent:*` scope.
- [ ] `packages/core/src/operations/*` imports nothing outside `packages/core/src` and no new dependency is
      added to any `package.json`; no zod in the operations module.
- [ ] `OAUTH_SCOPES`, `oauth-scope.middleware.ts`, `permission.middleware.ts`, `factory.ts`, `routes.ts` are
      unchanged (`git diff --stat` shows only the 6 new files and `packages/core/src/index.ts`).
- [ ] No `any` in new code or tests; TSDoc on every exported symbol; headers per fact 11.
- [ ] All Section 5 commands exit 0.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

- Wiring the catalog into `oauthScopeMiddleware`, widening `OAUTH_SCOPES`, migrating
  `oauth_clients.allowed_scopes`, consent templates in the dashboard → **ROADMAP sprint 04 (OAuthScopesV2)**.
- Removing the dead `kanban-position` alternative from `PROTECTED_ROUTES` (L159) → sprint 04, which owns the
  scope/permission middleware pass.
- `agent:read` / `agent:approve` scopes, the `agent_intents` table, `agentIntentGate`, any risk *policy*
  (dev/prod table, bulk-size threshold) → **sprint 05 (AgentIntents)**. This sprint only classifies.
- SDK methods and the SDK ↔ catalog parity test → **sprint 06 (ScriptSdk)**.
- `beech_search` / `beech_whoami` and permission-filtered catalog views → **sprint 08 (Mcp2)**.
- Catalog documentation in `docs/reference/mcp-server.md` → **sprint 09 (DocsEvals)**.
- A `customOperations` hook for `/api/custom/*` routes (ROADMAP §3.11, outside 2.0).
- Public API (`/api/v1/public`) exposure to agents (ROADMAP §7 decision 8).
- Converting `z.custom<...>()` body schemas to JSON-Schema-producing ones (ROADMAP §2): not needed, the
  catalog carries no body schemas.
- Any change to handlers, routers, migrations, `apps/dashboard`, `packages/cli`, `packages/mcp`.
