# ROADMAP — Typed Fluent Query Builder chain (#381 → #385)

The feature brief does not fit one sprint: it requires sequential merges across
`@beechcms/core` → `packages/cli` / `apps/api` → `packages/client`, and each boundary must be
validated on its own before the next one can compile against it.

Detailed Task Details exist ONLY for the sprint currently in planning. Future entries are goals and
dependencies, never interfaces — the graph and the codebase will have moved by the time they run.

| # | Slug | Status |
|---|------|--------|
| 1 | `SchemaManifestDsl` | **DONE — merged, archived to `docs/Sprints/SchemaManifestDsl/`** |
| 2 | `SchemaIntrospectionFingerprint` | **DONE — merged, archived to `docs/Sprints/SchemaIntrospectionFingerprint/`** |
| 3a | `CliSchemaExportTypes` | **DONE — merged, archived to `docs/Sprints/CliSchemaExportTypes/`** |
| 3b | `CliSchemaPlanApply` | **IN PLANNING — detailed plan in `stages/01_sprint_planning/output/CliSchemaPlanApply.md`** |
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

**Resolved during sprint-2 planning:** the fingerprint hashes a *contract projection* of the live
seed definitions (aliases, types, required flags, relation targets, resolved public policies),
serialized with sprint 1's frozen canonical serializer — not the whole manifest. Hashing labels,
hints or dashboard config would fire a hard "types are stale" error in external clients over edits
that cannot change a response byte. The serializer itself moves to `core/src/common/canonical-json.ts`
so the Worker can share it without importing the authoring-only `schema/` module; byte format
unchanged. Physical PRAGMA state is introspected but NOT hashed — physical drift is a fault to
report, not a contract to version.

---

## 3 — `CliSchemaTooling` (#382, part B) — SPLIT into 3a + 3b

Entry 3 was one sprint on paper: `beech schema export | diff | plan | apply` + `beech types generate`.
Planning it revealed two boundaries that are validated separately and merge sequentially:

- everything that only **reads** D1 and **writes files** (export, diff, type generation) needs no
  authentication, no HTTP surface and no server change;
- everything that **mutates** D1 must travel the MCP control plane (`POST /api/seeds/:slug/mcp-plan`
  / `mcp-apply`), which means the CLI needs an authenticated HTTP client it does not have today
  (only `@beechcms/mcp` has one, behind an OAuth browser flow), plus a server-side change so
  manifest apply can write `source = 'code'` (`seeds.mcp.ts:275` hardcodes `'runtime'`).

Shipping both at once means the read path waits on an auth decision it does not depend on, and the
write path lands untested against a manifest loader merged in the same PR. Split accordingly.

### 3a — `CliSchemaExportTypes`

**Goal:** the read half. `beech schema export` (live D1 → `beech.schema.ts`), `beech schema diff`
(manifest vs live declared seeds, and declared seeds vs physical tables), and `beech types generate`
(live D1 → `beech.generated.ts` with `SeedRegistryTypes` + the embedded sprint-2 fingerprint).

**Deliverables summary:** manifest module emitter in `@beechcms/core/schema`; an optional
`fingerprint` option on `generateSeedTypes`; manifest loader + manifest/live comparator +
executor-context helper in `packages/cli/src/lib/`; three CLI commands; `bin/cli.mjs` + docs wiring.
Every D1 read goes through sprint 2's `introspectSeedDefinitions` / `introspectTable`. Nothing under
`apps/api/` or `apps/dashboard/` is opened; no D1 write of any kind.

**Depends on:** sprints 1 and 2 — it consumes the manifest DSL, the canonical serializer, the
introspection primitive and the fingerprint.

### 3b — `CliSchemaPlanApply`

**Goal:** the write half. `beech schema plan` and `beech schema apply`, computing and executing
schema change **only** through `POST /api/seeds/:slug/mcp-plan` / `mcp-apply` — never raw SQL, never
a direct D1 write from the CLI — with rename/destructive/data-transforming/FTS/relation impact
surfaced from the server's own classification before anything executes.

**Deliverables summary:** an authenticated CLI→API client; the two commands; and the `apps/api`
seeds-slice change letting a manifest apply record `source = 'code'` on creation, which `mcp-apply`
cannot express today.

**Resolved during sprint-3b planning:** the auth mechanism is **OAuth 2.1 authorization-code + PKCE
under the already-seeded public client `beech-mcp-cli`** (`0000_v040_base.sql:443`, scopes
`schema:read schema:write`, loopback `/callback`), not a dedicated CLI credential and not an admin
JWT: `POST …/mcp-apply` is already allowlisted to `schema:write` in the fail-closed OAuth scope table,
so the server needs no auth work, and a grant stays revocable per-tool from Settings → Connected apps.
To avoid a second implementation of a security-critical flow, `packages/mcp/src/{oauth,token-store}.ts`
and the transport half of its `client.ts` **move** into a new dependency-free package
`@beechcms/api-client` consumed by both the MCP server and the CLI; `packages/mcp/src/client.ts`
becomes a singleton adapter that keeps exporting `request` and `BeechClientError` unchanged, so
`packages/mcp/src/index.ts` is never opened. `apply` is additive-only and never deletes, renames or
retypes: destructive intent is surfaced from the server's own `blockedReasons` and refused.

**Depends on:** 3a — it consumes 3a's manifest loader and comparator, and a plan is only meaningful
against a manifest a user can already export and diff.

---

## 4 — `PublicApiRelationExpansion` (#383)

**Goal:** `include=` on `/api/v1/public/*` — depth 1, policy-aware, batched — and an
`X-Schema-Revision` response header carrying the sprint-2 fingerprint.

**Deliverables summary:** query-parameter parsing and relation expansion in the public slice; the
fingerprint header emitted on every public response; additive-only within `/api/v1`.

**Depends on:** sprint 2 (fingerprint). Parallelizable with 3a and 3b — disjoint boundaries.

---

## 5 — `FluentClientQueryBuilder` (#384)

**Goal:** refactor `packages/client/src/query-builder.ts` into the fluent chain
(`.collection().where().include().select().first()`), generic over `SeedRegistryTypes`, with the
runtime fingerprint check and the opt-in `.list({ validate: true })` strict mode.

**Deliverables summary:** the fluent builder; generated-registry generics replacing the
`Record<string, unknown>` registry in `types.ts`; `X-Schema-Revision` compared against the
build-time fingerprint, mismatch surfacing an actionable `BeechProblem`, never a silent pass-through.

**Depends on:** sprint 3a (no `SeedRegistryTypes` + fingerprint without it) and sprint 4 (no typed
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
  binding on sprints 3a and 3b.
