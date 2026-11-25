# Sprint Plan — `CliSchemaPlanApply`

**Chain:** Typed Fluent Query Builder (#381 → #385) — **sprint 3b of 7** (`ROADMAP.md`).
**Issue:** #382, part B (write half).
**Upstream:** sprint 1 `SchemaManifestDsl`, sprint 2 `SchemaIntrospectionFingerprint`, sprint 3a
`CliSchemaExportTypes` — all merged, archived to `docs/Sprints/`.
**Downstream blocked on this:** nothing. Sprints 4, 5 and 6 do not consume `plan`/`apply`; this sprint
closes the manifest round-trip (`export → diff → plan → apply`) opened by 3a.

---

### Pre-Computation Analysis

Produced with the graphify CLI under `_config/tooling_graphify.md` (graph refreshed first with
`graphify update . --force`: **13087 nodes / 23617 edges / 1027 communities**; `GRAPH_REPORT.md` never
read; `query` not needed — every question was answerable with `explain` / `path` / `affected`).

#### a) God Nodes identified via the CLI

| Node | Degree | Community | Relevance to this sprint |
|------|--------|-----------|--------------------------|
| `seeds.helpers.ts` (`apps/api/src/features/seeds/seeds.helpers.ts`) | **27** | `hono` | Owns `rejectManifestOwned`, `validateAndApplySeedDef`, `requireAdmin`, `actorFromContext`. **Not edited**: the ownership guard shipped in sprint 1 and is already correct for 3b (it is deliberately NOT called on the MCP routes — `seeds.helpers.ts:96`). |
| `wrangler.ts` (`packages/cli/src/lib/wrangler.ts`) | **20** | `wrangler.ts` | Owns `queryD1`. **Not touched and not reached**: `plan`/`apply` never open the local SQLite file — every write travels HTTP to the control plane. |
| `oauth.ts` (`packages/mcp/src/oauth.ts`) | **19** | `oauth.ts` | The only PKCE/loopback implementation in the repo. **Moved**, not copied, into the new `@beechcms/api-client`. |
| `d1-context.ts` (`packages/cli/src/lib/d1-context.ts`) | **17** | `wrangler.ts` | Owns `CliError` + `exitWithError`, the error/exit idiom both new commands reuse. `createD1Context` / `loadLiveSeeds` are **not** called by `plan`/`apply`. |
| `seeds.mcp.ts` (`apps/api/src/features/seeds/seeds.mcp.ts`) | **15** | `hono` | The control plane. The **one** `apps/api` file this sprint edits, and only in three places (plan response gains `source`; apply accepts `source`; audit detail records it). |
| `token-store.ts` (`packages/mcp/src/token-store.ts`) | **12** | `mcp/src/client.ts` | `~/.beechcms/mcp-tokens.json`, keyed `apiUrl\|clientId`. **Moved verbatim**; the CLI becomes a second key in the same file, never a second file. |
| `manifest-loader.ts` (`packages/cli/src/lib/manifest-loader.ts`) | 8 | `schema-export.ts` | Sprint 3a's loader. Consumed unchanged by both new commands — that consumption is the dependency the roadmap records for 3b. |
| `seed.repository.d1.ts` (`apps/api/src/shared/db/repositories/seed.repository.d1.ts`) | 5 | `D1SeedRepository` | `applyAtomic` already takes `source?: 'code' \| 'runtime'` (`seed.repository.ts:57`) and `UPSERT_SEED_SQL`'s `ON CONFLICT DO UPDATE` already omits `source`. **Zero changes needed here** — the gap is only that the handler hardcodes `'runtime'`. |

#### b) Architectural boundaries affected

| Boundary | Touched? | What lands there |
|----------|----------|------------------|
| `packages/api-client` (**new package**) | **yes (6 new files)** | `@beechcms/api-client`: OAuth 2.1 PKCE loopback flow, on-disk grant cache, authenticated `fetch` transport, RFC 7807 parsing. Created by **moving** `packages/mcp/src/{oauth,token-store}.ts` and the transport half of `client.ts` — one implementation of the credential path, never two. |
| `packages/mcp` — `src/` | **yes (1 rewritten, 2 deleted, 1 manifest)** | `client.ts` becomes a ~30-line singleton adapter over the factory and keeps exporting `request` and `BeechClientError` with unchanged signatures; `oauth.ts` and `token-store.ts` are deleted (moved). `index.ts`, `plans.ts`, `resources.ts`, `supervisor.ts` are **not opened**. |
| `packages/cli` — `src/lib/` | **yes (2 new files)** | `control-plane.ts` (typed `mcp-plan` / `mcp-apply` client + error mapping), `manifest-order.ts` (pure relation-topological ordering). |
| `packages/cli` — `src/commands/` | **yes (2 new files)** | `schema-plan.ts`, `schema-apply.ts`. No existing command is rewritten. |
| `packages/cli` — `src/index.ts`, `package.json` | **yes** | 4 export lines; one new workspace dependency (`@beechcms/api-client`). |
| `bin/cli.mjs` | **yes** | `schema:plan`, `schema:apply` in `COMMANDS` + two handlers + help text. `'schema'` is already in the prefix-join list (L8). |
| `apps/api` — `src/features/seeds/seeds.mcp.ts` | **yes (1 file)** | `mcp-plan` returns the current owner (`source`); `mcp-apply` accepts an optional `source` and forwards it to `applyAtomic`; the audit detail records it. |
| `apps/api` — everything else | **NO** | No middleware, no route registration, no repository, no `oauth-scope.middleware.ts` change: `POST /api/seeds/:slug/mcp-apply → schema:write` is already allowlisted (`oauth-scope.middleware.ts:46`). |
| `apps/api/migrations` | **NO** | No DDL. `seeds.source` and the `beech-mcp-cli` OAuth client row already exist in `0000_v040_base.sql:296,443`. |
| `apps/dashboard` | **NO** | No dashboard concern. The 409 guard that protects it shipped in sprint 1. |
| `@beechcms/core` | **NO** | No new core export. `manifestToSeeds`, `validateManifest` and the `Seed` types are consumed exactly as 3a left them. |

#### c) `graphify affected` impact analysis (breaking-change proof)

```
$ graphify affected "authorize" --depth 2
- getAccessToken()      [calls]         packages/mcp/src/client.ts:L143
- request()             [calls]         packages/mcp/src/client.ts:L215
- mcp/src/client.ts     [imports]       packages/mcp/src/client.ts:L18
- mcp/src/index.ts      [imports_from]  packages/mcp/src/index.ts:L32
- freshClient()         [imports_from]  packages/mcp/src/client.test.ts:L25
- mcp/src/client.test.ts [dynamic_import] packages/mcp/src/client.test.ts:L1

$ graphify affected "readGrant" --depth 2
- getAccessToken()      [calls]         packages/mcp/src/client.ts:L118
- request()             [calls]         packages/mcp/src/client.ts:L215
- mcp/src/client.ts     [imports]       packages/mcp/src/client.ts:L19
- mcp/src/index.ts      [imports_from]  packages/mcp/src/index.ts:L32
- freshClient()         [imports_from]  packages/mcp/src/client.test.ts:L25
```

Reading: the entire blast radius of the OAuth + token-cache code is **`packages/mcp/src/client.ts`,
its own test, and `index.ts`'s import of `{ request, BeechClientError }`**. Nothing outside the
package reaches it. Extracting it is therefore provably non-breaking **as long as `client.ts` keeps
exporting `request` and `BeechClientError` with today's signatures** — which is exactly what TASK 7
specifies, and is why `index.ts` (389 lines of tool handlers) is never opened.

```
$ graphify explain "rejectManifestOwned"     Degree: 4
  --> publicProblem()      [calls]    apps/api/src/features/seeds/seeds.helpers.ts:L102
  <-- seeds.handler.ts     [imports]  apps/api/src/features/seeds/seeds.handler.ts:L22
  <-- seeds.destructive.ts [imports]  apps/api/src/features/seeds/seeds.destructive.ts:L18
```

Reading: the ownership guard is wired into the interactive routes **only**. `seeds.mcp.ts` does not
import it, deliberately (`seeds.helpers.ts:95-96`). This sprint keeps that true: making the control
plane refuse `source='code'` writes would make the manifest path unable to edit the very seeds it
owns.

```
$ graphify explain "classifyCandidate"       Degree: 2
  <-- seeds.handler.ts  [re_exports]  apps/api/src/features/seeds/seeds.handler.ts:L327
  <-- seeds.mcp.ts      [contains]    apps/api/src/features/seeds/seeds.mcp.ts:L80

$ graphify explain "mcpApp"                  Degree: 2
  <-- seeds.handler.ts  [re_exports]  apps/api/src/features/seeds/seeds.handler.ts:L330
```

Reading: the classifier and the router are consumed only through the seeds slice's own barrel. The
edits in TASK 14 are **additive on the wire** (one new response field, one new optional request
field), so `packages/mcp/src/index.ts`'s `beech_schema_plan` / `beech_schema_apply` tools — today's
only other client of these two routes — keep working byte-for-byte without being edited.

```
$ graphify affected "compareManifest" --depth 2
- schemaDiff()             [calls]      packages/cli/src/commands/schema-diff.ts:L44
- cli/src/index.ts         [re_exports] packages/cli/src/index.ts:L22
- manifest-compare.test.ts [imports]    packages/cli/src/test/manifest-compare.test.ts:L7

$ graphify explain "manifest-loader.ts"      Degree: 8
  <-- commands/schema-diff.ts   [imports_from] packages/cli/src/commands/schema-diff.ts:L8
  <-- commands/schema-export.ts [imports_from] packages/cli/src/commands/schema-export.ts:L9
```

Reading: 3a's loader and comparator have exactly the two consumers 3a created. This sprint adds
consumers, changes neither signature, and therefore cannot regress `beech schema diff` or
`beech schema export`.

```
$ graphify path "schemaExport" "mcpApp"
No directed path found between 'schemaExport' and 'mcpApp'.
```

Reading: today the CLI has **no code path into the API's handlers** — the two tiers meet only over
HTTP. This sprint must keep that true: `control-plane.ts` imports `fetch` and the shared client, never
a symbol from `apps/api`. It is an acceptance criterion in §6.

---

### VETO Audit

Evaluated against `_config/ponytail_arch.md`.

**1. Botanical Invariant — no D1 access bypasses `@beechcms/core`.**
This is the sprint where the CLI first *mutates* schema, so the invariant is the whole design.
The CLI emits **zero SQL** and opens **zero database handles**: `plan` and `apply` do not call
`createD1Context`, do not resolve `wrangler.jsonc`, and never touch the local SQLite file. Every DDL
string is produced server-side by `planCreateSeed` / `planExtendSeed` inside `@beechcms/core`
(`seeds.mcp.ts:160-165, 259-265`) and executed inside `D1SeedRepository.applyAtomic`'s CAS-guarded
batch. The CLI's role is: read a manifest, POST a candidate `Seed`, print what the server says it will
run, POST an apply. Branch identity stays `br_XX` end to end — `normalizeCandidate` (`seeds.mcp.ts:25`)
restores stored ids by alias before anything is planned, so the authoring-local ids `manifestToSeeds`
mints never reach D1. No field name is hardcoded anywhere in the new code. ✅

**2. VSA — zero cross-feature imports.**
Only one file under `apps/api/src/features/**` is opened (`seeds/seeds.mcp.ts`) and it gains no import
from another slice. The CLI reaches the API over HTTP only (`graphify path` above proves there is no
code path today, and none is added). Logic needed by two packages — the OAuth flow, the grant cache,
the authenticated transport — is **moved into a shared package** rather than duplicated, which is
rule 3 applied at the package tier: `@beechcms/mcp` and `@beechcms/cli` both consume
`@beechcms/api-client`, and neither imports the other. ✅

**3. Cloudflare purity.**
No ORM, no daemon, no stateful job. The new package is Node-only by construction (`node:http`,
`node:fs`, `node:child_process`) and is imported by two Node CLIs — never by the Worker: `graphify
path "createBeechApp" "readGrant"` finds nothing, and nothing in this sprint creates such an edge.
Schema change remains non-deterministic-free: every mutation is additive DDL planned by the engine and
committed in one `db.batch` under an OCC guard; destructive intent is refused by the server
(`seeds.mcp.ts:246-253`) and now *surfaced* by the CLI before anything executes. **Zero new
third-party dependencies** across the whole sprint. ✅

**4. Auth mechanism — the decision the roadmap deferred to this sprint.**
**Chosen: OAuth 2.1 authorization-code + PKCE, client `beech-mcp-cli`.** That client row is already
seeded (`0000_v040_base.sql:443`: `redirect_uris '["http://127.0.0.1/callback"]'`, `allowed_scopes
'schema:read schema:write'`, `is_public 1`) and has **no consumer today** — `@beechcms/mcp` uses the
sibling `beech-mcp` row. `POST /api/seeds/:slug/mcp-apply` is already mapped to `schema:write` in the
fail-closed allowlist (`oauth-scope.middleware.ts:46`), so the server side needs no auth work at all.
Rejected alternatives, with the reason each was rejected:
- **`beech login` with email + password → admin JWT.** Puts a full, unscoped admin session on disk,
  is not revocable per-client from Settings → Connected apps, and burns the login rate limiter. It
  would also be a *second* credential mechanism in a repo that already shipped one.
- **`BEECH_API_TOKEN` env var only.** No first-run path: an operator cannot obtain a token without
  another tool. Kept as an *escape hatch* (§4, TASK 8) for CI, not as the mechanism.
- **Duplicating `packages/mcp/src/oauth.ts` into the CLI.** Two implementations of a security-critical
  flow, two caches, two 401 paths, guaranteed divergence. Rejected on rule 3.

**5. YAGNI adjustments made during this audit (plan changed as a result):**

- **REJECTED — a CLI-side plan store mirroring `packages/mcp/src/plans.ts`.** The MCP server keeps
  plans in memory with a 10-minute TTL because an *agent* holds a conversation between plan and apply.
  `beech schema apply` is one process: it re-plans immediately before each write and compares the
  statements to the ones it printed. A TTL'd store would add state to a stateless command.
- **REJECTED — `beech schema apply --destructive` / a confirm-token flow.** `mcp-apply` refuses
  destructive intent by design and points at the dedicated endpoints (`seeds.mcp.ts:243-253`). Adding
  a CLI path to drop/rename/retype means re-implementing four confirmation protocols client-side. The
  CLI *surfaces* `blockedReasons` verbatim and stops. Out of scope, §7.
- **REJECTED — deleting seeds that are absent from the manifest.** `compareManifest` already reports
  them as `only_in_database`. Making `apply` delete them turns a reviewed additive step into a
  destructive one driven by a file omission. `apply` is additive-only; §7.
- **REJECTED — a `'runtime'` → `'code'` ownership-transfer flag.** Standing decision in `ROADMAP.md`;
  the `ON CONFLICT DO UPDATE` clause deliberately does not update `source`. The CLI **warns** when it
  applies against a `runtime`-owned seed and moves on.
- **REJECTED — parallel apply across seeds.** Each apply bumps `registry_version`; issuing two
  concurrently guarantees a 409 for one of them. Sequential, ordered, deterministic.
- **REJECTED — `--json` output, a `--watch` mode, progress spinners.** No consumer. Added when one
  exists.
- **ACCEPTED, scoped — moving `oauth.ts`/`token-store.ts` out of `packages/mcp`.** This is the only
  refactor in the sprint and it is mechanical: files move, `client.ts` becomes an adapter that
  preserves both exported symbols, `index.ts` is not opened. Verified safe by the `affected` output
  in (c).

**Verdict: APPROVED.** Minimal blueprint: 1 new package (6 files, 0 dependencies), 1 rewritten +
2 deleted files in `packages/mcp`, 4 new files in `packages/cli`, 1 edited dispatcher, 1 edited file
in `apps/api`, 1 edited doc, 0 migrations, 0 files in `apps/dashboard`, 0 new third-party deps.

HANDOFF -> caveman_coder.

---

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Sprint 3a shipped the read half of the manifest workflow: `beech schema export` produces
`beech.schema.ts` from live D1, `beech schema diff` reports when that snapshot is stale or when an
authored manifest disagrees with what is deployed, and `beech types generate` derives client types
from introspection. Every one of those commands ends the same way: **"…run `beech schema plan` /
`apply` to reconcile"** — a remedy that does not exist. `docs/build/cli-workflows.md:122` says so in
print. A drift signal with no reconciliation path is a warning nobody can act on without opening the
dashboard and hand-editing the very seeds the manifest claims to own.

This sprint closes that loop, and it is scheduled here — not earlier — for two reasons the audit
confirmed:

1. **It consumes 3a's loader and comparator.** `loadManifest` + `manifestToSeeds` turn the file into
   candidate `Seed`s; without them `plan` would need its own parser, which is precisely the second
   serializer sprint 1 forbade.
2. **It was split out of entry 3 because its first architectural decision is orthogonal to the read
   path.** The CLI had no authenticated HTTP client and no credential story. Deciding that in the same
   PR as the manifest loader would have coupled an auth review to a file-format review.

**VSA adherence.** The write path crosses a tier boundary — CLI → API — and it crosses it the only way
VSA permits: over the public HTTP contract, through the slice's own control plane. No CLI file imports
a symbol from `apps/api`; no `apps/api` file learns that a CLI exists. Inside `apps/api`, the change
is confined to the seeds slice's `seeds.mcp.ts`; no other slice is opened, and no shared helper gains
a seeds-specific concept. Logic genuinely needed by two packages (OAuth, token cache, transport) is
lifted into `@beechcms/api-client` instead of being copied — the package-tier form of "if two slices
need the same logic, move it to a shared lib".

**Botanical Engine adherence.** This is the first sprint in the chain where the CLI can change a
schema, and it does so without owning a single SQL string. `planCreateSeed` / `planExtendSeed` inside
`@beechcms/core` remain the only producers of DDL; `D1SeedRepository.applyAtomic` remains the only
executor; `normalizeCandidate` remains the only assigner of `br_XX` ids. The CLI contributes a
manifest, a display, a confirmation, and an HTTP call. That is the maximum authority a client tier may
hold in this codebase, and this sprint takes no more of it.

**Ownership becomes real.** `seeds.source` has been a column with exactly one writer (`'runtime'`,
hardcoded) since v0.4.0. Sprint 1 built the guard that refuses dashboard edits to `source = 'code'`
seeds; `seed-ownership.integration.test.ts:50` has to fake ownership with a raw `UPDATE` because *no
production path can write `'code'`*. This sprint is that path. After it, the guard defends rows the
system actually produces, and `beech schema diff` becomes a signal that cannot be silently defeated.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**The control plane (`apps/api/src/features/seeds/seeds.mcp.ts`, 329 lines, degree 15).**
Two routes, mounted at `seedsApp.route('/', mcpApp)` (`seeds.handler.ts:50`), i.e. under `/api/seeds`:

- `POST /api/seeds/:slug/mcp-plan` (L122) — dry run. Normalizes the candidate (`normalizeCandidate`,
  L25: preserves stored `br_XX` by alias, mints missing ones with `nextBranchId`, defaults
  `displayNameAlias`), validates it against the **full active set** via `validateSeedDefinitions`
  (cross-seed relation targets can only be checked whole), classifies it with `classifyCandidate`
  (L80: `'create' | 'additive' | 'destructive'` + `blockedReasons` naming the dedicated endpoint for
  each drop/rename/retype), reads **physical** columns through `schemaMutator.getColumns()`, and
  computes the exact statements `planCreateSeed` / `planExtendSeed` would run. Responds with
  `{ slug, classification, requiresConfirmation, applicable, blockedReasons, statements,
  ftsRebuildNeeded, expectedVersion, issues }`.
- `POST /api/seeds/:slug/mcp-apply` (L200) — mutation. Re-validates, refuses on any
  `blockedReasons` (422 `destructive-change-not-supported`), re-plans against physical columns, and
  commits **one** `applyAtomic` batch: CAS guard on `seed_meta.registry_version` → DDL → definition
  upsert → version bump. A version mismatch returns 409 `conflict` with nothing written. FTS5 rebuild
  runs after the committed batch through `execDestructive` and degrades to a `warning`, never a
  rollback. An audit event is appended with actor, `planId`, classification, versions and DDL count.
  **`source: 'runtime'` is hardcoded at L275** — the gap this sprint closes.

**Ownership plumbing — already complete except for one writer.**
`SeedApplyInput.source?: 'code' | 'runtime'` exists (`packages/core/src/content/seed.repository.ts:57`),
`D1SeedRepository.applyAtomic` destructures it with a `'runtime'` default (L106) and binds it into
`UPSERT_SEED_SQL`, whose `ON CONFLICT DO UPDATE` clause updates `definition`, `status` and
`updated_at` **but not `source`** (L9-16) — ownership is set at row creation and never transfers.
`rejectManifestOwned` (`seeds.helpers.ts:100`, degree 4) returns 409 `seed-manifest-owned` and is
imported by `seeds.handler.ts:22` and `seeds.destructive.ts:18` only.

**OAuth — server side, complete and fail-closed.**
`OAUTH_SCOPE_ROUTES` (`apps/api/src/middleware/oauth-scope.middleware.ts:41`) allowlists
`POST /api/seeds/:slug/mcp-plan → schema:read` and `POST /api/seeds/:slug/mcp-apply → schema:write`;
any `/api/*` path not listed is refused for OAuth-authenticated requests. The middleware is registered
immediately after `authMiddleware({ acceptOAuth: true })` and passes admin-JWT requests through
untouched (`oauthGrant === null`). Two public clients are seeded in
`apps/api/migrations/0000_v040_base.sql`: `beech-mcp` (L435, redirect `http://127.0.0.1/oauth/callback`)
and **`beech-mcp-cli` (L443, redirect `http://127.0.0.1/callback`, scopes `schema:read schema:write`,
`is_public = 1`) which nothing uses today**. Loopback redirect matching compares
protocol + hostname + pathname only, so the ephemeral port is free (`authorization-request.ts:111`).

**OAuth — client side, exists once, in the wrong package.**
`packages/mcp/src/oauth.ts` (degree 19): `createPkcePair` (over `deriveCodeChallenge` from
`@beechcms/core`), a loopback `node:http` listener on port 0 with `state` verification and a timeout,
`openBrowser` via `open`/`start`/`xdg-open`, `authorize()` and `refresh()` over
`POST /oauth/token`. `packages/mcp/src/token-store.ts` (degree 12): `~/.beechcms/mcp-tokens.json`
(override `BEECH_TOKEN_CACHE`), keyed `` `${apiUrl}|${clientId}` ``, atomic tmp→chmod 0600→rename
writes, every function swallowing its own I/O errors. `packages/mcp/src/client.ts`: module-level
`const config = loadConfig()` (env → `.dev.vars` → `http://localhost:8789`), in-memory grant, an
`inFlightAuth` guard against double browser windows, 30s expiry skew, refresh-then-retry on 401,
`insufficient_scope` detection on 403, two retries on 502/503/504, RFC 7807 parsing, and
`request<T>(method, path, body): Promise<{ data: T; headers: Headers }>`.
Its blast radius is `index.ts:32` and `client.test.ts` — nothing else (see Pre-Computation (c)).

**The CLI's schema tier after 3a.**
`lib/d1-context.ts` (degree 17) — `CliError { message, hint?, cause? }`, `exitWithError` (red `✗`, grey
hint, `process.exit(1)`), `createD1Context`, `loadLiveSeeds`. `lib/manifest-loader.ts` (degree 8) —
`DEFAULT_MANIFEST_PATH = 'beech.schema.ts'`, `ManifestLoadError`, `loadManifest(path)` importing the
file through Node's native type-stripping ESM loader and validating it with `validateManifest`.
`lib/manifest-compare.ts` — `compareManifest(manifest, liveSeeds) → { seeds: SeedDrift[], inSync }`.
Commands `schema-export.ts`, `schema-diff.ts`, `generate-types.ts` all follow the same shape: an
options interface, a single exported async function, a `try { … } catch (error) { exitWithError(error) }`
envelope, `picocolors` output, `process.exit(1)` for a non-clean result.
`packages/cli/package.json` dependencies are `@beechcms/core`, `@clack/prompts`, `picocolors` — no
HTTP client, no auth, nothing that talks to the API.

**Dispatcher.** `bin/cli.mjs:8` joins `schema <sub>` into `schema:<sub>`; `COMMANDS` (L20-54) maps
`'schema:diff'` and `'schema:export'` to thin arg-parsing wrappers that `await import('@beechcms/cli')`
and call the exported function. `packages/cli/src/test/cli-docs-parity.test.ts` fails the build for any
`COMMANDS` key that is not documented in `docs/build/cli-workflows.md`.

**Manifest shape.** `manifestToSeeds(manifest) → Seed[]` (`packages/core/src/schema/manifest-seeds.ts:36`)
fills authoring-local branch ids; relation branches carry `targetSeed`
(`packages/core/src/engine/types.ts:144`), and `validateSeedDefinitions` fatals on a target absent from
the candidate set (`seed-validation.ts:44-51`) — which is why apply order matters.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

**New package — `packages/api-client/` (`@beechcms/api-client`, private, 0 third-party deps)**

| File | Status | Content |
|------|--------|---------|
| `package.json` | new | name, `type: module`, build/test/lint scripts mirroring `packages/mcp` |
| `tsconfig.json` | new | mirrors `packages/mcp/tsconfig.json`, references `../core` |
| `vitest.config.ts` | new | mirrors `packages/mcp/vitest.config.ts` |
| `src/errors.ts` | new | `BeechClientError` (+ optional `status` / `problem`), `ProblemDetails` |
| `src/token-store.ts` | **moved** from `packages/mcp/src/token-store.ts` | unchanged behaviour, unchanged cache path and key |
| `src/oauth.ts` | **moved** from `packages/mcp/src/oauth.ts` | unchanged flow; imports `BeechClientError` from `./errors.js` |
| `src/client.ts` | new (extracted) | `createApiClient(config) → ApiClient`, `resolveApiConfig(overrides)` |
| `src/index.ts` | new | barrel |
| `src/oauth.test.ts`, `src/token-store.test.ts`, `src/client.test.ts` | **moved** from `packages/mcp/src/` | adapted to the factory |

**`packages/mcp/` (adapter only — `index.ts` is NOT opened)**

| File | Status | Content |
|------|--------|---------|
| `src/client.ts` | rewritten (~35 lines) | singleton adapter; still exports `request` and `BeechClientError` unchanged |
| `src/oauth.ts`, `src/token-store.ts` | **deleted** (moved) | — |
| `src/oauth.test.ts`, `src/token-store.test.ts` | **deleted** (moved) | — |
| `src/client.test.ts` | rewritten | mocks `@beechcms/api-client` instead of the two local modules |
| `package.json`, `tsconfig.json` | edited | workspace dep + project reference on `../api-client` |

**`packages/cli/`**

| File | Status | Content |
|------|--------|---------|
| `src/lib/control-plane.ts` | new | typed `mcp-plan` / `mcp-apply` client, `BeechClientError` → `CliError` mapping |
| `src/lib/manifest-order.ts` | new | pure relation-topological ordering + cycle detection |
| `src/commands/schema-plan.ts` | new | `beech schema plan` |
| `src/commands/schema-apply.ts` | new | `beech schema apply` |
| `src/index.ts` | edited | 4 export lines |
| `package.json` | edited | `"@beechcms/api-client": "workspace:^0.1.0"` |
| `src/test/control-plane.test.ts` | new | unit |
| `src/test/manifest-order.test.ts` | new | unit |
| `src/test/schema-plan.test.ts` | new | unit |
| `src/test/schema-apply.test.ts` | new | unit |

**`apps/api/`**

| File | Status | Content |
|------|--------|---------|
| `src/features/seeds/seeds.mcp.ts` | edited (3 places) | plan response `source`; apply accepts `source`; audit detail |
| `src/features/seeds/test/integration/seed-ownership.integration.test.ts` | edited (+2 cases) | `source='code'` on create; ownership does not transfer on update |

**Root**

| File | Status | Content |
|------|--------|---------|
| `bin/cli.mjs` | edited | `schema:plan`, `schema:apply`, two handlers, help |
| `docs/build/cli-workflows.md` | edited | 2 matrix rows + §6 rewrite (parity test gate) |

**Explicitly excluded from this sprint:** no migration, no dashboard file, no change to
`packages/mcp/src/index.ts`, no change to `@beechcms/core`, no new third-party dependency.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

## TASK 1 — `packages/api-client/` scaffold (3 new files)

`packages/api-client/package.json`:

```json
{
  "name": "@beechcms/api-client",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": "./dist/index.js" },
  "files": ["dist"],
  "scripts": {
    "build": "tsc --noEmit && esbuild src/index.ts --bundle --packages=external --platform=node --format=esm --outfile=dist/index.js",
    "dev": "esbuild src/index.ts --bundle --packages=external --platform=node --format=esm --outfile=dist/index.js --watch",
    "lint": "eslint .",
    "type-check": "tsc --noEmit",
    "test": "vitest run",
    "test:unit": "vitest run",
    "test:coverage": "vitest run --coverage"
  },
  "dependencies": { "@beechcms/core": "workspace:^0.8.0" },
  "devDependencies": {
    "@types/node": "^24.10.1",
    "esbuild": "^0.28.1",
    "typescript": "^5.9.3",
    "vitest": "^4.1.11"
  },
  "license": "MIT"
}
```

`packages/api-client/tsconfig.json` — byte-identical to `packages/mcp/tsconfig.json` (composite,
`outDir: dist`, `rootDir: src`, `module: ESNext`, `moduleResolution: Bundler`, `target: ES2022`,
`references: [{ "path": "../core" }]`).

`packages/api-client/vitest.config.ts` — byte-identical to `packages/mcp/vitest.config.ts`
(`environment: 'node'`, `include: ['src/**/*.test.ts']`, v8 coverage excluding `index.ts` and tests).

No `eslint.config.js`: the root config already covers `packages/*` (neither `cli` nor `mcp` has a
local one). Run `pnpm install` after creating the manifest so the workspace link is materialized.

## TASK 2 — `packages/api-client/src/errors.ts` (new)

`BeechClientError` moves out of `client.ts` so `oauth.ts` no longer imports from it (today's
`oauth.ts:19 → client.ts` edge is the one circular-looking import in the pair). Two optional fields are
added; **the `message` string stays exactly what `client.ts` produces today**, because
`packages/mcp/src/index.ts` renders `error.message` into MCP tool output and its tests assert on it.

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/** RFC 7807 Problem Details, as the BeechCMS API returns them on error. */
export interface ProblemDetails {
  type: string
  title: string
  status: number
  detail: string
}

/**
 * Failure of an API request, an OAuth exchange, or a connection attempt.
 *
 * `status` and `problem` are populated only for HTTP failures that carried a parseable body; callers
 * that need to branch on the failure (the CLI maps 401/403/409 to distinct remedies) read them, while
 * callers that only render text (the MCP server) keep using `message` unchanged.
 */
export class BeechClientError extends Error {
  constructor(message: string, readonly status?: number, readonly problem?: Partial<ProblemDetails>) {
    super(message)
    this.name = 'BeechClientError'
  }
}
```

## TASK 3 — `packages/api-client/src/token-store.ts` (moved, verbatim)

`git mv packages/mcp/src/token-store.ts packages/api-client/src/token-store.ts` and
`git mv packages/mcp/src/token-store.test.ts packages/api-client/src/token-store.test.ts`.
**No content change.** The cache path (`~/.beechcms/mcp-tokens.json`), the `BEECH_TOKEN_CACHE`
override, the `` `${apiUrl}|${clientId}` `` key and the 0600 atomic write are all preserved — the CLI
becomes a second key in the same file, so an operator has one credential store, not two.

## TASK 4 — `packages/api-client/src/oauth.ts` (moved, one import line changed)

`git mv packages/mcp/src/oauth.ts packages/api-client/src/oauth.ts` and likewise for
`oauth.test.ts`. The **only** edit:

```ts
-import { BeechClientError } from './client.js'
+import { BeechClientError } from './errors.js'
```

Everything else — `OAuthConfig`, `TokenGrant`, `PkcePair`, `base64Url`, `createPkcePair`,
`exchangeToken`, `renderClosePage`, `waitForCallback`, `openBrowser`, `authorize`, `refresh` — moves
unchanged, including the `/oauth/callback` loopback path (both seeded clients match loopback on
protocol + hostname + pathname, and `beech-mcp-cli` is registered with `/callback`; see TASK 5's
`callbackPath` note).

**One additive change is required** for the CLI to use the `beech-mcp-cli` client: the loopback
listener's accepted path becomes configurable, because the registered redirect URI differs between the
two clients.

```ts
export interface OAuthConfig {
  apiUrl: string
  authUrl: string
  clientId: string
  scope: string
  timeoutMs: number
  /** Loopback path the browser is redirected to. MUST match the client's registered
   *  `redirect_uris` pathname — `matchesRegisteredRedirectUri` compares protocol + hostname +
   *  pathname and ignores only the port. Default '/oauth/callback' (client `beech-mcp`). */
  callbackPath?: string
}
```

In `waitForCallback`, replace the two literals with the resolved value:

```ts
function waitForCallback(state: string, timeoutMs: number, callbackPath: string) { … }
//   if (url.pathname !== callbackPath) { res.writeHead(404); res.end(); return }
//   resolvePort(`http://127.0.0.1:${port}${callbackPath}`)
```

and in `authorize`: `const callbackPath = config.callbackPath ?? '/oauth/callback'`, passed through.
Default preserved ⇒ the MCP server's behaviour is byte-identical.

## TASK 5 — `packages/api-client/src/client.ts` (new — the extraction)

The transport is lifted out of `packages/mcp/src/client.ts` **unchanged in behaviour** and turned into
a factory. Module-level `config`, `grant` and `inFlightAuth` become closure state of one client
instance, which is what makes a second consumer possible at all.

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * Authenticated HTTP client for the BeechCMS REST API.
 *
 * OAuth 2.1 authorization-code + PKCE, an on-disk grant cache shared with every other Beech tool, and
 * refresh-and-retry on 401. One instance owns one grant: the browser flow is guarded per instance so
 * two concurrent calls never open two consent windows.
 *
 * @module
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { authorize, refresh, type OAuthConfig } from './oauth.js'
import { BeechClientError, type ProblemDetails } from './errors.js'
import { type CachedGrant, clearGrant, readGrant, writeGrant } from './token-store.js'

/** Seconds of clock skew treated as "already expired", so a token that dies in flight is refreshed
 *  before the request rather than after a 401. */
const EXPIRY_SKEW_MS = 30_000
const MAX_TRANSIENT_RETRIES = 2
const RETRY_BASE_DELAY_MS = 100

export interface ApiResponse<T> {
  data: T
  headers: Headers
}

export interface ApiClient {
  request<T = unknown>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>>
  readonly baseUrl: string
}

export interface ApiClientConfig {
  baseUrl: string
  oauth: OAuthConfig
}

/** Overrides a caller may set; anything omitted falls back to env, `.dev.vars`, then the default. */
export interface ApiConfigOverrides {
  baseUrl?: string
  clientId?: string
  scope?: string
  callbackPath?: string
}

function readDevVarsApiUrl(): string | undefined {
  const devVarsPath = join(process.cwd(), '.dev.vars')
  if (!existsSync(devVarsPath)) return undefined
  const match = readFileSync(devVarsPath, 'utf8').match(/^BEECH_API_URL=(.*)$/m)
  return match ? match[1].trim() : undefined
}

/** Resolves connection + OAuth configuration from overrides, environment, `.dev.vars`, defaults. */
export function resolveApiConfig(overrides: ApiConfigOverrides = {}): ApiClientConfig {
  const baseUrl = overrides.baseUrl ?? process.env.BEECH_API_URL ?? readDevVarsApiUrl() ?? 'http://localhost:8789'
  return {
    baseUrl,
    oauth: {
      apiUrl: baseUrl,
      authUrl: process.env.BEECH_AUTH_URL ?? baseUrl,
      clientId: overrides.clientId ?? process.env.BEECH_OAUTH_CLIENT_ID ?? 'beech-mcp',
      scope: overrides.scope ?? process.env.BEECH_OAUTH_SCOPE ?? 'schema:read schema:write',
      timeoutMs: process.env.BEECH_OAUTH_TIMEOUT_MS ? Number(process.env.BEECH_OAUTH_TIMEOUT_MS) : 180_000,
      callbackPath: overrides.callbackPath,
    },
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function createApiClient(config: ApiClientConfig): ApiClient {
  let grant: CachedGrant | undefined
  let inFlightAuth: Promise<CachedGrant> | undefined

  async function getAccessToken(forceRefresh = false): Promise<string> {
    if (grant === undefined) grant = readGrant(config.baseUrl, config.oauth.clientId)
    if (grant && !forceRefresh && grant.expiresAt - Date.now() > EXPIRY_SKEW_MS) return grant.accessToken
    if (inFlightAuth) return (await inFlightAuth).accessToken

    const authPromise = (async () => {
      if (grant?.refreshToken) {
        try {
          const refreshed = await refresh(config.oauth, grant.refreshToken)
          writeGrant(config.baseUrl, config.oauth.clientId, refreshed)
          grant = refreshed
          return refreshed
        } catch {
          clearGrant(config.baseUrl, config.oauth.clientId)
          grant = undefined
        }
      }
      const authorized = await authorize(config.oauth)
      writeGrant(config.baseUrl, config.oauth.clientId, authorized)
      grant = authorized
      return authorized
    })()

    inFlightAuth = authPromise
    try {
      return (await authPromise).accessToken
    } finally {
      inFlightAuth = undefined
    }
  }

  async function rawFetch(method: string, path: string, accessToken: string, body?: unknown): Promise<Response> {
    try {
      return await fetch(`${config.baseUrl}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
    } catch (error) {
      if (error instanceof TypeError || (error as NodeJS.ErrnoException)?.code === 'ECONNREFUSED') {
        throw new BeechClientError(`Cannot reach the BeechCMS API at ${config.baseUrl}. Start the local stack with: pnpm beech dev`)
      }
      throw error
    }
  }

  async function request<T = unknown>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
    let accessToken = await getAccessToken()
    let response = await rawFetch(method, path, accessToken, body)

    if (response.status === 401) {
      accessToken = await getAccessToken(true)
      response = await rawFetch(method, path, accessToken, body)
      if (response.status === 401) {
        throw new BeechClientError(
          'Authorization failed. Run any Beech tool again to re-authorize in the browser, or revoke and re-grant the client from Settings → Connected apps.',
          401,
        )
      }
    }

    for (let attempt = 0; isRetryableStatus(response.status) && attempt < MAX_TRANSIENT_RETRIES; attempt++) {
      await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt + Math.random() * RETRY_BASE_DELAY_MS)
      response = await rawFetch(method, path, accessToken, body)
    }

    if (response.status === 403) {
      let errorBody: { error?: string; error_description?: string } = {}
      try { errorBody = (await response.json()) as typeof errorBody } catch { /* non-JSON error body */ }
      if (errorBody.error === 'insufficient_scope') {
        const scope = errorBody.error_description?.match(/'([^']+)'/)?.[1] ?? ''
        throw new BeechClientError(
          `Token lacks the '${scope}' scope. Revoke 'BeechCMS MCP Server' under Settings → Connected apps and re-authorize.`,
          403,
        )
      }
      throw new BeechClientError(
        JSON.stringify({ status: 403, title: errorBody.error ?? response.statusText, detail: errorBody.error_description ?? '' }),
        403,
      )
    }

    if (!response.ok) {
      let problem: Partial<ProblemDetails> = {}
      try { problem = (await response.json()) as Partial<ProblemDetails> } catch { /* non-JSON error body */ }
      throw new BeechClientError(
        JSON.stringify({ status: problem.status ?? response.status, title: problem.title ?? response.statusText, detail: problem.detail ?? '' }),
        problem.status ?? response.status,
        problem,
      )
    }

    return { data: (await response.json()) as T, headers: response.headers }
  }

  return { request, baseUrl: config.baseUrl }
}
```

**Every message string above is copied from today's `packages/mcp/src/client.ts`.** The added `status`
/ `problem` arguments are the only behavioural delta, and they are additive.

## TASK 6 — `packages/api-client/src/index.ts` (new)

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export { createApiClient, resolveApiConfig } from './client.js'
export type { ApiClient, ApiClientConfig, ApiConfigOverrides, ApiResponse } from './client.js'
export { BeechClientError } from './errors.js'
export type { ProblemDetails } from './errors.js'
export { authorize, refresh, createPkcePair, base64Url } from './oauth.js'
export type { OAuthConfig, TokenGrant, PkcePair } from './oauth.js'
export { readGrant, writeGrant, clearGrant, cachePath, cacheKey } from './token-store.js'
export type { CachedGrant } from './token-store.js'
```

## TASK 7 — `packages/mcp/src/client.ts` (rewritten as an adapter, ~35 lines)

The MCP server keeps a module-level singleton because its tool handlers call `request()` directly and
its config comes only from the environment. Both exported symbols keep today's signatures, so
`index.ts` (389 lines) is **not opened**.

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * Process-wide API client for the MCP server.
 *
 * The transport, the OAuth flow and the grant cache live in `@beechcms/api-client`, shared with the
 * `beech` CLI: one credential path, one token store, one 401 policy. This module only fixes the
 * client identity (`beech-mcp`) and the singleton lifetime the stdio server needs.
 *
 * @module
 */

import { createApiClient, resolveApiConfig, type ApiResponse } from '@beechcms/api-client'

export { BeechClientError } from '@beechcms/api-client'
export type { ProblemDetails, ApiResponse } from '@beechcms/api-client'

const client = createApiClient(resolveApiConfig())

/** Sends an authenticated request to the BeechCMS API. See `@beechcms/api-client`. */
export function request<T = unknown>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
  return client.request<T>(method, path, body)
}
```

Then:
- `git rm packages/mcp/src/oauth.ts packages/mcp/src/token-store.ts` (moved in TASKs 3-4).
- `packages/mcp/package.json`: add `"@beechcms/api-client": "workspace:^0.1.0"` to `dependencies`.
- `packages/mcp/tsconfig.json`: `"references": [{ "path": "../core" }, { "path": "../api-client" }]`.
- Leave `index.ts`, `plans.ts`, `resources.ts`, `supervisor.ts` untouched.

## TASK 8 — `packages/cli/src/lib/control-plane.ts` (new)

The CLI's half of the boundary: the wire types, one client, and the translation of
`BeechClientError` into the `CliError` idiom every other command already prints.

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module lib/control-plane
 * The CLI's client for the seeds control plane (`POST /api/seeds/:slug/mcp-plan` / `mcp-apply`).
 *
 * Schema mutation from the CLI travels this module and nothing else: no SQL is built here, no D1
 * handle is opened, and no DDL is executed locally. The server plans through `@beechcms/core` and
 * commits through `D1SeedRepository.applyAtomic`; this module carries a candidate there and brings
 * the verdict back.
 */

import type { Seed } from '@beechcms/core'
import { createApiClient, resolveApiConfig, BeechClientError, type ApiClient } from '@beechcms/api-client'
import { CliError } from './d1-context.js'

/** OAuth client seeded for the CLI in `apps/api/migrations/0000_v040_base.sql`. Distinct from the MCP
 *  server's `beech-mcp` row so a grant can be revoked per tool in Settings → Connected apps. */
export const CLI_OAUTH_CLIENT_ID = 'beech-mcp-cli'

/** Registered redirect pathname for {@link CLI_OAUTH_CLIENT_ID}; the port is matched loosely. */
const CLI_CALLBACK_PATH = '/callback'

/** Verbatim response of `POST /api/seeds/:slug/mcp-plan`. */
export interface McpPlan {
  slug: string
  classification: 'create' | 'additive' | 'destructive'
  requiresConfirmation: boolean
  applicable: boolean
  /** Non-empty ⇒ apply will refuse. Each entry names the endpoint that CAN perform the change. */
  blockedReasons: string[]
  /** Exactly the DDL apply will run. Displayed, never parsed. */
  statements: string[]
  ftsRebuildNeeded: boolean
  expectedVersion: number
  issues: Array<{ fatal: boolean; messages: string[] }>
  /** Current owner, or null when the seed does not exist yet. Added by sprint 3b. */
  source: 'code' | 'runtime' | null
}

/** Verbatim response of `POST /api/seeds/:slug/mcp-apply`. */
export interface McpApplyResult {
  slug: string
  newVersion: number
  ftsRebuilt: boolean
  warning?: string
}

export interface ControlPlaneOptions {
  /** API origin. Default: `BEECH_API_URL`, then `.dev.vars`, then `http://localhost:8789`. */
  apiUrl?: string
}

export interface ControlPlane {
  plan(slug: string, candidate: Seed): Promise<McpPlan>
  apply(input: { slug: string; candidate: Seed; expectedVersion: number; planId: string }): Promise<McpApplyResult>
  readonly baseUrl: string
}

/** Maps a transport failure onto the CliError idiom, attaching the remedy the operator needs. */
function toCliError(error: unknown, slug: string): CliError {
  if (!(error instanceof BeechClientError)) {
    return new CliError(error instanceof Error ? error.message : String(error), undefined, error)
  }
  const detail = error.problem?.detail ?? error.message
  if (error.status === 401 || error.status === 403) {
    return new CliError(`Not authorized to change schema (${slug}).`, error.message, error)
  }
  if (error.status === 409) {
    return new CliError(
      `The schema registry moved while '${slug}' was being applied. Nothing was written.`,
      'Re-run `beech schema plan` and apply again.',
      error,
    )
  }
  if (error.status === 422) {
    return new CliError(`Server refused the change to '${slug}': ${detail}`, undefined, error)
  }
  return new CliError(`Control plane request failed for '${slug}': ${detail}`, undefined, error)
}

export function createControlPlane(options: ControlPlaneOptions = {}): ControlPlane {
  const config = resolveApiConfig({
    baseUrl: options.apiUrl,
    clientId: CLI_OAUTH_CLIENT_ID,
    scope: 'schema:read schema:write',
    callbackPath: CLI_CALLBACK_PATH,
  })
  const client: ApiClient = createApiClient(config)

  return {
    baseUrl: config.baseUrl,

    async plan(slug, candidate) {
      try {
        const { data } = await client.request<McpPlan>('POST', `/api/seeds/${slug}/mcp-plan`, { candidate })
        return data
      } catch (error) {
        throw toCliError(error, slug)
      }
    },

    async apply({ slug, candidate, expectedVersion, planId }) {
      try {
        // `source: 'code'` is written ONLY when the row is created: UPSERT_SEED_SQL's
        // ON CONFLICT clause deliberately omits `source`, so applying a manifest over a
        // dashboard-created seed never seizes ownership (ROADMAP standing decision).
        const { data } = await client.request<McpApplyResult>('POST', `/api/seeds/${slug}/mcp-apply`, {
          candidate,
          expectedVersion,
          planId,
          source: 'code',
        })
        return data
      } catch (error) {
        throw toCliError(error, slug)
      }
    },
  }
}
```

**CI escape hatch:** none is added here. `@beechcms/api-client` already honours `BEECH_API_URL`,
`BEECH_AUTH_URL`, `BEECH_OAUTH_CLIENT_ID`, `BEECH_OAUTH_SCOPE` and `BEECH_TOKEN_CACHE`, so a pipeline
that pre-seeds a grant file at `BEECH_TOKEN_CACHE` runs unattended with no extra code.

## TASK 9 — `packages/cli/src/lib/manifest-order.ts` (new, pure)

`validateSeedDefinitions` fatals on a relation whose `targetSeed` is not in the candidate set
(`seed-validation.ts:44-51`), and the server validates each candidate against *live* seeds plus that
one candidate. Applying a manifest in file order therefore fails whenever a new seed references
another new seed that has not been applied yet. This module fixes the order; it has no I/O and no
dependency beyond the `Seed` type.

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module lib/manifest-order
 * Orders manifest seeds so a relation target is always applied before the seed that points at it.
 *
 * The server validates each candidate against the live set plus that candidate alone, so a brand-new
 * seed whose `targetSeed` is also brand-new is fatal until the target exists. Targets already live in
 * D1, or absent from the manifest entirely, impose no constraint here — the server is the authority on
 * whether they resolve.
 */

import type { Seed } from '@beechcms/core'

export interface ApplyOrder {
  /** Dependency-ordered; ties broken by slug so two runs over one manifest are identical. */
  ordered: Seed[]
  /** Slug groups that reference each other. Non-empty ⇒ no total order exists. */
  cycles: string[][]
}

/** Relation targets this manifest also defines. Self-references are ignored: a seed may point at its
 *  own table, and `planCreateSeed` emits that FK inside the same CREATE TABLE. */
function manifestTargets(seed: Seed, slugs: Set<string>): string[] {
  const targets = new Set<string>()
  for (const branch of seed.branches ?? []) {
    if (branch.type === 'relation' && branch.targetSeed && branch.targetSeed !== seed.slug && slugs.has(branch.targetSeed)) {
      targets.add(branch.targetSeed)
    }
  }
  return [...targets].sort((a, b) => a.localeCompare(b))
}

export function orderSeedsForApply(seeds: Seed[]): ApplyOrder {
  const bySlug = new Map(seeds.map(seed => [seed.slug, seed]))
  const slugs = new Set(bySlug.keys())
  const sorted = [...seeds].sort((a, b) => a.slug.localeCompare(b.slug))

  const ordered: Seed[] = []
  const state = new Map<string, 'visiting' | 'done'>()
  const cycles: string[][] = []

  function visit(seed: Seed, stack: string[]): void {
    const mark = state.get(seed.slug)
    if (mark === 'done') return
    if (mark === 'visiting') {
      // Record the cycle from its first occurrence in the current stack, so the message names
      // exactly the seeds involved and nothing above them.
      cycles.push([...stack.slice(stack.indexOf(seed.slug)), seed.slug])
      return
    }
    state.set(seed.slug, 'visiting')
    for (const target of manifestTargets(seed, slugs)) {
      const next = bySlug.get(target)
      if (next) visit(next, [...stack, seed.slug])
    }
    state.set(seed.slug, 'done')
    ordered.push(seed)
  }

  for (const seed of sorted) visit(seed, [])

  return { ordered, cycles }
}
```

## TASK 10 — `packages/cli/src/commands/schema-plan.ts` (new)

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import pc from 'picocolors'
import { manifestToSeeds } from '@beechcms/core/schema'
import { CliError, exitWithError } from '../lib/d1-context.js'
import { DEFAULT_MANIFEST_PATH, loadManifest } from '../lib/manifest-loader.js'
import { createControlPlane, type ControlPlane, type McpPlan } from '../lib/control-plane.js'
import { orderSeedsForApply } from '../lib/manifest-order.js'

export interface SchemaPlanOptions {
  /** Manifest to plan. Default: `beech.schema.ts`. */
  manifest?: string
  /** API origin. Default: `BEECH_API_URL`, then `.dev.vars`, then `http://localhost:8789`. */
  apiUrl?: string
}

/**
 * Computes — and only prints — what applying `beech.schema.ts` would do.
 *
 * Nothing is written: every plan is the server's own dry run (`POST /api/seeds/:slug/mcp-plan`), so
 * the DDL displayed here is literally the DDL `beech schema apply` would execute. Exits 1 when any
 * seed is not applicable, so CI can gate on it exactly like `beech schema diff`.
 */
export async function schemaPlan(args: SchemaPlanOptions = {}): Promise<void> {
  try {
    const manifestPath = args.manifest ?? DEFAULT_MANIFEST_PATH
    const manifest = await loadManifest(manifestPath)
    const { ordered, cycles } = orderSeedsForApply(manifestToSeeds(manifest))

    if (cycles.length > 0) {
      throw new CliError(
        `Relation cycle in ${manifestPath}: ${cycles.map(cycle => cycle.join(' → ')).join('; ')}.`,
        'Apply one of these seeds without its relation branch first, then add the branch and apply again.',
      )
    }

    const controlPlane = createControlPlane({ apiUrl: args.apiUrl })
    console.log(pc.cyan(`\n  Plan for ${manifestPath} against ${controlPlane.baseUrl}\n`))

    const plans: McpPlan[] = []
    for (const seed of ordered) {
      // Sequential: each plan carries the registry version it was computed against, and a
      // concurrent plan would report a version its own apply could not use.
      const plan = await controlPlane.plan(seed.slug, seed)
      plans.push(plan)
      renderPlan(plan)
    }

    const blocked = plans.filter(plan => !plan.applicable)
    console.log('')
    if (blocked.length > 0) {
      console.log(pc.yellow(`  ⚠ ${blocked.length} seed(s) cannot be applied: ${blocked.map(p => p.slug).join(', ')}\n`))
      process.exit(1)
    }
    const changing = plans.filter(plan => plan.statements.length > 0)
    if (changing.length === 0) {
      console.log(pc.green('  ✓ Nothing to apply — the deployed schema already matches the manifest.\n'))
      return
    }
    console.log(pc.green(`  ✓ ${changing.length} seed(s) ready to apply. Run \`beech schema apply\`.\n`))
  } catch (error) {
    exitWithError(error)
  }
}

/** Renders one plan. Pure output — no exit codes, no decisions. */
export function renderPlan(plan: McpPlan): void {
  const label =
    plan.classification === 'create' ? pc.green('create') :
    plan.classification === 'additive' ? pc.cyan('additive') :
    pc.red('destructive')
  const owner = plan.source === null ? 'new' : plan.source === 'code' ? 'manifest-owned' : 'dashboard-owned'
  console.log(`  ${pc.bold(plan.slug)} — ${label} (${owner})`)

  if (plan.source === 'runtime') {
    // Ownership is set at row creation and never transfers (ROADMAP standing decision), so an
    // operator must not read a successful apply as "this seed is mine now".
    console.log(pc.dim('    note: stays dashboard-editable — applying does not transfer ownership'))
  }
  for (const issue of plan.issues) {
    for (const message of issue.messages) {
      console.log(issue.fatal ? pc.red(`    ✗ ${message}`) : pc.yellow(`    ! ${message}`))
    }
  }
  for (const reason of plan.blockedReasons) console.log(pc.red(`    ✗ ${reason}`))
  for (const statement of plan.statements) console.log(pc.dim(`    ${statement}`))
  if (plan.statements.length === 0 && plan.applicable) console.log(pc.dim('    (no change)'))
  if (plan.ftsRebuildNeeded) console.log(pc.yellow('    ! full-text index will be rebuilt after apply'))
}
```

## TASK 11 — `packages/cli/src/commands/schema-apply.ts` (new)

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { randomUUID } from 'node:crypto'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import type { Seed } from '@beechcms/core'
import { manifestToSeeds } from '@beechcms/core/schema'
import { CliError, exitWithError } from '../lib/d1-context.js'
import { DEFAULT_MANIFEST_PATH, loadManifest } from '../lib/manifest-loader.js'
import { createControlPlane, type ControlPlane, type McpPlan } from '../lib/control-plane.js'
import { orderSeedsForApply } from '../lib/manifest-order.js'
import { renderPlan } from './schema-plan.js'

export interface SchemaApplyOptions {
  manifest?: string
  apiUrl?: string
  /** Skip the confirmation prompt. Required in a non-interactive shell. */
  yes?: boolean
}

/**
 * Applies `beech.schema.ts` to the deployed schema through the control plane.
 *
 * Three phases, in order: plan everything and show it; confirm once; then apply seed by seed, each one
 * re-planned immediately before its write so the OCC version is current and the statements are still
 * the ones the operator approved. Additive only — a seed present in D1 and absent from the manifest is
 * never touched, and destructive intent is refused by the server before anything executes.
 */
export async function schemaApply(args: SchemaApplyOptions = {}): Promise<void> {
  try {
    const manifestPath = args.manifest ?? DEFAULT_MANIFEST_PATH
    const manifest = await loadManifest(manifestPath)
    const { ordered, cycles } = orderSeedsForApply(manifestToSeeds(manifest))

    if (cycles.length > 0) {
      throw new CliError(
        `Relation cycle in ${manifestPath}: ${cycles.map(cycle => cycle.join(' → ')).join('; ')}.`,
        'Apply one of these seeds without its relation branch first, then add the branch and apply again.',
      )
    }

    const controlPlane = createControlPlane({ apiUrl: args.apiUrl })
    console.log(pc.cyan(`\n  Plan for ${manifestPath} against ${controlPlane.baseUrl}\n`))

    const previews = new Map<string, McpPlan>()
    for (const seed of ordered) {
      const plan = await controlPlane.plan(seed.slug, seed)
      previews.set(seed.slug, plan)
      renderPlan(plan)
    }

    const blocked = [...previews.values()].filter(plan => !plan.applicable)
    if (blocked.length > 0) {
      // All-or-nothing at the run level: applying the appliable half of a reviewed manifest leaves
      // the database in a state no manifest describes.
      throw new CliError(
        `${blocked.length} seed(s) cannot be applied: ${blocked.map(plan => plan.slug).join(', ')}. Nothing was written.`,
        'Fix the manifest, or perform the flagged changes through the endpoints named above.',
      )
    }

    const pending = ordered.filter(seed => (previews.get(seed.slug)?.statements.length ?? 0) > 0)
    if (pending.length === 0) {
      console.log(pc.green('\n  ✓ Nothing to apply — the deployed schema already matches the manifest.\n'))
      return
    }

    await confirmApply(pending, args.yes === true)

    const planId = randomUUID()
    console.log('')
    for (const seed of pending) {
      const result = await applyOne(controlPlane, seed, previews.get(seed.slug)!, planId)
      console.log(pc.green(`  ✓ ${seed.slug} — registry version ${result.newVersion}`))
      if (result.warning) console.log(pc.yellow(`    ! ${result.warning}`))
    }

    console.log(pc.green(`\n  ✓ Applied ${pending.length} seed(s).`))
    console.log(pc.dim('    Regenerate client types with `beech types generate`.\n'))
  } catch (error) {
    exitWithError(error)
  }
}

/** One write. Re-plans first: the previous seed's apply bumped `registry_version`, so the version
 *  printed in the preview is already stale by construction. */
async function applyOne(controlPlane: ControlPlane, seed: Seed, preview: McpPlan, planId: string) {
  const fresh = await controlPlane.plan(seed.slug, seed)

  if (!fresh.applicable) {
    throw new CliError(
      `'${seed.slug}' became unappliable between plan and apply: ${fresh.blockedReasons.join('; ')}`,
      'The deployed schema changed under this run. Re-run `beech schema plan`.',
    )
  }
  if (fresh.statements.join('\n') !== preview.statements.join('\n')) {
    throw new CliError(
      `The plan for '${seed.slug}' changed between review and apply. Nothing was written for it.`,
      'Someone else changed the schema during this run. Re-run `beech schema plan`.',
    )
  }

  return controlPlane.apply({ slug: seed.slug, candidate: seed, expectedVersion: fresh.expectedVersion, planId })
}

/** Single confirmation for the whole run. Refuses to guess in a non-interactive shell. */
async function confirmApply(pending: Seed[], skip: boolean): Promise<void> {
  if (skip) return
  if (!process.stdout.isTTY) {
    throw new CliError(
      'Refusing to apply schema changes without confirmation in a non-interactive shell.',
      'Re-run with --yes once the plan above has been reviewed.',
    )
  }

  const answer = await p.confirm({
    message: `Apply ${pending.length} seed(s) to the deployed schema? (${pending.map(seed => seed.slug).join(', ')})`,
    initialValue: false,
  })
  if (p.isCancel(answer) || !answer) {
    throw new CliError('Aborted. Nothing was written.')
  }
}
```

## TASK 12 — `packages/cli/src/index.ts` + `packages/cli/package.json`

Append after the `schemaExport` exports (L24-25):

```ts
export { schemaPlan } from './commands/schema-plan.js'
export type { SchemaPlanOptions } from './commands/schema-plan.js'
export { schemaApply } from './commands/schema-apply.js'
export type { SchemaApplyOptions } from './commands/schema-apply.js'
```

`packages/cli/package.json` `dependencies` gains one line (keep alphabetical):

```json
"@beechcms/api-client": "workspace:^0.1.0",
```

## TASK 13 — `bin/cli.mjs`

1. `COMMANDS` (after `'schema:export'`, L25):

```js
  'schema:plan':    cmdSchemaPlan,
  'schema:apply':   cmdSchemaApply,
```

2. Two handlers, after `cmdSchemaExport` (L214):

```js
async function cmdSchemaPlan(args) {
  const manifestIdx = args.indexOf('--manifest')
  const manifest    = manifestIdx !== -1 ? args[manifestIdx + 1] : undefined
  const apiIdx      = args.indexOf('--api-url')
  const apiUrl      = apiIdx !== -1 ? args[apiIdx + 1] : undefined
  const { schemaPlan } = await import('@beechcms/cli')
  await schemaPlan({ manifest, apiUrl })
}

async function cmdSchemaApply(args) {
  const manifestIdx = args.indexOf('--manifest')
  const manifest    = manifestIdx !== -1 ? args[manifestIdx + 1] : undefined
  const apiIdx      = args.indexOf('--api-url')
  const apiUrl      = apiIdx !== -1 ? args[apiIdx + 1] : undefined
  const yes         = args.includes('--yes') || args.includes('-y')
  const { schemaApply } = await import('@beechcms/cli')
  await schemaApply({ manifest, apiUrl, yes })
}
```

3. Help text, in section 3 after the `schema diff` block (L86-89):

```js
    ${pc.cyan('schema plan')}     Show what applying beech.schema.ts would change (writes nothing)
      --manifest <f>  Manifest path (default: beech.schema.ts)
      --api-url <url> API origin (default: BEECH_API_URL or http://localhost:8789)
      Exits 1 when a seed cannot be applied.
    ${pc.cyan('schema apply')}    Apply beech.schema.ts through the control plane
      --manifest <f>  Manifest path (default: beech.schema.ts)
      --api-url <url> API origin
      -y, --yes       Skip the confirmation prompt
      Additive only. Authorizes in the browser on first use.
```

Note `'schema'` is already in the prefix-join list at L8 — no change there.

## TASK 14 — `apps/api/src/features/seeds/seeds.mcp.ts` (3 edits, additive on the wire)

**14.1 — plan response carries the current owner.** Inside the `mcp-plan` handler, `stored` is
already read (L140). Add `source` to the JSON body (after `issues`, L179):

```ts
    issues,
    // Current owner, so a client can warn that applying will not transfer ownership.
    // null ⇒ the seed does not exist yet and the apply that creates it decides the owner.
    source: stored && stored.status !== 'deleted' ? stored.source : null,
```

**14.2 — apply accepts an explicit owner.** In the `mcp-apply` handler, extend the destructuring
(L209-213) and validate:

```ts
  const { candidate: candidateInput, expectedVersion, planId, source } = body as {
    candidate?: unknown
    expectedVersion?: unknown
    planId?: unknown
    source?: unknown
  }
```

after the `expectedVersion` guard (L218-220), add:

```ts
  if (source !== undefined && source !== 'code' && source !== 'runtime') {
    return publicProblem(context, {
      type: 'invalid-json',
      title: 'Bad Request',
      status: 400,
      detail: "`source` must be 'code' or 'runtime' when present.",
    })
  }
```

and pass it into the atomic apply (replacing the hardcoded `source: 'runtime'` at L275):

```ts
    result = await repo.applyAtomic({
      slug,
      definition: candidate,
      ddl,
      expectedVersion: expectedVersion as number,
      // Honoured on INSERT only: UPSERT_SEED_SQL's ON CONFLICT clause deliberately omits `source`,
      // so a manifest apply over a dashboard-created seed cannot seize ownership of it.
      source: (source as 'code' | 'runtime' | undefined) ?? 'runtime',
    })
```

**14.3 — audit trail records it.** In the `activityLogger.log` details object (L314-324), after
`classification`:

```ts
      source: (source as 'code' | 'runtime' | undefined) ?? 'runtime',
```

Update the route's TSDoc `@remarks` to state that `source` defaults to `'runtime'` and is applied only
on creation. **No other file under `apps/api/` is opened**: `oauth-scope.middleware.ts` already maps
this route to `schema:write`, and `rejectManifestOwned` must stay uncalled here (it is the sanctioned
manifest path).

## TASK 15 — `docs/build/cli-workflows.md`

Required, not cosmetic: `packages/cli/src/test/cli-docs-parity.test.ts` fails the build for a
`COMMANDS` key that is not documented.

1. Command matrix — two rows after the `schema diff` row (L41):

| `npx beech schema plan` (`beech schema:plan`) | Consumer | Shows the exact DDL applying `beech.schema.ts` would run. Writes nothing. Exits 1 when a seed cannot be applied. | `--manifest <file>`, `--api-url <url>` |
| `npx beech schema apply` (`beech schema:apply`) | Consumer | Applies `beech.schema.ts` through the control plane (`mcp-plan` / `mcp-apply`). Additive only. | `--manifest <file>`, `--api-url <url>`, `-y`/`--yes` |

2. Rewrite §6's note (L122), which currently says apply "is not shipped yet", to describe the closed
loop: `export` → review in Git → `diff` → `plan` → `apply` → `types generate`; the CLI never executes
SQL and never opens D1 (every write goes through `POST /api/seeds/:slug/mcp-*`); the first `plan` or
`apply` opens the browser once to authorize the `beech-mcp-cli` OAuth client, and the grant is cached
in `~/.beechcms/mcp-tokens.json` and revocable from Settings → Connected apps; `apply` never deletes a
seed that is absent from the manifest and never performs a drop/rename/retype — the server refuses
those and names the endpoint that can.

## TASK 16 — Tests

All rules below are from `_config/testing_conventions.md`; a violation is a blocking review finding.

**16.1 `packages/api-client/src/token-store.test.ts`, `oauth.test.ts`** — moved with their subjects
(TASKs 3-4). Only the import paths change (`./client.js` → `./errors.js` where `BeechClientError` is
asserted). No new case, except one in `oauth.test.ts`:
- `it('redirects the browser to the configured callback path so a client registered with /callback matches', …)`
  — asserts that `authorize({ …, callbackPath: '/callback' })` builds a `redirect_uri` ending in
  `/callback` (Rule 5.3: the contract is the URI, not the port).

**16.2 `packages/api-client/src/client.test.ts`** — moved from `packages/mcp/`, retargeted from the
module singleton to the factory. Keep every existing case (browser authorize on cold cache, cached
grant reuse, refresh on expiry, refresh-then-retry on 401, `insufficient_scope` on 403, RFC 7807
parsing, transient 5xx retry) and construct the subject per test with
`createApiClient(resolveApiConfig({ baseUrl: 'http://localhost:8787' }))` instead of
`vi.resetModules()` + dynamic import. Mock `./oauth.js` and `./token-store.js` at the top of the file
(Rule 3.9); `globalThis.fetch` is the only other boundary faked. Add:
- `it('keys the grant cache by the configured client id so two tools never share a token', …)` —
  two clients with different `clientId`, assert `writeGrant` received each id (Rule 5.8: the subject
  IS the call construction, so asserting the mock is correct here).

**16.3 `packages/mcp/src/client.test.ts`** — rewritten thin. `vi.mock('@beechcms/api-client', …)`
returning a `createApiClient` spy; two cases:
- `it('forwards method, path and body to the shared client', …)`
- `it('builds its client with the beech-mcp client id', …)` — regression guard: the MCP server and
  the CLI must stay distinguishable in Settings → Connected apps.
The deeper transport behaviour is covered once, in 16.2 (Rule 6.2 case 3: note the deliberate
omission and where it is covered).

**16.4 `packages/cli/src/test/manifest-order.test.ts`** (unit, pure — no mocks):
- `it('places a relation target before the seed that points at it', …)`
- `it('orders independent seeds by slug so two runs over one manifest are identical', …)`
- `it('ignores a relation whose target is not in the manifest', …)` — the server, not the CLI, decides
  whether a live target resolves.
- `it('ignores a self-referencing relation instead of reporting a cycle', …)`
- `it('reports the exact slugs of a two-seed cycle', …)` — assert the group contents, not the array
  identity.
Fixtures are hand-built minimal `Seed` objects: canonical seeds carry no relation pair, and Rule 3.5
permits hand-rolled input for a shape the canonical set does not cover — state that in a comment.

**16.5 `packages/cli/src/test/control-plane.test.ts`** (unit). Mock `@beechcms/api-client` with a
`createApiClient` returning a `request` spy:
- `it('posts the candidate to mcp-plan and returns the server verdict unchanged', …)`
- `it('sends source=code on apply so a created seed is manifest-owned', …)` — assert the body.
- `it('maps a 409 to a CliError telling the operator to re-plan', …)` — assert `CliError` + the hint's
  presence, not its wording? No: assert the error *type* and that `cause` is the `BeechClientError`
  (Rule 5.4 — identity, not copy).
- `it('maps a 403 insufficient-scope failure to an authorization CliError', …)`
- `it('uses the beech-mcp-cli client id and the /callback redirect path', …)` — assert the config
  object passed to `createApiClient`; these two values must match the seeded `oauth_clients` row or
  every authorization fails with `invalid_request` (Rule 6.2 case 4: name the mechanism).

**16.6 `packages/cli/src/test/schema-plan.test.ts`** (unit). Mock `../lib/manifest-loader.js` and
`../lib/control-plane.js`:
- `it('plans every seed in dependency order and exits 0 when all are applicable', …)`
- `it('exits 1 when any seed reports blockedReasons', …)` — spy `process.exit` the way
  `schema-export.test.ts:43` does.
- `it('fails before contacting the API when the manifest contains a relation cycle', …)` — assert the
  control-plane spy was never called (Rule 5.6: a rejection is proven by what did not happen).

**16.7 `packages/cli/src/test/schema-apply.test.ts`** (unit). Same mocks plus
`vi.mock('@clack/prompts', …)` (the idiom `forms.test.ts:14` already uses):
- `it('re-plans each seed immediately before writing it so the OCC version is current', …)` — two
  seeds, assert `plan` was called twice per seed and `apply` received the *fresh* `expectedVersion`.
- `it('writes nothing when any seed in the run is unappliable', …)` — assert `apply` never called.
- `it('aborts the seed whose statements changed between review and apply', …)`
- `it('skips the prompt and applies when yes is set', …)`
- `it('refuses to apply without confirmation in a non-interactive shell', …)` — `process.stdout.isTTY`
  stubbed false; assert `apply` never called.
- `it('passes one plan id to every apply in the run so the audit trail ties them together', …)`

**16.8 `apps/api/src/features/seeds/test/integration/seed-ownership.integration.test.ts`** (integration,
real D1, existing file — add one `describe` with two cases). The harness baseline is already in
`beforeEach`; reuse `createSeed` and the `SeedRecordBody` type already declared there.
- `it('records source=code when a manifest apply creates the seed', …)` — ACT is
  `POST /api/seeds/new_slug/mcp-apply` with `{ candidate, expectedVersion, source: 'code' }` against a
  slug that does not exist; assert 200, then read `GET /api/seeds/:slug` and assert
  `record.source === 'code'` (Rule 5.5 — assert what was persisted).
- `it('leaves a dashboard-created seed as runtime when a manifest apply targets it', …)` — ARRANGE
  through `createSeed` (so `source` is `'runtime'`), ACT with `source: 'code'`, assert 200 and
  `record.source === 'runtime'`. This is the regression guard for the `ON CONFLICT DO UPDATE` clause
  that deliberately omits `source`; name that mechanism in a comment (Rule 6.2 case 4).
- The existing case at L137 (`mcp-apply` against a manifest-owned seed keeps `source = 'code'`) stays
  unchanged and now exercises the same code path with `source` omitted — the default branch.
Replace the `markManifestOwned` docblock at L47-49, which says "no production path writes
source='code' until the manifest apply command lands": it has landed. The raw `UPDATE` helper stays
(the other cases need a manifest-owned seed without going through the control plane).

**No new e2e tier file.** The browser authorization flow cannot run unattended, and every other axis is
covered above; §5's manual smoke sequence is the documented human check (Rule 6.2 case 3).

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

```bash
# 0. New package must exist in the workspace before anything resolves it.
pnpm install

# 1. Shared client: build (runs `tsc --noEmit` first) + unit tests.
pnpm --filter @beechcms/api-client build
pnpm --filter @beechcms/api-client test

# 2. MCP server must still compile and pass with the adapter in place.
pnpm --filter @beechcms/mcp build
pnpm --filter @beechcms/mcp test

# 3. CLI: build is also the type gate, then unit tests (includes cli-docs-parity).
pnpm --filter @beechcms/cli build
pnpm --filter @beechcms/cli test

# 4. API: typecheck + the seeds slice integration tier.
cd apps/api && npx tsc --noEmit && cd ../..
pnpm --filter @beechcms/api test

# 5. Whole-workspace gates.
pnpm beech lint
pnpm beech test --diff

# 6. Architectural regression: the Worker must have no path into the CLI's control plane
#    or into the Node-only credential store.
graphify update . --force
graphify path "createBeechApp" "createControlPlane"   # expect: No directed path found
graphify path "createBeechApp" "readGrant"            # expect: No directed path found
```

Manual smoke (local stack, one terminal; the first `plan` opens a browser once):

```bash
pnpm beech dev                 # API on http://localhost:8789

# a. round-trip: export what is deployed, then plan it — must be a no-op
pnpm beech schema export
pnpm beech schema plan         # expect: every seed "(no change)", exit 0

# b. additive change: add a branch to a seed in beech.schema.ts by hand
pnpm beech schema diff         # expect: exit 1, "≠ <slug> — manifest and deployed definition disagree"
pnpm beech schema plan         # expect: "additive", one ALTER TABLE ... ADD COLUMN printed
pnpm beech schema apply        # confirm at the prompt; expect "✓ <slug> — registry version N+1"
pnpm beech schema diff         # expect: exit 0, in sync

# c. ownership: the applied seed is now manifest-owned; the dashboard must refuse it
curl -i -X PUT http://localhost:8789/api/seeds/<slug> -H 'Authorization: Bearer <admin jwt>' \
  -H 'Content-Type: application/json' -d '{"branches":[]}'
#    expect: 409 with "type": "...seed-manifest-owned"
#    (only for a seed CREATED by apply — one created in the dashboard stays 'runtime')

# d. destructive intent is surfaced, never executed: delete a branch from the manifest
pnpm beech schema plan         # expect: red "destructive", the DELETE .../branches/br_XX remedy, exit 1
pnpm beech schema apply        # expect: refuses, "Nothing was written."

# e. new seed with a relation to another new seed: ordering proof
#    add two seeds to the manifest, the second pointing at the first
pnpm beech schema plan         # expect: target planned first, both "create", exit 0
pnpm beech schema apply --yes  # expect: both applied, in order

# f. drift under a run: apply, and while it prompts, change the schema in the dashboard
#    expect: "The plan for '<slug>' changed between review and apply. Nothing was written for it."

# g. types close the loop
pnpm beech types generate      # expect: beech.generated.ts fingerprint changes after (b)
```

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

**Boundaries**
- [ ] No file under `packages/cli/src/**` imports any symbol from `apps/api/**`; `graphify path
      "schemaApply" "mcpApp"` reports no directed path.
- [ ] `graphify path "createBeechApp" "createControlPlane"` and `graphify path "createBeechApp"
      "readGrant"` both report no directed path — the Worker never reaches Node-only code.
- [ ] Exactly one file under `apps/api/src/` is modified: `features/seeds/seeds.mcp.ts`.
- [ ] Zero files under `apps/dashboard/` and zero files under `packages/core/src/` are modified.
- [ ] Zero migration files are added or edited.

**Botanical invariant**
- [ ] `packages/cli/src/commands/schema-plan.ts` and `schema-apply.ts` contain no SQL string, no
      `CREATE`/`ALTER`/`INSERT`/`UPDATE` literal, and no call to `createD1Context`, `loadLiveSeeds`,
      `queryD1` or any `node:sqlite`/wrangler API.
- [ ] Every DDL statement executed originates from `planCreateSeed`/`planExtendSeed` inside
      `@beechcms/core`, invoked server-side; the CLI only displays `plan.statements`.
- [ ] No physical column name and no branch alias is hardcoded in any new file.

**Shared client extraction**
- [ ] `packages/mcp/src/oauth.ts` and `packages/mcp/src/token-store.ts` no longer exist; their content
      lives in `packages/api-client/src/` with unchanged behaviour.
- [ ] `packages/mcp/src/client.ts` still exports `request` and `BeechClientError` with unchanged
      signatures, and `packages/mcp/src/index.ts` is **not modified**.
- [ ] The token cache path (`~/.beechcms/mcp-tokens.json`), its `BEECH_TOKEN_CACHE` override, its
      `apiUrl|clientId` key and its 0600 permissions are unchanged.
- [ ] `@beechcms/api-client` has zero third-party dependencies (`@beechcms/core` only) and is consumed
      by both `@beechcms/mcp` and `@beechcms/cli`; neither of those two imports the other.
- [ ] `packages/api-client/tsconfig.json` declares `references: [{ "path": "../core" }]` and
      `packages/mcp/tsconfig.json` adds `{ "path": "../api-client" }`.

**Auth**
- [ ] The CLI authorizes as client id `beech-mcp-cli` with callback path `/callback` — the exact values
      seeded in `apps/api/migrations/0000_v040_base.sql:443` — and requests scope
      `schema:read schema:write`.
- [ ] No password, no client secret and no long-lived admin JWT is read, prompted for, or written by
      any new file.
- [ ] A 403 `insufficient_scope` and a 401 both surface as a `CliError` naming the remedy, not as a
      stack trace.

**Command behaviour**
- [ ] `beech schema plan` performs **zero** writes: it issues only `POST …/mcp-plan` requests.
- [ ] `beech schema plan` exits 1 when any seed reports `blockedReasons` or a fatal issue, and 0 when
      every seed is applicable.
- [ ] `beech schema apply` writes nothing at all when any seed in the run is unappliable.
- [ ] `beech schema apply` prompts once and refuses to proceed in a non-interactive shell without
      `--yes`.
- [ ] `beech schema apply` re-plans each seed immediately before writing it and aborts that seed when
      the statements differ from the reviewed plan or the server answers 409.
- [ ] `beech schema apply` sends `source: 'code'` and one shared `planId` for every seed in the run.
- [ ] `beech schema apply` never issues a `DELETE`, a rename or a retype request, and never touches a
      seed that exists in D1 but not in the manifest.
- [ ] Relation targets defined in the manifest are applied before the seeds referencing them; a
      relation cycle fails before the first HTTP request with a message naming the slugs.

**API change**
- [ ] `POST /api/seeds/:slug/mcp-plan` returns `source: 'code' | 'runtime' | null`; every other field of
      the response is byte-identical to before.
- [ ] `POST /api/seeds/:slug/mcp-apply` accepts an optional `source`, rejects any value other than
      `'code'`/`'runtime'` with 400, and defaults to `'runtime'` when absent — so `@beechcms/mcp`'s
      existing tools keep their exact behaviour without being edited.
- [ ] Applying with `source: 'code'` over an existing seed leaves `seeds.source` unchanged (proven by
      an integration test, not by reading the SQL).
- [ ] The activity-log detail for `mcp-apply` records the resolved `source`.

**Typing and quality**
- [ ] `tsc --noEmit` passes in `packages/api-client`, `packages/mcp`, `packages/cli` and `apps/api`.
- [ ] No `any` in any new or edited file, tests included; no non-null assertion except the two
      documented `previews.get(slug)!` lookups guarded by the preceding loop.
- [ ] `pnpm beech lint` passes.
- [ ] Every new test file satisfies `_config/testing_conventions.md` §8: one tier, SPDX header, four
      zones, one act, named act result, status asserted first, typed bodies, no weak or conditional
      assertions.
- [ ] `packages/cli/src/test/cli-docs-parity.test.ts` passes with `schema:plan` and `schema:apply`
      registered — i.e. `docs/build/cli-workflows.md` documents both.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executing agent MUST NOT build or modify any of the following.

**Deferred to a later sprint in the chain (`ROADMAP.md`):**
- `include=` on `/api/v1/public/*`, the `X-Schema-Revision` response header, relation expansion —
  sprint 4 `PublicApiRelationExpansion`.
- The fluent client chain, `SeedRegistryTypes` generics, the runtime fingerprint check,
  `.list({ validate: true })` — sprint 5 `FluentClientQueryBuilder`.
- `IN` subqueries over declared relations — sprint 6 `ClientRelationSubqueries`.

**Rejected in the VETO Audit, not deferred:**
- Any CLI path to a destructive change: branch drop, alias rename, type retype, hard delete, FTS
  rebuild. The server refuses them on `mcp-apply` (`seeds.mcp.ts:243-253`) and names the dedicated
  endpoint; the CLI prints that verbatim and stops. Re-implementing those confirmation protocols
  client-side needs its own brief.
- Deleting or soft-deleting a seed that exists in D1 and is absent from the manifest. `apply` is
  additive-only; `diff` already reports the case as `only_in_database`.
- A `'runtime'` → `'code'` ownership-transfer command or flag (standing decision in `ROADMAP.md`).
- Calling `rejectManifestOwned` from the MCP routes. The control plane is the sanctioned manifest
  path; guarding it would make manifest-owned seeds uneditable by anything.
- A CLI-side plan store with a TTL (mirroring `packages/mcp/src/plans.ts`), parallel apply, `--json`
  output, a `--watch` mode, or progress spinners.
- Raw SQL, migration-file generation, or any use of `packages/cli/src/lib/migration-writer.ts`.
  It stays caller-less, exactly as 3a left it.

**Explicitly not touched:**
- `packages/mcp/src/index.ts`, `plans.ts`, `resources.ts`, `supervisor.ts` — the extraction stops at
  `client.ts`.
- `packages/core/src/**` — no new export, no signature change.
- `apps/dashboard/**` — the 409 guard it must respect shipped in sprint 1.
- `apps/api/migrations/**` — `seeds.source`, the `CHECK` constraint and both `oauth_clients` rows
  already exist.
- `apps/api/src/middleware/oauth-scope.middleware.ts` — both routes are already allowlisted with the
  right scopes.
- `packages/cli/src/commands/schema-export.ts`, `schema-diff.ts`, `generate-types.ts` and
  `lib/{manifest-loader,manifest-compare,d1-context,schema-diff,wrangler,d1-executor}.ts` — consumed,
  never edited.
