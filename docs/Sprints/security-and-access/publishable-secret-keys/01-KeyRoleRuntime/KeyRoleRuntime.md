# Sprint Plan — KeyRoleRuntime (publishable & secret keys, sprint 01)

Roadmap: `stages/01_sprint_planning/output/backlog/ROADMAP.md`, row 01. Feature brief:
`stages/00_ideation/output/feature_brief.md` (issue #995, #996, #997). This is the first sprint of four. The
shared decisions table in the ROADMAP (binding names, local values, client config shape, command name) is fixed
here and binds sprints 02-04.

**Re-plan (2026-11-24) after the stage 02 rejection** (`output/rejections.md`). T1-T7 are already implemented on
`feature/key-role-runtime` (uncommitted). The executor checks them against this plan and does not redo them. What changed:

| # | Rejection | Resolution |
|---|---|---|
| 1 | Public `POST /:seed/add` returns 500 on any seed with a relation branch (`sanitize.ts:38` passes no `idGenerator`) | **Fixed in this sprint: new T8.** `sanitizePublicPayload` requires an `IIdGenerator`, and both callers pass `context.get('idGenerator')`. Why: this is the secret-key write path the sprint documents (#997). Sprint 02's smoke test needs `beech_sk_dev` → 201. The same bug also breaks `PUT /:seed/edit` on `posts` (`public-edit.ts:141`). The two T6 tests stay on canonical `posts`, and T6 gains a relation-validation case and an edit case. SECTION 7 now carves out exactly this change. |
| 2 | The closing grep cannot return "no hits" | SECTION 5 now runs three scoped greps, each with its expected result stated. |
| 3 | Commands not run | They are unchanged in SECTION 5 and run once T8 is green. |
| 4 | `@beechcms/testing` resolves through `dist` | `pnpm --filter @beechcms/testing build` is added to SECTION 5, before the api type-check. |

### Pre-Computation Analysis

**Graph refresh:** `graphify update . --force` → 33056 nodes, 48350 edges, 3163 communities (2026-11-24, re-plan run).

**a) God Nodes (via `graphify explain`)**

| Node | Source | Degree | Why it matters here |
|---|---|---|---|
| `createBeechApp()` | `apps/api/src/factory.ts:L106` | 180 | Registers `apiKeyMiddleware()` at `factory.ts:246`. Its *registration* is unchanged, but every flow suite that builds the app with `TEST_ENV` goes through the new decision. |
| `publicProblem()` | `apps/api/src/public/errors/problem-details.ts:L124` | 111 | Every new denial goes out through it. Its signature is not touched. Its status union (`problem-details.ts:82`) already contains 401 and 403. |
| `apiKeyMiddleware()` | `apps/api/src/public/middleware/api-key-middleware.ts:L30` | 6 | Rewritten to call the shared decision. Callers: `createBeechApp`, `public/index.ts` re-export, its own test. |
| `validateClientConfig()` | `packages/client/src/http.ts:L6` | — | Replaced. Callers: `createBeechBrowserClient`, `createBeechServerClient`, `http.test.ts`, `apps/api/test/client-sdk-e2e.test.ts`. |

**b) Architectural boundaries affected**

- `@beechcms/core`: **no change**. `timingSafeEqual` (already imported by both the middleware and the add handler) stays the
  only primitive used. No DB access is involved anywhere in this sprint.
- `apps/api`, **public slice only** (`apps/api/src/public/**`): a new module `middleware/public-key-auth.ts` is shared by
  `middleware/api-key-middleware.ts` and `handlers/public-add.ts`. Both are in the same slice. Also changed:
  `errors/public-errors.ts`, and the `Env` bindings in `apps/api/src/types.ts`.
- `packages/client`: config types, config validation, both client factories.
- `packages/testing`: `env.ts` fixture constants and their re-export in `index.ts`.
- Monorepo dev config: `apps/api/wrangler.jsonc`, `apps/api/.dev.vars.example`, `scripts/dev-cli/orchestrator.ts`,
  `e2e/playwright.config.ts`, `e2e/tests/rate-limit.e2e.ts`.
- `apps/dashboard`: **untouched** (no reference to the public keys; verified by grep).

**c) `graphify affected` impact analysis**

```
graphify affected "apiKeyMiddleware" --depth 2
- factory.ts / createBeechApp()            apps/api/src/factory.ts:L1, L106
- index.ts [re_exports]                    apps/api/src/public/index.ts:L1
- api-key-middleware.test.ts / buildApp()  apps/api/src/public/middleware/api-key-middleware.test.ts:L1, L9
- factory.{csp,custom-routes,docs-parity,operations-parity}.test.ts, src/index.ts
- 27 flow suites under apps/api/test/flow/ (flow-guest-access.test.ts is the only one that sends X-API-Key)
- public-add.test.ts, test/helpers/oauth-flow.ts, rbac account-email.integration.test.ts

graphify affected "publicAddHandler" --depth 2
- public-routes.ts, public/index.ts, factory.ts, test/core-validation.test.ts

graphify affected "validateClientConfig" --depth 2   (and "BeechClientConfig", "createBeechServerClient")
- packages/client/src/{browser,server}/client.ts, {browser,server}/index.ts, src/index.ts (type re-export)
- http.test.ts, browser-client.test.ts, server-client.test.ts
- apps/api/test/client-sdk-e2e.test.ts (imports client sources by relative path)

graphify affected "sanitizePublicPayload" --depth 2   (re-plan, T8)
- public-add.ts / publicAddHandler()        apps/api/src/public/handlers/public-add.ts:L131
- public-edit.ts / resolveData() -> publicEditHandler()   public-edit.ts:L64, L176
- public/index.ts [re_exports] -> public-routes.ts, factory.ts
- apps/api/test/core-validation.test.ts     (the only test caller, 2 calls at L101, L112)

graphify path "publicAddHandler" "apiKeyMiddleware"
- 2 hops, only through the public/index.ts barrel: no direct coupling today. The duplicated key check is
  textual (public-add.ts:169-183 vs api-key-middleware.ts:37-58). This sprint removes it.
```

Breaking-change census (grep for `PUBLIC_READ_API_KEY|PUBLIC_WRITE_API_KEY|TEST_PUBLIC_(READ|WRITE)_KEY`, excluding
docs and stages): 26 code and test files, all listed in SECTION 3. The breaks are intended (product decision: no legacy
support). Everything outside this list is docs (sprint 04), scaffolder (02) or CLI (02, 03).

### VETO Audit

| Rule (`_config/ponytail_arch.md`) | Assessment |
|---|---|
| 1. YAGNI | Two fixed roles, one decision function, two new problem types. **Rejected inside this audit:** a key registry table, per-seed key scopes, a shared constants package for the `beech_*` prefixes, an `ENV`-based "accept dev key" switch, and runtime fallback reads of the legacy names. None is required by the brief, and the brief explicitly drops the last two. The constants stay local to each package: `@beechcms/client` has zero dependencies and must not gain `@beechcms/core` for one string. |
| 2. Botanical invariant (T8) | `sanitizePublicPayload` still delegates to core's `validateAndSanitizeSeedPayload`. It only forwards the request-scoped `IIdGenerator` that `repositoryMiddleware` sets (`middleware/repository.middleware.ts:156`). That is the same thing the protected create path does (`features/content/handlers/create.ts:67`). Core is not edited. |
| 2. Botanical invariant | No D1 query is added, changed or moved. Key resolution is pure and works on `c.env` plus one header. Content written by the secret-key path still goes through `context.get('repository').create` (`public-add.ts:410`), unchanged. The new integration test provisions storage through `createTestHarness` (`planCreateSeed` and real migrations) and reads state back through the HTTP surface. It names no physical column. |
| 3. VSA | `public-key-auth.ts` lives in `apps/api/src/public/middleware/`. Its two consumers are in the same slice (`public/middleware`, `public/handlers`). Nothing under `apps/api/src/features/**` imports it. `graphify path` confirms there is no feature-to-public edge to break. Test fixtures come from `@beechcms/testing` (shared) and `apps/api/test/fixtures.ts` (forks tier, already shared by `apps/api/test/**`). |
| 4. Cloudflare purity | No new binding. Secrets go through `.dev.vars` and `wrangler secret put`. `vars` holds only the publishable key. No migration. |
| 5. Minimal blueprint | 1 new source file, 1 new test file, the rest are edits. Tiers touched: api and client, not core. T8 adds one option to an existing adapter and touches no new files outside the public slice, apart from its single test caller. |

**Verdict: APPROVED.** No adjustment needed after the audit. HANDOFF -> caveman_coder

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

The scaffolder (02), the migration command (03) and the docs (04) all write or describe names the runtime
must recognise. With no legacy support, the runtime contract has to exist first. Otherwise the scaffolder would
write `BEECH_SECRET_KEY` to a worker that only reads `PUBLIC_WRITE_API_KEY`. This sprint fixes that contract in one
place:

- **One decision, two callers.** Today the key check exists twice: once in the middleware (`api-key-middleware.ts:37-58`)
  and again in the add handler (`public-add.ts:169-183`). The add handler re-checks because `POST /:seed/add` is a
  zero-secret path that the middleware skips (`api-key-middleware.ts:24`). Both callers will use
  `authorizePublicKey()` and `publicKeyProblem()`, so the two paths cannot diverge (brief §4 "Autenticazione API").
- **Client shape follows the role.** `createBeechBrowserClient({ publishableKey })` and
  `createBeechServerClient({ secretKey })`: one server instance reads and writes (#997).
- **Tests and monorepo dev move with it.** Every suite that sends a key uses the new fixture names. `pnpm beech dev`
  and the e2e run keep working, because the monorepo is configured the same way a scaffolded project will be in sprint 02.

VSA: everything server-side stays in the public slice. Botanical Engine: untouched, because authentication runs
before any content access and the seed policies (`checkPublicOperation`, `public-add.ts:137`) still decide authorization
after it. The key authenticates; the seed authorizes.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Public API middleware order** (`apps/api/src/factory.ts:242-251`, unchanged by this sprint):

1. `schemaRevisionMiddleware()`
2. `publicRateLimitMiddleware()`: picks a limiter by method (`rate-limit-middleware.ts:10-17`). It is key-agnostic and stays so.
3. `apiKeyMiddleware()`
4. `publicRoutes` (`public-routes.ts`): `GET /:seed`, `POST /:seed/add`, `PUT|PATCH /:seed/edit/:id` (L80-83), plus
   health, timetrap token and schema.

Mounted at `/api/v1/public` (`factory.ts:251`), before `apiProtected`.

**`apiKeyMiddleware`** (`api-key-middleware.ts`):
- `isZeroSecretPath` (L14-28): `/health`, `timetrap/token`, `GET /:seed/schema`, `POST /:seed/add`. **Keep as is.**
- Picks `PUBLIC_READ_API_KEY` for GET/HEAD/OPTIONS and `PUBLIC_WRITE_API_KEY` for everything else (L38-39). An unset key
  gives 403 `public-api-not-configured`; a missing or wrong key gives 401 `public-api-key-unauthorized`.
- Reads `c.env` through a local `PublicBindings` type (L9-12).

**`publicAddHandler`** (`public-add.ts`):
- L169-183: its own check against `PUBLIC_WRITE_API_KEY`. A wrong key gives 401; no key means the anonymous path.
- `isApiKeyAuthenticated` then gates three behaviours: the flat-payload fallback (L186), skipping the Time-Trap (L229) and
  accepting a client `status` (L279). **These three stay. Only the source of the boolean changes.**

**Public sanitize adapter** (`apps/api/src/public/validation/sanitize.ts`): `sanitizePublicPayload(seed, payload, options = {})`
calls core `validateAndSanitizeSeedPayload` (L38-44) **without `idGenerator`**. Core's `relationSchema`
(`packages/core/src/engine/validation/schema-builders.ts:338-344`) throws when a seed has a relation branch and no generator
is given. Canonical `posts` has three relation branches (`canonical.seeds.ts:45-47`) and `allowPublicPost` + `allowPublicEdit`.
So at HEAD, every public add (`public-add.ts:322`) and public edit (`public-edit.ts:141`) on `posts` returns 500. Existing
public suites only write to relation-free seeds, which is why nothing caught it. The request context already has
`idGenerator` (`public-add.ts:343,379` use it).

**Bindings** (`apps/api/src/types.ts`): `PUBLIC_READ_API_KEY?` L55-56, `PUBLIC_WRITE_API_KEY?` L57-58, `ENV?: string`
L121, `PUBLIC_TIME_TRAP_SECRET?` L143. Problem types are normalised to `https://beechcms.dev/problems/<type>`
(`problem-details.ts:100-104`). Warnings use the `console.warn('[tag] …')` convention (e.g.
`features/automations/executors/webhook.executor.ts:47`).

**Client** (`packages/client/src`): `BeechClientConfig { baseUrl; apiKey; fetch?; headers? }` (`types.ts:10-15`) is used
by both factories. `validateClientConfig` (`http.ts:6-16`) requires `apiKey`. `request()` sets `X-API-Key: cfg.apiKey`
(`http.ts:30`). The browser client already exposes only `list`/`first` (`BeechBrowserClient`, `types.ts:129`). The server
client adds `create` (POST `/add`) and `update` (PUT `/edit/:id`) (`server/client.ts:83-97`). `index.ts:6` re-exports
`BeechClientConfig`. `tsconfig.typecheck.json` includes the `*.test.ts` files (it overrides `exclude`), so
`@ts-expect-error` in tests is checked by `pnpm --filter @beechcms/client type-check`.

**Test fixtures:** `packages/testing/src/env.ts:7-8,17-18` (`TEST_PUBLIC_READ_KEY`, `TEST_PUBLIC_WRITE_KEY`, re-exported at
`index.ts:12`) and `apps/api/test/fixtures.ts:12-13,21-22` (the same names for the forks tier). The harness merges
`options.env` over `TEST_ENV` (`packages/testing/src/harness.ts:62`) and exposes `harness.app` and `harness.env`
(L46-52). Canonical `posts` has `allowPublicRead` and `allowPublicPost`; canonical `categories` has `allowPublicRead` only
(`packages/testing/src/seeds/canonical.seeds.ts:9-33`).

**Monorepo dev:** `apps/api/wrangler.jsonc` `vars` L113-114 hold the two dev keys, and the secret-put comments are at
L104-105, L137-138 and L168. `apps/api/.dev.vars` is gitignored. It is seeded from `.dev.vars.example` by hand
(`.github/CONTRIBUTING.md:43`), and `pnpm beech dev` patches it (`scripts/dev-cli/orchestrator.ts:178`
`ensurePrivacyMasterKey`, called at L397). The e2e worker gets hermetic `--var` flags (`e2e/playwright.config.ts:21-31`),
and `e2e/tests/rate-limit.e2e.ts:74,101` hard-codes the old dev keys.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

**Create**
- `apps/api/src/public/middleware/public-key-auth.ts`: the shared decision, the denial-to-response helper and the constants.
- `apps/api/src/public/test/integration/public-key-roles.integration.test.ts`: real D1, full chain, single server-client instance.

**Edit: runtime**
- `apps/api/src/public/middleware/api-key-middleware.ts`: delegates to `public-key-auth.ts`; drops `PublicBindings`.
- `apps/api/src/public/handlers/public-add.ts`: L169-183 replaced by the shared decision.
- `apps/api/src/public/errors/public-errors.ts`: new entries, reworded `API_KEY_UNAUTHORIZED`.
- `apps/api/src/types.ts`: L55-58 replaced by the two new bindings.
- `apps/api/src/public/validation/sanitize.ts`, plus one call site each in `public-add.ts:322` and `public-edit.ts:141` (T8).
- `apps/api/test/core-validation.test.ts`: the two `sanitizePublicPayload` calls pass the generator (T8).
- `packages/client/src/types.ts`, `http.ts`, `browser/client.ts`, `server/client.ts`, `index.ts`.

**Edit: fixtures and tests** (mechanical rename unless SECTION 4 T6 says otherwise)
- `packages/testing/src/env.ts`, `packages/testing/src/index.ts`, `apps/api/test/fixtures.ts`
- `apps/api/src/public/middleware/api-key-middleware.test.ts` (rewritten, T6)
- `apps/api/src/public/handlers/public-add.test.ts` (+1 case, T6)
- `packages/client/src/http.test.ts`, `browser/browser-client.test.ts`, `server/server-client.test.ts` (T6)
- `apps/api/test/client-sdk-e2e.test.ts`, `apps/api/test/flow/flow-guest-access.test.ts`,
  `apps/api/test/public-routes.test.ts`, `apps/api/test/public-edit.test.ts`, `apps/api/test/public-anti-bot.test.ts`
- `apps/api/src/public/test/integration/public-{trash-isolation,relation-subquery,relation-expansion,localization-write,localization-read,idempotency,error-redaction,empty-in-filter}.integration.test.ts`
- `apps/api/src/features/search/test/integration/public-search-index.integration.test.ts`
- `e2e/tests/rate-limit.e2e.ts`

**Edit: monorepo dev config**
- `apps/api/wrangler.jsonc`, `apps/api/.dev.vars.example`, `scripts/dev-cli/orchestrator.ts`, `e2e/playwright.config.ts`

**Not in this sprint:** `bin/**`, `packages/cli/**`, `scripts/smoke-release.mjs`, `docs/**`, `CHANGELOG.md` (see SECTION 7).

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### T1 — Bindings (`apps/api/src/types.ts`)

Replace L55-58 (the two `PUBLIC_*_API_KEY` members and their docblocks) with exactly:

```ts
  /** Publishable key: read-only Public API access (GET/HEAD/OPTIONS), safe in a browser. Local value `beech_pk_dev`. */
  BEECH_PUBLISHABLE_KEY?: string
  /** Secret key: full Public API access (every method), server-side only. Lives in `.dev.vars` / `wrangler secret put`. */
  BEECH_SECRET_KEY?: string
```

Leave every other binding alone (`PUBLIC_TIME_TRAP_SECRET`, `PUBLIC_PUBLISHED_ONLY`, the rate limiters).

### T2 — Shared decision (`apps/api/src/public/middleware/public-key-auth.ts`, new)

Reason: a pure function plus one response helper. Middleware and handler then share the decision *and* the response, so
they cannot drift. A context variable set by the middleware would not work, because the middleware skips `POST /add`.

SPDX header: copy `public-add.ts:1-3`. Exports, verbatim:

```ts
import type { Context } from 'hono'
import type { Env } from '../../types.js'

/** Local development values. Public by design: the secret one is refused outside ENV=development. */
export const DEV_PUBLISHABLE_KEY = 'beech_pk_dev'
export const DEV_SECRET_KEY = 'beech_sk_dev'

/** One stable line, logged on every request refused by the dev-secret guard. Never carries the key value. */
export const PUBLIC_KEY_DEV_SECRET_WARNING =
  '[public-api] refused BEECH_SECRET_KEY: it is the local development value and ENV is not "development". Set a generated key with `wrangler secret put BEECH_SECRET_KEY`.'

export type PublicKeyRole = 'secret' | 'publishable'

export type PublicKeyDenialType =
  | 'public-api-not-configured'
  | 'public-api-key-unauthorized'
  | 'public-api-secret-key-required'
  | 'public-api-dev-secret-key'

export type PublicKeyDecision =
  | { ok: true; role: PublicKeyRole }
  | { ok: false; status: 401 | 403; type: PublicKeyDenialType; write: boolean }

export type PublicKeyBindings = Pick<Env, 'BEECH_PUBLISHABLE_KEY' | 'BEECH_SECRET_KEY' | 'ENV'>

export function isReadMethod(method: string): boolean

export function authorizePublicKey(input: {
  method: string
  providedKey: string | undefined
  env: PublicKeyBindings
}): PublicKeyDecision

export function publicKeyProblem(c: Context, denial: Extract<PublicKeyDecision, { ok: false }>) /* return type inferred, see below */
```

**`authorizePublicKey` rules, evaluated in this order** (read = GET, HEAD, OPTIONS; write = anything else):

1. A blank or empty configured value counts as **not configured**. A blank provided header counts as **absent**.
2. If `providedKey` matches the configured `BEECH_SECRET_KEY` (`timingSafeEqual` from `@beechcms/core`, as today):
   - if `env.ENV !== 'development'` **and** the configured secret is exactly `DEV_SECRET_KEY` → deny `403 public-api-dev-secret-key`.
     An undefined `ENV` counts as "not development".
   - otherwise → `{ ok: true, role: 'secret' }` for every method.
3. Else, if `providedKey` matches the configured `BEECH_PUBLISHABLE_KEY` (`timingSafeEqual`):
   - read → `{ ok: true, role: 'publishable' }`. **No guard** on `DEV_PUBLISHABLE_KEY`, in any environment.
   - write → deny `403 public-api-secret-key-required`.
4. Else (absent or unmatched key):
   - read with neither key configured, or write with no secret configured → deny `403 public-api-not-configured` (fail closed).
   - otherwise → deny `401 public-api-key-unauthorized`.

Invariants: pure (no I/O, no logging); never reads `PUBLIC_READ_API_KEY` or `PUBLIC_WRITE_API_KEY`; the same input
always gives the same decision. `write` on a denial is `!isReadMethod(method)`. `publicKeyProblem` uses it to pick the
not-configured detail.

**`publicKeyProblem` rules:** it returns `publicProblem(c, { type, title, status, detail })` with title and detail from
`PUBLIC_ERRORS` (T3). Its return type is **inferred, not annotated**: `problem-details.ts:116-123` explains why, since it
feeds `AppType` through the add handler. Pick the `not-configured` detail with `denial.write`
(`PUBLIC_NOT_CONFIGURED_WRITE` vs `PUBLIC_NOT_CONFIGURED_READ`). For `public-api-dev-secret-key` only, it first calls
`console.warn(PUBLIC_KEY_DEV_SECRET_WARNING)` with **no other argument**: no key, no path, no header.

`isReadMethod`: move the body of `rate-limit-middleware.ts:10-12` here and import it there too. That leaves one
definition of "read method" in the slice.

### T3 — Error catalogue (`apps/api/src/public/errors/public-errors.ts`)

Replace the object contents with exactly:

```ts
export const PUBLIC_ERRORS = {
  API_KEY_UNAUTHORIZED: {
    error: 'Unauthorized',
    message: 'Missing or invalid API key. Send the publishable key (reads) or the secret key (reads and writes) in the X-API-Key header.',
  },
  PUBLIC_NOT_CONFIGURED_READ: {
    error: 'Forbidden',
    message: 'Public API reads are not configured: set BEECH_PUBLISHABLE_KEY (or BEECH_SECRET_KEY). Projects created with 0.10.x: run `npx beech keys:migrate`.',
  },
  PUBLIC_NOT_CONFIGURED_WRITE: {
    error: 'Forbidden',
    message: 'Public API writes are not configured: set BEECH_SECRET_KEY. Projects created with 0.10.x: run `npx beech keys:migrate`.',
  },
  SECRET_KEY_REQUIRED: {
    error: 'Forbidden',
    message: 'This is a publishable key, which is read-only. Writes require the secret key, used server-side only.',
  },
  DEV_SECRET_KEY: {
    error: 'Forbidden',
    message: 'The local development secret key is refused outside ENV=development. Configure a generated BEECH_SECRET_KEY.',
  },
} as const
```

`API_KEY_FORBIDDEN` is removed. Grep for remaining users: today only `api-key-middleware.ts`.

### T4 — Callers

**`api-key-middleware.ts`**: keep the file, `apiKeyMiddleware()` export name and `isZeroSecretPath` unchanged (no churn in
`factory.ts:23,246` or `public/index.ts:5`). Delete `PublicBindings` (L9-12) and the inline decision (L37-58). On a
non-zero-secret path, call `authorizePublicKey({ method, providedKey: c.req.header('X-API-Key'), env: c.env })`. A denial
returns `publicKeyProblem(c, decision)`; an allow calls `next()`. The middleware does not store the role: nothing reads it.

**`public-add.ts`**: replace L169-183 only. If `X-API-Key` is present and non-blank, call `authorizePublicKey` with
`method: 'POST'`. A denial returns `publicKeyProblem(context, decision)` at the same point the 401 returns today (after
seed lookup, origin check and JSON parse). An allow sets `isApiKeyAuthenticated = true` (only `secret` can be allowed for
POST). If the header is absent or blank, the request is anonymous (`isApiKeyAuthenticated = false`) and takes the
Time-Trap path. Drop the now-unused `timingSafeEqual` import from L5 if nothing else in the file uses it. L186, L229 and
L279 are untouched. Do **not** add a key check to `public-edit.ts`: the middleware already guards `PUT|PATCH /edit`.

Behaviour change to expect: a publishable key on `POST /add` used to get 401. It now gets 403
`public-api-secret-key-required` (brief rule 6).

### T5 — Client SDK (`packages/client/src`)

**`types.ts`**: replace `BeechClientConfig` (L10-15) with exactly:

```ts
/** Options shared by the browser and the server client. */
export interface BeechClientBaseConfig {
  baseUrl: string
  fetch?: typeof fetch
  headers?: Record<string, string> | Headers
}

/** Browser client: read-only, authenticated with the publishable key (`beech_pk_…`). */
export interface BeechBrowserClientConfig extends BeechClientBaseConfig {
  publishableKey: string
}

/** Server client: reads and writes with one instance, authenticated with the secret key (`beech_sk_…`). Never ship it to a browser. */
export interface BeechServerClientConfig extends BeechClientBaseConfig {
  secretKey: string
}
```

**`index.ts:6`**: export `BeechClientBaseConfig`, `BeechBrowserClientConfig` and `BeechServerClientConfig` in place of
`BeechClientConfig`.

**`http.ts`**: remove `validateClientConfig`; add, verbatim:

```ts
/** Transport settings after validation; `key` is the one the client's role requires. Internal: not re-exported from index. */
export interface HttpConfig extends BeechClientBaseConfig {
  key: string
}

export function resolveBrowserConfig(config: BeechBrowserClientConfig): HttpConfig
export function resolveServerConfig(config: BeechServerClientConfig): HttpConfig
export async function request<T>(
  cfg: HttpConfig,
  method: string,
  path: string,
  opts?: { params?: URLSearchParams; body?: unknown; options?: RequestOptions },
): Promise<BeechResult<T>>
```

`request` keeps its body and only reads `cfg.key` for `X-API-Key` (L30). Validation rules, checked in this order (keep the
first two messages from `http.ts:7-12` verbatim):
1. Not an object → `TypeError('Configuration object is required')`.
2. `baseUrl` blank → the existing `baseUrl` error.
3. Own property `apiKey` present (the config is a runtime value, so check with `Object.hasOwn`) → `Error` whose message
   names the replacement: browser `"apiKey was removed: pass publishableKey to createBeechBrowserClient"`; server
   `"apiKey was removed: pass secretKey to createBeechServerClient"`. This comes before rule 4, so a 0.10 config gets the
   rename hint, not a generic "missing" message.
4. Role key missing or blank → `"publishableKey is required and must be a non-empty string"` or
   `"secretKey is required and must be a non-empty string"`.
5. Browser only: `publishableKey` starts with the module-local constant `SECRET_KEY_PREFIX = 'beech_sk_'` →
   `Error("publishableKey is a secret key (beech_sk_…): secret keys must never reach the browser. Use the publishable key (beech_pk_…).")`.
   The server client does not check prefixes (YAGNI; the API answers a publishable key on a write with 403 anyway).

The returned `HttpConfig` copies `baseUrl`, `fetch` and `headers` and sets `key`. It never keeps a reference to the
caller's object.

**`browser/client.ts:17-20`**: signature `createBeechBrowserClient<TRegistry = Record<string, unknown>>(config: BeechBrowserClientConfig): BeechBrowserClient<TRegistry>`.
Resolve once with `resolveBrowserConfig` and pass the result to every `request`.
**`server/client.ts:51-54`**: the same with `BeechServerClientConfig` / `resolveServerConfig`. One resolved config serves
`list`, `first`, `create` and `update`. That is the #997 fix. Aliases `createBeechClient` stay.

Compile-time guarantees (no new code, asserted in T6): the browser resource type has no `create`/`update`; an object
literal with `apiKey` fails the excess-property check on both configs.

### T6 — Tests

Quote style: single quotes, as the files already use. Header: SPDX as the file already has (MIT in `packages/client`,
BUSL in `apps/api`). The rename map for every mechanical file:
`TEST_PUBLIC_READ_KEY → TEST_PUBLISHABLE_KEY`, `TEST_PUBLIC_WRITE_KEY → TEST_SECRET_KEY`,
`TEST_ENV.PUBLIC_READ_API_KEY → TEST_ENV.BEECH_PUBLISHABLE_KEY`, `TEST_ENV.PUBLIC_WRITE_API_KEY → TEST_ENV.BEECH_SECRET_KEY`,
`apiKey: <read key>` → `publishableKey:`, `apiKey: <write key>` → `secretKey:`. An env override that "unconfigures"
the public API must now unset **both** bindings, because the secret key also authorizes reads
(`flow-guest-access.test.ts:32`).

**Fixtures** (`packages/testing/src/env.ts`, `apps/api/test/fixtures.ts`, same values in both):

```ts
export const TEST_PUBLISHABLE_KEY = 'beech_pk_test_6f8g9h0j1k2l'
export const TEST_SECRET_KEY = 'beech_sk_test_9a8b7c6d5e4f'
// in TEST_ENV:
  BEECH_PUBLISHABLE_KEY: TEST_PUBLISHABLE_KEY,
  BEECH_SECRET_KEY: TEST_SECRET_KEY,
```

`packages/testing/src/index.ts:12` re-exports `TEST_PUBLISHABLE_KEY` and `TEST_SECRET_KEY` in place of the old names.
`TEST_ENV.ENV` stays `'development'`. Neither fixture value equals a `DEV_*` constant, so the guard never fires by
accident.

**`apps/api/src/public/middleware/api-key-middleware.test.ts`** (unit, rewritten; fixture: inline env objects through the
existing `buildApp(env)` stub at L9-18, typed `PublicKeyBindings`; deliberately synthetic, since the subject is the decision table)
- `describe('apiKeyMiddleware')`
- `it` zero-secret paths (`/health`, `/timetrap/token`, `GET /posts/schema`, `POST /posts/add`) pass with no key and nothing configured (keep L21-35).
- `it` `/posts/add-batch` and `/posts/add/extra` are not zero-secret and get 401 with the secret configured (keep L37-45).
- `it` method × role matrix: publishable passes GET/HEAD and gets 403 `public-api-secret-key-required` on POST/PUT/PATCH/DELETE; secret passes all six (array-driven, Rule 1.6).
- `it` a wrong key of a different length or one differing character gets 401 `public-api-key-unauthorized` (keep L64-79).
- `it` a missing key gets 401 when at least one key is configured.
- `it` a read with neither key configured gets 403 `public-api-not-configured`.
- `it` a write with only the publishable key configured and no header gets 403 `public-api-not-configured`.
- `it` the secret key reads with no publishable key configured: 200.
- `it` `BEECH_SECRET_KEY=beech_sk_dev` is refused with 403 `public-api-dev-secret-key` when `ENV` is `production` and when `ENV` is unset (matrix).
- `it` `BEECH_SECRET_KEY=beech_sk_dev` passes when `ENV=development`.
- `it` a dev-guard refusal logs exactly `PUBLIC_KEY_DEV_SECRET_WARNING` once, with no argument containing `beech_sk_dev` (`vi.spyOn(console, 'warn')`, restored in `afterEach`; comment: the log line is the brief's contract, not a stand-in for behaviour).
- `it` `beech_pk_dev` as the configured publishable key passes a GET with `ENV=production` (no guard on the publishable key).
- `it` legacy bindings alone (`PUBLIC_READ_API_KEY`, `PUBLIC_WRITE_API_KEY` set; new ones unset) leave the API unconfigured: 403 `public-api-not-configured` even when the old value is sent.

**`apps/api/src/public/handlers/public-add.test.ts`** (unit, existing harnessless `createBeechApp` + `StaticContentRepository`;
fixture `TEST_SEEDS` / `TEST_ENV` from `apps/api/test/fixtures.ts`): rename at L12/L239, keep the L256 case at 401, and add:
- `it` the publishable key on `POST /leads/add` gets 403 `public-api-secret-key-required` and the repository holds no new entry.

**`apps/api/src/public/test/integration/public-key-roles.integration.test.ts`** (integration; real D1 via
`createTestHarness({ db: env.DB, createApp })`, copy the `beforeEach` of
`public-idempotency.integration.test.ts:34-46`; canonical seeds; per-test env through `options.env`; the server client
is imported by relative path `../../../../../../packages/client/src/server/index.js`, as
`apps/api/test/client-sdk-e2e.test.ts:11` does, with `fetch` bridged to `harness.app.request(url, init, harness.env)`;
comment the bridge: in-process, no network)
- `describe('public slice — key roles (real D1)')`
- `describe('GET /api/v1/public/:seed')`
  - `it` the publishable key lists `posts`: 200.
  - `it` the secret key lists `posts`: 200.
  - `it` a request without a key gets 401 `public-api-key-unauthorized`.
- `describe('POST /api/v1/public/:seed/add')`
  - `it` the secret key creates a `posts` entry without a Time-Trap token: 201, id matches `UUID_V4_PATTERN`, and the entry is readable with the publishable key.
  - `it` the publishable key gets 403 `public-api-secret-key-required` and the `posts` list count is unchanged.
  - `it` the secret key on `categories` (no `allowPublicPost`) gets 403 `operation-not-allowed` and nothing is written (guard comment: the key authenticates, the seed authorizes; #1022 tracks the split).
  - `it` with `ENV=production` and `BEECH_SECRET_KEY=beech_sk_dev`, sending `beech_sk_dev` gets 403 `public-api-dev-secret-key` and nothing is written.
  - `it` an anonymous submission without a Time-Trap token still gets 422 `time-trap-missing` (the zero-secret path is unchanged).
  - `it` the secret key with a malformed `category_id` (not a UUID) gets 400 `validation_failed` naming `category_id`, not 500. Nothing is written. (T8 regression guard. Comment: this is the relation branch that used to throw in core.)
- `describe('PUT /api/v1/public/:seed/edit/:id')`
  - `it` the secret key updates the title of a `posts` entry it created: 200, and a publishable-key read returns the new title (T8 on the edit path).
  - `it` the publishable key gets 403 `public-api-secret-key-required` and the title is unchanged.
- `describe('createBeechServerClient — one instance, one key')`
  - `it` an instance built with only `secretKey` creates an entry that its own `list` and `first` then return (ACT = `create`; `list`/`first` are the state assertion).

All `posts` writes in this file use canonical `posts` and send no relation fields, except the malformed-id case. No
hand-rolled seed is needed once T8 lands (rejection 1, option a).

**`apps/api/test/core-validation.test.ts`** (forks tier, T8): the two `public sanitize adapter` cases at L101 and L112 pass
`{ idGenerator: SystemIdGenerator }` (import from `@beechcms/core`). They keep their assertions. Add no new case:
`apps/api/test/fixtures.ts` declares no relation branch, and the relation behaviour is covered against real D1 by the
malformed-id case in `public-key-roles.integration.test.ts` above.

**`packages/client/src/http.test.ts`** (unit; inline configs, no I/O): replace the `validateClientConfig` describe with
`describe('resolveBrowserConfig')` and `describe('resolveServerConfig')`. Retype `baseConfig` as `HttpConfig` (`key: 'test-key'`)
for the `request` describe.
- `it` the browser resolver returns `key` equal to `publishableKey`.
- `it` the browser resolver throws a message naming `publishableKey` when given `apiKey` (comment: the message naming the parameter is the brief's contract).
- `it` the browser resolver throws a message naming `publishableKey` when the key is missing or blank.
- `it` the browser resolver refuses a `beech_sk_` key.
- `it` the server resolver returns `key` equal to `secretKey`.
- `it` the server resolver throws a message naming `secretKey` when given `apiKey`, or when the key is missing.
- `it` `request` sends `X-API-Key` equal to `cfg.key` (adapt the existing L84 case).

**`browser/browser-client.test.ts`** (unit; existing fetch mock): `baseConfig` uses `publishableKey`; L27-31 updated to the new
messages; L92 replaced by:
- `it` the resource type has no `create` or `update`: `@ts-expect-error` on each access, plus the existing runtime `toBeUndefined` (comment: `type-check` enforces the directive).
- `it` a config literal with `apiKey` is a type error (`@ts-expect-error`) and throws at runtime.

**`server/server-client.test.ts`** (unit; existing fetch mock): `baseConfig` uses `secretKey`; L27-31 updated; add:
- `it` one instance sends the same `X-API-Key` on `list` and `create`.

**`apps/api/test/client-sdk-e2e.test.ts`**: rename only. L128 keeps its meaning (secret key bypasses Time-Trap) and L161 stays 401.

### T7 — Monorepo dev config

- **`apps/api/wrangler.jsonc`**: in `vars` replace L113-114 with `"BEECH_PUBLISHABLE_KEY": "beech_pk_dev",`. In the
  secret-put comments, replace the two `PUBLIC_*_API_KEY` lines at L104-105 and L137-138 with one
  `BEECH_SECRET_KEY` line and one `BEECH_PUBLISHABLE_KEY` line (production publishable key = generated
  `beech_pk_live_…`). Update the list at L168. `env.production` gets no key in `vars`.
- **`apps/api/.dev.vars.example`**: after the JWT block (L7-10), add a block in the file's Italian comment style:
  secret key, local value, "in prod: `wrangler secret put BEECH_SECRET_KEY --env production` con un valore generato
  `beech_sk_live_…`", then the line `BEECH_SECRET_KEY=beech_sk_dev`.
- **`scripts/dev-cli/orchestrator.ts`**: add `export function ensureDevSecretKey(): boolean`, modelled on
  `ensurePrivacyMasterKey` (L178-197): same file, same "never overwrite a non-empty value" rule, appends
  `BEECH_SECRET_KEY=beech_sk_dev` with a one-line comment. Call it next to L397 with
  `this.logLine('bootstrap', 'Added BEECH_SECRET_KEY to apps/api/.dev.vars')` when it returns true. Reason: existing
  developer `.dev.vars` files predate the key, and without it every monorepo write would 403 after this sprint.
- **`e2e/playwright.config.ts`**: add `'--var', 'BEECH_SECRET_KEY:beech_sk_dev',` to `API_VARS` (L21-31). The publishable
  key comes from `wrangler.jsonc` `vars`.
- **`e2e/tests/rate-limit.e2e.ts`**: L74 becomes `beech_pk_dev`, L101 becomes `beech_sk_dev`.

### T8 — Relation-safe public sanitize (`apps/api/src/public/validation/sanitize.ts`)

Reason: without it, the secret-key write that this sprint and #997 promise returns 500 on any seed with a relation branch
(rejection 1). The option is **required**, not optional. An optional generator is how this bug got in, and a
required one makes `type-check` flag every caller.

Change the signature to exactly:

```ts
import type { IIdGenerator, LocaleConfig, Seed, ValidationDetail } from '@beechcms/core'

export function sanitizePublicPayload(
  seed: Seed,
  payload: Record<string, unknown>,
  options: {
    idGenerator: IIdGenerator
    allowNull?: boolean
    operation?: 'create' | 'update'
    requireAtLeastOneValidField?: boolean
    enforceRequiredFields?: boolean
    localeConfig?: LocaleConfig
  },
): PublicSanitizeResult
```

The `= {}` default goes away. Forward `options.idGenerator` to `validateAndSanitizeSeedPayload` next to `localeConfig`.
Every other line of the adapter stays the same: the defaults, the dangerous-field mapping to 422, the details mapping to 400.

Call sites:
- `public-add.ts:322` adds `idGenerator: context.get('idGenerator')` to its options literal.
- `public-edit.ts:141` (inside `resolveData`, which already receives `context`) adds the same.

Behaviour: a relation value that is not a valid id now gives 400 `validation_failed` with a detail on that alias (core's
`Expected valid-relation-id`), as on the protected path. Payloads with no relation field behave as before. This sprint
does not check that the target entry exists, and neither does the protected create path.

The `public-edit.ts` change is limited to that one property. Its key handling, its sensitive-field checks and the
middleware guard on `PUT|PATCH /edit` stay unchanged.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

```bash
pnpm --filter @beechcms/client type-check      # includes *.test.ts: @ts-expect-error directives must hold
pnpm --filter @beechcms/client test
pnpm --filter @beechcms/client build
pnpm --filter @beechcms/testing type-check
pnpm --filter @beechcms/testing build           # apps/api resolves @beechcms/testing through dist/: build it before the api type-check
pnpm --filter @beechcms/api type-check
pnpm --filter @beechcms/api test:unit
pnpm --filter @beechcms/api test:integration   # workers tier, real D1
pnpm beech test --diff                          # forks/flow tiers need Docker; start Docker Desktop if the daemon is down
pnpm lint
pnpm lint:tests

# Closing greps (docs/, bin/, packages/cli/ are later sprints)
# 1. Legacy names in source and config: expected NO hits.
git grep -nE "PUBLIC_(READ|WRITE)_API_KEY|TEST_PUBLIC_(READ|WRITE)_KEY|dev-public-(read|write)-key" -- apps packages/client packages/testing e2e scripts/dev-cli ':!*.test.ts'
# 2. Legacy names in tests: expected EXACTLY ONE hit, the "legacy bindings alone" case in
#    apps/api/src/public/middleware/api-key-middleware.test.ts (it asserts that the old names are ignored).
git grep -nE "PUBLIC_(READ|WRITE)_API_KEY|TEST_PUBLIC_(READ|WRITE)_KEY|dev-public-(read|write)-key" -- apps packages/client packages/testing e2e scripts/dev-cli '*.test.ts'
# 3. The legacy client option, as a property: expected NO hits. (The Resend `apiKey:` in apps/api/src/features/** and
#    apps/api/src/shared/email/** is unrelated. Client tests that assert `apiKey` is rejected are excluded on purpose.)
git grep -nE "apiKey\s*:" -- packages/client/src ':!*.test.ts' apps/api/test/client-sdk-e2e.test.ts
graphify update .
```

Manual, after `pnpm beech dev`:
- `curl -H "X-API-Key: beech_pk_dev" http://localhost:<api>/api/v1/public/posts` → 200.
- `curl -X POST -H "X-API-Key: beech_pk_dev" -H "Content-Type: application/json" -d '{"title":"x"}' .../posts/add` → 403 `public-api-secret-key-required`.
- The same POST with `beech_sk_dev` → 201. Before T8 this returned 500.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `authorizePublicKey` is the only place in `apps/api` that compares an `X-API-Key`: outside tests, the header is read only in `api-key-middleware.ts` and `public-add.ts`, and both pass it straight to `authorizePublicKey`. `timingSafeEqual` against a key binding appears nowhere else.
- [ ] `apps/api/src` contains no reference to `PUBLIC_READ_API_KEY` or `PUBLIC_WRITE_API_KEY`.
- [ ] Publishable key: GET/HEAD pass; every write gets 403 `public-api-secret-key-required`, including `POST /:seed/add`.
- [ ] Secret key: every method passes, and the seed policies still apply (`allowPublicPost=false` → 403 `operation-not-allowed`).
- [ ] Wrong key → 401. Secret not configured → writes 403 `public-api-not-configured`. Nothing configured → reads 403.
- [ ] `BEECH_SECRET_KEY=beech_sk_dev` with `ENV` ≠ `development` (or unset) → 403 `public-api-dev-secret-key` plus exactly one `console.warn(PUBLIC_KEY_DEV_SECRET_WARNING)` per refusal, with no key value. There is no guard on the publishable key.
- [ ] The comparison stays `timingSafeEqual`, and there is no `ENV` branch other than the dev-secret guard.
- [ ] Zero-secret paths (health, timetrap token, schema, anonymous add) behave exactly as before.
- [ ] `createBeechBrowserClient({ baseUrl, publishableKey })` and `createBeechServerClient({ baseUrl, secretKey })` are the only accepted shapes; `apiKey` is a type error and a runtime error naming the right parameter; a `beech_sk_` key throws in the browser client.
- [ ] `create`/`update` on a browser resource fail `type-check` (`@ts-expect-error` holds).
- [ ] One server instance performs `list`, `first` and `create` (integration test green).
- [ ] `BeechClientConfig` is no longer exported. `HttpConfig` is not exported from `packages/client/src/index.ts`.
- [ ] The secret key creates and edits a canonical `posts` entry (it has relation branches): 201 and 200, never 500. A malformed relation id gives 400 `validation_failed`.
- [ ] `sanitizePublicPayload` requires `idGenerator`, and both public callers pass `context.get('idGenerator')`.
- [ ] Every command in SECTION 5 passes, and each closing grep returns exactly its stated result.
- [ ] `@beechcms/core` is unchanged (`git diff --stat packages/core` is empty).

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

- **Scaffolder** (`bin/template.mjs`, `bin/create.mjs`, `scripts/lib/template.test.mjs`), first-commit test, `scripts/smoke-release.mjs`,
  `beech init` key echo (`packages/cli/src/commands/init.ts:15-36`), `beech forms` templates
  (`packages/cli/src/commands/forms.ts`, `NEXT_PUBLIC_BEECH_WRITE_KEY`): ROADMAP row **02 ScaffoldSecrets**.
- **`beech keys:migrate`** and its `bin/beech.mjs` / `docs/build/cli-workflows.md` entries: ROADMAP row **03 KeysMigrate**.
  The `PUBLIC_NOT_CONFIGURED_*` messages already name the command; it does not exist until 03, and no release ships in between (ROADMAP "Note di rilascio").
- **All docs** (`docs/**`, `CHANGELOG.md`, `packages/mcp/resources` rebuild, legacy-name check in `scripts/docs-fact-check.mjs`): ROADMAP row **04 KeyModelDocs**.
- Moving the monorepo's own dev `PUBLIC_TIME_TRAP_SECRET` / `WEBHOOK_SECRET` out of `apps/api/wrangler.jsonc` `vars`:
  not required. They are dev-only "changeme" values that `env.production` drops; rule 2 of the brief targets scaffolded projects (row 02).
- Rate limiting per key, key rotation/revocation, multiple keys, dashboard key management, validating `beech_*_live_` prefixes at runtime (brief §5).
- Separating "the key may write" from `allowPublicPost`, and the `published` default of anonymous posts (#1022).
- Any change to `public-edit.ts` beyond the one `idGenerator` property in T8. Also out: `rate-limit-middleware.ts` behaviour
  (only the `isReadMethod` import moves, T2), the Time-Trap, CORS and `isZeroSecretPath`.
- Checking that a public relation id points to an existing entry. Neither the public path nor the protected path does it today.
- Bumping package versions or release notes. That happens at release time, after sprint 03.
