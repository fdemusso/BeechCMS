# 1. Feature Definition and Core Value

`@beechcms/client` today forces consumers to hand-encode filter objects into JSON (`query-builder.ts`'s object-style `content(seed).list({filter:{...}})`), with no fluent chain, no `.include()` for relations, and no compile-time type safety — `types.ts` is backed by a generic `Record<string, unknown>` registry, not schema-derived types. This is indispensable to fix because BeechCMS's value proposition as a headless CMS depends on external consumers (not just internal dashboard code) being able to query content safely and ergonomically without learning a second query language or risking silent shape mismatches.

The fix is a typed, fluent query builder (`client.collection<'posts'>('posts').where(...).include(...).select(...).first()`) that compiles directly to the existing Public API REST contract — no new query language, no client-side SQL/graph engine, no backend semantic change. This requires an execution chain across five issues (#381→#385): a schema manifest DSL, CLI schema tooling, server-side relation expansion, the fluent client itself, and a tightly-scoped subquery extension.

Within that chain, #381 introduces a second, explicit path for seed creation and evolution: authoring or editing `beech.schema.ts` and applying it through an MCP/CLI plan-and-apply workflow (bootstrap, environment restore, portability, batch reconciliation reviewed as a Git diff before anything touches D1). This coexists with — and does not replace — the dashboard's existing direct-to-D1 seed creation UI. D1/Admin API remains the sole *runtime* schema authority regardless of which path produced a given change: the Worker never imports or executes `beech.schema.ts` implicitly, and no production schema mutation happens automatically on deploy.

The critical risk surfaced during sparring is **runtime schema drift**: TypeScript types generated at build time are only valid at that moment. If the D1 schema changes after a client is built and published to npm, external consumers — who have no shared CI safety net with the monorepo — silently trust stale types against a backend that has moved on. The core architectural decision resolving this: **live D1 introspection, not the git-tracked manifest file, is the single source of truth for generated types.** A schema fingerprint is computed from the same introspection D1 is queried through, embedded in generated types, returned on every Public API response, and verified by the client at runtime — turning silent drift into an actionable error.

# 2. Domain Boundaries and Business Rules

**Entities involved:**

- **Dashboard-Driven Seed Creation (existing, untouched)** — creation, editing, and deletion of seeds (content types) via the dashboard UI and `packages/cli/src/commands/seed-create.ts`, which write directly to D1 (`content_{slug}` tables). This interactive path is a solved, working system and is **not** modified by this feature.
- **Manifest-Driven Seed Creation (#381, in scope)** — a second, explicit path: author or edit `beech.schema.ts` using `defineSchema()`/`defineSeed()`/`defineField.*`/`defineGroup()` from `@beechcms/core/schema`, then validate/diff/plan/apply it through the MCP/CLI control plane. This path *does* create and alter seeds and fields in D1 — used for bootstrap, environment portability, backup/restore, and batch reconciliation reviewed as a Git diff. It never runs automatically (no implicit Worker-boot import, no automatic mutation on deploy) and never executes raw SQL from the manifest.
- **Schema Introspection Primitive (shared, new)** — a D1 pragma-based introspection function, generalizing the `PragmaRow`/`FkRow`/`IndexRow` reading already present in `packages/cli/src/lib/schema-diff.ts`. This becomes the single source of truth consumed by drift-checking, manifest export, and type generation alike. `getExpectedColumns(seed)` (`packages/core/src/engine/ddl.ts`) — which derives expected columns from Seed *code* — remains a separate, narrower concern (see Business Rules below).
- **`beech.schema.ts` Manifest (#381)** — a git-versioned, bidirectional desired-state artifact. `beech schema export` produces it deterministically from live D1 (via the shared introspection primitive), for Git review and portability. `beech schema plan`/`apply` consumes it (hand-authored, or started from an export) to create/alter seeds and fields in D1 through explicit, reviewed steps — never implicitly. Both directions round-trip through canonical JSON; no callbacks, closures, or executable code are ever persisted.
- **CLI Schema Tooling (#382)** — `beech schema export` (D1 → `beech.schema.ts`), `beech schema diff` (manifest vs. live D1, either direction: is my snapshot stale, or does my authored manifest disagree with what's deployed?), `beech schema plan/apply` (compute and execute concrete DDL — including seed creation, plus rename/destructive/data-transforming/FTS/relation impact classification — through the MCP/CLI control plane, never direct SQL), and `beech types generate` (D1 introspection → `beech.generated.ts` with `SeedRegistryTypes` + embedded fingerprint).
- **Public API Relation Expansion (#383)** — `include=` query parameter on `apps/api/src/public/*` routes; depth=1, policy-aware, batched; every response carries an `X-Schema-Revision` fingerprint header derived from the same introspection primitive.
- **`@beechcms/client` Fluent Query Builder (#384)** — refactor of `query-builder.ts` into a chained API, generic over `SeedRegistryTypes` from #382, with `.include()` typed only once #383 is stable, and a runtime fingerprint check against every response.
- **Subquery Extension (#385)** — `IN` filters over relations *already declared* via #383's `.include()` contract only. No arbitrary `JOIN`, no client-side SQL AST, no unbounded graph traversal.

**Business rules:**

1. Generated client types (#382) are derived exclusively from the shared D1-introspection primitive — never from `beech.schema.ts` directly — so types can never be more stale than the last introspection.
2. `beech.schema.ts` supports two legitimate, coexisting seed-creation paths — the dashboard UI (interactive, immediate, unchanged by this feature) and manifest plan/apply (declarative, reviewed, explicit) — both converge on D1 as the single runtime authority; neither is a shortcut around explicit apply/review for the manifest path, and neither is deprecated in favor of the other.
3. `beech schema diff` serves both directions: detect that a committed snapshot is stale relative to live D1 (needs re-export), and detect that an authored/edited manifest disagrees with live D1 (needs a plan before apply). Applying a plan is always an explicit CLI/MCP action — never automatic on deploy or at Worker boot.
4. `beech schema plan/apply` must classify rename, destructive, data-transforming, FTS/vector, draft, and relation/junction impacts explicitly in the generated plan before execution — whether the target is a brand-new seed or a structural change to an existing one.
5. Each seed has exactly one owning creation path, tracked by the existing `seeds.source` column (`'code'` | `'runtime'`, `apps/api/migrations/0000_v040_base.sql:296`). A seed with `source = 'code'` must reject dashboard-UI edit attempts — edits to a manifest-owned seed happen only by editing `beech.schema.ts` and re-applying, so `beech schema diff` remains a trustworthy signal instead of chasing drift introduced behind its back.
6. The Public API (`/api/v1/public/*`) is additive-only within a major version; a breaking seed change forces an API version bump, not a silent type regeneration.
7. No second query language is introduced (GROQ/Sanity-style rejected) — the filter-object/fluent-chain compiles directly to the existing parameterized-SQL-backed contract.
8. `@beechcms/client` stays dependency-light; runtime validation (zod-derived) is available only as opt-in strict mode (`.list({ validate: true })`), never the default.
9. The fluent client must compare the `X-Schema-Revision` response fingerprint against its build-time-embedded fingerprint before trusting response shape; a mismatch produces an actionable `BeechProblem`-style error ("client types stale, regenerate with `beech types generate`"), never a silent pass-through.
10. `.include()` ships typed only after #383's `include=` contract is stable — no premature typed relation support against an unstable server contract.
11. #385's subquery support is restricted to `IN` filters over relations already declared through #383 — any broader form (arbitrary `JOIN`, unbounded graph traversal) requires a separate architectural RFC, not silent scope expansion inside this chain.

# 3. Primary Requirements (User Stories)

* AS A BeechCMS core developer I WANT a shared D1 schema-introspection primitive used identically by `schema-diff` and by type generation SO THAT generated client types are always derived from what's actually deployed, never from a manifest file that could be stale.

* AS A BeechCMS core developer I WANT `beech schema export` to read live D1 state and write a git-versioned `beech.schema.ts` snapshot SO THAT schema changes made via the dashboard are visible, reviewable, and diffable in version control.

* AS A BeechCMS core developer I WANT `beech schema diff`/`plan`/`apply` to let me author or edit `beech.schema.ts` and reconcile it against live D1 through an explicit, reviewed step SO THAT I can bootstrap a new environment, restore/replicate a schema, or batch-reconcile changes without hand-writing SQL migrations or waiting on the dashboard UI.

* AS A BeechCMS core developer I WANT a seed's `source` (`'code'` vs `'runtime'`) to gate where it can be edited SO THAT a dashboard edit can never silently invalidate a manifest-owned seed and defeat `beech schema diff`'s drift signal.

* AS A BeechCMS core developer I WANT `beech types generate` to produce a `beech.generated.ts` file with a `SeedRegistryTypes` registry and an embedded schema fingerprint SO THAT `@beechcms/client` consumers get compile-time-accurate types without hand-writing them.

* AS A Public API consumer I WANT every response to carry an `X-Schema-Revision` fingerprint header SO THAT clients can detect schema drift between their build time and the current request.

* AS A `@beechcms/client` consumer I WANT the fluent client to compare the response fingerprint against its build-time-embedded fingerprint SO THAT a stale-types mismatch produces an actionable error instead of a silent shape mismatch.

* AS A `@beechcms/client` consumer I WANT to write typed fluent queries (`.collection().where().include().select().first()`) SO THAT I stop hand-encoding JSON filter objects and get compile-time safety on fields and operators.

* AS A `@beechcms/client` consumer I WANT `.include()` to expand a declared relation server-side (depth=1, policy-aware, batched) SO THAT I can fetch related content in one request without a second query language or client-side joins.

* AS A `@beechcms/client` consumer I WANT an opt-in `.list({ validate: true })` strict mode using zod-derived runtime validation SO THAT I can fail-fast on schema drift when I need that guarantee, without paying the cost by default.

* AS A `@beechcms/client` consumer I WANT subquery filtering restricted to `IN` conditions over relations already declared via `.include()` SO THAT the client gains query power without becoming a client-side SQL or graph-traversal engine.

# 4. Secondary Requirements and Logical Constraints

- **External consumer blind spot**: a consumer installing `@beechcms/client` from npm has no shared CI/pipeline with the monorepo and thus no automatic warning of schema drift — the runtime fingerprint check (rule 8) is the *only* safety net for this population and must not be treated as optional hardening.
- **`#104` (GitOps sprint) overlap resolved**: its partial `schema-diff.ts` work is absorbed as the basis for the shared introspection primitive (rule 1), not duplicated by a separate #382 export pipeline.
- **`defineSeed` groundwork**: the existing `defineSeed` in `packages/core/src/engine/define-seed.ts` is currently an identity passthrough (`return seed`) with no validation. #381 must give it real manifest semantics (validation, round-trip JSON) — it is not starting from zero, but it is not functionally complete today either.
- **Sequencing is hard-blocking, not advisory**: #384 cannot ship typed-complete without #382 (no `SeedRegistryTypes`) and without #383 (no real `.include()`). It may start only in an untyped/escape-hatch form (refactoring `query-builder.ts`'s existing object API into a fluent wrapper) ahead of that.
- **No implicit schema sync at Worker boot**: `beech.schema.ts` is a desired-state artifact; the Worker never imports or executes it at startup — every mutation to D1 happens through an explicit CLI/MCP apply step, dashboard action, or plan/apply run, never as a side effect of deployment.
- **`seeds.source` enforcement is new work**: the column exists but every current write path (`seeds.mcp.ts`, `seed.repository.d1.ts`) hardcodes `'runtime'`. This feature must (a) have manifest-apply write `'code'`, and (b) add the dashboard-edit rejection for `source = 'code'` seeds — neither exists today.
- **Symmetric case flagged, not solved here**: whether manifest plan/apply may target a `source = 'runtime'` (dashboard-created) seed — and under what conditions ownership could transfer from `'runtime'` to `'code'` — is left for the Architect to resolve; this brief only requires that a `'code'` seed rejects dashboard edits, not the reverse.

# 5. Out of Scope (Discarded during sparring)

- **GROQ-style dynamic query language** (Sanity comparison) — rejected: violates the explicit "no second query language" scope, would require a backend interpreter/compiler with larger attack surface than the current filter-object-to-parameterized-SQL compilation, and doesn't solve runtime drift (only relocates where types are generated from).
- **Arbitrary `JOIN` / client-side graph traversal** (#385 in its originally proposed form) — reduced to `IN` filters over relations already declared via #383, or must be raised as a separate architectural RFC before implementation.
- **A second implicit schema authority** — D1/Admin API remains the sole *runtime* authority; the manifest path is an explicit, reviewed alternate *creation/mutation* path, never a competing runtime source of truth (per #381's own stated scope).
- **Arbitrary JS validation callbacks or executable dashboard components persisted in D1** — the manifest stays strictly serializable JSON; custom UI is referenced only via a declarative key resolved from a local dashboard registry.
- **Arbitrary database SQL embedded in the manifest** — all D1 mutation from the manifest path goes through the planner/applier, never raw SQL authored in `beech.schema.ts`.
- **Silent or automatic production schema mutation on deploy** — apply is always an explicit CLI/MCP action, never a deploy side effect.
- **Resolving the symmetric `'runtime'`→`'code'` ownership-transfer question** — deferred to the Architect (see Secondary Requirements); this brief only mandates the `'code'`-seed-rejects-dashboard-edit direction.
- **Forced runtime validation (zod-derived) on every client call by default** — contradicts the dependency-light goal; available only as explicit opt-in strict mode.
- **Rebuilding `schema-diff.ts`'s Seed-vs-D1 comparison from scratch** — it is generalized/repurposed (rule 3), not replaced.
