# ROADMAP — Typed Fluent Query Builder chain (#381 → #385)

The feature brief does not fit one sprint: it requires sequential merges across
`@beechcms/core` → `packages/cli` / `apps/api` → `packages/client`, and each boundary must be
validated on its own before the next one can compile against it.

Detailed Task Details exist ONLY for the sprint currently in planning. Future entries are goals and
dependencies, never interfaces — the graph and the codebase will have moved by the time they run.

| # | Slug | Status |
|---|------|--------|
| 1 | `SchemaManifestDsl` | **PLANNED — detailed plan in `output/SchemaManifestDsl.md`** |
| 2 | `SchemaIntrospectionFingerprint` | pending |
| 3 | `CliSchemaTooling` | pending |
| 4 | `PublicApiRelationExpansion` | pending |
| 5 | `FluentClientQueryBuilder` | pending |
| 6 | `ClientRelationSubqueries` | pending |

---

## 1 — `SchemaManifestDsl` (#381)

**Goal:** give `beech.schema.ts` a real, pure, serializable authoring DSL in `@beechcms/core/schema`,
and make `seeds.source = 'code'` a load-bearing ownership signal instead of a dormant column.

**Deliverables summary:** new `packages/core/src/schema/` module (`defineSchema` / `defineSeed` /
`defineField.*` / `defineGroup`, canonical JSON round-trip, manifest validation), a `./schema` subpath
export on `@beechcms/core`, and a manifest-ownership guard in the `apps/api` seeds slice that refuses
dashboard edits to a `source = 'code'` seed.

**Depends on:** nothing. It is the only sprint in the chain with no upstream.

---

## 2 — `SchemaIntrospectionFingerprint` (#382, part A)

**Goal:** one D1 pragma-based introspection primitive, executor-agnostic (Worker `D1Database` binding
AND the CLI's `queryD1` shell path), plus a deterministic schema fingerprint computed from its output.

**Deliverables summary:** introspection + fingerprint functions in `@beechcms/core`;
`packages/cli/src/lib/schema-diff.ts` refactored onto the primitive instead of reading PRAGMA itself.
The fingerprint's input is the canonical JSON shape frozen in sprint 1.

**Depends on:** sprint 1 — the canonical serializer defines what is fingerprinted; without it the
fingerprint would have to be re-specified later, invalidating every already-published client.

---

## 3 — `CliSchemaTooling` (#382, part B)

**Goal:** `beech schema export | diff | plan | apply` and `beech types generate`, all reading live D1
through the sprint-2 primitive, all mutating only through the existing MCP control plane
(`POST /api/seeds/:slug/mcp-plan` / `mcp-apply`), never raw SQL.

**Deliverables summary:** the four `beech schema` subcommands; `beech types generate` emitting
`SeedRegistryTypes` plus the embedded fingerprint header (today's `beech generate-types` reads
`seeds.definition` and embeds no fingerprint); manifest apply writing `source = 'code'`.

**Depends on:** sprints 1 and 2 — it consumes the manifest DSL and the introspection primitive.

---

## 4 — `PublicApiRelationExpansion` (#383)

**Goal:** `include=` on `/api/v1/public/*` — depth 1, policy-aware, batched — and an
`X-Schema-Revision` response header carrying the sprint-2 fingerprint.

**Deliverables summary:** query-parameter parsing and relation expansion in the public slice; the
fingerprint header emitted on every public response; additive-only within `/api/v1`.

**Depends on:** sprint 2 (fingerprint). Parallelizable with sprint 3 — they touch disjoint boundaries.

---

## 5 — `FluentClientQueryBuilder` (#384)

**Goal:** refactor `packages/client/src/query-builder.ts` into the fluent chain
(`.collection().where().include().select().first()`), generic over `SeedRegistryTypes`, with the
runtime fingerprint check and the opt-in `.list({ validate: true })` strict mode.

**Deliverables summary:** the fluent builder; generated-registry generics replacing the
`Record<string, unknown>` registry in `types.ts`; `X-Schema-Revision` compared against the
build-time fingerprint, mismatch surfacing an actionable `BeechProblem`, never a silent pass-through.

**Depends on:** sprint 3 (no `SeedRegistryTypes` + fingerprint without it) and sprint 4 (no typed
`.include()` against an unstable server contract).

---

## 6 — `ClientRelationSubqueries` (#385, reduced form)

**Goal:** `IN` filters over relations already declared through sprint 4's `include=` contract.

**Deliverables summary:** subquery encoding in the fluent builder and its server-side counterpart,
restricted to declared relations. Arbitrary `JOIN`, client-side SQL AST, and unbounded graph
traversal stay rejected and require a separate architectural RFC.

**Depends on:** sprint 5.

---

## Standing decisions that outlive any single sprint

- **Ownership never transfers implicitly.** `seeds.source` is set at row creation and the
  `ON CONFLICT DO UPDATE` clause in `D1SeedRepository.UPSERT_SEED_SQL` deliberately does not update
  it. Manifest plan/apply against an existing `source = 'runtime'` seed is allowed and leaves it
  dashboard-editable; it does not claim ownership. A `'runtime'` → `'code'` transfer command is out
  of scope for the whole chain and needs its own brief.
- **No implicit schema authority.** The Worker never imports or executes `beech.schema.ts`; no D1
  mutation is a deploy side effect. Every apply is an explicit CLI/MCP action.
- **Types derive from introspection, never from the manifest file.** Established in sprint 2 and
  binding on sprint 3.
