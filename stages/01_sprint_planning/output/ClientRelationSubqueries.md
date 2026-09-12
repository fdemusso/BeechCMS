# Sprint Plan — `ClientRelationSubqueries`

**Chain:** Typed Fluent Query Builder (#381 → #385) — **sprint 6 of 6, the last** (`output/backlog/ROADMAP.md`).
**Issue:** #385, reduced form.
**Upstream:** sprint 4 `PublicApiRelationExpansion` (the `include=` contract that declares which relations
are publicly reachable — merged, archived to `docs/Sprints/PublicApiRelationExpansion/`) and sprint 5
`FluentClientQueryBuilder` (the chain this sprint adds a link to — merged, archived to
`docs/Sprints/FluentClientQueryBuilder/`).
**Downstream blocked on this:** nothing. This closes the chain.

---

### Pre-Computation Analysis

Produced with the graphify CLI under `_config/tooling_graphify.md` (graph refreshed first with
`graphify update . --force`: **13475 nodes / 24049 edges / 1152 communities**; `GRAPH_REPORT.md` never
read; `query` never needed — `explain` / `path` / `affected` answered every question).

#### a) God Nodes identified via the CLI

| Node | Degree | Community | Relevance to this sprint |
|------|--------|-----------|--------------------------|
| `D1ContentRepository` (`apps/api/src/shared/db/repositories/content.repository.d1.ts:113`) | **44** | `D1ContentRepository` | **Modified — one new method.** It is the only place in the Worker that may name a junction table (`jTable()`, L92). The public slice cannot resolve a multi-relation filter without it, and must not learn the physical table name to do so. |
| `FluentQueryBuilder` (`packages/client/src/query-builder.ts:16`) | **13** | `client/src/types.ts` | **Modified.** Sprint 5's chain object. One method (`.whereRelation()`) and one encoding branch are added; `.where()/.include()/.select()/.first()/.list()` keep their exact signatures, so no consumer of the chain is touched. |
| `publicReadHandler()` (`apps/api/src/public/public-read.ts:14`) | **13** | `public-add.ts` | **Modified — one `catch` branch.** `Invalid subquery:` → 400 `invalid-subquery`, alongside the existing `Invalid filter:` (L57) and `Invalid include:` (L60) mappings. No route, no middleware change. |
| `readListEntries()` (`apps/api/src/public/read-list.ts:21`) | **12** | `public-add.ts` | **Modified — subquery resolution inserted between `parsePublicFilter()` (L24) and `toEngineFilters()` (L31), plus an empty-result short circuit.** It is the single production caller of both. |
| `buildSelectQuery()` (`packages/core/src/engine/query.ts:36`) | 8 | `engine/types.ts` | **Not modified.** Every resolved subquery lands as an `in` condition it already compiles (`query.ts:208-219`). The sprint introduces no operator, no column type and no raw SQL in the engine. |
| `resolvePolicies()` (`packages/core/src/engine/policies.ts:102`) | 8 | `engine/types.ts` | **Not modified — consumed.** It is the one authority for `public` / `filter` on a branch; admission of a relation subquery asks it exactly as `toEngineFilters()` (`query-builder.ts:127`) and `expandRelations()` (`relation-include.ts:42`) already do. |
| `expandRelations()` (`apps/api/src/public/relation-include.ts:12`) | 7 | `public-add.ts` | **Modified by extraction only.** Its four admission checks (L35-52) move verbatim into `relation-access.ts` and are re-imported; error strings stay byte-identical so `relation-include.test.ts` stays green without edits. |
| `buildSearchParams()` (`packages/client/src/query-builder.ts:50`) | 6 | `client/src/types.ts` | **Modified.** Gains the nested-value encoding for relation subqueries. Still the only place the client turns query state into `URLSearchParams`; still exported unchanged from `packages/client/src/index.ts:4`. |

#### b) Architectural boundaries affected

| Boundary | Touched? | What lands there |
|----------|----------|------------------|
| `packages/client` | **yes (3 modified, 2 test files)** | `.whereRelation()` on the fluent chain, `RelationSubquery` type, nested encoding in `buildSearchParams`, two new exports in `index.ts`. No new dependency — the package stays dependency-light (brief rule 8). |
| `apps/api` — `src/public/` | **yes (2 new, 4 modified)** | `relation-subquery.ts` + `relation-access.ts` (new, with unit tests); `query-builder.ts` (subquery parsing/validation), `read-list.ts` (resolution + empty short circuit), `relation-include.ts` (admission extraction), `public-read.ts` (one `catch` branch). |
| `apps/api` — `src/public/test/integration/` | **yes (1 new)** | `public-relation-subquery.integration.test.ts` — real D1, full middleware chain, canonical seeds. |
| `apps/api` — `src/features/**` | **NO** | No feature slice is opened. `features/backrefs/d1-backref.repository.ts:62` already speaks junction SQL for the dashboard; this sprint does **not** import, extend or generalize it (see VETO Audit §2). |
| `apps/api/migrations` | **NO** | No DDL. The junction tables (`rel_{seed}_{alias}`) this sprint reads are already created by the engine. |
| `@beechcms/core` | **yes (1 file, interface only)** | `packages/core/src/content/content.repository.ts` gains one method on the `ContentRepository` interface. No engine logic, no new export from the barrel, no SQL — the statement lives in the D1 implementation. |
| `apps/api` — `src/shared/db/repositories/` | **yes (1 modified)** | `content.repository.d1.ts` implements the new method with one parameterized junction `SELECT`. |
| `apps/api/test/mocks/` | **yes (1 modified)** | `static-content.repository.ts` implements the new interface method in memory (it `implements ContentRepository`, so the interface change is a compile error until it does). |
| `@beechcms/testing` | **NO** | The canonical set already carries every fixture this sprint needs: `categories` (`allowPublicRead: true`), `posts.category_id` (single, public), `posts.related_posts` (multi, public) and `posts.author_id` (relation to the non-public `authors` seed) — the last one is the ready-made negative case. |
| `apps/dashboard` | **NO** | No dashboard concern. |
| `packages/cli`, `packages/core/src/engine/seed-types-generator.ts` | **NO** | Typing the *inner* fields of a subquery would need a relation map in the generated registry. Deliberately out of scope — see SECTION 7. |
| `docs/reference/public-api.md`, `docs/reference/client-sdk.md` | **yes** | The wire contract for the nested filter value, its limits and its 400s; the `.whereRelation()` chain method. |

#### c) `graphify affected` impact analysis (breaking-change proof)

```
$ graphify affected "expandRelations" --depth 2
- readListEntries()        [calls]   apps/api/src/public/read-list.ts:L48
- readSingleEntry()        [calls]   apps/api/src/public/read-single.ts:L41
- read-list.ts             [imports] apps/api/src/public/read-list.ts:L8
- read-single.ts           [imports] apps/api/src/public/read-single.ts:L8
- relation-include.test.ts [imports] apps/api/src/public/relation-include.test.ts:L7
- publicReadHandler()      [calls]   apps/api/src/public/public-read.ts:L54
- public-read.ts           [imports] apps/api/src/public/public-read.ts:L11
- public-read.test.ts      [imports] apps/api/src/public/public-read.test.ts:L8
```

Reading: the admission logic being extracted has a blast radius of **one slice plus its own tests**.
Extraction is safe provided the thrown strings do not change — which is why SECTION 4 fixes them
verbatim rather than "improving" them.

```
$ graphify affected "parsePublicFilter" --depth 2
- readListEntries()          [calls]   apps/api/src/public/read-list.ts:L24
- public/query-builder.test.ts [imports] apps/api/src/public/query-builder.test.ts:L6
- read-list.ts               [imports] apps/api/src/public/read-list.ts:L10
- publicReadHandler()        [calls]   apps/api/src/public/public-read.ts:L54
- public-read.ts             [imports] apps/api/src/public/public-read.ts:L11
- public-read.test.ts        [imports] apps/api/src/public/public-read.test.ts:L8
```

Reading: `parsePublicFilter` has exactly **one production caller** (`readListEntries`). Widening its
return type with an optional `subquery` field on a condition is provably non-breaking; `read-single.ts`
never parses a filter at all, which is why the read-single path is untouched by this sprint.

```
$ graphify affected "buildSelectQuery" --depth 1
- query.test.ts [imports] packages/core/src/engine/query.test.ts:L4
```

Reading, with the caveat sprint 4 recorded: the AST graph does not trace imports through the
`@beechcms/core` barrel, so this is not proof of zero consumers — it is proof that **this sprint adds
none**. Every resolved subquery reaches the engine as an existing `in` condition, so the SQL compiler is
not opened and every previously-generated statement stays byte-identical.

```
$ graphify affected "FluentQueryBuilder" --depth 2
- browser/client.ts        [imports]        packages/client/src/browser/client.ts:L6
- server/client.ts         [imports]        packages/client/src/server/client.ts:L6
- src/query-builder.test.ts [imports]       packages/client/src/query-builder.test.ts:L5
- browser/index.ts         [re_exports]     packages/client/src/browser/index.ts:L4
- server/index.ts          [re_exports]     packages/client/src/server/index.ts:L4
- browser-client.test.ts   [dynamic_import] packages/client/src/browser/browser-client.test.ts:L1
- server-client.test.ts    [dynamic_import] packages/client/src/server/server-client.test.ts:L1
```

Reading: adding a method to the chain reaches only `@beechcms/client`'s own two client factories, and
both consume the builder through the same `QueryExecutor` contract, which does **not** change — the
executors keep receiving one `ListQuery` object. Neither `browser/client.ts` nor `server/client.ts` is
opened by this sprint. `apps/api/test/client-sdk-e2e.test.ts` (the consumer sprint 5 had to migrate)
calls only `.where()/.first()/.list()` and is therefore unaffected.

```
$ graphify path "publicReadHandler" "D1ContentRepository"  → no directed path
$ graphify path "publicReadHandler" "queryD1"              → no directed path
$ graphify path "readListEntries"   "D1BackrefRepository"  → no directed path
```

Reading: the public slice reaches storage only through the injected `ContentRepository` interface —
never a concrete D1 class, never the CLI's shell SQLite path, never the dashboard's junction-SQL
repository. **All three must still return _no directed path_ after this sprint.** They are the
regression guard for the one genuinely dangerous shortcut available here (calling `jTable()` or writing
a junction `SELECT` inside `public/`), and they are re-run in SECTION 5.

---

### VETO Audit

Proposed boundaries from step 1, evaluated against `_config/ponytail_arch.md`.

**1. The Botanical Invariant — no D1 access bypasses `@beechcms/core`.**
The public slice issues **zero SQL**. A relation subquery is resolved in two steps, both through the
injected `ContentRepository`: (a) `findMany(targetSeed, …)` against the relation's target seed, which
compiles through `buildSelectQuery` exactly like every other public read; (b) for multi-relations only,
`findParentIdsByRelation(parentSeed, alias, targetIds, limit)` — a **new method on the core interface**,
whose single parameterized statement lives in `D1ContentRepository` beside the junction statements that
class already owns (`jTable()`, L92). Both results are rewritten into the `in` operator the engine
already supports, so no new operator and no raw statement enters the system. Every lookup is by
`branch.alias`; branch identity stays `br_XX` in the Seed definitions; the physical table name
`rel_{seed}_{alias}` is never spelled outside the repository.
The alternative considered and rejected: resolving the junction inside `apps/api/src/public/` with a
`prepare()` call, the way `features/backrefs/d1-backref.repository.ts:62` does. That is precisely the
bypass rule 2 exists to forbid, and it would break the three `graphify path` guards above. **PASS.**

**2. VSA enforcement — no cross-feature imports.**
Everything new lives in `apps/api/src/public/`, the slice that owns the public contract, and imports
only from `@beechcms/core` and from sibling modules inside the same slice. Nothing under
`../features/` is imported, and the dashboard's backref repository — which answers the *inverse*
question against the same junction tables — is deliberately **not** reused: it is a dashboard-authority
reader (it returns `displayName` and ignores public policy entirely) living in another slice, and
importing it would be a cross-slice import of exactly the kind rule 3 forbids. The duplicated concept
is one `SELECT DISTINCT parent_id`, and it lands in the shared repository both slices already depend on
— not in a shared helper between two feature slices.
Within the slice, the admission checks that `relation-include.ts` and `relation-subquery.ts` would
otherwise both hand-roll are extracted once into `relation-access.ts`. Two call sites, one definition of
"a publicly reachable relation". **PASS.**

**3. Cloudflare purity.**
Edge-native throughout: at most two extra `findMany` round-trips and, for multi-relations, one extra
junction `SELECT`, all inside the same Worker request, all parameterized, all bounded (≤ 2 subqueries
per request, ≤ 200 resolved target ids, ≤ 500 resolved parent ids). No ORM, no background job, no new
binding, no migration, no non-deterministic schema change. Edge caching is unaffected: the filter — with
its nested subquery — is part of the request URL, so `resolveEdgeCache`/`withCachedResponse`
(`public-read.ts:32,51`) keep keying correctly with no change. **PASS.**

**4. YAGNI — what was cut before drafting.**
- **`not_in` over a relation subquery** — rejected. The brief says `IN` (rule 11), and `col NOT IN (…)`
  silently drops rows whose relation column is NULL, so the obvious reading of the feature would be
  wrong for exactly the rows a consumer cares about. `not_in` on a relation is refused with 400.
- **Nested subqueries (a subquery inside a subquery)** — rejected. Depth is 1, the same ceiling sprint 4
  fixed for `include=`. Anything deeper is the architectural RFC #385 already defers.
- **Typed inner fields (`.whereRelation('category_id', q => q.where({ name: … }))` checked against the
  `categories` row type)** — rejected for this sprint. It requires emitting a relation→target map in
  `seed-types-generator.ts`, regenerating every published client, and a third generic parameter on the
  chain: three boundaries, none of which the brief asks for. The *alias* is typed (it is a key of the
  row type); the inner fields are validated server-side and answer 400. Recorded in SECTION 7.
- **Silent truncation of an over-broad subquery** — rejected as a correctness defect, not a limit.
  Truncating an id set makes the parent page silently *miss rows*, which is indistinguishable from data
  loss for the consumer. Over-broad subqueries answer 400 and say how to narrow.
- **A core-level `resolveRelationSubquery()` helper** — rejected. It would be a second definition of
  "publicly filterable" living outside the slice that owns the public contract — the same judgement
  sprint 4 made about `expandRelations`.

**5. Minimalist blueprint.** Two new modules in one slice, four edited files in that slice, one method on
the core `ContentRepository` interface with one implementation and one in-memory mock, three touched
files in `@beechcms/client`, one new integration suite, two docs pages. No migration, no dashboard, no
CLI, no new package, no new dependency.

**Verdict: APPROVED.** No violation found; the plan below is the version that survived this audit.

HANDOFF -> caveman_coder

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================
This is the last sprint of the #381→#385 chain, and it exists **last** for a hard reason: a relation
subquery is only expressible against relations the server has already declared publicly reachable.
Sprint 4 established that declaration (`include=`, depth 1, policy-aware, `X-Schema-Revision`) and
sprint 5 established the chain object that will carry it (`.collection().where().include()…`). Filtering
*through* a relation before either existed would have meant inventing a second, parallel notion of
"which relations may a public caller traverse" — the exact duplication the chain was sequenced to avoid.

The feature it closes is the one the brief opened with: a consumer can already ask for a post's category
(`include=category_id`), but cannot ask for *the posts in the category named "Tech"* without two
round-trips and client-side id juggling. That is the remaining gap between BeechCMS's fluent client and
the query ergonomics its value proposition claims — and it is closed here without a second query
language, without a client-side SQL AST, and without unbounded graph traversal (brief rules 7 and 11).

**VSA adherence.** All new public-contract logic lands in `apps/api/src/public/`, the slice that owns
that contract. No feature slice is imported; no feature slice imports the new modules. The one piece of
logic that genuinely belongs elsewhere — reading a junction table — goes to the repository both slices
already depend on, behind the `ContentRepository` interface, not into a shared helper between slices.

**Botanical Engine adherence.** The public slice issues no SQL. Both resolution steps travel the injected
`ContentRepository`; the resolved id sets re-enter the engine as the `in` operator `buildSelectQuery`
already compiles (`query.ts:208-219`). No hardcoded field names (every lookup is by `branch.alias`), no
physical table name outside the repository, no new operator, no migration.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Public read path** (`graphify explain "publicReadHandler"`, `graphify affected "parsePublicFilter"`):

```
publicReadHandler (public-read.ts:14)
  ├─ readSingleEntry  (?id= / ?slug=)   → NO filter parsing at all
  └─ readListEntries  (read-list.ts:21)
       ├─ parsePublicFilter(query.filter)      L24  → ParsedPublicFilter | null
       ├─ toEngineFilters(seed, parsedFilter)  L31  → FilterGroup[]
       ├─ repository.findMany(seed, …)         L35
       ├─ toFlatPublicEntry(item, seed, …)     L47
       └─ expandRelations(data, query.include, …) L48
```

- `parsePublicFilter` (`public/query-builder.ts:76`) accepts `{"logic":"AND","where":[{field,op,value}]}`
  and validates `op` against `PUBLIC_FILTER_OPERATORS` (L46). It does **not** constrain the shape of
  `value`.
- `toEngineFilters` (`public/query-builder.ts:121`) looks the field up as a branch, enforces
  `resolvePolicies(branch).public && .filter` (L127), maps the branch type to a `FilterType` (L96 —
  `relation` falls to the `text` default) and emits one `FilterGroup` per condition.
- `buildSelectQuery` (`core/engine/query.ts:36`) skips any group whose column fails
  `isValidColumn(seed, col)` (`ddl.ts:108`), and `buildFilterCondition` returns `null` for an `in` whose
  value is not a non-empty array (`query.ts:209`) — **a dropped condition, not an error**.

**Two latent defects this establishes, both fixed by this sprint:**
1. `isValidColumn` returns `true` for a **multi-relation** alias (it only checks that a branch with that
   alias exists), but a multi-relation has **no column on the parent table** (`ddl.ts:138`, junction
   tables only). `?filter={"where":[{"field":"related_posts","op":"in","value":["<id>"]}]}` therefore
   compiles to `related_posts IN (?)` and answers **500** today.
2. A filter whose `in` value is not a non-empty array is silently dropped, so the request answers **200
   with the whole collection** instead of the filtered subset. Any subquery-shaped value sent to today's
   server would return *more* data than asked for, not an error. Both are why SECTION 4 validates the
   value shape at parse time and short-circuits empty id sets explicitly.

**Relation reachability** (`relation-include.ts:30-52`, shipped by sprint 4) — a relation is publicly
traversable only when: the alias exists on the parent seed, the branch is `type: 'relation'`,
`resolvePolicies(branch).public` is true, the branch declares `targetSeed`, and the target seed has
`allowPublicRead`. Limits: ≤ 3 includes, depth 1 (no dots), ≤ 200 target ids per branch. Errors are
`Error`s whose message starts with `Invalid include:`, mapped to 400 `invalid-include` in
`public-read.ts:60`; `Invalid filter:` maps to 400 `invalid-filter` at L57.

**Relation storage** (`core/engine/ddl.ts`, `content.repository.d1.ts`):
- single (`multiple` falsy): a `TEXT` column on `content_{slug}` holding the target id, with an FK
  (`ddl.ts:46,136`). Filterable by column today.
- multi (`multiple: true`): **no parent column**; rows live in `rel_{parent}_{alias}(parent_id,
  target_id, position)` (`ddl.ts:418-431`), read back per page by `attachMultiRelationRows`
  (`content.repository.d1.ts:267`) and exposed as an ordered `string[]` on the branch alias. The junction
  table name is built by the private `jTable()` (`content.repository.d1.ts:92`). Column names
  `parent_id` / `target_id` are confirmed by the dashboard reader at
  `features/backrefs/d1-backref.repository.ts:68,77`.

**Client** (`packages/client`, sprint 5):
- `FluentQueryBuilder<TRow>` (`query-builder.ts:16`) accumulates one `ListQuery<TRow>` and hands it to a
  `QueryExecutor` (`query-builder.ts:11`) supplied by `browser/client.ts:27` and `server/client.ts`.
- `buildSearchParams` (`query-builder.ts:50`) flattens `query.filter` into
  `{logic, where:[{field,op,value}]}`, validating each operator against `OPERATORS` (L6) and throwing
  `TypeError` on an unknown one.
- `ListQuery<TRow>` (`types.ts:55`) already carries `filter`, `logic`, `sort`, `search`, `fields`,
  `include`, `page`, `limit`, `latest`. `SeedRegistryTypes` (`types.ts:76`) is the generated registry;
  relation branches are emitted as `string` / `string[]` (`core/engine/seed-types-generator.ts:55`) —
  **there is no relation→target-seed map in the generated types**, which is why the inner fields of a
  subquery cannot be typed in this sprint.

**Canonical fixtures** (`packages/testing/src/seeds/canonical.seeds.ts`, extended by sprint 4) — already
sufficient, no change needed: `categories` (`allowPublicRead: true`, public `name`), `posts.category_id`
(`br_09`, single relation → `categories`, `policies.public: true`), `posts.related_posts` (`br_10`, multi
relation → `posts`, `policies.public: true`), `posts.author_id` (`br_08`, relation → `authors`, **not**
public and `authors` is **not** `allowPublicRead`) — the negative case.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

**`@beechcms/core` — interface only (no logic, no SQL):**
- `packages/core/src/content/content.repository.ts` *(modified)* — one new method on the
  `ContentRepository` interface: `findParentIdsByRelation`.

**`apps/api` — public slice:**
- `apps/api/src/public/relation-access.ts` *(new)* — `resolvePublicRelationTarget()`: the single
  definition of "a publicly reachable relation branch", extracted verbatim from `relation-include.ts`.
- `apps/api/src/public/relation-access.test.ts` *(new, unit tier)*.
- `apps/api/src/public/relation-subquery.ts` *(new)* — `resolveRelationSubqueries()`: turns relation
  conditions into concrete id conditions through the repository.
- `apps/api/src/public/relation-subquery.test.ts` *(new, unit tier)*.
- `apps/api/src/public/query-builder.ts` *(modified)* — parse and validate the nested subquery value;
  `PublicFilterCondition` gains an optional `subquery` field.
- `apps/api/src/public/query-builder.test.ts` *(modified)* — parser cases for the new value shape.
- `apps/api/src/public/read-list.ts` *(modified)* — call the resolver between parse and
  `toEngineFilters`; short-circuit an empty result set.
- `apps/api/src/public/relation-include.ts` *(modified)* — consume `relation-access.ts`; **no behaviour
  and no message change**.
- `apps/api/src/public/public-read.ts` *(modified)* — one `catch` branch: `Invalid subquery:` → 400
  `invalid-subquery`.
- `apps/api/src/public/test/integration/public-relation-subquery.integration.test.ts` *(new,
  integration tier)*.

**`apps/api` — shared infrastructure:**
- `apps/api/src/shared/db/repositories/content.repository.d1.ts` *(modified)* — implements
  `findParentIdsByRelation` with one parameterized junction `SELECT`.
- `apps/api/test/mocks/static-content.repository.ts` *(modified)* — in-memory implementation of the same
  method (required: the class `implements ContentRepository`).

**`@beechcms/client`:**
- `packages/client/src/types.ts` *(modified)* — `RelationSubquery`, `ListQuery.relationFilters`,
  `FluentQuery.whereRelation()`.
- `packages/client/src/query-builder.ts` *(modified)* — `.whereRelation()` on the chain; nested encoding
  in `buildSearchParams`.
- `packages/client/src/index.ts` *(modified)* — export `FluentQuery` and `RelationSubquery` types.
- `packages/client/src/query-builder.test.ts` *(modified, unit tier)* — encoding cases.

**Docs:**
- `docs/reference/public-api.md` *(modified)* — the nested filter value, its limits, its 400s.
- `docs/reference/client-sdk.md` *(modified)* — `.whereRelation()` on the fluent chain.

**Explicitly not produced:** no migration, no new route, no middleware change, no `apps/dashboard` file,
no `packages/cli` file, no change to `packages/core/src/engine/*`, no change to `@beechcms/testing`.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### 4.0 The wire contract (decide nothing downstream — this is it)

A relation subquery is a **nested object in the `value` position** of an existing `in` condition inside
the existing `filter` query parameter. No new query parameter is introduced.

```
GET /api/v1/public/posts?filter={"logic":"AND","where":[
  {"field":"category_id","op":"in","value":{"logic":"AND","where":[{"field":"name","op":"eq","value":"Tech"}]}}
]}
```

Rules, all enforced server-side:
- `field` must be a **publicly reachable relation branch** of the queried seed (same five checks as
  `include=`). Single and multi relations are both accepted.
- `op` must be `in`. Any other operator with an object value → `Invalid subquery:` 400.
- The nested value is `{ where: [...], logic?: 'AND' | 'OR' }`; `where` entries have the same
  `{field, op, value}` shape and are validated **against the target seed** with the existing
  `toEngineFilters` policy gate (public + filterable).
- Depth 1: a nested condition whose `value` is an object → `Invalid subquery:` 400.
- ≤ **2** relation subqueries per request; inner `where` ≤ **5** conditions.
- The inner query resolves against **published** entries only, matching `include=`.
- A resolved target-id set larger than **200**, or a resolved parent-id set larger than **500**, is
  refused with 400 — never truncated.

An `in` condition on a relation alias whose value is a **plain array of ids** stays legal and is routed
through the same resolver (this is what fixes the multi-relation 500 described in SECTION 2).

### 4.1 `@beechcms/core` — the interface method

`packages/core/src/content/content.repository.ts`, inside `export interface ContentRepository` (after
`findBySlug`, before `getFacets`):

```ts
  /**
   * Resolves the parent entry ids that reference any of `targetIds` through a MULTI relation
   * branch (junction table). Single-value relations need no lookup — their target id lives in a
   * column on the parent row and is filterable directly.
   *
   * Returns at most `limit` distinct parent ids, in no guaranteed order. Callers that must
   * distinguish "complete" from "truncated" pass `limit = cap + 1` and compare the length.
   *
   * @throws RepositoryError if `branchAlias` is not a `multiple: true` relation branch of `seed`.
   */
  findParentIdsByRelation(
    seed: Seed,
    branchAlias: string,
    targetIds: string[],
    limit: number,
  ): Promise<string[]>
```

No other core file is opened. Do **not** add an engine helper, do **not** touch `query.ts`, `ddl.ts` or
the barrel exports.

### 4.2 `apps/api` — D1 implementation

`apps/api/src/shared/db/repositories/content.repository.d1.ts`, as a public method of
`D1ContentRepository` (place it next to `findMany`/`findById`, after `findBySlug`):

```ts
  /**
   * Reads the live junction table for a multi-relation branch and returns the distinct parent ids
   * pointing at any of `targetIds`. Draft junction rows are deliberately excluded: the public
   * surface filters published content only.
   */
  async findParentIdsByRelation(
    seed: Seed,
    branchAlias: string,
    targetIds: string[],
    limit: number,
  ): Promise<string[]> {
    if (targetIds.length === 0 || limit <= 0) return []

    const branch = seed.branches.find(b => b.alias === branchAlias)
    if (!branch || branch.type !== 'relation' || branch.multiple !== true) {
      throw new RepositoryError(
        `findParentIdsByRelation: '${branchAlias}' is not a multi-relation branch of ${seed.slug}`,
      )
    }

    const table = jTable(seed.slug, branchAlias)
    const placeholders = targetIds.map(() => '?').join(', ')
    const { results } = await this.db
      .prepare(
        `SELECT DISTINCT parent_id FROM ${table} WHERE target_id IN (${placeholders}) LIMIT ?`,
      )
      .bind(...targetIds, limit)
      .all<{ parent_id: string }>()

    return (results ?? []).map(r => r.parent_id)
  }
```

`jTable` (L92) and `RepositoryError` (imported at L9) already exist in this file. The table name comes
from `jTable`, never from a template literal written at the call site.

### 4.3 `apps/api` — in-memory mock

`apps/api/test/mocks/static-content.repository.ts`, as a method of `StaticContentRepository` (the class
`implements ContentRepository`, so this is required for `tsc` to pass):

```ts
  async findParentIdsByRelation(
    seed: Seed,
    branchAlias: string,
    targetIds: string[],
    limit: number,
  ): Promise<string[]> {
    if (targetIds.length === 0 || limit <= 0) return []
    const wanted = new Set(targetIds)
    const parents: string[] = []
    for (const entry of this.getTable(seed.slug)) {
      const value = Object.hasOwn(entry, branchAlias) ? entry[branchAlias] : undefined
      if (!Array.isArray(value)) continue
      if (value.some((v) => typeof v === 'string' && wanted.has(v))) {
        parents.push(entry.id as string)
        if (parents.length >= limit) break
      }
    }
    return parents
  }
```

### 4.4 `apps/api` — `relation-access.ts` (new, extraction)

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Branch, Seed } from '@beechcms/core'
import { resolvePolicies } from '@beechcms/core'

/** Error vocabulary of the caller: the same five checks answer under two contract names. */
export type RelationAccessKind = 'include' | 'subquery'

export type PublicRelationTarget = {
  branch: Branch
  targetSeed: Seed
}

/**
 * The single definition of "a relation a public caller may traverse", shared by `?include=`
 * (relation-include.ts) and relation subquery filters (relation-subquery.ts).
 *
 * @throws Error whose message starts with `Invalid include:` or `Invalid subquery:` per `kind`,
 *   which public-read.ts maps to 400 `invalid-include` / `invalid-subquery`.
 */
export function resolvePublicRelationTarget(
  alias: string,
  parentSeed: Seed,
  getSeed: (slug: string) => Seed | null,
  kind: RelationAccessKind,
): PublicRelationTarget {
  const prefix = kind === 'include' ? 'Invalid include' : 'Invalid subquery'

  const branch = parentSeed.branches.find(b => b.alias === alias)
  if (!branch) {
    throw new Error(`${prefix}: branch '${alias}' does not exist.`)
  }
  if (branch.type !== 'relation') {
    throw new Error(`${prefix}: branch '${alias}' is not a relation.`)
  }
  if (!resolvePolicies(branch).public) {
    throw new Error(`${prefix}: branch '${alias}' is not publicly readable.`)
  }
  if (!branch.targetSeed) {
    throw new Error(`${prefix}: branch '${alias}' is missing a target seed.`)
  }
  const targetSeed = getSeed(branch.targetSeed)
  if (!targetSeed || !targetSeed.allowPublicRead) {
    throw new Error(`${prefix}: target seed '${branch.targetSeed}' is not publicly readable.`)
  }

  return { branch, targetSeed }
}
```

**Then edit `relation-include.ts`:** delete its inline checks (L35-52) and replace them with

```ts
    const { branch, targetSeed } = resolvePublicRelationTarget(include, parentSeed, getSeed, 'include')
```

keeping the dot-check (L31) and the `MAX_INCLUDES` check (L26) where they are. The five message strings
above are byte-identical to the ones being deleted — `relation-include.test.ts` must pass **unchanged**.
If it does not, the extraction is wrong; do not edit that test.

### 4.5 `apps/api` — subquery parsing (`public/query-builder.ts`)

Extend the exported types (keep everything else in the file as it is):

```ts
export type PublicSubquery = {
  where: PublicFilterCondition[]
  logic: PublicFilterLogic
}

export type PublicFilterCondition = {
  field: string
  op: PublicFilterOperator
  value?: unknown
  /** Present only for a relation subquery: `value` is then unused. */
  subquery?: PublicSubquery
}
```

Add the limits and the nested parser, and route `parseWhereCondition` through them:

```ts
const MAX_RELATION_SUBQUERIES = 2
const MAX_SUBQUERY_CONDITIONS = 5

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseSubquery(field: string, op: PublicFilterOperator, raw: Record<string, unknown>): PublicSubquery {
  if (op !== 'in') {
    throw new TypeError(`Invalid subquery: field '${field}' uses operator '${op}'; only 'in' accepts a subquery.`)
  }
  if (!Array.isArray(raw.where)) {
    throw new TypeError(`Invalid subquery: field '${field}' requires a 'where' array.`)
  }
  if (raw.where.length === 0 || raw.where.length > MAX_SUBQUERY_CONDITIONS) {
    throw new TypeError(
      `Invalid subquery: field '${field}' must carry between 1 and ${MAX_SUBQUERY_CONDITIONS} conditions (got ${raw.where.length}).`,
    )
  }
  const where = raw.where.map((inner) => {
    const cond = parseWhereCondition(inner)
    if (!cond) {
      throw new TypeError(`Invalid subquery: field '${field}' carries an unreadable condition.`)
    }
    if (cond.subquery) {
      throw new TypeError(`Invalid subquery: field '${field}' nests a second subquery; max depth is 1.`)
    }
    return cond
  })
  return { where, logic: validateLogic(raw.logic) }
}
```

Inside `parseWhereCondition`, after the operator check and before the `return`:

```ts
  if (isPlainObject(maybe.value)) {
    return { field, op: opRaw as PublicFilterOperator, subquery: parseSubquery(field, opRaw as PublicFilterOperator, maybe.value) }
  }
```

And in `parsePublicFilter`, after `where` is built:

```ts
  const subqueryCount = where.filter(c => c.subquery).length
  if (subqueryCount > MAX_RELATION_SUBQUERIES) {
    throw new TypeError(
      `Invalid subquery: a request may carry at most ${MAX_RELATION_SUBQUERIES} relation subqueries (got ${subqueryCount}).`,
    )
  }
```

`toEngineFilters` is **not** modified: by the time it runs, no condition carries a `subquery` any more
(see 4.6). As a fail-closed guard, add at the top of its `map` callback:

```ts
    if (cond.subquery) {
      throw new TypeError(`Invalid subquery: field '${cond.field}' reached the engine unresolved.`)
    }
```

### 4.6 `apps/api` — `relation-subquery.ts` (new, the resolver)

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { ContentRepository, Seed } from '@beechcms/core'
import { resolvePublicRelationTarget } from './relation-access'
import { toEngineFilters, type ParsedPublicFilter, type PublicFilterCondition } from './query-builder'

/** A subquery resolving to more targets than this is refused, never truncated: truncation silently drops parent rows. */
const MAX_SUBQUERY_TARGET_IDS = 200
/** Multi-relation resolution fans out to parents; the same refusal rule applies one level up. */
const MAX_SUBQUERY_PARENT_IDS = 500

export type ResolvedSubqueryFilter = {
  /** Filter to hand to `toEngineFilters`, with every subquery rewritten to a concrete id condition. */
  filter: ParsedPublicFilter | null
  /** True when the request provably matches nothing; the caller MUST answer an empty page without querying. */
  empty: boolean
}

/**
 * Rewrites every relation condition into a concrete `in` condition the engine can compile:
 *   - single relation → `{ field: <alias>, op: 'in', value: [targetId, …] }` (the alias IS a column)
 *   - multi relation  → `{ field: 'id',    op: 'in', value: [parentId, …] }` (resolved via the junction)
 *
 * An unresolved subquery must never reach `buildSelectQuery`: an `in` with an empty array is DROPPED
 * there (query.ts:209), which would answer the whole collection instead of nothing.
 */
export async function resolveRelationSubqueries(
  parsed: ParsedPublicFilter | null,
  parentSeed: Seed,
  repository: ContentRepository,
  getSeed: (slug: string) => Seed | null,
  publishedOnly: boolean,
): Promise<ResolvedSubqueryFilter> {
  if (!parsed || parsed.where.length === 0) return { filter: parsed, empty: false }

  const isOr = parsed.logic === 'OR'
  const rewritten: PublicFilterCondition[] = []
  let droppedAny = false

  for (const cond of parsed.where) {
    const branch = parentSeed.branches.find(b => b.alias === cond.field)
    const isRelation = branch?.type === 'relation'

    if (!cond.subquery && !isRelation) {
      rewritten.push(cond)
      continue
    }
    if (!cond.subquery && isRelation && branch?.multiple !== true) {
      // A single relation is a plain TEXT column; today's direct id filter already works.
      rewritten.push(cond)
      continue
    }
    if (cond.op !== 'in') {
      throw new TypeError(
        `Invalid subquery: field '${cond.field}' is a relation and only supports the 'in' operator (got '${cond.op}').`,
      )
    }

    const { branch: relBranch, targetSeed } = resolvePublicRelationTarget(cond.field, parentSeed, getSeed, 'subquery')

    const targetIds = cond.subquery
      ? await resolveTargetIds(cond.field, cond.subquery, targetSeed, repository, publishedOnly)
      : normalizeIdArray(cond.field, cond.value)

    if (targetIds.length === 0) {
      droppedAny = true
      if (!isOr) return { filter: null, empty: true }
      continue
    }

    if (relBranch.multiple !== true) {
      rewritten.push({ field: cond.field, op: 'in', value: targetIds })
      continue
    }

    const parentIds = await repository.findParentIdsByRelation(
      parentSeed, cond.field, targetIds, MAX_SUBQUERY_PARENT_IDS + 1,
    )
    if (parentIds.length > MAX_SUBQUERY_PARENT_IDS) {
      throw new TypeError(
        `Invalid subquery: field '${cond.field}' matches more than ${MAX_SUBQUERY_PARENT_IDS} entries; narrow the subquery.`,
      )
    }
    if (parentIds.length === 0) {
      droppedAny = true
      if (!isOr) return { filter: null, empty: true }
      continue
    }
    rewritten.push({ field: 'id', op: 'in', value: parentIds })
  }

  // Under OR, a subquery matching nothing is a false disjunct and is dropped — but if EVERY condition
  // was dropped the request matches nothing, and an empty `where` would answer the whole collection.
  if (rewritten.length === 0) {
    return { filter: null, empty: droppedAny }
  }

  return { filter: { where: rewritten, logic: parsed.logic }, empty: false }
}

async function resolveTargetIds(
  field: string,
  subquery: NonNullable<PublicFilterCondition['subquery']>,
  targetSeed: Seed,
  repository: ContentRepository,
  publishedOnly: boolean,
): Promise<string[]> {
  // Reuses the public filter policy gate: inner fields must be public AND filterable on the TARGET seed.
  const innerFilters = toEngineFilters(targetSeed, { where: subquery.where, logic: subquery.logic })

  const { items, total } = await repository.findMany(targetSeed, {
    filters: innerFilters,
    filterLogic: subquery.logic,
    status: publishedOnly ? 'published' : null,
    pagination: { limit: MAX_SUBQUERY_TARGET_IDS, offset: 0 },
  })

  if (total > MAX_SUBQUERY_TARGET_IDS) {
    throw new TypeError(
      `Invalid subquery: field '${field}' matches ${total} entries, above the limit of ${MAX_SUBQUERY_TARGET_IDS}; narrow the subquery.`,
    )
  }
  return items.map(item => item.id as string).filter(id => typeof id === 'string')
}

function normalizeIdArray(field: string, value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`Invalid subquery: field '${field}' expects an array of ids or a subquery object.`)
  }
  const ids = value.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
  if (ids.length > MAX_SUBQUERY_TARGET_IDS) {
    throw new TypeError(
      `Invalid subquery: field '${field}' carries more than ${MAX_SUBQUERY_TARGET_IDS} ids.`,
    )
  }
  return ids
}
```

`toEngineFilters` throws `Invalid filter: field '<x>' is not filterable` for a non-public inner field;
that message keeps its existing 400 `invalid-filter` mapping, which is correct — the offending field is
an ordinary filter field, it just happens to sit inside a subquery.

### 4.7 `apps/api` — wire it into `read-list.ts`

Replace L31 (`const engineFilters = toEngineFilters(seed, parsedFilter)`) with:

```ts
  const resolved = await resolveRelationSubqueries(parsedFilter, seed, repository, getSeed, publishedOnly)
  if (resolved.empty) {
    const emptyMeta = latestMode
      ? { total: 0, returned: 0, seed: seedSlug }
      : buildPublicListMeta({ total: 0, page: pagination.page, limit: pagination.limit, returned: 0, seed: seedSlug })
    return { data: [], meta: emptyMeta }
  }
  const engineFilters = toEngineFilters(seed, resolved.filter)
```

and pass `resolved.filter?.logic` where `parsedFilter?.logic` is read at L37. Nothing else in the
function changes — `expandRelations` at L48 still runs against whatever survived the filter, so
`filter=<subquery>` and `include=` compose.

### 4.8 `apps/api` — the 400 mapping (`public-read.ts`)

In the `catch` block, **above** the existing `Invalid filter:` branch (L57) — the order matters, the
prefixes are disjoint but the subquery branch is the more specific contract:

```ts
    if (error instanceof Error && error.message.startsWith('Invalid subquery:')) {
      return publicProblem(context, { type: 'invalid-subquery', title: 'Invalid Subquery', status: 400, detail: error.message })
    }
```

### 4.9 `@beechcms/client` — types (`packages/client/src/types.ts`)

```ts
/** Inner query of a relation subquery filter: resolved server-side against the relation's target seed. */
export interface RelationSubquery {
  where: Record<string, FieldFilter>
  logic?: 'AND' | 'OR'
}
```

Add to `ListQuery<TRow>` (after `include`):

```ts
  /** Relation alias → subquery. Encoded into the `filter` parameter as a nested `in` value. */
  relationFilters?: Record<string, RelationSubquery>
```

Add to `FluentQuery<TRow>` (after `include`):

```ts
  /**
   * Filters the collection through a declared relation: keeps entries whose `alias` relation
   * points at any entry of the target seed matching `subquery`. Depth 1; the server refuses a
   * relation that `?include=` could not traverse, and refuses an over-broad subquery with 400.
   */
  whereRelation(alias: Extract<keyof TRow, string>, subquery: RelationSubquery): this
```

### 4.10 `@beechcms/client` — encoding (`packages/client/src/query-builder.ts`)

Add the chain method to `FluentQueryBuilder<TRow>`:

```ts
  whereRelation(alias: Extract<keyof TRow, string>, subquery: RelationSubquery): this {
    this.query.relationFilters = { ...this.query.relationFilters, [alias]: subquery }
    return this
  }
```

Extract the existing flattening loop out of `buildSearchParams` so both levels share it, then encode the
relation filters into the same `where` array:

```ts
type WireCondition = { field: string; op: BeechFilterOperator; value?: unknown }

function toWireConditions(filter: Record<string, FieldFilter>): WireCondition[] {
  const where: WireCondition[] = []
  for (const [field, raw] of Object.entries(filter)) {
    if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const [op, value] of Object.entries(raw)) {
        if (!OPERATORS.has(op as BeechFilterOperator)) {
          throw new TypeError(`Invalid filter operator '${op}' on field '${field}'`)
        }
        where.push({ field, op: op as BeechFilterOperator, value })
      }
    } else {
      where.push({ field, op: 'eq', value: raw })
    }
  }
  return where
}
```

In `buildSearchParams`, replace the inline loop with `toWireConditions(query.filter)` and add, before the
`params.set('filter', …)` call:

```ts
  for (const [alias, subquery] of Object.entries(query.relationFilters ?? {})) {
    where.push({
      field: alias,
      op: 'in',
      value: { logic: subquery.logic ?? 'AND', where: toWireConditions(subquery.where) },
    })
  }
```

so a chain with only a `relationFilters` entry still emits the `filter` parameter (the existing
`if (where.length)` guard covers both sources once they share the array). Operator validation inside a
subquery therefore reuses the same `OPERATORS` set and throws the same `TypeError` client-side.

`packages/client/src/index.ts` — add `FluentQuery` and `RelationSubquery` to the exported type list.
`browser/client.ts` and `server/client.ts` are **not** opened: the executor contract is unchanged.

### 4.11 Tests

**`apps/api/src/public/relation-access.test.ts`** (unit) — `describe('resolvePublicRelationTarget', …)`:
resolves `category_id` to the `categories` seed; each of the five rejection paths throws with the
`Invalid include:` / `Invalid subquery:` prefix per `kind` (`author_id` is the non-public branch,
`authors` the non-public target seed). Canonical seeds only.

**`apps/api/src/public/relation-subquery.test.ts`** (unit) — `describe('resolveRelationSubqueries', …)`,
repository faked with `vi.fn()` (unit tier per Rule 0.1):
- a single-relation subquery rewrites to `{ field: 'category_id', op: 'in', value: [ids] }`;
- a multi-relation subquery calls `findParentIdsByRelation` and rewrites to `{ field: 'id', op: 'in' }`;
- an inner query matching nothing under `AND` returns `{ filter: null, empty: true }` — the regression
  guard for the dropped-`in` defect (`query.ts:209`);
- under `OR`, an empty subquery drops only its own disjunct and leaves the sibling condition intact;
- under `OR`, all-conditions-dropped returns `empty: true`;
- `total` above the target cap, and a parent-id set above the parent cap, both throw
  `Invalid subquery:`;
- a relation condition with `op: 'not_in'` throws `Invalid subquery:`.

**`apps/api/src/public/query-builder.test.ts`** (unit, extend the existing file) — the nested value
parses into `subquery`; a nested subquery inside a subquery, a non-`in` operator with an object value,
more than 2 subqueries, and an empty/oversized inner `where` each throw.

**`packages/client/src/query-builder.test.ts`** (unit, extend) — `.whereRelation()` emits the nested
`filter` JSON; it composes with `.where()` in one `where` array; `logic: 'OR'` reaches the inner object;
an invalid operator inside the subquery throws `TypeError`; a chain with only `.whereRelation()` still
emits the `filter` parameter.

**`apps/api/src/public/test/integration/public-relation-subquery.integration.test.ts`** (integration,
real D1, harness + canonical seeds, modelled byte-for-byte on
`public-relation-expansion.integration.test.ts`):
- posts filtered through `category_id` by the category's `name` return only the matching posts, and the
  count is asserted against D1;
- posts filtered through the multi-relation `related_posts` return only the referencing parents —
  the case that answers 500 today;
- a subquery matching no target returns `200` with `data: []` and `meta.total: 0` (not the whole
  collection);
- `author_id` (non-public relation) returns `400` with `type: 'invalid-subquery'`;
- a subquery on a non-filterable inner field returns `400 invalid-filter`;
- a subquery composed with `include=category_id` returns both the filtered set and `_includes`;
- every response still carries `X-Schema-Revision`.

Testing conventions are binding (`_config/testing_conventions.md`): one tier per file, SPDX header, four
zones, one ACT assigned to a named variable, canonical fixtures only, status asserted first, typed
bodies, no `any`. Repository-level coverage of `findParentIdsByRelation` is deliberately taken through
the integration suite rather than a direct D1 repository test — note that in the file docblock (Rule
6.2.3) naming this suite as where it is covered.

### 4.12 Docs

`docs/reference/public-api.md` — new section **“Relation Subquery Filters”** after
“Relation Expansion — `?include=`”: the nested value shape, the worked example from 4.0, and the limits
table (relation must be `include`-reachable; `in` only; depth 1; ≤ 2 subqueries; ≤ 5 inner conditions;
≤ 200 targets; ≤ 500 parents; published-only) with the 400 types `invalid-subquery` / `invalid-filter`.
State explicitly that an over-broad subquery is **refused, not truncated**.

`docs/reference/client-sdk.md` — document `.whereRelation(alias, { where, logic })` on the fluent chain
with one example, and state that the inner field names are validated server-side, not at compile time.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

```bash
# 1. core — interface change compiles and the package still builds
cd packages/core && npx tsc --noEmit && pnpm run build

# 2. client — types + build
cd packages/client && npx tsc --noEmit && pnpm run build

# 3. api — the interface change must not break either implementation or the mock
cd apps/api && npx tsc --noEmit && pnpm run build

# 4. the new integration suite (real D1)
cd apps/api && npx vitest run src/public/test/integration/public-relation-subquery.integration.test.ts

# 5. sprint 4 must still pass UNCHANGED — proof the relation-access extraction changed no behaviour
cd apps/api && npx vitest run src/public/relation-include.test.ts src/public/test/integration/public-relation-expansion.integration.test.ts

# 6. full workspace run, scoped to the diff (coverage thresholds included)
pnpm beech test --diff

# 7. architectural regression guards — all three MUST still print "No directed path found"
graphify update . --force
graphify path "publicReadHandler" "D1ContentRepository"
graphify path "publicReadHandler" "queryD1"
graphify path "readListEntries" "D1BackrefRepository"
```

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================
- [ ] `ContentRepository` (core) declares `findParentIdsByRelation`; `D1ContentRepository` and
      `StaticContentRepository` both implement it; `npx tsc --noEmit` passes in `packages/core`,
      `packages/client` and `apps/api`.
- [ ] No file under `apps/api/src/public/` contains `prepare(`, `jTable(`, `rel_` or any SQL string —
      verified by grep; all three `graphify path` guards still report no directed path.
- [ ] A subquery on a single relation (`category_id`) and on a multi relation (`related_posts`) both
      return exactly the matching parent entries against real D1.
- [ ] A subquery matching nothing returns `200` with `data: []` and `meta.total: 0` — never the
      unfiltered collection.
- [ ] Under `logic: 'OR'`, an empty subquery drops only its own disjunct; all-empty returns an empty
      page.
- [ ] A subquery over a relation `?include=` would refuse (`author_id`) returns `400` with
      `type: 'invalid-subquery'`; a non-filterable inner field returns `400 invalid-filter`.
- [ ] `not_in` on a relation, a nested subquery, more than 2 subqueries, more than 5 inner conditions,
      and an over-broad result set each return `400`, and the over-broad case is **refused, not
      truncated**.
- [ ] `X-Schema-Revision` is still emitted on every public response; `?include=` composes with a
      subquery filter in the same request.
- [ ] `relation-include.test.ts` and `public-relation-expansion.integration.test.ts` pass **unmodified**
      (the extraction changed no message and no behaviour).
- [ ] `.whereRelation()` is typed to the row's own keys, encodes into the existing `filter` parameter,
      and composes with `.where()/.include()/.select()/.first()/.list()`; `QueryExecutor` and both
      client factories are unchanged.
- [ ] `@beechcms/client` gains no runtime dependency.
- [ ] No `any` in production code or tests; new tests follow `_config/testing_conventions.md` (tier,
      placement, four zones, canonical fixtures, named ACT result).
- [ ] `pnpm beech test --diff` passes including coverage thresholds on every changed file.
- [ ] `docs/reference/public-api.md` and `docs/reference/client-sdk.md` document the contract and its
      limits.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================
- **Typed inner subquery fields.** `.whereRelation()` types the *alias* against the row type; the inner
  field names are `Record<string, FieldFilter>` and are validated server-side. Typing them needs a
  relation→target-seed map emitted by `packages/core/src/engine/seed-types-generator.ts` and a
  regeneration of every published client. Not built here — it needs its own brief (see the ROADMAP's
  standing decision that types derive from introspection).
- **Arbitrary `JOIN`, client-side SQL AST, unbounded graph traversal.** Rejected by the brief (§5) and by
  ROADMAP entry 6; any broader form requires a separate architectural RFC.
- **Depth > 1.** A subquery inside a subquery is refused, exactly as `include=author.team` is. Same RFC.
- **`not_in` / negated relation filters.** Deliberately refused (VETO Audit §4); the NULL semantics make
  the obvious reading wrong.
- **Subqueries on the single-entry path.** `?id=` / `?slug=` reads do not parse filters at all;
  `read-single.ts` is not opened.
- **Subqueries on write paths.** `POST /add` and `PUT /edit` are untouched.
- **Aggregates, `count`, `exists`.** Not in the brief; not built.
- **A general backref/reverse-relation query API.** `features/backrefs` stays dashboard-only and is not
  opened, generalized or imported.
- **Backfilling the fluent-chain documentation in `docs/reference/client-sdk.md`.** Sprint 5 shipped the
  chain without documenting it; this sprint adds only the `.whereRelation()` section. The wider SDK doc
  gap is real but is not this sprint's deliverable.
- **Any change to `apps/dashboard`, `packages/cli`, `@beechcms/testing`, `apps/api/migrations`,
  `packages/core/src/engine/*`, or the middleware chain in `factory.ts`.**
