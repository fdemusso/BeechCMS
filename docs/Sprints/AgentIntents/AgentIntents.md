# Sprint Plan — AgentIntents (`@beechcms/mcp` 2.0 Agent Control Plane, sprint 05)

Roadmap: `stages/01_sprint_planning/output/backlog/ROADMAP.md`, §6 rows 05 and 05b, §4.5 (intents, policy, table,
endpoints, server-side replay), §5 (security), and the "Decisioni della pianificazione dello sprint 05" note under §3
(written by this planning run).
Feature brief: `stages/00_ideation/output/feature_brief.md` is empty on purpose; the ROADMAP is the source.
Previous sprints shipped (both review PASS, both still uncommitted in the working tree of `feature/operation-catalog`):
**03 OperationCatalog** (`docs/Sprints/OperationCatalog/`) and **04 OAuthScopesV2** (`docs/Sprints/OAuthScopesV2/`).
This sprint builds on those files as they are on disk.

---

### Pre-Computation Analysis

Graph refreshed with `graphify update .` before mapping.

**a) God nodes on the path**

| Node | Source | Role here |
|------|--------|-----------|
| `createBeechApp()` | `apps/api/src/factory.ts:L105` | Builds `apiProtected` (L225-237): `authMiddleware` L227 → `oauthScopeMiddleware` L230 → `permissionMiddleware` L234 → `protectedRoutes` L237. **Edited**: one registration (`agentIntentGate`) between L234 and L237. Every app-building suite runs through it. |
| `repositoryMiddleware()` | `apps/api/src/middleware/repository.middleware.ts:L115` | Degree 44. Binds every repository. **Edited**: one `context.set` line for the new repository (pattern L190). |
| `authMiddleware()` | `apps/api/src/middleware/auth.middleware.ts:L80` | Also mounted by `consent.router.ts`, `search.ts`, custom routes. **Edited**: replay branch, honoured only when `acceptOAuth` (so only `apiProtected`). |
| `oauthScopeMiddleware()` | `apps/api/src/middleware/oauth-scope.middleware.ts:L76` | **Shrunk**: the interim risk ceiling (L10-11, L47-57, L91-96) leaves; rules 1-3 stay. |
| `permissionMiddleware()` / `PROTECTED_ROUTES` | `apps/api/src/middleware/permission.middleware.ts:L68-200` | Four new rows. Runs **before** the new gate, so an intent is only ever created for a request the user may make. |
| `OPERATION_CATALOG` / `matchOperation()` / `resolveOperationRisk()` | `packages/core/src/operations/{catalog,match}.ts` | Four new rows; the gate is the second runtime consumer. |
| `OAUTH_SCOPES` / `SCOPE_GRANT_REQUIREMENTS` | `packages/core/src/oauth/scopes.ts:L15-18`, `role-guard.ts:L57-72` | Two scopes appended. |

**b) Architectural boundaries affected**

- `@beechcms/core`
  - `oauth/scopes.ts`, `oauth/role-guard.ts` — `agent:read`, `agent:approve`.
  - `operations/catalog.ts` — 4 `intents.*` rows.
  - new `operations/confirmation-policy.ts` — pure dev/prod policy.
  - new `operations/agent-intent.repository.ts` — `IAgentIntentRepository` + record types.
  - `observability/activity-logger.ts` — `EntityType` gains `'intent'`.
  - `index.ts` — two `export *` lines.
- `apps/api`
  - `migrations/0046_agent_intents.sql` — table + index + `allowed_scopes`.
  - new `shared/db/repositories/d1-agent-intent.repository.ts`.
  - new `shared/agent-intents/replay.ts` — in-process replay marker + payload hash (shared by two middlewares and one slice).
  - new `middleware/agent-intent-gate.middleware.ts`.
  - `middleware/oauth-scope.middleware.ts`, `middleware/auth.middleware.ts`, `middleware/permission.middleware.ts`,
    `middleware/repository.middleware.ts`, `types.ts`, `factory.ts`, `routes.ts`.
  - new slice `features/agent-intents/`.
- `apps/dashboard` — `features/oauth-consent/lib/consent-templates.ts` (one constant) + 2 locale keys × 5 locales.
  The "pending agent actions" section is **sprint 05b**.
- `docs/reference/mcp-server.md`, `docs/reference/rbac-api.md` — text that would become false.
- `packages/mcp`, `packages/cli`, `packages/api-client`: **no edit**.

**c) `graphify affected` impact analysis**

```
graphify affected "oauthScopeMiddleware()" --depth 2
- createBeechApp() [calls] factory.ts:L230; buildApp() [calls] oauth-scope.middleware.test.ts:L17
- buildApp()/adminFor()/bootWithBrokenTable() in factory.csp, factory.custom-routes, repository.middleware,
  upload-proxy-gate, upload-validation, public-error-redaction tests; mountedRouteKeys() factory.operations-parity.test.ts:L33
- docs: "Permission Model & Known Limitations" mcp-server.md:L354
  → JWT suites unaffected (grant null passes first, in the scope middleware and in the new gate).
    OAuth suites change: oauth-scope.middleware.test.ts (risk cases move out), flow-oauth-resource-server.test.ts.

graphify affected "authMiddleware()" --depth 1
- createBeechApp() factory.ts:L227; consent.router.ts:L8; search.ts:L18; auth.middleware.test.ts; jwt-claims-passthrough.test.ts
- docs "Authorization Layers" rbac-api.md:L18
  → the replay branch is inert unless acceptOAuth is true AND the request env carries the replay marker, which
    only the in-process dispatcher sets. consent/search/custom routes never see it.

graphify affected "permissionMiddleware()" --depth 1
- createBeechApp() factory.ts:L234; docs rbac-api.md:L19, mcp-server.md:L360, roles-permissions.md:L225
  → four AUTHED rows added; no existing row changes.

graphify affected "OPERATION_CATALOG" --depth 1
- catalog.test.ts, match.ts, match.test.ts (+ factory.operations-parity.test.ts through matchOperation)
  → additive rows; parity suite proves route ↔ row.

graphify explain "repositoryMiddleware()" → degree 44, one more binding, no order change.
```

Breaking-change result: **intended behaviour changes only, all OAuth-side**: (1) a publish/destructive OAuth
request that the user's RBAC allows now answers `202` with a pending intent instead of `403 confirmation_required`;
(2) in `development` a `publish` OAuth request executes immediately; (3) an OAuth request refused by RBAC on a
risky operation now answers `403 forbidden` (RBAC runs before the gate) instead of `confirmation_required`.
JWT behaviour is byte-identical.

**Facts established during research (the executor does not need to re-check these):**

1. `ENV` is `Env.ENV?: string` (`apps/api/src/types.ts:L120`); `wrangler.jsonc` sets `development` (L111) and
   `production` (L151); the factory already treats anything but `'production'` as dev (`factory.ts:L149`). `TEST_ENV`
   (`apps/api/test/fixtures.ts:L19`) has no `ENV`, so flow tests run as development unless they spread `ENV: 'production'`.
2. Hono 4.13.13 `HonoRequest#cachedBody` (`hono/dist/request.js:L81-91`): `json()` is `cachedBody('text').then(JSON.parse)`.
   Reading `c.req.text()` in a middleware caches the text; a later `json()`/`zodJson` reuses it. No handler under
   `apiProtected` reads `c.req.raw`'s body (sprint 04 fact 6).
3. `c.req.raw` is the exact `Request` given to `app.fetch`, and `c.env` is the exact env object given to it. A value
   stored under a module-private `Symbol` key in that env object is unreachable from HTTP.
4. The OAuth branch of `authMiddleware` (`auth.middleware.ts:L94-120`) loads the owner with `userRepository.findById`,
   refuses inactive accounts with `invalidTokenResponse()`, builds `JwtClaims` from the user and sets `oauthGrant`.
5. `IClock.nowSeconds()` exists (`packages/core/src/common/clock.ts:L22`); OAuth and invitation rows store Unix
   **seconds**. `FixedClock` (`@beechcms/testing`) has `advance(deltaMs)`; `createBeechApp({ authProviders: { clock } })`
   feeds that clock to `repositoryMiddleware` (`factory.ts:L131`), so `c.get('clock')` is the fake.
6. Catalog ids must match `/^[a-z]+\.[a-z][a-zA-Z]*$/` (`catalog.test.ts:L17`): the prefix is all lower case, hence
   `intents.*`, not `agentIntents.*`.
7. System-table repository pattern: `D1InvitationRepository` (`shared/db/repositories/d1-invitation.repository.ts`),
   constructor `(db, idGenerator)`, times passed in by the caller, a row type + `rowToRecord`. Its test
   (`d1-invitation.repository.test.ts:L1-30`) uses `D1TestDatabase`, `SequentialIdGenerator`, `seedTestUsers`.
8. `logActivity(context, entry)` (`shared/services/activity-log/log-activity.ts`) takes the actor from `jwtPayload`,
   which the OAuth branch also sets. `activity_logs.action` / `entity_type` are free TEXT (`0000_v040_base.sql:L139-150`);
   the dashboard falls back to the raw value for unknown ones (`settings/lib/activity-presentation.ts`, `defaultValue`).
9. Slice error bodies use `publicProblem(c, { type, title, status, detail })` (`public/errors/problem-details.ts:L124`,
   status union L82 includes 404/409/413); `rbac/guards.ts:L26` wraps it. Middleware error bodies use the OAuth shape
   `{ error, error_description }` (`oauth-scope.middleware.ts:L32-45`).
10. Flow-tier OAuth helpers (`requestConsent`, `exchangeCode`, `issueToken`, `createTargetSeed`) are file-local to
    `test/flow/flow-oauth-resource-server.test.ts:L31-89` and hard-code `CLIENT_ID = 'beech-mcp-cli'`.
11. `validateAuthorizationRequest` refuses a scope outside `client.allowedScopes` with `invalid_scope`
    (`authorization-request.ts:L171-172`). `ALL_SCOPES` in the flow file is `OAUTH_SCOPES.join(' ')`: once
    `agent:approve` exists it is no longer requestable by `beech-mcp-cli`.
12. No handler reads request headers that a replay would need: the only `req.header(...)` reads under `features/` are
    in `webhooks` (outside `apiProtected`). `Idempotency-Key` is public-API only.
13. Headers: core files MIT, everything else BUSL; core tests keep MIT. Core resolves through `dist` in api and
    dashboard tests: build core first.

---

### VETO Audit

Evaluated against `_config/ponytail_arch.md`.

| Rule | Verdict | Evidence |
|------|---------|----------|
| 1. YAGNI | PASS (adjusted) | Every deliverable is on ROADMAP row 05 or required to make it safe. Cut: **(a)** the dashboard section → new row **05b** (API is the security-critical part, reviewed alone; the UI depends on the RPC types of the new routes). **(b)** no in-memory repository: tests use real D1 (testing conventions 0.1). **(c)** no expiry sweep job: expiry is lazy (filtered on read, marked on touch). **(d)** no per-operation rich summaries ("12 entries"): `operation.summary` + method + path. **(e)** request headers are not stored or replayed (fact 12). Kept although not strictly on the row: two consent locale strings and one template constant, because the consent screen must describe every scope a client can request. |
| 2. Botanical invariant | PASS | `agent_intents` is a system table (no Branch, no `br_XX`, no `apiToDb`), accessed only through `IAgentIntentRepository`. The replayed request re-enters the full stack, so content writes still go through the content repository and the engine. |
| 3. VSA | PASS | New slice `features/agent-intents/` imports only core, `shared/*`, `public/errors`, `types`. The replay marker lives in `shared/agent-intents/` because two middlewares and the slice use it. No `features/*` cross-import; the dispatcher reaches other slices only through HTTP-in-process (`app.fetch`). |
| 4. Cloudflare purity | PASS | One numbered migration. No module-level mutable state: the replay marker rides on the per-request env object (fact 3), not a global map. No background job; replay is synchronous inside the approve request. |
| 5. Minimal blueprint | PASS | core (contract, policy, scopes, catalog rows) → api (migration, repo, gate, slice) → dashboard (one constant, locale strings). |

**Deliberate divergences from the ROADMAP text** (recorded in the ROADMAP note under §3): split 05/05b; replay marker
in `env` instead of an internal header; lazy expiry; no in-memory repo; `intents.approve` is `write` (approving does
not itself create an intent); `agent:*` in the Read template.

---

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Sprint 04 widened what an OAuth token may reach but refuses every publish/destructive call with
`403 confirmation_required`, so an agent cannot delete, purge, publish in production, or change roles at all. The
ROADMAP's answer is the intent gate: the server stores the risky request instead of running it, a human approves
it, and the server — never the client — runs exactly what was stored, once. Sprints 06-08 (SDK `IntentPending`,
`beech run` output, `beech_confirm` elicitation) all consume this contract, so it must exist, alone and reviewed,
before them.

Invariants kept: JWT requests untouched; fail-closed (a request the gate cannot classify is refused); RBAC decides
both at creation (the gate runs after `permissionMiddleware`) and at replay (the replay re-enters the whole stack);
an intent is bound to its user, its payload hash and a 10-minute TTL, and runs at most once.

- **Botanical Engine:** untouched; replayed content writes take the normal engine path.
- **VSA:** contract and policy in core; gate and replay marker cross-cutting; endpoints in their own slice.
- **Order:** needs the catalog (03) and the scope gate (04); the dashboard fallback (05b) and MCP confirm (08) need it.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**`apiProtected` middleware order** (`apps/api/src/factory.ts`):
1. `authMiddleware({ acceptOAuth: true })` — L227; sets `jwtPayload` and `oauthGrant`
   (`OAuthGrantContext = { clientId, userId, scope: OAuthScope[] }`, `types.ts:L156-164`).
2. `oauthScopeMiddleware()` — L230; JWT passes; miss/`excluded` → `403 insufficient_scope` (no `scope=`); missing
   scope → `403 insufficient_scope` naming it; **interim**: reads the body when the risk is a rule function
   (L91-92), and `publish`/`destructive` → `403 confirmation_required` (L93-96).
3. `permissionMiddleware()` — L234; active account → `resolveRouteRule` (fail-closed) → RBAC.
4. `protectedRoutes` — L237 (`routes.ts`, one method chain, `/rbac` at L68).

**Catalog** (`packages/core/src/operations/catalog.ts`): 142 rows, 106 `agent`, 36 `excluded`; risk rules
`publishWhenStatusPublished` (L76) and `destructiveWhenPurge` (L83); constructor `agent()` L44, last row L251.

**Scopes**: 14 in `OAUTH_SCOPES` (`scopes.ts:L15-18`); `SCOPE_GRANT_REQUIREMENTS` (`role-guard.ts:L57-72`).
Seeded clients both carry the 14-scope string (`0045_oauth_scopes_v2.sql`). Consent templates
(`apps/dashboard/src/features/oauth-consent/lib/consent-templates.ts:L16-28`), `READ_SCOPES` at L16-18.

**Patterns to copy:**
- System-table repository + its D1 test: fact 7.
- Repository binding: `repository.middleware.ts:L190` (override `?? new D1…(database, resolvedIdGenerator)`),
  override field L85, `Variables` entry `types.ts:L277`.
- Method-chain slice router: `features/notifications/notifications.handler.ts` (`new Hono<…>().get(...)...`),
  barrel `features/notifications/index.ts`.
- AUTHED route rows: `permission.middleware.ts:L76-77`.
- Stub-app middleware unit test: `oauth-scope.middleware.test.ts:L11-24` (`buildApp`, `grant()`).
- Migration header comment: `migrations/0045_oauth_scopes_v2.sql`.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

Create:
- `packages/core/src/operations/confirmation-policy.ts` (+ `confirmation-policy.test.ts`, unit)
- `packages/core/src/operations/agent-intent.repository.ts`
- `apps/api/migrations/0046_agent_intents.sql`
- `apps/api/src/shared/db/repositories/d1-agent-intent.repository.ts` (+ `.test.ts`)
- `apps/api/src/shared/agent-intents/replay.ts` (+ `replay.test.ts`, unit)
- `apps/api/src/middleware/agent-intent-gate.middleware.ts` (+ `.test.ts`, unit)
- `apps/api/src/features/agent-intents/index.ts`, `agent-intents.handler.ts`, `agent-intents.view.ts`
- `apps/api/test/helpers/oauth-flow.ts` (flow-tier helpers moved out of `flow-oauth-resource-server.test.ts`)
- `apps/api/test/flow/flow-agent-intents.test.ts`

Edit (source):
- `packages/core/src/oauth/scopes.ts`, `packages/core/src/oauth/role-guard.ts`
- `packages/core/src/operations/catalog.ts`
- `packages/core/src/observability/activity-logger.ts` (`EntityType`)
- `packages/core/src/index.ts`
- `apps/api/src/middleware/oauth-scope.middleware.ts`, `auth.middleware.ts`, `permission.middleware.ts`,
  `repository.middleware.ts`
- `apps/api/src/types.ts`, `apps/api/src/factory.ts`, `apps/api/src/routes.ts`
- `apps/dashboard/src/features/oauth-consent/lib/consent-templates.ts`
- `apps/dashboard/src/locales/{en,it,de,fr,es}.json`
- `docs/reference/mcp-server.md`, `docs/reference/rbac-api.md`

Edit (tests):
- `packages/core/src/oauth/scopes.test.ts`, `packages/core/src/oauth/role-guard.test.ts`,
  `packages/core/src/operations/catalog.test.ts`
- `apps/api/src/middleware/oauth-scope.middleware.test.ts`, `apps/api/src/middleware/auth.middleware.test.ts`,
  `apps/api/src/factory.operations-parity.test.ts`
- `apps/api/test/flow/flow-oauth-resource-server.test.ts`
- `apps/dashboard/src/features/oauth-consent/components/consent-screen.test.tsx`,
  `apps/dashboard/src/features/oauth-consent/lib/consent-templates.test.ts`

Already done by this planning run (executor does not edit): `ROADMAP.md` (row 04 → DONE, row 05 → PLANNED and
amended, row 05b added, dependency line, sprint 05 note under §3, §4.5 replay wording); sprint 04 archived to
`docs/Sprints/OAuthScopesV2/` with `pnpm pipeline next`.

Explicitly excluded: no dashboard component, no change to `packages/mcp`, `packages/cli`, `packages/api-client`, no
change to any existing handler under `features/`.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### Task 1 — Two agent scopes (`packages/core/src/oauth/scopes.ts`, `role-guard.ts`)

Approach: append `'agent:read'` and `'agent:approve'` to `OAUTH_SCOPES` (16 entries, order: the existing 14, then
these two); extend the docblock with one line: `agent:approve` lets a client run an approved intent and is granted
only to the `beech-mcp` client (by `allowed_scopes`), never to the script client.
`SCOPE_GRANT_REQUIREMENTS` gains `'agent:read': 'authenticated'` and `'agent:approve': 'authenticated'` (derived by
the parity test from the four new AUTHED rows: any account may act on its own intents). Reason: the scope only
says "this client may confirm"; what runs is re-checked by RBAC at replay.

### Task 2 — Confirmation policy (`packages/core/src/operations/confirmation-policy.ts`, new, MIT)

Approach: pure functions in core, next to the risk type. Reason: the gate applies it now; sprint 08's `beech_whoami`
reports the same policy, so it must not live inside a middleware.

```ts
import type { OperationRisk } from './types.js'

/** Deployment class the confirmation policy depends on (ROADMAP §4.5). */
export type AgentEnvironment = 'development' | 'production'

/** `'production'` iff `env === 'production'`; anything else (unset included) is development, as in the factory CORS rule. */
export function agentEnvironment(env: string | undefined): AgentEnvironment

/**
 * Whether an OAuth request of this risk must become an intent instead of running.
 * `destructive` always; `publish` only in production; `read` / `write` never.
 */
export function requiresConfirmation(risk: OperationRisk, environment: AgentEnvironment): boolean
```

Export through `packages/core/src/index.ts` next to the operations lines (L48-50).

### Task 3 — Intent storage contract (`packages/core/src/operations/agent-intent.repository.ts`, new, MIT)

Approach: one interface shaped like `IInvitationRepository` (fact 7): the caller passes times, the D1 implementation
mints ids. Reason: one lifecycle shape in the codebase; the atomic state transitions live in SQL.

```ts
import type { OperationMethod, OperationRisk } from './types.js'

/** Risks that create an intent. */
export type AgentIntentRisk = Extract<OperationRisk, 'publish' | 'destructive'>

/** `pending` → `approved` → `executed` | `failed`; `pending` → `rejected` | `expired`. No other transition exists. */
export type AgentIntentStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'failed' | 'expired'

export interface AgentIntentRecord {
  id: string
  userId: string
  clientId: string
  operationId: string
  method: OperationMethod
  /** Path including the query string, exactly as received (`/api/content/posts/e1?purge=true`). */
  path: string
  /** Raw request body text; `null` when the request had none. */
  body: string | null
  /** `intentPayloadHash(method, path, body)`. */
  bodyHash: string
  risk: AgentIntentRisk
  summary: string
  status: AgentIntentStatus
  resultStatus: number | null
  resultBody: string | null
  /** Unix seconds. */
  createdAt: number
  expiresAt: number
  decidedAt: number | null
}

export type NewAgentIntentInput = Omit<AgentIntentRecord, 'id' | 'status' | 'resultStatus' | 'resultBody' | 'decidedAt'>

export interface IAgentIntentRepository {
  /** Stores a `pending` intent and returns its id. */
  create(input: NewAgentIntentInput): Promise<string>
  /** One intent of this user, any status. Null when absent OR owned by someone else (indistinguishable on purpose). */
  findForUser(intentId: string, userId: string): Promise<AgentIntentRecord | null>
  /** This user's `pending` intents with `expiresAt > now`, newest first, at most `limit`. */
  listPending(userId: string, now: number, limit: number): Promise<AgentIntentRecord[]>
  /**
   * Atomic `pending` → `approved` | `rejected`, only while `expiresAt > now` and only for this user.
   * TRUE only when THIS call performed the transition (single-use under concurrency).
   */
  decide(intentId: string, userId: string, decision: 'approved' | 'rejected', now: number): Promise<boolean>
  /** Atomic `pending` → `expired` for an intent whose `expiresAt <= now`. TRUE when it transitioned. */
  expire(intentId: string, userId: string, now: number): Promise<boolean>
  /** `approved` → `executed` | `failed` with the replay outcome. No-op on any other status. */
  recordResult(intentId: string, outcome: 'executed' | 'failed', resultStatus: number, resultBody: string | null): Promise<void>
}
```

Export through `packages/core/src/index.ts`.

### Task 4 — Catalog rows (`packages/core/src/operations/catalog.ts`)

Append a section `// --- Agent intents ---` after the media rows (L251), `docs` = `DOCS_MCP`:

| id | method | path | scope | risk | summary |
|----|--------|------|-------|------|---------|
| `intents.list` | GET | `/api/agent/intents` | `agent:read` | `read` | List your pending agent intents |
| `intents.get` | GET | `/api/agent/intents/:id` | `agent:read` | `read` | Read one agent intent |
| `intents.approve` | POST | `/api/agent/intents/:id/approve` | `agent:approve` | `write` | Approve an agent intent and run it once |
| `intents.reject` | POST | `/api/agent/intents/:id/reject` | `agent:read` | `write` | Reject an agent intent |

Rule pinned by a test: no `intents.*` row may ever be `publish`/`destructive`, or approving would create another
intent. Totals become 146 / 110 `agent` / 36 `excluded`.

### Task 5 — Activity entity (`packages/core/src/observability/activity-logger.ts:L28-32`)

Add `'intent'` to `EntityType`. No new `ActivityAction`: `create` = intent stored, `authorize` = approved and
replayed, `revoke` = rejected (existing tones in the dashboard already fit: default / default / destructive).

### Task 6 — Migration (`apps/api/migrations/0046_agent_intents.sql`)

Header comment in the style of `0045`: what the table is, that the scope strings must ship with the 16-scope
`OAUTH_SCOPES` (an unknown scope empties a parsed row), and that `agent:approve` goes to `beech-mcp` only.

```sql
CREATE TABLE IF NOT EXISTS agent_intents (
  id            TEXT    PRIMARY KEY,
  user_id       TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id     TEXT    NOT NULL,
  operation_id  TEXT    NOT NULL,
  method        TEXT    NOT NULL,
  path          TEXT    NOT NULL,
  body          TEXT,
  body_hash     TEXT    NOT NULL,
  risk          TEXT    NOT NULL CHECK (risk IN ('publish', 'destructive')),
  summary       TEXT    NOT NULL,
  status        TEXT    NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'failed', 'expired')),
  result_status INTEGER,
  result_body   TEXT,
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  decided_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_agent_intents_user_status ON agent_intents(user_id, status);

UPDATE oauth_clients
SET allowed_scopes = 'schema:read schema:write content:read content:write content:delete media:read media:write automations:read automations:write users:read users:write settings:read settings:write analytics:read agent:read agent:approve'
WHERE client_id = 'beech-mcp';

UPDATE oauth_clients
SET allowed_scopes = 'schema:read schema:write content:read content:write content:delete media:read media:write automations:read automations:write users:read users:write settings:read settings:write analytics:read agent:read'
WHERE client_id = 'beech-mcp-cli';
```

### Task 7 — D1 repository (`apps/api/src/shared/db/repositories/d1-agent-intent.repository.ts`, new, BUSL)

Approach: copy the shape of `D1InvitationRepository` (fact 7): `(db, idGenerator)`, `AgentIntentRow` + `rowToRecord`,
class docblock "system table, not a `BaseD1Repository`". Rules:
- `create` inserts with `status = 'pending'`, id from `idGenerator.uuid()`.
- `findForUser` filters by `id AND user_id`.
- `listPending`: `status = 'pending' AND expires_at > ?`, `ORDER BY created_at DESC, id DESC`, `LIMIT ?`.
- `decide`: one `UPDATE … SET status = ?, decided_at = ? WHERE id = ? AND user_id = ? AND status = 'pending' AND
  expires_at > ?`; returns `meta.changes === 1`.
- `expire`: same shape with `expires_at <= ?`, sets `status = 'expired'`, `decided_at = now`.
- `recordResult`: `UPDATE … WHERE id = ? AND status = 'approved'`.
- `method` / `risk` / `status` are narrowed when mapping rows; an unexpected stored value throws (CHECK constraints
  make it unreachable; never cast silently).

Bind in `repository.middleware.ts`: override field `agentIntentRepository?: IAgentIntentRepository` (next to L85)
and `context.set('agentIntentRepository', overrides?.agentIntentRepository ?? new D1AgentIntentRepository(database,
resolvedIdGenerator))` next to L190. `types.ts` `Variables` gains `agentIntentRepository: IAgentIntentRepository`
(next to L277). `BeechConfig` does **not** gain a field (no caller needs to inject it).

### Task 8 — Replay marker and payload hash (`apps/api/src/shared/agent-intents/replay.ts`, new, BUSL)

Approach: the dispatcher passes a copy of the request env with one extra property under a module-private `Symbol`
key; `authMiddleware` and the gate read it back. Reason: unforgeable from HTTP (fact 3) and no module-level mutable
state (VETO 4); an internal header would be forgeable by any client that learns its name.

```ts
import type { OAuthScope } from '@beechcms/core'
import type { Env } from '../../types'

/** What an in-process replay of an approved intent carries; set only by the approve handler. */
export interface IntentReplay {
  intentId: string
  userId: string
  clientId: string
  /** Exactly `[operation.scope]` of the stored operation. */
  scope: OAuthScope[]
  payloadHash: string
}

/** Runs a request through the whole app in-process (`app.fetch`). Provided by the factory. */
export type IntentDispatcher = (request: Request, env: Env, executionCtx?: ExecutionContext) => Promise<Response>

/** A shallow copy of `env` carrying the replay; `env` itself is never mutated. */
export function withIntentReplay(env: Env, replay: IntentReplay): Env

/** The replay carried by this request env, or `null` for every request that came over HTTP. */
export function readIntentReplay(env: Env): IntentReplay | null

/**
 * Hex SHA-256 of `${method}\n${pathWithQuery}\n${body ?? ''}` (method upper-cased).
 * Same input → same hash; binds an intent to exactly what was asked.
 */
export function intentPayloadHash(method: string, pathWithQuery: string, body: string | null): Promise<string>
```

Use `sha256hex` from `@beechcms/core` (already used by `auth.middleware.ts:L8`).

### Task 9 — Replay identity in `authMiddleware` (`apps/api/src/middleware/auth.middleware.ts`)

Rule, first thing in the returned handler, **only when `acceptOAuth` is true**: if `readIntentReplay(c.env)` is
non-null, skip the `Authorization` header entirely; load the user with `userRepository.findById(replay.userId)`;
missing or inactive → `invalidTokenResponse()` (the approve handler records it as `failed`); otherwise set
`jwtPayload` exactly as the OAuth branch does and `oauthGrant = { clientId: replay.clientId, userId: replay.userId,
scope: replay.scope }`, then `next()`. Extract the claims construction (L109-114) into a file-local helper used by
both branches, so a replay can never present a different shape than a live OAuth request (fact 4). Update the
function docblock (one bullet). With `acceptOAuth` false the marker is ignored (consent, search, custom routes).

### Task 10 — Scope gate loses the interim ceiling (`apps/api/src/middleware/oauth-scope.middleware.ts`)

Delete `CONFIRMATION_REQUIRED_ERROR` (L10-11), `confirmationRequiredResponse` (L47-57) and the body/risk block
(L91-96). Rules 1-3 remain unchanged. Export `insufficientScopeResponse` (L32, unchanged body) so the gate's
fail-closed branch answers identically. Docblock: replace the "Interim rule" bullet with "risk is enforced after RBAC
by `agentIntentGate()`".

### Task 11 — Intent gate (`apps/api/src/middleware/agent-intent-gate.middleware.ts`, new, BUSL)

Approach: one middleware after `permissionMiddleware`; it owns risk, policy, intent creation and replay admission.
Reason: after RBAC means an intent is only stored for something the user could do (ROADMAP §4.5).

```ts
/** Lifetime of a pending intent (ROADMAP §5: 10 minutes). */
export const AGENT_INTENT_TTL_SECONDS = 600
/** Largest request body stored in an intent; above it the request is refused 413. */
export const MAX_INTENT_BODY_BYTES = 262_144

export const AGENT_INTENT_GATE_ERRORS = {
  BODY_TOO_LARGE: 'intent_body_too_large',
  REPLAY_MISMATCH: 'intent_replay_mismatch',
} as const

export interface AgentIntentGateOptions {
  /** In-process dispatcher, exposed to the approve handler as `c.get('intentDispatcher')`. */
  dispatch: IntentDispatcher
}

export function agentIntentGate(options: AgentIntentGateOptions): (c: Context<AppEnv>, next: Next) => Promise<Response | void>
```

`types.ts` `Variables` gains `intentDispatcher: IntentDispatcher` (docblock: set by `agentIntentGate`, read only by
the approve handler).

Rules, in order:
0. `c.set('intentDispatcher', options.dispatch)` — before everything, so a JWT approve (dashboard, 05b) has it.
1. `oauthGrant` null (JWT) → `next()`. Must stay before any body read.
2. `replay = readIntentReplay(c.env)`. If non-null: the request is admitted iff `replay.userId === grant.userId`, the
   recomputed `intentPayloadHash(c.req.method, pathWithQuery, bodyText)` equals `replay.payloadHash`, and
   `agentIntentRepository.findForUser(replay.intentId, replay.userId)?.status === 'approved'`. Any mismatch → 409
   `{ error: 'intent_replay_mismatch', error_description }`. Admitted → `next()` regardless of risk or policy.
3. `operation = matchOperation(c.req.method, c.req.path)`; null or `excluded` → `insufficientScopeResponse(null)`
   (unreachable after the scope gate; kept fail-closed).
4. Body: `bodyText = await c.req.text()` only when `typeof operation.risk === 'function'` or the static risk is
   `publish`/`destructive`; empty text counts as `null`. The risk input body is `JSON.parse(bodyText)` with any error
   mapped to `undefined` (never throws, never 500; the handler's validator answers malformed JSON as today). The text
   is read regardless of `Content-Type` (sprint 04 regression: the validator parses any type). Fact 2: the handler
   still reads it.
5. `risk = resolveOperationRisk(operation, { query: c.req.query(), body })`;
   `requiresConfirmation(risk, agentEnvironment(c.env.ENV))` false → `next()`.
6. `bodyText` UTF-8 byte length > `MAX_INTENT_BODY_BYTES` → 413 `{ error: 'intent_body_too_large', error_description }`.
7. Store: `pathWithQuery = new URL(c.req.url).pathname + search`; `now = clock.nowSeconds()`; `create({ userId:
   grant.userId, clientId: grant.clientId, operationId: operation.id, method, path: pathWithQuery, body: bodyText,
   bodyHash, risk, summary: \`${operation.summary}: ${method} ${pathWithQuery}\`, createdAt: now, expiresAt: now +
   AGENT_INTENT_TTL_SECONDS })`.
8. `logActivity(c, { action: 'create', entityType: 'intent', entityId: id, details: { op: 'intent', operationId,
   risk, clientId: grant.clientId } })`.
9. Respond `202` JSON, never running the handler:

```ts
/** Body of the 202 answer. `expiresAt` is Unix seconds. */
export interface AgentIntentPendingResponse {
  intent: { id: string; operationId: string; risk: AgentIntentRisk; summary: string; status: 'pending'; expiresAt: number }
}
```

Registration in `factory.ts`, between L234 and L237, with a comment (order is load-bearing: after RBAC, before routes):
`apiProtected.use('*', agentIntentGate({ dispatch: (request, env, executionCtx) => app.fetch(request, env, executionCtx) }))`.
Update the comment block at L228-233 ("scope allowlist" → "scope gate"; RBAC "runs last" → "before the intent gate").

### Task 12 — Route rows (`apps/api/src/middleware/permission.middleware.ts`)

Append after L199 (before `]`), with a section comment `// --- agent intents: own intents only, checked in the handler`:

```ts
  { method: 'GET',    pattern: /^\/api\/agent\/intents$/,                    requirement: AUTHED },
  { method: 'GET',    pattern: /^\/api\/agent\/intents\/[^/]+$/,             requirement: AUTHED },
  { method: 'POST',   pattern: /^\/api\/agent\/intents\/[^/]+\/approve$/,    requirement: AUTHED },
  { method: 'POST',   pattern: /^\/api\/agent\/intents\/[^/]+\/reject$/,     requirement: AUTHED },
```

### Task 13 — Slice `features/agent-intents/` (new, BUSL)

Files: `index.ts` (barrel, `export { agentIntentsApp } from './agent-intents.handler'`), `agent-intents.handler.ts`
(one method chain, pattern `notifications.handler.ts`), `agent-intents.view.ts` (pure mapping + constants).
Mount in `routes.ts` after `.route('/rbac', rbacApp)` (L68): `.route('/agent', agentIntentsApp)`.

Verbatim building blocks (`agent-intents.view.ts`):

```ts
/** Most pending intents one listing returns. */
export const AGENT_INTENT_LIST_LIMIT = 50
/** Largest replay response body stored on the intent; longer bodies are cut at this many UTF-8 bytes. */
export const MAX_INTENT_RESULT_BYTES = 65_536

export const AGENT_INTENT_ERRORS = {
  NOT_FOUND: 'intent_not_found',
  EXPIRED: 'intent_expired',
  NOT_PENDING: 'intent_not_pending',
} as const

/** API shape of an intent. Never carries `bodyHash`. Times are Unix seconds. */
export interface AgentIntentView {
  id: string
  operationId: string
  method: OperationMethod
  path: string
  risk: AgentIntentRisk
  summary: string
  status: AgentIntentStatus
  clientId: string
  createdAt: number
  expiresAt: number
  decidedAt: number | null
  result: { status: number; body: unknown } | null
}

/** Detail adds the stored request body: parsed JSON when it parses, else the raw text, `null` when absent. */
export interface AgentIntentDetailView extends AgentIntentView {
  body: unknown
}

export function toIntentView(record: AgentIntentRecord): AgentIntentView
export function toIntentDetailView(record: AgentIntentRecord): AgentIntentDetailView
```

`result.body` follows the same parse-or-raw rule on `resultBody`; `result` is `null` until `resultStatus` is set.

Routes (caller = `jwtPayload.sub`, for JWT and OAuth alike; `now = clock.nowSeconds()`; errors through
`publicProblem` with the codes above):

| Route | Success | Rules |
|---|---|---|
| `GET /intents` | 200 `{ intents: AgentIntentView[] }` | `listPending(sub, now, AGENT_INTENT_LIST_LIMIT)` |
| `GET /intents/:id` | 200 `{ intent: AgentIntentDetailView }` | `findForUser`; null → 404 `intent_not_found` |
| `POST /intents/:id/approve` | 200 `{ intent: AgentIntentView, result: { status, body } }` | see below |
| `POST /intents/:id/reject` | 200 `{ intent: AgentIntentView }` | see below |

Approve, in order (the request body, if any, is ignored: what runs is what was stored):
1. `intent = findForUser(id, sub)`; null → 404 `intent_not_found` (another user's intent looks absent).
2. `intent.status === 'pending' && intent.expiresAt <= now` → `expire(...)`, 409 `intent_expired`.
3. `decide(id, sub, 'approved', now)` false → 409 `intent_not_pending` (already decided, or lost a race).
4. Build `new Request(new URL(intent.path, c.req.url), { method: intent.method, headers: body ? { 'Content-Type':
   'application/json' } : {}, body: intent.body ?? undefined })` — no other header. Dispatch with
   `c.get('intentDispatcher')(request, withIntentReplay(c.env, { intentId, userId: sub, clientId: intent.clientId,
   scope: [operation.scope], payloadHash: intent.bodyHash }), executionCtxOrUndefined)`. `operation` comes from
   `OPERATION_CATALOG` by `intent.operationId`; when the id no longer exists (catalog changed between creation and
   approval) → `recordResult(id, 'failed', 410, null)` and answer 200 with `result: { status: 410, body: null }`.
   `executionCtx` is read in `try/catch` (the getter throws when absent, as in `factory.ts:L205-206`).
   The replay identity is always the intent's OAuth client, even when a JWT user approves: the gate's replay branch
   (Task 11 rule 2) and RBAC then run exactly as for the original agent request.
5. Read the response text, cut to `MAX_INTENT_RESULT_BYTES`; `recordResult(id, status < 400 ? 'executed' : 'failed',
   status, text || null)`.
6. `logActivity(c, { action: 'authorize', entityType: 'intent', entityId: id, details: { op: 'approve', operationId,
   resultStatus } })`.
7. Answer with the re-read intent (`findForUser`) and `result`. A failed replay is still a 200 here: approving
   succeeded; the outcome is in `result.status`.

Reject: steps 1-2 as approve; `decide(id, sub, 'rejected', now)` false → 409 `intent_not_pending`; `logActivity`
`{ action: 'revoke', entityType: 'intent', entityId: id, details: { op: 'reject', operationId } }`; answer the
re-read intent.

### Task 14 — Consent vocabulary in the dashboard (`apps/dashboard`)

- `features/oauth-consent/lib/consent-templates.ts:L16-18`: append `'agent:read', 'agent:approve'` to `READ_SCOPES`
  (cumulative, so every template carries them; templates only narrow the client's request, and `beech-mcp-cli`
  never requests `agent:approve`). Update the docblock with that reason.
- Locales, all five, under `oauth.consent.scopes` (next to `analytics:read`, `en.json:L2437`): `agent:read` →
  "See the actions your agent is waiting for you to confirm, and reject them"; `agent:approve` → "Run an action
  after you confirm it in your AI client". `it` written with care, `de/fr/es` translated.
- No component change. Run `node scripts/check-design-tokens.mjs --format agent` on nothing: no `.tsx` is edited.

### Task 15 — Docs that would become false

- `docs/reference/mcp-server.md` § "Permission Model & Known Limitations" (L352-374): replace the interim bullet
  (L358) with the intent rule: after RBAC, a `destructive` request (always) or `publish` request (in `production`)
  made with an OAuth token answers `202` with a pending intent instead of running; it runs once when approved via
  `POST /api/agent/intents/:id/approve` (scope `agent:approve`, `beech-mcp` client only) or from the dashboard; it
  expires after 10 minutes. Add the four endpoints as a table and the residual risk sentence from ROADMAP §4.5
  ("protects against mistakes and prompt injection, not against a hostile agent with full shell access").
  Failure matrix (L376+): drop the `confirmation_required` row; add `202 intent pending` (remediation: ask the user
  to confirm), `409 intent_expired` / `intent_not_pending`, `413 intent_body_too_large`.
- `docs/reference/rbac-api.md:L34`: "refused with `confirmation_required`" → "become pending intents that the user
  must approve".
- Do not edit `docs/api/**` (generated) or `docs/Sprints/**`.

### Task 16 — Tests (behaviour lists; bodies follow `_config/testing_conventions.md`)

**`packages/core/src/operations/confirmation-policy.test.ts`** — unit, MIT, fixture: literals.
- `it('requires confirmation for destructive in every environment and for publish only in production')` — 4 risks ×
  2 environments matrix.
- `it('treats every ENV value other than production as development')` — `undefined`, `''`, `'development'`,
  `'staging'`, `'Production'` → development; `'production'` → production.

**`packages/core/src/oauth/scopes.test.ts`** — update `it('lists the 14 v2 scopes…')` → 16, the two agent scopes
last; rename accordingly. Matrix in `it('returns null for a scope outside the vocabulary')`: replace `'agent:read'`
with `'agent:write'`.

**`packages/core/src/oauth/role-guard.test.ts`** — `it('grants only the authenticated scopes…')`: 9 granted
(`agent:read`, `agent:approve` added), 7 denied.

**`packages/core/src/operations/catalog.test.ts`** — add `it('never gives an intents operation a risk that would
create an intent')` — every `intents.*` row resolves to `read`/`write` for an empty input; comment: approving must
not itself need approval.

**`apps/api/src/shared/agent-intents/replay.test.ts`** — unit, BUSL, fixture: literals + `TEST_ENV`.
- `it('reads back the replay it was given and leaves the original env untouched')`.
- `it('returns null for an env that came from outside')` — plain `TEST_ENV`, and an env with a string property
  named like the symbol's description.
- `it('hashes method, path with query and body deterministically')` — same input twice equal; changing any one of
  method, query, body changes the hash; lower-case method equals upper-case.

**`apps/api/src/shared/db/repositories/d1-agent-intent.repository.test.ts`** — BUSL, pattern
`d1-invitation.repository.test.ts:L1-30` (`D1TestDatabase`, `SequentialIdGenerator`, `seedTestUsers` with two
users), `NOW = 1_700_000_000`.
- `it('creates a pending intent that only its owner can find')`.
- `it('lists only pending unexpired intents of the user, newest first, capped')`.
- `it('decides a pending intent once and refuses a second decision')` — first `decide` true, second false, status kept.
- `it('refuses to decide an expired intent and expires it')` — `decide` at `expiresAt` false; `expire` true; status
  `expired`.
- `it('refuses to decide another user\'s intent')` — false, status still `pending`.
- `it('records a result only on an approved intent')` — pending → `recordResult` no-op; approved → `executed` with
  status and body.
- `it('deletes the intents of a deleted user')` — `DELETE FROM users` → row gone (cascade).

**`apps/api/src/middleware/agent-intent-gate.middleware.test.ts`** — unit, BUSL. Stub app in the shape of
`oauth-scope.middleware.test.ts:L11-24`: a first middleware sets `oauthGrant`, `clock` (`FixedClock`), a `vi.fn()`
`agentIntentRepository` (boundary mock, Rule 3.10) and a `vi.fn()` `activityLogger`; then the gate; terminal handler
echoes `c.req.json()` or `{ ok: true }`. Env passed per request (`ENV` varies).
- `it('lets a JWT request through untouched, whatever its risk')` — grant null, `DELETE /api/seeds/a` → 200,
  `create` not called.
- `it('lets read and write requests through')` — matrix `GET /api/content/posts`, `POST` draft body → 200.
- `it('stores a destructive request as an intent and answers 202 without running the handler')` — `DELETE
  /api/content/posts/e1?purge=true`: 202 body per `AgentIntentPendingResponse`, `create` called with `path`
  including `?purge=true`, `body: null`, `risk: 'destructive'`, `expiresAt = now + 600`; terminal handler not reached.
- `it('runs a publish immediately in development and stores it in production')` — `{status:'published'}` create:
  no `ENV` → 200; `ENV: 'production'` → 202.
- `it('reads the body for risk whatever the Content-Type')` — production, `text/plain` published body → 202;
  regression comment from sprint 04.
- `it('keeps the JSON body readable by the handler')` — draft body reaches the echo handler intact (fact 2).
- `it('treats a malformed JSON body as a plain write')` — `'{'` → 200 from the stub, `create` not called.
- `it('refuses an oversized body with 413 and stores nothing')` — production publish with a body of
  `MAX_INTENT_BODY_BYTES + 1` bytes.
- `it('admits a matching replay of an approved intent without storing a new one')` — env from `withIntentReplay`,
  repository returns `status: 'approved'` → 200, `create` not called.
- `it('refuses a replay whose payload, user or status does not match')` — matrix: other body; other `userId`;
  repository status `executed` → 409 `intent_replay_mismatch`.
- `it('logs the creation of an intent as the caller')` — `activityLogger.log` called with `action: 'create'`,
  `entityType: 'intent'`.

**`apps/api/src/middleware/oauth-scope.middleware.test.ts`** — remove the four risk cases (L138-210 region: destructive,
static publish, request-dependent risk, purge) and the `CONFIRMATION_REQUIRED_ERROR` import; add
`it('lets a destructive operation through to the next layer when the scope matches')` — `schema:write`,
`DELETE /api/seeds/articles` → 200; comment: risk is the intent gate's, after RBAC. Body-readability and malformed-body
cases move to the gate test; delete them here.

**`apps/api/src/middleware/auth.middleware.test.ts`** — unit, existing `buildApp` (L16):
- `it('authenticates an in-process replay as the intent owner without an Authorization header')` — `acceptOAuth: true`,
  env from `withIntentReplay`, active user → 200; `oauthGrant` equals the replay identity.
- `it('refuses a replay for an inactive owner with 401')`.
- `it('ignores the replay marker when OAuth is not accepted')` — `acceptOAuth: false`, no header → 401.

**`apps/api/src/factory.operations-parity.test.ts`** — no new case: `catalogues every route`, `mounts every
catalogued operation`, `places every agent operation behind the RBAC route table` and the
`SCOPE_GRANT_REQUIREMENTS` derivation must pass with the 4 new routes and rows. Run it; edit only if the ghost-collision
probe needs the new literal `agent`/`intents` segments (it derives them itself — expected no change).

**`apps/api/test/helpers/oauth-flow.ts`** — new, BUSL. Move `requestConsent`, `exchangeCode`, `issueToken`,
`createTargetSeed` and the constants they use out of `flow-oauth-resource-server.test.ts:L15-89`; `clientId` becomes a
parameter (default `'beech-mcp-cli'`). Export `CLI_SCOPES` (`OAUTH_SCOPES` minus `agent:approve`, space-joined) and
`MCP_SCOPES` (all 16). Reason: a second flow file needs them (Rule 3.12); `test/helpers/` already holds the flow
tier's shared helpers (`d1-test-database.ts`, `seed-fixtures.ts`).

**`apps/api/test/flow/flow-oauth-resource-server.test.ts`** — import the moved helpers. Changes:
- `ALL_SCOPES` → `CLI_SCOPES` everywhere (fact 11).
- `it('seeded clients allow every v2 scope after the migrations')` → expect the two `0046` strings (per client).
- `it('a publish sent as text/plain …')` → rename `it('a production publish sent as text/plain becomes an intent and
  persists nothing')`: env `{ ...TEST_ENV, ENV: 'production', DB: db }` → 202, zero entries, one `pending` row.
- `it('a token wider than the owner role is still limited by RBAC')` → expected token scope list gains `agent:read`;
  `PUT /api/settings` now answers 403 `forbidden` (RBAC runs before the gate); settings unchanged; no intent row.
- `it('a destructive call with the right scope is refused until confirmed')` → rename `it('a destructive call with
  the right scope becomes a pending intent and changes nothing')`: 202, seed intact, one `pending` row whose
  `operation_id` is `seeds.delete`.
- Everything else unchanged.

**`apps/api/test/flow/flow-agent-intents.test.ts`** — new, flow tier (real D1 via `D1TestDatabase`, real migrations,
real middleware), BUSL. `describe('agent intents — flow (real D1)')`. `beforeEach`: `D1TestDatabase`,
`seedTestUsers(TEST_USERS)`, `clock = new FixedClock(Date.now())`, `app = createBeechApp({ seeds: [], authProviders: {
clock } })`, admin login, `createTargetSeed`. Tokens: script token = `issueToken(..., 'beech-mcp-cli', 'schema:read
schema:write content:read content:write content:delete agent:read')`; confirm token = `issueToken(..., 'beech-mcp',
'agent:read agent:approve')`. A local `intentRows()` helper reads `agent_intents`.
- `it('approving with the MCP client runs the stored request once and records the outcome')` — script token
  `DELETE /api/seeds/articles` → 202; confirm token approve → 200, `result.status` 2xx; seed gone; row `executed`,
  `result_status` 2xx; `activity_logs` holds `create` and `authorize` rows with `entity_type = 'intent'`.
- `it('approving the same intent twice runs it once')` — second approve → 409 `intent_not_pending`; still one
  `authorize` activity row.
- `it('the dashboard JWT can approve an intent created by an agent')` — admin JWT approve → 200, seed gone.
- `it('rejecting an intent keeps the data and blocks a later approval')` — script token reject → 200 `rejected`;
  approve → 409; seed intact.
- `it('an expired intent is refused and marked expired')` — `clock.advance(601_000)`; approve → 409 `intent_expired`;
  row `expired`; seed intact.
- `it('another user\'s intent is invisible')` — second user (pattern `flow-oauth-resource-server.test.ts` scoped user,
  with `manage_seeds` global role) gets 404 on `GET /api/agent/intents/:id` and on approve; the list is empty for them.
- `it('the script client can neither request nor use agent:approve')` — consent for `beech-mcp-cli` with
  `agent:approve` → `invalid_scope`; script token approve → 403 `insufficient_scope` naming `agent:approve`.
- `it('the approve body cannot change what runs')` — approve with JSON body `{ "path": "/api/seeds" }` → the stored
  `DELETE /api/seeds/articles` ran (seed gone), nothing else changed.
- `it('a replay re-checks RBAC and records a refusal as failed')` — scoped user with `manage_seeds` global creates the
  intent; delete their role assignment by SQL; they approve with JWT → 200, `result.status` 403; row `failed`; seed intact.
- `it('a purge requested through content.delete becomes an intent, a plain delete does not')` — create an entry
  (admin JWT); script token `DELETE /api/content/articles/:id?purge=true` → 202; without `purge` → 200 trashed.
- `it('lists only the caller\'s pending, unexpired intents')` — two intents, one rejected → list has one.
- `it('the dashboard JWT never creates intents')` — admin JWT `DELETE /api/seeds/articles` → 200; zero rows.

**`apps/dashboard/src/features/oauth-consent/lib/consent-templates.test.ts`** — unit. `it('builds cumulative
templates…')` unchanged; add `it('lets every template delegate intent confirmation')` — each template contains
`agent:read` and `agent:approve`.

**`apps/dashboard/src/features/oauth-consent/components/consent-screen.test.tsx`** — L133 expected Read scope string
gains ` agent:read agent:approve` (request order: all 16 requested). No other change.

`locales.test.ts` covers the new keys in all five locales (no edit).

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

```bash
pnpm --filter @beechcms/core build          # api and dashboard tests resolve core through dist (fact 13)
pnpm --filter @beechcms/core type-check
pnpm --filter @beechcms/core test
pnpm --filter @beechcms/api type-check
pnpm --filter @beechcms/api test:unit
pnpm --filter @beechcms/api test:flow       # flow-agent-intents + flow-oauth-* against D1TestDatabase with 0046 applied
pnpm --filter @beechcms/dashboard type-check
pnpm --filter @beechcms/dashboard test:unit
pnpm beech db:migrate                       # 0046 applies cleanly on the local D1
pnpm beech lint
pnpm beech test --diff
graphify update .
```

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `OAUTH_SCOPES` has 16 entries ending with `agent:read`, `agent:approve`; both are `'authenticated'` in
      `SCOPE_GRANT_REQUIREMENTS`, and the parity derivation still equals the map.
- [ ] `CONFIRMATION_REQUIRED_ERROR` and every `confirmation_required` response are gone
      (`grep -rn "confirmation_required" apps packages docs/reference` matches nothing).
- [ ] With an OAuth token, after RBAC: `destructive` always, and `publish` in `production`, answer `202` with
      `AgentIntentPendingResponse` and run nothing; `read`/`write` (and `publish` in development) run as before.
- [ ] An intent runs only through `POST /api/agent/intents/:id/approve`, once, as its owner, with the stored method,
      path and body; expired, already decided and other users' intents are refused (`409` / `409` / `404`).
- [ ] The replay re-enters the full middleware chain: RBAC refusals at replay are recorded as `failed`.
- [ ] The replay marker cannot come from HTTP: no header is involved; `authMiddleware` honours it only with
      `acceptOAuth`.
- [ ] `beech-mcp` may request `agent:approve`; `beech-mcp-cli` may not (`0046`, flow test).
- [ ] JWT requests never create intents; every pre-existing JWT test is green and unmodified.
- [ ] Intent creation, approval and rejection each write one activity row with `entity_type = 'intent'`.
- [ ] Catalog: 146 rows, 110 `agent`; no `intents.*` row resolves to `publish`/`destructive`; parity suite green.
- [ ] `0046_agent_intents.sql` applies cleanly; DDL equals Task 6.
- [ ] Consent templates carry the two agent scopes; the two locale keys exist in all five locales.
- [ ] `docs/reference/mcp-server.md` and `rbac-api.md` describe intents instead of `confirmation_required`.
- [ ] No `any` in new or edited code and tests; TSDoc on every new or changed export; headers per fact 13.
- [ ] `packages/mcp`, `packages/cli`, `packages/api-client`, every existing handler under `features/` and every
      dashboard `.tsx` are unchanged.
- [ ] All Section 5 commands exit 0.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

- Dashboard section "Azioni agente in attesa" (list, preview, Approve/Reject with the JWT) and the activity-log
  labels/presentation for `entityType: 'intent'` → **ROADMAP sprint 05b (AgentIntentsDashboard)**.
- `beech_confirm`, `beech_intents`, elicitation, `beech_whoami` reporting the policy → **sprint 08 (Mcp2)**.
- `IntentPending` in the SDK and `pendingIntents` in `beech run` output → **sprints 06-07**.
- Batch approval of several intents in one call (`beech_confirm({ intentIds })` loops per id in 08).
- A sweep/retention job for old intents; rich per-operation summaries; replaying original request headers.
- A configurable bulk threshold policy for `content.bulkUpdate` (ROADMAP §3 sprint 03 note).
- Any change to existing catalog rows, existing `PROTECTED_ROUTES` rows, token/consent handlers, or
  `packages/mcp` / `packages/cli` / `packages/api-client` defaults.
- Rewriting MCP guides beyond Task 15 → **sprint 09 (DocsEvals)**.
