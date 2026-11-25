# Sprint Plan — `PublicApiRelationExpansion`

**Chain:** Typed Fluent Query Builder (#381 → #385) — **sprint 4 of 7** (`ROADMAP.md`).
**Issue:** #383.
**Upstream:** sprint 2 `SchemaIntrospectionFingerprint` (the fingerprint this sprint publishes as a
response header) — merged, archived to `docs/Sprints/SchemaIntrospectionFingerprint/`.
**Downstream blocked on this:** sprint 5 `FluentClientQueryBuilder` — `.include()` cannot ship typed
against an unstable server contract, and the client's runtime drift check has nothing to compare
against until `X-Schema-Revision` is on the wire.
**Parallel:** sprints 3a/3b (`packages/cli`, merged) touched disjoint boundaries; nothing in this
sprint re-opens them.

---

### Pre-Computation Analysis

Produced with the graphify CLI under `_config/tooling_graphify.md` (graph refreshed first with
`graphify update . --force`: **13204 nodes / 23825 edges / 1044 communities**; `GRAPH_REPORT.md`
never read; `query` never needed — `explain` / `path` / `affected` answered every question).

#### a) God Nodes identified via the CLI

| Node | Degree | Community | Relevance to this sprint |
|------|--------|-----------|--------------------------|
| `publicProblem()` (`apps/api/src/public/problem-details.ts:111`) | **73** | `publicProblem` | The single RFC 9457 error emitter for the whole public surface. **Consumed, not modified**: the new `invalid-include` 400 is one more call site, with the same `{type,title,status,detail}` shape. |
| `createBeechApp()` (`apps/api/src/factory.ts:116`) | **61** | `src/factory.ts` | Owns middleware registration order. **One line added**: `apiPublic.use('*', schemaRevisionMiddleware())` at `factory.ts:265`, ahead of the rate-limit and API-key gates so every public response — 200, 400, 401, 429 alike — carries `X-Schema-Revision`. |
| `D1ContentRepository` (`apps/api/src/shared/db/repositories/content.repository.d1.ts:113`) | **44** | `D1ContentRepository` | Already returns relation values in the exact shape expansion needs: single relation → target-id string on the branch alias (`rowToData`, L166), multi-relation → ordered `string[]` from the junction table (`attachMultiRelationRows`, L262). **Not modified** — expansion is a second `findMany` against the target seed, never new SQL. |
| `SeedRegistry` (`packages/core/src/engine/seed-registry.ts:46`) | 11 | `Seed` | `all()` is the seed list fed to `computeSchemaFingerprint`; the registry instance itself is the cache key for the memoized fingerprint (one compute per registry build, per isolate). **Not modified.** |
| `resolvePolicies()` (`packages/core/src/engine/policies.ts:102`) | 8 | `Branch` | The one place branch `public` / `visibility` defaults are resolved. Include admission asks it, exactly as `toEngineFilters()` already does for filterable fields (`query-builder.ts:127`). **Not modified.** |
| `toFlatPublicEntry()` (`apps/api/src/public/entry-projection.ts:14`) | 7 | `public-add.ts` | The public projection gate (`filterEntryForActor(data, seed, {type:'public'})`). Applied to the parent **after** expansion and to every expanded target **with the target's own seed**. **Not modified** — its signature is already what nested projection needs. |
| `getHydratedRegistry()` (`apps/api/src/shared/services/cache/seed-registry-cache.ts:29`) | 6 | `vitest` | Isolate-level registry cache (version token + 5s TTL). **Not modified**: the fingerprint memo is keyed on the `ISeedRegistry` instance this returns, so a registry rebuild invalidates the fingerprint for free and no second cache-invalidation rule enters the codebase. |
| `computeSchemaFingerprint()` (`packages/core/src/engine/schema-fingerprint.ts:136`) | 5 | `Branch` | Sprint 2's primitive. **Consumed verbatim.** The Worker gets its second consumer (the CLI's `generate-types.ts` was the first); both ends must call this same function, which is the whole point of the drift detector. |

#### b) Architectural boundaries affected

| Boundary | Touched? | What lands there |
|----------|----------|------------------|
| `apps/api` — `src/public/` | **yes (4 new, 3 modified)** | `relation-include.ts` + `schema-revision.ts` (+ their unit tests) are new; `read-list.ts`, `read-single.ts`, `public-read.ts` gain the include plumbing and the `Invalid include:` → 400 mapping. |
| `apps/api` — `src/public/test/integration/` | **yes (new)** | `public-relation-expansion.integration.test.ts` — first integration suite in the public slice; real D1, real middleware chain, canonical seeds. |
| `apps/api` — `src/factory.ts` | **yes (1 line)** | Registers `schemaRevisionMiddleware()` on `apiPublic`. No other middleware moves; the documented order (repository → seedRegistry → storage → queue → authProviders → rateLimiter → observability → CORS → security headers → analytics) is untouched. |
| `apps/api` — everything else | **NO** | No new route, no migration, no repository change, no change to `features/*`. `features/search/public-search.router.ts` inherits the header from the middleware without being opened. |
| `apps/api/migrations` | **NO** | No DDL. Expansion reads tables the engine already created (`content_*`, `rel_*`). |
| `@beechcms/core` | **NO** | No new export. `computeSchemaFingerprint`, `filterEntryForActor`, `resolvePolicies` and `ContentRepository.findMany` are consumed exactly as they stand. A relation-expansion helper in core would be a second place that knows what "public" means — see VETO Audit. |
| `@beechcms/testing` | **yes (1 file)** | `canonical.seeds.ts` gains one seed (`categories`, publicly readable) and two branches on `posts` (`category_id` single relation, `related_posts` multi-relation). Today's canonical set has **zero** publicly-readable relation targets and **zero** multi-relations, so the server contract this sprint ships cannot be integration-tested against it at all. |
| `packages/client` | **NO** | Sprint 5's boundary. The client is not opened; the header is a one-way server emission until then. |
| `apps/dashboard` | **NO** | No dashboard concern in this sprint. |
| `docs/reference/public-api.md` | **yes** | `include` row in the query-parameter table, the expanded-response shape, the `X-Schema-Revision` header, and the documented limits. |

#### c) `graphify affected` impact analysis (breaking-change proof)

```
$ graphify affected "toFlatPublicEntry" --depth 2
- readListEntries()       [calls]    apps/api/src/public/read-list.ts:L45
- readSingleEntry()       [calls]    apps/api/src/public/read-single.ts:L39
- entry-projection.test.ts [imports] apps/api/src/public/entry-projection.test.ts:L6
- read-list.ts            [imports]  apps/api/src/public/read-list.ts:L7
- read-single.ts          [imports]  apps/api/src/public/read-single.ts:L7
- publicReadHandler()     [calls]    apps/api/src/public/public-read.ts:L54
- public-read.ts          [imports]  apps/api/src/public/public-read.ts:L11
```

Reading: the projection gate's entire blast radius is **three files inside `public/` plus its own
unit test**. Expansion can therefore be inserted immediately upstream of it (raw repository rows in,
expanded rows out, projection unchanged) without any caller outside the slice noticing.

```
$ graphify affected "readListEntries" --depth 2
- publicReadHandler()  [calls]         apps/api/src/public/public-read.ts:L54
- public-read.ts       [imports]       apps/api/src/public/public-read.ts:L11
- public/index.ts      [re_exports]    apps/api/src/public/index.ts:L13
- public-routes.ts     [indirect_call] apps/api/src/public/public-routes.ts:L81
```

Reading: `readListEntries` / `readSingleEntry` have exactly one production caller each
(`publicReadHandler`). Widening their input object with an optional `includes` field is provably
non-breaking; no second caller has to be found and updated.

```
$ graphify affected "computeSchemaFingerprint" --depth 2
- schema-fingerprint.test.ts [imports] packages/core/src/engine/schema-fingerprint.test.ts:L5
```

Reading, with a caveat a future reader must not misread: the AST graph does **not** trace imports
that arrive through the `@beechcms/core` package barrel, so this is not proof of zero consumers. A
direct grep (`grep -rn "computeSchemaFingerprint" --include='*.ts' packages apps`) finds the real
set: `packages/cli/src/commands/generate-types.ts:35` (sprint 3a, embeds it into
`beech.generated.ts`) and core's own test. This sprint **adds** a consumer and changes neither the
function nor its projection — so every fingerprint already embedded in a generated client stays
comparable, which is the invariant the whole drift mechanism rests on.

```
$ graphify path "publicReadHandler" "D1ContentRepository"     → no directed path
$ graphify path "readListEntries"   "queryD1"                 → no directed path
$ graphify path "publicReadHandler" "seedsApp"                → no directed path
```

Reading: the public slice reaches storage only through the injected `ContentRepository` interface,
never through a concrete D1 class, never through the CLI's shell SQLite path, and never through
another feature slice. All three must still return *no directed path* after this sprint — expansion
adds `findMany` calls through the same injected interface and nothing else.

---

### VETO Audit

Proposed boundaries from step 1, evaluated against `_config/ponytail_arch.md`.

**1. The Botanical Invariant — no D1 access bypasses `@beechcms/core`.**
Relation expansion issues **zero SQL**. It resolves target ids into a `FilterGroup` and hands it to
`repository.findMany(targetSeed, …)`, which compiles it through `buildSelectQuery` in
`@beechcms/core/engine/query.ts` — the same parameterized-SQL path every other public read already
takes. `id IN (…)` is an operator the engine already supports for system columns
(`query.ts:208-219`), so the sprint introduces no new operator, no new column type, and no raw
statement. Physical junction tables (`rel_{seed}_{alias}`) are never named by this sprint's code:
the repository already resolves them and hands back `string[]` on the branch alias. No hardcoded
field names — every lookup is by `branch.alias`, and branch identity stays `br_XX` inside the Seed
definitions. **PASS.**

**2. VSA enforcement — no cross-feature imports.**
Everything new lives in `apps/api/src/public/`, the slice that owns the public contract. It imports
from `@beechcms/core` and from `../shared/utils/query-utils` (the shared lib, already imported by
`read-list.ts:6`) and from nothing under `../features/`. The three `graphify path` checks above are
the regression guard, and they are re-run in Validation. Symmetrically, no other slice imports the
new modules: `features/search/public-search.router.ts` receives the response header from the
middleware registered in `factory.ts`, not from an import.
The one cross-boundary question this sprint had to answer: *should relation expansion live in
`@beechcms/core` so the dashboard could reuse it?* **No.** Expansion here is defined entirely by
public-API policy (`allowPublicRead`, `policies.public`, `visibility`), which is a property of the
public contract, not of the engine. The dashboard already has its own relation-resolution path
(`features/backrefs`) with different authority rules. Moving this to core would create the second
definition of "publicly visible" that rule 2 of the Botanical Invariant exists to prevent. **PASS.**

**3. Cloudflare purity.**
Edge-native throughout: one extra `findMany` per included branch, bounded at three branches and 200
target ids per branch, running inside the same Worker request. No ORM, no background job, no
schema change, no new binding. The fingerprint is a Web Crypto SHA-256 (`crypto.subtle`, already
the API `webhook-crypto.ts` uses) memoized per isolate on the registry instance, so the steady-state
cost of the header is a `Map` lookup. **PASS.**

**4. YAGNI.**
Three things were cut here before drafting:
- **depth > 1 / nested `include=author.team`** — rejected. The brief fixes depth at 1; a dotted path
  is refused with 400, not silently truncated. Anything deeper requires the RFC that #385 already
  defers.
- **an `include` counterpart on `POST /add` and `PUT /edit`** — rejected. Write responses echo what
  was written; nobody in the chain consumes an expanded write response, and sprint 5's `.include()`
  is a read-path API.
- **a core-level `expandRelations()` helper generalized over actor types** — rejected as
  over-engineering: there is exactly one caller and one actor type (`public`).

**5. Minimalist blueprint.** Two new production modules, three edited files in one slice, one line in
the factory, one shared-fixture extension, one docs page. Nothing in `apps/dashboard`, nothing in
`@beechcms/core`, no migration.

**Verdict: APPROVED.** No violation found; the plan below is the version that survived this audit.

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================
The Public API relation expansion must be built before the Fluent Client Query Builder (Sprint 5) can support `.include()`. If the client shipped typed `.include()` methods before the server could handle them, it would be a broken contract. Furthermore, this sprint implements the `X-Schema-Revision` header on all API responses, which is a hard dependency for the client's runtime drift detection (#384). 

Adherence to VSA and Botanical Engine invariants: This sprint isolates all new code inside `apps/api/src/public/`. It reuses the engine's standard parameterization and injection (`ContentRepository`), issuing no D1 statements directly. It respects the boundary of `@beechcms/core` without contaminating it with API-specific public visibility logic.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================
- The API factory (`apps/api/src/factory.ts`) builds the middleware chain. Existing order: repository → seedRegistry → storage → queue → authProviders → rateLimiter → observability → CORS → security headers → analytics.
- The `X-Schema-Revision` header must be injected via a new middleware *early* in the chain so even rate-limited or unauthenticated responses (e.g., 400, 401, 429) carry the fingerprint.
- Public read operations (`read-list.ts`, `read-single.ts`) extract content via `repository.findMany` and filter through `toFlatPublicEntry` (depth 0).
- `D1ContentRepository` already supports fetching joined relation IDs (`string[]` for multi, `string` for single) under the branch alias.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================
- `apps/api/src/public/schema-revision.ts` (new): Middleware to append `X-Schema-Revision`.
- `apps/api/src/public/relation-include.ts` (new): Helper to execute the depth=1 related content fetching.
- `apps/api/src/public/read-list.ts` (modified): Wire up `includes` parsing and execution.
- `apps/api/src/public/read-single.ts` (modified): Wire up `includes` parsing and execution.
- `apps/api/src/public/public-read.ts` (modified): `invalid-include` 400 error mapping.
- `apps/api/src/factory.ts` (modified): 1 line to mount `schemaRevisionMiddleware`.
- `apps/api/src/public/test/integration/public-relation-expansion.integration.test.ts` (new): Integration tests.
- `@beechcms/testing/src/canonical.seeds.ts` (modified): Add publicly readable relation targets (e.g., `categories` and `related_posts` on `posts`).
- `docs/reference/public-api.md` (modified): Document `include` parameter and `X-Schema-Revision` header.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================
**Task 4.1: Schema Revision Middleware**
Create `apps/api/src/public/schema-revision.ts`:
```ts
import type { MiddlewareHandler } from 'hono'
import { computeSchemaFingerprint } from '@beechcms/core'
import type { AppEnv } from '../../shared/types.js'

export function schemaRevisionMiddleware(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const registry = c.get('seedRegistry')
    // computeSchemaFingerprint is memoized per registry instance
    const fingerprint = await computeSchemaFingerprint(registry)
    await next()
    c.res.headers.set('X-Schema-Revision', fingerprint)
  }
}
```

**Task 4.2: Factory Wiring**
Modify `apps/api/src/factory.ts`:
Import `schemaRevisionMiddleware`.
At `L265` (before rate-limiter and auth gates), add:
`apiPublic.use('*', schemaRevisionMiddleware())`

**Task 4.3: Canonical Seeds Extension**
Modify `@beechcms/testing/src/canonical.seeds.ts`:
Add a new seed `categories` with `allowPublicRead: true`.
Add two branches to `posts`:
- `category_id`: `type: 'relation', targetSeed: 'categories', multiple: false, public: true`
- `related_posts`: `type: 'relation', targetSeed: 'posts', multiple: true, public: true`

**Task 4.4: Relation Include Logic**
Create `apps/api/src/public/relation-include.ts`:
Takes `includes: string[]`, validated against the parent `Seed`'s public relation branches.
Uses `c.get('repository').findMany(targetSeed, { filter: { id: { in: ids } } })` to fetch targets.
Passes fetched items through `toFlatPublicEntry`.
Throws `BeechProblem` (`type: 'invalid-include', status: 400`) if a requested branch is not a relation or not publicly readable.
Supports depth=1 only (rejects paths with dots).

**Task 4.5: Wire Read Handlers**
Modify `read-list.ts` and `read-single.ts` to parse `c.req.query('include')` (comma-separated).
Await `relation-include.ts` logic to append `_includes: { [alias]: [FlatPublicEntry] }` to the standard output.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================
- `pnpm run build` in `apps/api/`
- `npx tsc --noEmit` in `apps/api/`
- `pnpm beech test --diff`
- Run the new integration suite: `npx vitest run src/public/test/integration/public-relation-expansion.integration.test.ts` in `apps/api/`

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================
- [ ] `X-Schema-Revision` header appears on all `/api/v1/public/*` responses (including 400s/401s).
- [ ] `include=branch_alias` fetches depth=1 relations securely.
- [ ] `include=unauthorized_branch` returns 400 Bad Request.
- [ ] `include=nested.branch` (depth > 1) returns 400 Bad Request.
- [ ] No raw D1 queries are used; all queries go through `ContentRepository`.
- [ ] New canonical seeds correctly allow integration testing for single and multiple public relations.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================
- **No deep relation expansion:** Nested includes (e.g., `include=author.team`) are explicitly out of scope. Depth > 1 requires a future RFC.
- **No includes on write paths:** `POST /add` and `PUT /edit` are untouched.
- **No client library changes:** Fluent Query Builder (`.include()`) is deferred to Sprint 5 (`ROADMAP.md`).
- **No core expansion helpers:** Logic remains within `apps/api/src/public/`, not shared in `@beechcms/core`.
