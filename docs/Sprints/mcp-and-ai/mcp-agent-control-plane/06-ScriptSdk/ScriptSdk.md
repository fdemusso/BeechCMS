# Sprint Plan — ScriptSdk (`@beechcms/mcp` 2.0 Agent Control Plane, sprint 06)

Roadmap: `stages/01_sprint_planning/output/backlog/ROADMAP.md`, §6 row 06, §4.3 component 4, §4.7 ("SDK `beech`"),
§7 decisions 6 and 9, and the "Decisioni della pianificazione dello sprint 06" note under §3 (written by this run).
Feature brief: `stages/00_ideation/output/feature_brief.md` is empty on purpose; the ROADMAP is the source.
Previous sprints shipped (all review PASS): **03 OperationCatalog**, **04 OAuthScopesV2**, **05 AgentIntents**
(commit `975aaab2`), **05b AgentIntentsDashboard** (`docs/Sprints/AgentIntentsDashboard/`, uncommitted in the working
tree of `feature/agent-intents-dashboard`). Sprint 06 depends only on 03 (catalog) and 05 (intent `202` contract).

---

### Pre-Computation Analysis

Graph refreshed with `graphify update .` (19 900 nodes, 47 257 edges) before mapping. Known graph limit: edges across a
package specifier (`from '@beechcms/core'`, `from '@beechcms/api-client'`) are not extracted, so consumers across
packages were confirmed with `grep` and are listed explicitly below.

**a) God nodes on the path**

| Node | Source | Role here |
|------|--------|-----------|
| `createBeechApp()` | `apps/api/src/factory.ts:L106` (degree 179) | **Not edited.** The flow suite builds it exactly as `flow-agent-intents.test.ts:L89` does, plus `jobs: contentImportJobs`. |
| `agentIntentGate()` | `apps/api/src/middleware/agent-intent-gate.middleware.ts:L69` | **Edited (types only)**: its 202 body type `AgentIntentPendingResponse` (L35-37) moves to core; the middleware imports and re-exports it. Behaviour unchanged. |
| `OPERATION_CATALOG` / `matchOperation()` / `resolveOperationRisk()` | `packages/core/src/operations/{catalog,match}.ts` | **Not edited.** Third runtime consumer: the SDK resolves every method's method/path/risk from the catalog. Existing consumers: `oauth-scope.middleware.ts`, `agent-intent-gate.middleware.ts`, `factory.operations-parity.test.ts`. |
| `createApiClient()` | `packages/api-client/src/client.ts:L80` | **Edited**: gains `send()` (raw `Response`, no status mapping); `request()` is rebuilt on top of it with identical behaviour. Consumers: `packages/mcp/src/client.ts:L14`, `packages/cli/src/lib/control-plane.ts:L15`. |
| `createControlPlane()` | `packages/cli/src/lib/control-plane.ts:L87` | **Edited (one constant)**: its OAuth scope becomes the shared CLI scope, so `beech schema *` and the SDK share one grant without a scope clash. |

**b) Architectural boundaries affected**

- `@beechcms/core`
  - new `operations/agent-intent.wire.ts` — the intent `202` wire type + its guard (shared by API and CLI).
  - `index.ts` — one `export *` line after L52.
- `packages/api-client` (private, bundled into CLI and MCP)
  - `src/client.ts` — `send()` on `ApiClient`; `request()` re-based on it.
  - `src/client.test.ts` — three new `it()`.
- `packages/cli`
  - new `src/sdk/` (the SDK), `tsconfig.sdk.json`, `package.json` (`./sdk` export + build), `src/lib/control-plane.ts`
    (exported constants), four new test files under `src/test/`.
- `apps/api`
  - `src/middleware/agent-intent-gate.middleware.ts` — type moved to core (re-export kept).
  - new `test/flow/flow-script-sdk.test.ts` — helpers against test D1 + MinIO.
- `apps/dashboard`, `packages/mcp`, migrations, routes, `PROTECTED_ROUTES`: **no edit**.

**c) `graphify affected` impact analysis**

```
graphify affected "createApiClient" --depth 2
- freshClient() client.test.ts:L51; api-client/src/index.ts [re_exports] L4; request() client.ts:L132
  + by grep (cross-package, not in graph): packages/mcp/src/client.ts:L14, packages/cli/src/lib/control-plane.ts:L15
  → request() keeps its exact contract (throws BeechClientError on 401-after-refresh, 403, !ok; returns parsed JSON).
    All 12 existing client.test.ts cases must pass unchanged; MCP and control-plane are untouched callers.

graphify affected "AgentIntentPendingResponse" --depth 2
- agent-intent-gate.middleware.test.ts [imports] L13; flow-agent-intents.test.ts [imports] L19
  → both import from the middleware module; the re-export keeps both compiling with zero edits.

graphify explain "matchOperation"  (consumers: match.ts, match.test.ts; by grep: oauth-scope + agent-intent-gate
  middlewares, factory.operations-parity.test.ts)
  → read-only reuse; no signature change.

graphify explain "createControlPlane"
- schemaApply() schema-apply.ts:L42; schemaPlan() schema-plan.ts:L38; control-plane.test.ts
  → only the requested scope string changes. control-plane.test.ts asserts no scope literal (checked: only L64,
    an insufficient-scope mapping case) — stays green.
```

---

### VETO Audit

| Rule (`ponytail_arch.md`) | Verdict |
|---|---|
| 1 YAGNI | One SDK module inside an existing package (decision 9: no new package). No codegen, no OpenAPI, no sandbox. Typed response shapes only where a helper or the roadmap example consumes them (content, trash, import job, media upload); everything else is `SdkJson`. No `jobs` namespace (only import jobs are awaited: `content.waitForImport`). No public `createBeechSdk` export: sprint 07 is its only caller. **Pass.** |
| 2 Botanical invariant | The SDK is an HTTP client. It never opens D1, never builds SQL, never names a physical column. Every write lands on an existing handler that goes through `apiToDb`/repositories. Entry payloads use branch aliases exactly as the dashboard does. The flow suite seeds through the real routes. **Pass.** |
| 3 VSA | No feature slice is touched. The one shared type (`AgentIntentPendingResponse`) moves *down* into `@beechcms/core` because two tiers (API middleware, CLI SDK) need it. The flow test lives in `apps/api/test/flow/` (cross-package flow tier), importing the SDK by relative source path exactly like `client-sdk-e2e.test.ts:L10-11`. **Pass.** |
| 4 Cloudflare purity | Upload/import keep "the Worker never receives bytes": presign → PUT to storage → confirm/import. The multipart `POST /api/upload` is deliberately not exposed. No background job, no migration. **Pass.** |
| 5 Minimal blueprint | core: 1 file. api-client: 1 method. cli: `src/sdk/` (11 files, 6 of them per-domain method maps). api: 1 type move + 1 flow suite. |

Security re-check (§5): the SDK has no method for `intents.approve` and the CLI client is never granted
`agent:approve` (migration 0046 `allowed_scopes`); dry-run never sends a non-read request; intent detection is by body
shape, not by status, so an ordinary `202` (import job, seed purge) can never be mistaken for an intent and vice versa.

HANDOFF -> caveman_coder

---

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Sprint 07 (`beech run`) executes `.beech/scripts/*.ts` against an authenticated `beech` instance, and sprint 08's
`beech_search` returns SDK signatures. Both need a stable, typed SDK surface first: the method names, the outcome type
that tells "executed" from "awaiting human confirmation", the journal `beech run` prints, and the dry-run semantics.
Building the SDK alone lets it be validated against the real API (catalog parity in CI, helpers against test D1 and
MinIO) before any command or MCP tool depends on it.

- **VSA:** the SDK is a client module in `packages/cli/src/sdk/`; it imports only `@beechcms/core` (catalog, scopes,
  wire types) and, in exactly one adapter file, `@beechcms/api-client`. No API slice changes.
- **Botanical invariants:** untouched by construction — the SDK reaches data only through the HTTP surface, whose
  handlers already go through the engine.
- **Fail-closed parity:** the method map is checked against `OPERATION_CATALOG` in CI. An operation added to the
  catalog without an SDK method (or an explicit, reasoned omission) fails the build, the same principle as
  `factory.operations-parity.test.ts` one layer down.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Catalog** (`packages/core/src/operations/catalog.ts`): 146 operations, 110 `exposure: 'agent'` across 19 id domains:
`settings`(12) `schema`(3) `layout`(4) `seeds`(13) `users`(4) `roles`(4) `assignments`(2) `invitations`(4)
`notifications`(5) `stats`(9) `drafts`(5) `content`(13) `views`(5) `trash`(5) `widgets`(6) `search`(1)
`automations`(6) `media`(5) `intents`(4). Ids are `domain.verb`; `path` is the Hono pattern; `risk` is static or a
rule (`content.create`/`content.update`: `publishWhenStatusPublished`; `content.delete`: `destructiveWhenPurge`).
Exported from core root (`packages/core/src/index.ts:L48-52`). `resolveOperationRisk(op, { query, body })` in
`match.ts` gives the effective risk; `requiresConfirmation()` in `confirmation-policy.ts` the dev/prod rule.

**Intent gate contract** (sprint 05): a gated OAuth request answers `202` with
`{ intent: { id, operationId, risk, summary, status: 'pending', expiresAt } }`
(`agent-intent-gate.middleware.ts:L35-37`, built at L141-144). **Other `202`s exist**: `POST /api/content/:slug/import`
→ `202 { jobId }` (`features/content/handlers/import.ts:L120`), `DELETE /api/seeds/:slug/hard` → `202 { jobId, status }`
(`features/seeds/seeds.destructive.ts:L107`). Status alone therefore cannot identify an intent.

**HTTP client** (`packages/api-client/src/client.ts`): `createApiClient(config)` → `{ request, baseUrl }`.
`rawFetch` L115-128 (JSON headers, bearer, offline → `BeechClientError`), `request` L130-177: 401 → refresh+retry once
(second 401 throws), 502/503/504 retried twice, 403 and `!ok` throw `BeechClientError(message, status, problem)`,
success parses `response.json()` (so a 204/empty body throws today). Config via `resolveApiConfig(overrides)` L57-70.
Token cache key = `${apiUrl}|${clientId}` (`token-store.ts:L44`).

**CLI OAuth client** (`packages/cli/src/lib/control-plane.ts`): `CLI_OAUTH_CLIENT_ID = 'beech-mcp-cli'` (L20),
private `CLI_CALLBACK_PATH = '/callback'` (L23), requests scope `'schema:read schema:write'` (L91). Migration 0046 sets
`beech-mcp-cli.allowed_scopes` = every v2 scope except `agent:approve`. If the SDK asked for a wider scope under the same
cache key, a grant cached by `beech schema plan` would make every SDK call `403 insufficient_scope` — hence one shared
scope constant (Task 4).

**CLI package** (`packages/cli/package.json`): ESM, `exports` only `"."` → `dist/index.js`; build =
`tsc --noEmit && esbuild src/index.ts --bundle --external:@beechcms/core …`. `@beechcms/api-client` is a
**devDependency** (private, bundled); `src/test/package-dependencies.test.ts` forbids private runtime deps. Tests:
`vitest.config.ts` includes `src/test/**/*.test.ts` only.

**Wire shapes the typed methods use** (verified in handlers):
- Entry envelope (`apps/api/src/shared/policies/apply-policies.ts:L51-66`): `{ id, slug, status, created_at,
  updated_at, deleted_at?, data: Record<alias, unknown> }`; list/get add `has_pending_draft` (`list.ts:L212`,
  `get.ts:L41`).
- `GET /api/content/:slug` (`list.ts:L136-225`): `page` (default 1), `limit` (≤ 100), `offset`, `search`, `sortBy`,
  `sortDir`, `filters` (JSON; `parseQueryFilters` takes `Object.values` of it, so a JSON array works), `kanbanAxis`.
  **With no query params it returns a bare array** (L217-219); with any, `{ items, total, page, limit, relations,
  relationAvatars }`.
- Create `201 { id }` (`create.ts:L121`); update `{ success: true }` (`update.ts:L181`); delete
  `{ success: true, softDeleted }` (`delete.ts:L64`); bulk `{ updated, failed: [{ id, problem }] }`
  (`bulk.handler.ts:L209`, body `{ ids (1..500), fields }`, `crud.schema.ts:L49-52`).
- Trash list `{ items, total, page, limit, retentionDays }` (`trash.ts:L90`); restore `{ success, slug }` (L109);
  bulk restore/purge `{ succeeded, failed }` (L131, L160).
- Import job (`features/content/import-job.ts:L159-171` `toImportJobResponse`): `{ id, targetSeed, format, state:
  'pending'|'processing'|'completed'|'failed', rowsRead, insertedRows, failedRows, errors, createdAt, updatedAt,
  finishedAt }`.
- Presign (`features/upload/index.ts:L199-213`, schema `upload.schema.ts:L21-29`): body `{ filename, mimeType,
  sizeBytes, purpose?: 'import' }` → `{ uploadUrl, key, expiresIn }`; `purpose: 'import'` prefixes the key with
  `imports/<userId>/`. Confirm (L216-281): `{ key }` → `{ url }`. The dashboard import path is presign → PUT, **no
  confirm** (`apps/dashboard/src/features/content-transfer/api/transfer.api.ts:L104-129`); MIME map L48-51
  (`csv: text/csv`, `ndjson: application/json`).
- Export (`handlers/export.ts:L147-151`): streamed text body, `Content-Type` per format.
- Error bodies come in three shapes: problem `{ type, title, status, detail }` (content, import), OAuth/gate
  `{ error, error_description }` (`insufficient_scope`, `intent_*`), plain `{ error: '<message>' }` (upload).

**Flow-tier patterns** (`apps/api/test/flow/`, Docker-bound, `node:sqlite` D1 via `D1TestDatabase`):
`flow-agent-intents.test.ts:L77-96` (login + `issueToken(app, db, adminToken, scopes, state, clientId?)` from
`test/helpers/oauth-flow.ts:L75`, `CLI_SCOPES` L22, `createTargetSeed` L81 creates `articles` with `title` text +
`body` richtext); `flow-media-assets.test.ts:L17-25` (S3 client to MinIO), L175-214 (presign → PUT → confirm,
`media_objects` row); `TEST_ENV.ENV = 'development'` (`test/fixtures.ts:L32`); in-process import jobs via
`createBeechApp({ …, jobs: contentImportJobs })` (`content-import.integration.test.ts:L30`,
`features/content/jobs/import-chunk.worker.ts:L340`).

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

Create:
- `packages/core/src/operations/agent-intent.wire.ts`
- `packages/core/src/operations/agent-intent.wire.test.ts`
- `packages/cli/src/sdk/index.ts` — public barrel (types + guards only)
- `packages/cli/src/sdk/types.ts` — every exported SDK type and the `BeechSdk` interface
- `packages/cli/src/sdk/errors.ts` — `BeechSdkError`
- `packages/cli/src/sdk/invoke.ts` — catalog lookup, request building, response mapping, dry-run, journal
- `packages/cli/src/sdk/operations.ts` — `SDK_OPERATIONS`, `SDK_OMITTED_OPERATIONS`, `SDK_HELPER_METHODS`
- `packages/cli/src/sdk/helpers.ts` — `listAll`, `uploadFile`, `importFile`, `waitForImport`
- `packages/cli/src/sdk/create-sdk.ts` — `createBeechSdk()` (internal; sprint 07 calls it)
- `packages/cli/src/sdk/api-client-transport.ts` — production transport (internal; never re-exported)
- `packages/cli/tsconfig.sdk.json`
- `packages/cli/src/test/sdk-parity.test.ts`, `sdk-invoke.test.ts`, `sdk-helpers.test.ts`, `sdk-transport.test.ts`
- `apps/api/test/flow/flow-script-sdk.test.ts`

Edit:
- `packages/core/src/index.ts` — `export * from './operations/agent-intent.wire.js'`
- `apps/api/src/middleware/agent-intent-gate.middleware.ts` — drop local interface, import + re-export from core
- `packages/api-client/src/client.ts`, `packages/api-client/src/client.test.ts`
- `packages/cli/src/lib/control-plane.ts` — export `CLI_CALLBACK_PATH`, add/use `CLI_OAUTH_SCOPE`
- `packages/cli/package.json` — `./sdk` export, build steps
- `stages/01_sprint_planning/output/backlog/ROADMAP.md` — done by this planning run (status + decisions)

No command, no `defineScript`, no docs page, no API route, no migration (Section 7).

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### Task 1 — Intent wire type in core

**Approach:** move the `202` body type into core and add one guard. Reason: the API produces it and the CLI consumes
it; core is the only package both may import.

File `packages/core/src/operations/agent-intent.wire.ts` (MIT header like `agent-intent.repository.ts`):

```ts
import type { AgentIntentRisk } from './agent-intent.repository.js'

/** The intent an OAuth request became instead of running. `expiresAt` is Unix seconds. */
export interface AgentIntentPending {
  id: string
  operationId: string
  risk: AgentIntentRisk
  summary: string
  status: 'pending'
  expiresAt: number
}

/** Body of the gate's `202` answer. */
export interface AgentIntentPendingResponse {
  intent: AgentIntentPending
}

/** True iff `body` is the gate's `202` body. Never throws. */
export function isAgentIntentPendingResponse(body: unknown): body is AgentIntentPendingResponse
```

Guard rules: `body` is a non-null, non-array object; `body.intent` likewise; `intent.status === 'pending'`;
`intent.id`, `intent.operationId`, `intent.summary` are non-empty strings; `intent.risk` is `'publish'` or
`'destructive'`; `intent.expiresAt` is a finite number. Anything else → `false` (`{ jobId }`, `{ jobId, status }`,
`null`, strings).

Edits: `packages/core/src/index.ts` — add the `export *` line after L52. `agent-intent-gate.middleware.ts` — delete
the interface at L34-37, add `AgentIntentPendingResponse` to the existing `@beechcms/core` import and add
`export type { AgentIntentPendingResponse } from '@beechcms/core'` so `agent-intent-gate.middleware.test.ts:L13` and
`flow-agent-intents.test.ts:L19` compile unchanged. The literal at L141 keeps its shape.

Tests — unit, `packages/core/src/operations/agent-intent.wire.test.ts`, fixtures: a gate body literal copied from the
shape above, plus the two real non-intent `202` bodies.
- `it('recognises the gate 202 body as a pending intent')` → `true`.
- `it('rejects the import-job and seed-purge 202 bodies')` → matrix `{ jobId }`, `{ jobId, status: 'queued' }` → `false`.
- `it('rejects an intent whose status is not pending')` → `status: 'executed'` → `false`.
- `it('rejects non-object bodies without throwing')` → matrix `null`, `'x'`, `[]`, `{ intent: null }` → `false`.

### Task 2 — `send()` on the API client

**Approach:** add `send(method, path, body?) → Promise<Response>` to `ApiClient` and rebuild `request()` on it.
Reason: the SDK must see the real status and body of every answer (`202` intent vs `202` job, problem codes, 204,
text export); today `request()` hides status and throws on `!ok`.

`packages/api-client/src/client.ts`:

```ts
export interface ApiClient {
  request<T = unknown>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>>
  /** Authenticated request with refresh-on-401 and transient retries; returns the final Response whatever its status. */
  send(method: string, path: string, body?: unknown): Promise<Response>
  readonly baseUrl: string
}
```

Rules for `send`: exactly today's L131-148 (token, one refresh+retry on 401, throws the existing re-authorize
`BeechClientError(…, 401)` when the retry is still 401; 502/503/504 retry loop; offline → existing `BeechClientError`).
It never reads the body and never throws on any other status. `request` = `send` + today's L150-176 unchanged (403
mapping, `!ok` problem mapping, `response.json()`). No change to `ApiResponse`, `resolveApiConfig`, exports, or MCP.

Tests — unit, append to `packages/api-client/src/client.test.ts`, reuse its `freshClient()` (L51) and fetch stub:
- `it('send returns a 404 Response without throwing and without reading its body')` → status 404, `bodyUsed` false.
- `it('send refreshes once on 401 and returns the retried Response')` → one refresh, final status 200.
- `it('send returns a 202 Response with its body intact')` → status 202, `json()` equals the stubbed body.
All 12 existing cases stay green unchanged (regression guard for MCP and control-plane).

### Task 3 — SDK types (`packages/cli/src/sdk/types.ts`)

**Approach:** one hand-written interface `BeechSdk<TRegistry>` (decision 6), its building-block types, and a
mechanical signature rule for the 15 untyped namespaces. Reason: sprint 07 and 08 depend on these names verbatim.

```ts
import type { AgentIntentPending, OperationMethod, OperationRisk, TransferFormat, FilterType } from '@beechcms/core'

/** Any JSON answer the SDK does not model; narrow it in the script. */
export type SdkJson = unknown
export type SdkBody = Record<string, unknown>
export type SdkQueryValue = string | number | boolean | null | readonly unknown[] | Record<string, unknown>
export type SdkQuery = Record<string, SdkQueryValue | undefined>

/** Structural stand-in for `beech types generate` output (`SeedRegistryTypes`). */
export type SeedRegistryShape = Record<string, Record<string, unknown>>
export type SeedSlug<TRegistry> = keyof TRegistry & string

/** Outcome of every non-read method. Discriminated by `kind`. */
export type WriteOutcome<T> =
  | { kind: 'executed'; status: number; data: T }
  | { kind: 'pending'; intent: AgentIntentPending }
  | { kind: 'dry-run'; call: SdkCallRecord }

export interface SdkCallRecord {
  operationId: string
  method: OperationMethod
  /** Path with query string, as sent (or as it would have been sent). */
  path: string
  /** Effective risk for this request (`resolveOperationRisk`). */
  risk: OperationRisk
  outcome: 'executed' | 'pending' | 'dry-run' | 'error'
  /** HTTP status; `null` for dry-run. */
  status: number | null
  /** Request body; present only on `dry-run` records. */
  body?: unknown
}

/** Everything a script did, in call order. `beech run` (sprint 07) prints it. */
export interface SdkJournal {
  readonly calls: readonly SdkCallRecord[]
  readonly pendingIntents: readonly AgentIntentPending[]
}

export interface SdkRequest { method: OperationMethod; path: string; body?: unknown }
export interface SdkTransport { send(request: SdkRequest): Promise<Response> }

/** Time source for polling; injected so tests never sleep. */
export interface SdkClock { now(): number; sleep(ms: number): Promise<void> }

export interface BeechSdkOptions {
  transport: SdkTransport
  /** Record non-read calls instead of sending them. Default false. */
  dryRun?: boolean
  /** Used only for the storage PUT of presigned uploads. Default `globalThis.fetch`. */
  fetch?: typeof fetch
  /** Default: `Date.now` + `setTimeout`. */
  clock?: SdkClock
}

type SystemKey = 'id' | 'slug' | 'status' | 'created_at' | 'updated_at'

export interface SdkEntry<TRow> {
  id: string
  slug: string | null
  status: string
  created_at: number | null
  updated_at: number | null
  deleted_at?: number | null
  has_pending_draft?: boolean
  data: Omit<TRow, SystemKey>
}

/** Create/update body: branch aliases plus the optional system fields the handlers read. */
export type EntryInput<TRow> = Partial<Omit<TRow, SystemKey>> & { slug?: string; status?: string }

export interface ContentFilterCondition { op: 'eq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'is_empty' | 'is_not_empty'; value: string | number | boolean | null }
export interface ContentFilterGroup { columnId: string; type: FilterType; conditions: ContentFilterCondition[] }

export interface ContentListQuery {
  page?: number
  limit?: number
  search?: string
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  filters?: ContentFilterGroup[]
}
export interface ContentPage<TRow> { items: SdkEntry<TRow>[]; total: number; page: number; limit: number }
export interface TrashPage<TRow> extends ContentPage<TRow> { retentionDays: number }
export interface SdkProblem { status: number; type: string; detail: string }
export interface BulkUpdateResult { updated: string[]; failed: { id: string; problem: SdkProblem }[] }
export interface BulkTrashResult { succeeded: string[]; failed: { id: string; problem: SdkProblem }[] }

export interface ImportJob {
  id: string
  targetSeed: string
  format: TransferFormat
  state: 'pending' | 'processing' | 'completed' | 'failed'
  rowsRead: number
  insertedRows: number
  failedRows: number
  errors: unknown[]
  createdAt: number
  updatedAt: number
  finishedAt: number | null
}

export interface ListAllOptions extends Omit<ContentListQuery, 'page' | 'limit'> {
  /** Refuse (throw `list_cap_exceeded`) when the seed holds more matching entries. Default 5000. */
  maxItems?: number
}
export interface UploadFileInput { filename: string; mimeType: string; data: Uint8Array }
export interface ImportFileInput { filename: string; format: TransferFormat; data: Uint8Array }
export interface WaitOptions { intervalMs?: number; timeoutMs?: number }
```

Verify `updated`/`succeeded` element types against `bulk.handler.ts` and `trash.ts:L120-131` before finalising; if the
repository returns objects rather than ids, type them as returned and note it in the execution log.

**The four typed namespaces** (verbatim; `R` = `TRegistry`, `K extends SeedSlug<R>`):

```ts
export interface ContentNamespace<R> {
  list<K extends SeedSlug<R>>(slug: K, query?: ContentListQuery): Promise<ContentPage<R[K]>>
  get<K extends SeedSlug<R>>(slug: K, id: string): Promise<SdkEntry<R[K]>>
  getBySlug<K extends SeedSlug<R>>(slug: K, entrySlug: string): Promise<SdkEntry<R[K]>>
  facets(slug: SeedSlug<R>, query?: SdkQuery): Promise<SdkJson>
  backrefs(targetSlug: SeedSlug<R>, targetId: string, query?: SdkQuery): Promise<SdkJson>
  create<K extends SeedSlug<R>>(slug: K, body: EntryInput<R[K]>): Promise<WriteOutcome<{ id: string }>>
  update<K extends SeedSlug<R>>(slug: K, id: string, body: EntryInput<R[K]>): Promise<WriteOutcome<{ success: true }>>
  bulkUpdate<K extends SeedSlug<R>>(slug: K, body: { ids: string[]; fields: Partial<Omit<R[K], SystemKey>> }): Promise<WriteOutcome<BulkUpdateResult>>
  delete(slug: SeedSlug<R>, id: string, query?: { purge?: 'true' }): Promise<WriteOutcome<{ success: true; softDeleted: boolean }>>
  kanbanMove(slug: SeedSlug<R>, id: string, body: SdkBody): Promise<WriteOutcome<SdkJson>>
  export(slug: SeedSlug<R>, query?: { format?: TransferFormat; safe?: boolean; search?: string; filters?: ContentFilterGroup[] }): Promise<string>
  import(slug: SeedSlug<R>, body: { objectKey: string; format: TransferFormat }): Promise<WriteOutcome<{ jobId: string }>>
  importStatus(jobId: string): Promise<ImportJob>
  // helpers (Task 7)
  listAll<K extends SeedSlug<R>>(slug: K, options?: ListAllOptions): Promise<SdkEntry<R[K]>[]>
  importFile(slug: SeedSlug<R>, input: ImportFileInput, wait?: WaitOptions): Promise<WriteOutcome<ImportJob>>
  waitForImport(jobId: string, options?: WaitOptions): Promise<ImportJob>
}

export interface TrashNamespace<R> {
  list<K extends SeedSlug<R>>(slug: K, query?: { page?: number; limit?: number }): Promise<TrashPage<R[K]>>
  restore(slug: SeedSlug<R>, id: string): Promise<WriteOutcome<{ success: true; slug: string | null }>>
  bulkRestore(slug: SeedSlug<R>, body: { ids: string[] }): Promise<WriteOutcome<BulkTrashResult>>
  bulkPurge(slug: SeedSlug<R>, body: { ids: string[] }): Promise<WriteOutcome<BulkTrashResult>>
  reconcile(slug: SeedSlug<R>, body?: SdkBody): Promise<WriteOutcome<SdkJson>>
}

export interface MediaNamespace {
  presign(body: { filename: string; mimeType: string; sizeBytes: number; purpose?: 'import' }): Promise<WriteOutcome<{ uploadUrl: string; key: string; expiresIn: number }>>
  confirm(body: { key: string }): Promise<WriteOutcome<{ url: string }>>
  downloadUrl(key: string): Promise<SdkJson>
  delete(key: string): Promise<WriteOutcome<SdkJson>>
  // helper (Task 7)
  uploadFile(input: UploadFileInput): Promise<WriteOutcome<{ key: string; url: string }>>
}

export interface IntentsNamespace {
  list(): Promise<SdkJson>
  get(id: string): Promise<SdkJson>
  reject(id: string): Promise<WriteOutcome<SdkJson>>
}
```

**Mechanical rule for the other 15 namespaces** (`settings schema layout seeds users roles assignments invitations
notifications stats drafts views widgets search automations`): one method per agent operation of that domain, named
by the part of the id after the dot (`drafts.publish` → `drafts.publish(...)`). Parameters, in order: one `string`
per `:param` of the catalog `path`, in path order (named after the param, camelCased: `schema_slug` → `schemaSlug`);
then `query?: SdkQuery` for `GET`/`DELETE`, or `body?: SdkBody` for `POST`/`PUT`/`PATCH`. Return:
`Promise<SdkJson>` when the catalog risk is the static string `'read'`, otherwise `Promise<WriteOutcome<SdkJson>>`.
Each namespace is an exported interface (`SettingsNamespace`, `SeedsNamespace`, …).

```ts
export interface BeechSdk<R = SeedRegistryShape> {
  content: ContentNamespace<R>; trash: TrashNamespace<R>; drafts: DraftsNamespace; views: ViewsNamespace
  seeds: SeedsNamespace; schema: SchemaNamespace; layout: LayoutNamespace
  users: UsersNamespace; roles: RolesNamespace; assignments: AssignmentsNamespace; invitations: InvitationsNamespace
  settings: SettingsNamespace; automations: AutomationsNamespace
  stats: StatsNamespace; widgets: WidgetsNamespace; search: SearchNamespace; notifications: NotificationsNamespace
  media: MediaNamespace; intents: IntentsNamespace
}

/** Narrowing helpers for script authors. */
export function isPending<T>(outcome: WriteOutcome<T>): outcome is Extract<WriteOutcome<T>, { kind: 'pending' }>
export function isExecuted<T>(outcome: WriteOutcome<T>): outcome is Extract<WriteOutcome<T>, { kind: 'executed' }>
```

(`isPending`/`isExecuted` are one-line runtime functions; put them in `invoke.ts` and re-export from `index.ts`.)

### Task 4 — CLI OAuth constants (`packages/cli/src/lib/control-plane.ts`)

**Approach:** one scope string for every CLI tool that uses `beech-mcp-cli`. Reason: shared token-cache key (Section 2).

```ts
export const CLI_OAUTH_CLIENT_ID = 'beech-mcp-cli'          // existing, L20
export const CLI_CALLBACK_PATH = '/callback'                 // existing L23, now exported
/** Every v2 scope except `agent:approve`: scripts can read and reject intents, never approve them (ROADMAP §4.5). */
export const CLI_OAUTH_SCOPE: string = OAUTH_SCOPES.filter(scope => scope !== 'agent:approve').join(' ')
```

`createControlPlane` L91 uses `CLI_OAUTH_SCOPE`. It equals migration 0046's `allowed_scopes` for `beech-mcp-cli`;
the dashboard consent templates still narrow the grant.

### Task 5 — Method map (`packages/cli/src/sdk/operations.ts`)

**Approach:** a literal, hand-written map from SDK method to catalog id, type-checked against `BeechSdk` with
`satisfies`. Reason: key parity with the interface is enforced by the compiler; id/route correctness by Task 9.

```ts
export const SDK_HELPER_METHODS = ['content.listAll', 'content.importFile', 'content.waitForImport', 'media.uploadFile'] as const
type HelperKey = 'listAll' | 'importFile' | 'waitForImport' | 'uploadFile'

export type SdkOperationMap = {
  readonly [N in keyof BeechSdk]: { readonly [M in Exclude<keyof BeechSdk[N], HelperKey>]: string }
}

/** SDK method → catalog operation id. Rule: the value is always `${namespace}.${method}`. */
export const SDK_OPERATIONS = { content: { list: 'content.list', /* … all 108 … */ }, /* … */ } as const satisfies SdkOperationMap

/** Agent operations deliberately without an SDK method, with the reason. Exactly these two. */
export const SDK_OMITTED_OPERATIONS: Readonly<Record<string, string>> = {
  'intents.approve': 'Scripts never approve their own intents; approval is a human dialog in the MCP server (ROADMAP §4.5).',
  'media.upload': 'Multipart upload streams bytes through the Worker; media.uploadFile uses presign + PUT + confirm.',
}
```

Write the map grouped by namespace in the order of `BeechSdk` (one line per method). 108 entries.

### Task 6 — Invocation core (`packages/cli/src/sdk/invoke.ts`, `errors.ts`)

```ts
export class BeechSdkError extends Error {
  readonly name = 'BeechSdkError'
  constructor(
    message: string,
    readonly status: number,          // 0 = API unreachable
    readonly code: string | null,     // machine code (see rules)
    readonly operationId: string,
    readonly body: unknown,
  )
}

export const SDK_ERROR_CODES = {
  UNREACHABLE: 'unreachable',
  UNAUTHORIZED: 'unauthorized',
  INVALID_JSON: 'invalid_json',
  LIST_CAP_EXCEEDED: 'list_cap_exceeded',
  STORAGE_PUT_FAILED: 'storage_put_failed',
  IMPORT_WAIT_TIMEOUT: 'import_wait_timeout',
} as const

/** Internal. One SDK call: builds the request from the catalog, applies dry-run, maps the answer. */
export interface SdkInvoker {
  call(operationId: string, pathParams: readonly string[], input: { query?: SdkQuery; body?: unknown }): Promise<unknown>
  readonly journal: SdkJournal
  readonly options: Required<Pick<BeechSdkOptions, 'dryRun'>> & { fetch: typeof fetch; clock: SdkClock }
}
export function createInvoker(options: BeechSdkOptions): SdkInvoker
```

Rules for `call` (in order):
1. Look up `operationId` in a `Map` built once from `OPERATION_CATALOG`. Unknown id, or `exposure !== 'agent'`, or id
   in `SDK_OMITTED_OPERATIONS` → throw a plain `Error` (programming error, never reached by a correct map).
2. Path: replace each `:param` segment of `op.path`, in order, with `encodeURIComponent(pathParams[i])`. Arity
   mismatch → plain `Error`. (`media.*` keys may contain `/`; encoding is the contract, see `upload/index.ts` decode.)
3. Query: drop `undefined` values; primitives → `String(v)`; arrays/objects → `JSON.stringify(v)`; keys in insertion
   order; appended as `?…` only when non-empty. **`content.list` always sends `page`** (default `1`) so the answer is
   always the paged shape, never the bare array of `list.ts:L217`.
4. Risk: `resolveOperationRisk(op, { query: <string query>, body })`.
5. Dry-run: when `dryRun` and risk ≠ `'read'` → push `{ …, outcome: 'dry-run', status: null, body }` to the journal,
   return `{ kind: 'dry-run', call }`. Nothing is sent. Reads are sent normally.
6. Send via `transport.send({ method: op.method, path, body })`. The transport may throw `BeechSdkError`
   (adapter) — record `outcome: 'error'` and rethrow.
7. Parse: status 204 or empty text → `null`; `Content-Type` containing `json` → `JSON.parse` (failure →
   `BeechSdkError` `invalid_json`); otherwise the text.
8. Status `202` **and** `isAgentIntentPendingResponse(parsed)` → push intent to `journal.pendingIntents`, record
   `pending`, return `{ kind: 'pending', intent }`. Any other 2xx → record `executed`; return `parsed` for static
   `'read'` operations, `{ kind: 'executed', status, data: parsed }` otherwise. (Regression guard: import `202 { jobId }`
   is `executed`.)
9. Non-2xx → record `error`, throw `BeechSdkError(message, status, code, operationId, parsed)`.
   `code` = `parsed.type` if string, else `parsed.error` if string matching `/^[a-z0-9_-]+$/`, else `null`.
   `message` = `` `${operationId} failed (${status}): ${detail}` `` where `detail` = first string of
   `parsed.detail`, `parsed.error_description`, `parsed.error`, else the status text.

The journal arrays are append-only and exposed read-only; records never include request headers or tokens.

### Task 7 — Helpers (`packages/cli/src/sdk/helpers.ts`)

Each helper receives the invoker and the already built namespaces; no helper calls `transport` directly.

- **`content.listAll(slug, options)`** — pages with `limit: 100` (server max, `list.ts:L137`) from page 1. After the
  first page, if `total > maxItems` (default `5000`) throw `list_cap_exceeded` (status 0, body `{ total, maxItems }`)
  before fetching more. Stop when collected `>= total` or a page returns zero items (guards a total that shrinks
  mid-walk). Sequential, never parallel. Returns the concatenated `items`.
- **`media.uploadFile({ filename, mimeType, data })`** — `media.presign({ filename, mimeType, sizeBytes:
  data.byteLength })`; a non-`executed` outcome is returned as is (dry-run → no PUT). Then `options.fetch(uploadUrl,
  { method: 'PUT', headers: { 'Content-Type': mimeType }, body: data })`; non-2xx → `storage_put_failed`
  (status = PUT status, `operationId: 'media.uploadFile'`), confirm not called. Then `media.confirm({ key })`; return
  `{ kind: 'executed', status, data: { key, url } }`. The PUT is recorded in nothing (it is not an API operation) and
  never carries the bearer token.
- **`content.importFile(slug, { filename, format, data }, wait?)`** — presign with `purpose: 'import'` and MIME
  `csv → 'text/csv'`, `ndjson → 'application/json'` (`transfer.api.ts:L48-51`), PUT as above, **no confirm** (an
  import file is transport; the worker deletes it — `transfer.api.ts:L104-110`). Then `content.import(slug,
  { objectKey: key, format })`: `pending` or `dry-run` → return it unchanged (no polling). `executed` → return
  `{ kind: 'executed', status, data: await waitForImport(jobId, wait) }`.
- **`content.waitForImport(jobId, { intervalMs = 1000, timeoutMs = 300_000 })`** — poll `content.importStatus`
  until `state` is `completed` or `failed` and return the job (a `failed` job is returned, not thrown: the script
  reads `errors`). Sleep through `clock.sleep(intervalMs)` between polls; when `clock.now() - start >= timeoutMs`
  throw `import_wait_timeout` (body = last job).

### Task 8 — Assembly, transport, public surface, build

**`create-sdk.ts`:**

```ts
export interface BeechSdkHandle<R> { sdk: BeechSdk<R>; journal: SdkJournal }
export function createBeechSdk<R = SeedRegistryShape>(options: BeechSdkOptions): BeechSdkHandle<R>
```

Builds one invoker, then for every `SDK_OPERATIONS[ns][method]` a function `(...args) =>` splitting `args` into the
first `n` path params (`n` = `:param` count of the catalog path) and the next argument as `query` (`GET`/`DELETE`) or
`body` (others); attaches the four helpers; one documented cast to `BeechSdk<R>` (key parity is guaranteed by
`satisfies`, behaviour by Task 9). Default clock: `{ now: Date.now, sleep: ms => new Promise(r => setTimeout(r, ms)) }`.

**`api-client-transport.ts`** (the only `src/sdk/` file that may import `@beechcms/api-client`):

```ts
export function createApiClientTransport(options?: { apiUrl?: string }): SdkTransport & { readonly baseUrl: string }
```

Uses `resolveApiConfig({ baseUrl: options?.apiUrl, clientId: CLI_OAUTH_CLIENT_ID, scope: CLI_OAUTH_SCOPE,
callbackPath: CLI_CALLBACK_PATH })` + `createApiClient`; `send` → `client.send(method, path, body)`. Maps a thrown
`BeechClientError` with `status === 401` → `BeechSdkError(…, 401, 'unauthorized', '', null)`, without status →
`BeechSdkError(…, 0, 'unreachable', '', null)`; the `operationId` is filled by the invoker when it rethrows (rule 6:
wrap, do not mutate). Copy the config call shape of `control-plane.ts:L88-93`.

**`index.ts`** (public, `@beechcms/cli/sdk`): `export type` every type of `types.ts` plus `BeechSdkHandle`;
runtime exports only `BeechSdkError`, `SDK_ERROR_CODES`, `isPending`, `isExecuted`. Never exports `createBeechSdk`,
`createApiClientTransport`, `createInvoker`, `SDK_OPERATIONS` (sprint 07 imports them by source path inside the CLI).

**Build** (`packages/cli`):
- `tsconfig.sdk.json`: extends `./tsconfig.json`; `compilerOptions`: `noEmit: false`, `declaration: true`,
  `emitDeclarationOnly: true`, `composite: false`, `declarationMap: false`, `rootDir: "src"`, `outDir: "dist"`,
  `tsBuildInfoFile` removed; `include: ["src/sdk/index.ts"]`. Emits `dist/sdk/*.d.ts` for the barrel's import graph
  (which never reaches `api-client-transport.ts` — Task 9 checks it).
- `package.json`: `exports["./sdk"] = { "types": "./dist/sdk/index.d.ts", "import": "./dist/sdk/index.js" }`;
  `build` appends `&& tsc -p tsconfig.sdk.json && esbuild src/sdk/index.ts --bundle --external:@beechcms/core
  --platform=node --format=esm --outfile=dist/sdk/index.js`. No dependency changes.

### Task 9 — Tests

All unit tests below use a **recording transport** declared inside each `describe` (Rule 3.12): an object whose
`send` stores `{ method, path, body }` and returns a queued `new Response(...)`. It is the HTTP boundary (Rule 3.10).
Fixture source: catalog ids/paths from `@beechcms/core`; response bodies are the wire shapes of Section 2.

**`packages/cli/src/test/sdk-parity.test.ts`** — unit.
- `it('every agent operation is an SDK method or a reasoned omission')` → set(`SDK_OPERATIONS` values) ∪
  keys(`SDK_OMITTED_OPERATIONS`) equals set of agent ids.
- `it('every SDK method names an agent operation spelled namespace.method')` → each value equals
  `${ns}.${method}`, exists in the catalog, `exposure: 'agent'`.
- `it('omits exactly intents.approve and media.upload, each with a reason')` → keys sorted equal; reasons non-empty.
- `it('each method sends the method and path its catalog operation matches')` → matrix over all 108: call with
  placeholder path params `p0…pn` (and `{}` body for writes) through `createBeechSdk`; `matchOperation(method,
  pathname)` of the recorded request returns that id.
- `it('read operations resolve to the raw body and others to an executed outcome')` → matrix: queue `200 {"ok":1}`;
  static `'read'` → `{ ok: 1 }`, others → `kind: 'executed'`.
- `it('the public barrel never reaches the api-client adapter')` → read `src/sdk/*.ts` with `node:fs`: only
  `api-client-transport.ts` contains `@beechcms/api-client`, and no file reachable from `index.ts` imports
  `./api-client-transport`. (File read of the package's own source; comment why — it guards the published d.ts.)

**`packages/cli/src/test/sdk-invoke.test.ts`** — unit.
- `it('encodes path params, so a storage key with a slash stays one segment')` → `media.delete('imports/u/a.csv')`
  path ends `/api/upload/imports%2Fu%2Fa.csv`.
- `it('drops undefined query values and JSON-encodes filters')` → `content.list('posts', { search: undefined,
  filters: [g] })` → query has `page=1` and `filters=<JSON>`, no `search`.
- `it('content.list always asks for a page, so the answer is never the bare array')` → no query → `?page=1`.
- `it('a 202 gate body becomes a pending outcome and lands in the journal')` → `content.delete(…, { purge: 'true' })`
  → `kind: 'pending'`; `journal.pendingIntents` has the id; call record `outcome: 'pending'`, `risk: 'destructive'`.
- `it('a 202 import-job body is an executed outcome, not an intent')` → regression guard; `data.jobId` set,
  `pendingIntents` empty.
- `it('a problem body becomes BeechSdkError with its type as code')` → 404 `{ type: 'content-not-found', … }` →
  rejects with `status 404`, `code 'content-not-found'`, `operationId 'content.get'`.
- `it('an OAuth error body becomes BeechSdkError with its error as code')` → 403 `insufficient_scope`.
- `it('a 204 answer is executed with null data')`.
- `it('export returns the text body unchanged')` → `text/csv` body → string.
- `it('dry-run records a write with its body and sends nothing')` → `content.create('posts', { status: 'published' })`
  → `kind: 'dry-run'`, recorded `risk: 'publish'`, transport saw 0 requests.
- `it('dry-run still sends reads')` → `content.get` hits the transport once.

**`packages/cli/src/test/sdk-helpers.test.ts`** — unit; injected `SdkClock` (manual `now`, `sleep` that advances it)
and injected `fetch` stub (the storage boundary). No fake timers (Rule 3.11).
- `it('listAll walks pages of 100 until it holds total entries')` → total 205 → 3 requests, 205 items.
- `it('listAll stops on an empty page even if total says more')`.
- `it('listAll refuses above maxItems after the first page')` → rejects `list_cap_exceeded`, 1 request.
- `it('uploadFile presigns, PUTs the bytes without a bearer token, then confirms')` → order presign → PUT → confirm;
  PUT headers have no `Authorization`; outcome data `{ key, url }`.
- `it('uploadFile does not confirm when the storage PUT fails')` → `storage_put_failed`, no confirm request.
- `it('uploadFile in dry-run never PUTs')` → fetch stub not called, `kind: 'dry-run'`.
- `it('importFile presigns for import with the format MIME and never confirms')` → presign body
  `purpose: 'import'`, `mimeType: 'application/json'` for ndjson; no `/api/upload/confirm` request.
- `it('importFile returns a pending import without polling')` → import answers gate 202 → `kind: 'pending'`, no
  `import-jobs` request.
- `it('waitForImport returns a failed job instead of throwing')`.
- `it('waitForImport times out with import_wait_timeout')` → clock passes `timeoutMs`.

**`packages/cli/src/test/sdk-transport.test.ts`** — unit; `vi.mock('@beechcms/api-client', …)` at top (Rule 3.9),
boundary only.
- `it('asks for the CLI client, callback and scope')` → `resolveApiConfig` called with `clientId 'beech-mcp-cli'`,
  `callbackPath '/callback'`, `scope` = `CLI_OAUTH_SCOPE`, and `CLI_OAUTH_SCOPE` lacks `agent:approve`.
- `it('maps a 401 client error to BeechSdkError unauthorized')`.
- `it('maps an unreachable API to BeechSdkError status 0 unreachable')`.

**`apps/api/test/flow/flow-script-sdk.test.ts`** — flow tier (real `createBeechApp`, `D1TestDatabase`, real OAuth
token from the consent flow, MinIO). Docblock: covers SDK helpers and the intent outcome against the real API; the
method ↔ catalog parity is unit-tested in `packages/cli/src/test/sdk-parity.test.ts`.
Setup copies `flow-agent-intents.test.ts:L77-96`: `seedTestUsers`, `FixedClock`, `createBeechApp({ seeds: [],
authProviders: { clock }, jobs: contentImportJobs })`, login, `createTargetSeed` (seed `articles`), script token via
`issueToken(app, db, adminToken, CLI_SCOPES, 'state-sdk')` (client `beech-mcp-cli`). SDK built with
`createBeechSdk({ transport })` where the local `transport.send` calls `app.request(path, { method, headers:
{ Authorization, 'Content-Type' }, body: JSON.stringify(body) }, env())`; storage PUTs use the real global `fetch`
to MinIO. Import the SDK by relative source path (`../../../../packages/cli/src/sdk/create-sdk`), as
`client-sdk-e2e.test.ts:L10-11` does. Entries are created through `sdk.content.create` (the real route, Rule 3.8).
- `it('listAll returns every entry of a seed across two pages')` → arrange 101 entries; 101 unique ids, each
  `UUID_V4_PATTERN`.
- `it('uploadFile stores the object in MinIO and registers it in media_objects')` → PNG signature bytes
  (`flow-media-assets.test.ts:L27`); outcome executed; `HeadObject` on the key succeeds; one `media_objects` row.
- `it('importFile imports NDJSON rows and removes the transport object')` → 3 rows `{ title }`; job `completed`,
  `insertedRows 3`; `content.listAll` holds the 3 titles; `HeadObject` on the import key → not found.
- `it('a purge with the script token returns a pending intent and leaves the entry in place')` →
  `content.delete('articles', id, { purge: 'true' })` → `kind: 'pending'`, `operationId 'content.delete'`;
  `agent_intents` row `pending`; entry still readable.
- `it('dry-run writes nothing and still reads')` → `create` + `delete` in dry-run: `content_articles` count
  unchanged, journal has two `dry-run` records, a `content.list` read returned the live total.
- `it('a token without content:write gets BeechSdkError insufficient_scope and writes nothing')` → second token
  with scope `'schema:read content:read'`; `create` rejects `status 403`, `code 'insufficient_scope'`; row count 0.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

```bash
pnpm --filter @beechcms/core build
pnpm --filter @beechcms/core exec vitest run src/operations/agent-intent.wire.test.ts
pnpm --filter @beechcms/api-client type-check && pnpm --filter @beechcms/api-client test
pnpm --filter @beechcms/cli build            # tsc + esbuild + tsconfig.sdk.json + sdk bundle
ls packages/cli/dist/sdk/index.js packages/cli/dist/sdk/index.d.ts
! grep -r "api-client" packages/cli/dist/sdk/*.d.ts
pnpm --filter @beechcms/cli test
pnpm --filter @beechcms/mcp type-check && pnpm --filter @beechcms/mcp test
(cd apps/api && npx tsc --noEmit)
pnpm beech dev    # Docker stack (MinIO) for the flow tier; or start Docker Desktop
pnpm --filter @beechcms/api exec vitest run --project flow flow-script-sdk.test.ts flow-agent-intents.test.ts flow-media-assets.test.ts
pnpm --filter @beechcms/api exec vitest run --project unit src/middleware/agent-intent-gate.middleware.test.ts src/factory.operations-parity.test.ts
pnpm lint
pnpm beech test --diff
```

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `AgentIntentPendingResponse` lives in `@beechcms/core`; the gate middleware has no local copy; gate behaviour
      and its two existing test importers unchanged.
- [ ] `ApiClient.send()` exists; all pre-existing `api-client` tests pass unmodified; MCP builds and tests unchanged.
- [ ] `SDK_OPERATIONS` has 108 entries, `satisfies SdkOperationMap` (compiler-enforced key parity with `BeechSdk`).
- [ ] Parity test passes: agent ops = SDK methods ∪ {`intents.approve`, `media.upload`}; every method's request
      resolves through `matchOperation` to its own id.
- [ ] No SDK method, scope or code path can call `POST /api/agent/intents/:id/approve`; `CLI_OAUTH_SCOPE` lacks
      `agent:approve`.
- [ ] Intent detection is by `isAgentIntentPendingResponse`, never by status alone (import `202` test green).
- [ ] Dry-run sends zero non-read requests (unit + flow assert it).
- [ ] Helpers: `listAll` cap and empty-page guard, `uploadFile` presign→PUT→confirm, `importFile` presign→PUT→import
      →wait with no confirm, `waitForImport` timeout — all green; flow suite green against test D1 + MinIO.
- [ ] `@beechcms/cli/sdk` resolves to `dist/sdk/index.js` + `dist/sdk/index.d.ts`; the d.ts never mentions
      `@beechcms/api-client`; `package-dependencies.test.ts` green (no new runtime dependency).
- [ ] No `any` in SDK source or tests; SPDX headers (MIT in `packages/*` source, BUSL in `apps/api` tests).
- [ ] `pnpm lint`, `npx tsc --noEmit` in `apps/api`, `pnpm --filter @beechcms/cli build` clean.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

- `beech run`, `defineScript`, `.beech/scripts/`, `beech agent setup`, console/`--out` rendering of the journal →
  **sprint 07 BeechRun** (ROADMAP §6 row 07). `createBeechSdk` and the transport stay internal until then.
- `beech_whoami`, `beech_search` (SDK signatures in search results), `beech_intents`, `beech_confirm`, MCP version fix
  → **sprint 08 Mcp2**. `packages/mcp` is not edited.
- SDK docs page, "agente in locale" guide, evals → **sprint 09 DocsEvals**. No `docs/` edit in this sprint.
- Precise response types for the 15 mechanically-typed namespaces (they return `SdkJson`); generating types from Zod
  or OpenAPI (decision 6: hand-written).
- `/api/v1/public/*` in the SDK (decision 8, deferred); an SDK method for `intents.approve` or multipart
  `POST /api/upload` (reasoned omissions).
- Client-side redaction of confidential fields: the API already applies per-actor visibility (`applyVisibility`,
  `apply-policies.ts:L86`); the SDK adds none.
- A `jobs` namespace or waiting on seed purge jobs (`seeds.purgeStatus` is a plain read).
- Any change to routes, `PROTECTED_ROUTES`, the catalog, the gate's behaviour, migrations, or `apps/dashboard`.
- Fixing issue #967 (`db:migrate` on an initialised local DB) or the `GET /api/seeds/:slug` on deleted seeds note.
