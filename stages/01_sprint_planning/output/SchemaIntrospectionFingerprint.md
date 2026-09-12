# Sprint Plan — `SchemaIntrospectionFingerprint`

**Chain:** Typed Fluent Query Builder (#381 → #385) — **sprint 2 of 6** (`ROADMAP.md`).
**Issue:** #382, part A.
**Upstream:** sprint 1 `SchemaManifestDsl` — merged, archived to `docs/Sprints/SchemaManifestDsl/`.
**Downstream blocked on this:** sprint 3 `CliSchemaTooling` (consumes the primitive), sprint 4
`PublicApiRelationExpansion` (emits the fingerprint as `X-Schema-Revision`).

---

### Pre-Computation Analysis

Produced with the graphify CLI under the constraints of `_config/tooling_graphify.md` (no
`GRAPH_REPORT.md` read, no invented flags, `query` not needed — every question here was answerable
with `explain` / `path` / `affected`).

#### a) God Nodes identified via the CLI

| Node | Degree | Community | Relevance to this sprint |
|------|--------|-----------|--------------------------|
| `engine/types.ts` (`packages/core/src/engine/types.ts`) | **73** | `engine/types.ts` | Owns `Seed` / `Branch`. Every new type in this sprint reads it and **adds nothing to it** — a field added here fans out to 73 neighbours. |
| `ddl.ts` (`packages/core/src/engine/ddl.ts`) | **45** | `engine/types.ts` | Owns `getExpectedColumns` / `SchemaColumn` — the *code-derived* expectation side of the diff. It stays untouched; this sprint builds the *database-derived* side next to it. |
| `wrangler.ts` (`packages/cli/src/lib/wrangler.ts`) | **17** | `wrangler.ts` | Owns `queryD1` — the CLI's only shell path to D1. It is the single node the CLI-side executor adapter wraps. |
| `manifest.types.ts` (`packages/core/src/schema/manifest.types.ts`) | **17** | `manifest.types.ts` | Sprint-1 hub of the authoring module. Read-only for this sprint. |
| `generateTypes()` (`packages/cli/src/commands/generate-types.ts:33`) | 7 | `wrangler.ts` | Today reads `seeds.definition` with a raw `queryD1` call. It is **not** refactored here (sprint 3 rewrites it); the primitive it will call is what this sprint ships. |

#### b) Architectural boundaries affected

| Boundary | Touched? | What lands there |
|----------|----------|------------------|
| `@beechcms/core` — `src/common/` | **yes (new file + move)** | `canonical-json.ts`: the deterministic serializer physically moved out of `schema/canonical.ts`, byte format frozen and unchanged. |
| `@beechcms/core` — `src/engine/` | **yes (2 new files)** | `introspection.ts` (executor-agnostic live-D1 reads) and `schema-fingerprint.ts` (contract projection + SHA-256). Worker-safe: zero Node imports, zero Cloudflare imports. |
| `@beechcms/core` — `src/schema/` | **yes (1 file edited)** | `canonical.ts` keeps its exported surface (`toCanonicalJson`, `fromCanonicalJson`, `ManifestSerializationError`) and delegates the serializer. No public API change. |
| `@beechcms/core` — `src/index.ts` | **yes (2 export lines)** | The new engine modules are exported from the ROOT entry (Worker-importable), never from `./schema` (authoring-only subpath). |
| `packages/cli` — `src/lib/` | **yes** | `d1-executor.ts` (new adapter over `queryD1`) and `schema-diff.ts` (refactored onto the primitive; its `SeedDiff` output shape is unchanged). |
| `apps/api` | **NO** | The Worker-side executor adapter and the `X-Schema-Revision` header are sprint 4. Nothing in `apps/api/src` is opened this sprint. |
| `apps/dashboard` | **NO** | The dashboard has no schema-introspection concern in this chain. |
| `apps/api/migrations` | **NO** | No DDL, no new table, no new column. The `seeds` table (`0000_v040_base.sql:291-302`) already carries everything read here. |

#### c) `graphify affected` impact analysis (breaking-change proof)

```
$ graphify affected "queryD1" --depth 2
- generateTypes()        [calls]        packages/cli/src/commands/generate-types.ts:L57
- getExistingTables()    [calls]        packages/cli/src/commands/init.ts:L395
- diffSeed()             [calls]        packages/cli/src/lib/schema-diff.ts:L82
- generate-types.ts      [imports]      packages/cli/src/commands/generate-types.ts:L9
- init.ts                [imports]      packages/cli/src/commands/init.ts:L9
- lib/schema-diff.ts     [imports]      packages/cli/src/lib/schema-diff.ts:L8
- generate-types.test.ts [imports]      packages/cli/src/test/generate-types.test.ts:L9
- cli/src/index.ts       [re_exports]   packages/cli/src/index.ts:L20
- init()                 [calls]        packages/cli/src/commands/init.ts:L539
- dbMigrate()            [imports_from] packages/cli/src/commands/db-migrate.ts:L75
- dbReset()              [imports_from] packages/cli/src/commands/db-reset.ts:L48
- onboard.ts             [imports_from] packages/cli/src/commands/onboard.ts:L6
- db-migrate.ts          [dynamic_import]
- db-reset.ts            [dynamic_import]
- migration-writer.ts    [imports_from] packages/cli/src/lib/migration-writer.ts:L12
```

Reading: `queryD1` is a hub, so it is **wrapped, not changed**. The adapter added in
`packages/cli/src/lib/d1-executor.ts` calls it; its signature, its local-SQLite fast path and its
wrangler fallback all stay byte-identical, so `init`, `dbMigrate`, `dbReset`, `onboard` and
`generateTypes` are provably unaffected.

```
$ graphify affected "getExpectedColumns" --depth 2
- ddl.test.ts [imports] packages/core/src/engine/ddl.test.ts:L4
```

Reading: `getExpectedColumns` is consumed at depth 1 only by its own test and (through the package
boundary, which the AST graph does not traverse) by `lib/schema-diff.ts:78`. The sprint keeps
calling it unchanged — the *expected* side of the diff is code-derived and stays that way;
only the *actual* side moves behind the primitive.

```
$ graphify path "createBeechApp" "queryD1"
No directed path found between 'createBeechApp' and 'queryD1'.
```

Reading: the Worker application graph has **no** reachability into the CLI's shell executor. That
separation is the reason the primitive must be executor-agnostic rather than importing `queryD1` —
and it must stay true after this sprint (acceptance criterion in §6).

```
$ graphify explain "toCanonicalJson"
Degree: 5
  <-- manifest-validation.ts [imports]   packages/core/src/schema/manifest-validation.ts:L13
  <-- canonical.test.ts      [imports]   packages/core/src/schema/canonical.test.ts:L5
  <-- validateManifest()     [calls]     packages/core/src/schema/manifest-validation.ts:L38
  --> canonicalize()         [calls]     packages/core/src/schema/canonical.ts:L80
```

Reading: exactly two consumers. The serializer can be moved under `common/` with a re-export in
place, and both consumers keep compiling untouched (`ManifestSerializationError` is re-exported as
the *same class object*, so the `instanceof` check at `manifest-validation.ts:42` still holds).

---

### VETO Audit

Evaluated against `_config/ponytail_arch.md`.

**1. Botanical Invariant — no D1 access bypasses `@beechcms/core`.**
The primitive lives *inside* `@beechcms/core` and never opens a connection itself: it receives a
`SchemaQueryExecutor` and issues read-only `PRAGMA` / `SELECT` statements through it. The CLI keeps
its existing single shell path (`queryD1`); the Worker will keep its D1 binding (sprint 4). No new
connection mechanism, no second SQL entry point, no ORM. **Reads only** — the primitive issues zero
DDL and zero writes, so the engine's mutation path (`planCreateSeed` / `seed-ddl.ts`) remains the
one and only way D1 schema changes.
*Hardcoded field names:* the only literal column names used are the physical system columns already
owned by `ddl.ts` (`SYSTEM_COLUMNS`) and the structural `seeds` table columns (`slug`,
`definition`, `status`). Content fields are never named — they arrive from PRAGMA output and are
addressed by Branch ID / alias exactly as `getExpectedColumns` already does. ✅

**2. VSA — zero cross-feature imports.**
The sprint opens no file under `apps/api/src/features/**` or `apps/dashboard/src/features/**`, so
no cross-slice import can be introduced. The shared logic (introspection, fingerprint,
canonicalization) goes to `@beechcms/core`, which is exactly what rule 3 mandates for logic two
consumers need. `graphify path "createBeechApp" "queryD1"` returning no path is the audit evidence
that the Worker tier does not reach into the CLI tier; the executor interface exists specifically
to keep it that way. ✅

**3. Cloudflare purity.**
`crypto.subtle.digest('SHA-256', …)` is Web Crypto — available in Workers and in Node ≥ 18 without
a polyfill, and already used in this package (`packages/core/src/webhook-crypto.ts:13,25`). No new
dependency is added to `@beechcms/core` (its `dependencies` block is untouched). No background job,
no stateful process, no non-deterministic schema change. ✅

**4. YAGNI adjustments made during this audit (plan changed as a result):**

- **REJECTED — a second canonical serializer.** The first draft gave the fingerprint its own
  stringifier. Duplicating a frozen byte format is exactly how two "canonical" forms drift apart.
  The plan now *moves* the sprint-1 serializer to `common/canonical-json.ts` and has both callers
  share it. Cost: one file move + one re-export line.
- **REJECTED — hashing the raw manifest/seed JSON.** The roadmap froze "the canonical JSON shape"
  as the fingerprint input, but hashing the *whole* seed definition makes the fingerprint flip on a
  UI label edit, a dashboard icon change or a hint typo. Under rule 9 of the brief, that would hand
  every external consumer a hard `BeechProblem` for a change that cannot alter a single response
  byte — a false-positive generator, and the fastest way to get the drift check disabled in the
  field. The plan therefore hashes a **contract projection**: the subset of `Seed` that an API
  response shape actually depends on, serialized with the frozen sprint-1 serializer and versioned
  by `SCHEMA_FINGERPRINT_VERSION`. Same serializer, reduced input, explicit version byte.
- **REJECTED — fingerprinting the physical PRAGMA output.** Physical column ORDER, index names and
  auto-index rows legitimately differ between a freshly-migrated environment and one grown by
  `ALTER TABLE ADD COLUMN`, while the API contract is identical. Physical introspection stays the
  *verification* layer (it feeds `diffSeed`, and `beech schema export`/`plan` in sprint 3); it is
  not hashed. Physical drift is a fault to report, not a contract to version.
- **REJECTED — `PRAGMA index_info` expansion.** The only consumer (`diffSeed`) checks index
  *presence by name*. Per-index column lists are not read by anyone this sprint. Not built.
- **REJECTED — a Worker-side executor adapter in `apps/api`.** Nothing in the Worker consumes the
  primitive until sprint 4 emits the header. Building the adapter now means shipping dead code in
  the hot path. It is specified as sprint-4 work in §7 instead.

**Verdict: APPROVED.** Minimal blueprint: 3 new files in `@beechcms/core`, 1 new + 1 refactored
file in `packages/cli`, 2 edited files (`schema/canonical.ts`, `core/src/index.ts`), 0 files in
`apps/api`, 0 files in `apps/dashboard`, 0 migrations.

HANDOFF -> caveman_coder.

---

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Sprint 1 froze *how a schema is written down* (the manifest DSL and its canonical JSON). This
sprint freezes *how a schema is read back out of D1, and how that state is named*. Every remaining
sprint in the chain consumes one of the two artifacts produced here:

- sprint 3 (`CliSchemaTooling`) builds `beech schema export | diff | plan | apply` on the
  introspection primitive, and `beech types generate` embeds the fingerprint header;
- sprint 4 (`PublicApiRelationExpansion`) emits the same fingerprint as `X-Schema-Revision` on
  every public response;
- sprint 5 (`FluentClientQueryBuilder`) compares the two and turns a mismatch into an actionable
  `BeechProblem`.

If the fingerprint were specified later, it would be specified *twice* — once in the CLI that
generates types and once in the Worker that answers requests — and the two definitions would be
free to disagree. A drift detector whose two ends disagree is worse than no drift detector: it
either fires constantly (and gets muted) or never fires (and lies). So the algorithm, its input
projection, and its version prefix must land once, in `@beechcms/core`, before either consumer
exists.

**Botanical Engine adherence.** The primitive reads; it never writes. `@beechcms/core` remains the
only place that knows how BeechCMS state is shaped in D1: `ddl.ts` owns the *code → expected
columns* direction (`getExpectedColumns`), and `introspection.ts` now owns the *database → actual
state* direction. Both live in the same package, behind the same `Seed`/`Branch` vocabulary, so a
caller can never assemble a schema opinion from raw SQL of its own.

**VSA adherence.** The logic has two consumers in two different tiers (the CLI process and, from
sprint 4, the Worker). Rule 3 of `ponytail_arch.md` says that logic belongs in `@beechcms/core`,
reached through an injected interface rather than a shared concrete client — which is what
`SchemaQueryExecutor` is. The CLI adapter is the CLI's own; the Worker adapter will be the
Worker's own; neither package imports the other. `graphify path "createBeechApp" "queryD1"` must
keep returning no path after this sprint.

**Why the move of the canonical serializer is part of *this* sprint and not a later cleanup.**
`schema/canonical.ts` documents itself as authoring-only and is deliberately absent from
`src/index.ts`, because the Worker must never import the authoring DSL. The fingerprint must run
inside the Worker. Leaving the serializer where it is would force either (a) a Worker import of the
authoring module, breaking the boundary sprint 1 established, or (b) a duplicate serializer,
breaking the frozen byte format. The move resolves both, and it is cheapest now — before sprint 3
and sprint 4 add callers.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Sprint 1 surface (`packages/core/src/schema/`, shipped, ~285 LOC + tests)**

| File | Exports | Status for this sprint |
|------|---------|------------------------|
| `manifest.types.ts` | `MANIFEST_VERSION = 1`, `ManifestBranch`, `ManifestSeed`, `FieldGroup`, `BeechSchemaManifest` | read-only |
| `define.ts` | `defineSchema`, `defineSeed`, `defineField.*`, `defineGroup` | untouched |
| `canonical.ts` | `toCanonicalJson`, `fromCanonicalJson`, `ManifestSerializationError` | **edited** — body delegates, exports unchanged |
| `manifest-seeds.ts` | `manifestToSeeds`, `seedsToManifest` | untouched |
| `manifest-validation.ts` | `validateManifest` | untouched (depends on `ManifestSerializationError` identity at L42) |
| `index.ts` | `export *` of the five above | untouched |

`packages/core/package.json` already publishes the `./schema` subpath
(`"./schema": { "import": "./dist/schema/index.js", "types": "./dist/schema/index.d.ts" }`).
The root `.` entry (`src/index.ts`) is the Worker-facing one; the new engine modules go there.

**Canonical serializer, as frozen in sprint 1** (`schema/canonical.ts:48-85`): object keys sorted
lexicographically, `undefined` properties dropped, array order preserved (branch order is physical
column order), `JSON.stringify(value, null, 2)` plus a trailing newline. Non-serializable values
(`function`, `symbol`, `bigint`, non-finite number, `Date`/`Map`/`Set`/`RegExp`/class instance)
throw `ManifestSerializationError` carrying the dotted `path` and the `found` kind. The module
header calls the format "a compatibility surface … Treat it as frozen." This sprint honours that:
the bytes do not change, only the file the function lives in.

**Engine vocabulary (`packages/core/src/engine/`, god-node tier)**

- `types.ts:76-188` — `Branch`: `id` (`br_XX`, survives alias renames), `alias` (the SQL column
  name), `label`, `hint`, `type`, `format`, `multiple`, `options`, `requiredOnCreate`,
  `requiredOnUpdate`, `policies`, `numberOptions`, `fileOptions`, `targetSeed`, `onDelete`,
  `fields` (repeater sub-branches), `minItems`, `maxItems`.
- `types.ts:219-256` — `Seed`: `slug` (table is `content_{slug}`), `label`, `labelPlural`,
  `allowPublicRead` / `allowPublicPost` / `allowPublicEdit`, `allowDrafts`, `displayNameAlias`,
  `retentionDays`, `branches`, `dashboard`, `layout` (server-populated presentation state).
- `ddl.ts:367-414` — `SchemaColumn { name, sqlType: 'TEXT'|'REAL'|'INTEGER', notNull, isPk }` and
  `getExpectedColumns(seed)`: `id, slug, status` first, then one column per branch (skipping
  `relation` + `multiple: true`, which live in a junction table), plus `{alias}_bidx` where
  `hasBlindIndex(branch)`, then `created_at, updated_at`.
- `ddl.ts:37-48` — `BRANCH_TYPE_SQL`: text/json/richtext/file/tags/relation/repeater → `TEXT`,
  number → `REAL`, boolean/date → `INTEGER`.
- `ddl.ts:425-427` — `junctionTableName(slug, alias)` = `rel_{slug}_{alias}`.
- `policies.ts:102` — `resolvePolicies(branch): Required<NonNullable<Branch['policies']>>`, the
  single place field defaults (`visibility: 'full'`, `public: true`, …) are materialized.

**CLI D1 access (`packages/cli/src/lib/wrangler.ts`, god node, degree 17)**

- `WranglerOptions { db: string; local: boolean; configPath: string | null }`.
- `queryD1<T extends D1Row>(sql, options): T[]` — **synchronous**. In `local` mode it opens the
  miniflare SQLite file directly via `node:sqlite` `DatabaseSync` and falls back to
  `npx wrangler d1 execute --file … --json` (parsing `results` out of the first result object).
  It **throws** when wrangler exits non-zero or the JSON cannot be parsed.
- `findWranglerConfig()`, `resolveDbName()`, `getLocalD1SqlitePath()`, `executeD1File()`,
  `sqlQuote()` — untouched by this sprint.

**CLI diff (`packages/cli/src/lib/schema-diff.ts`, 175 LOC)**

- Declares its own PRAGMA row shapes locally: `PragmaRow` (L10-15), `FkRow` (L17-26),
  `IndexRow` (L28-32) — this duplication is exactly what the brief's rule 1 says must become one
  shared primitive.
- `diffSeed(seed, options)` (L76) issues three PRAGMAs by string interpolation
  (`PRAGMA table_info(${tableName})`, `foreign_key_list`, `index_list`) and compares against
  `getExpectedColumns(seed)`.
- Emits `SeedDiff { slug, tableExists, columns: ColumnDiff[] }` with
  `status: 'ok' | 'missing' | 'extra' | 'type_mismatch' | 'fk_missing' | 'fk_mismatch' | 'index_missing'`.
- Relation checks: expected FK target `content_{targetSeed}`, expected `ON DELETE` defaulting to
  `SET NULL`, expected index name `idx_{slug}_{alias}`.
- **Consumers:** `migration-writer.ts:12` imports the `SeedDiff` *type* only (`DESTRUCTIVE` set at
  L15, `writeMigration(diffs)` at L48). `graphify affected` shows **no runtime caller** of
  `diffSeed` itself — `commands/schema-diff.ts` has been a deprecation notice since v0.4.0
  (22 LOC, prints "beech schema:diff is deprecated" and returns). The refactor is therefore free of
  behavioural blast radius, and the sprint-3 `beech schema diff` command is what will call it for
  real.

**Type generation today (`packages/cli/src/commands/generate-types.ts`)**

`generateTypes()` runs `SELECT slug, definition FROM seeds WHERE status = 'active' ORDER BY slug ASC;`
through `queryD1`, `JSON.parse`s each `definition` into a `Seed`, and hands the array to
`generateSeedTypes(seeds)` from `@beechcms/core`. It embeds **no fingerprint** and exposes **no
`SeedRegistryTypes` registry**. This sprint does not change it; it ships the primitive that sprint 3
will rewrite it onto (roadmap entry 3).

**Structural tables (`apps/api/migrations/0000_v040_base.sql:291-302`)**

```sql
CREATE TABLE IF NOT EXISTS seeds (
    slug        TEXT    NOT NULL PRIMARY KEY,
    definition  TEXT    NOT NULL,
    status      TEXT    NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'deleted')),
    source      TEXT    NOT NULL DEFAULT 'runtime'
                        CHECK (source IN ('code', 'runtime')),
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_seeds_status ON seeds(status);
```

`source` (`'code' | 'runtime'`) landed in sprint 1 as a load-bearing ownership signal. This sprint
reads neither `source` nor writes any row: the fingerprint covers *what the schema is*, not *who
owns it*. No migration is authored.

**Test idiom in play.** `@beechcms/core` colocates unit tests beside the source
(`src/**/*.test.ts`, per `packages/core/vitest.config.ts`); `packages/cli` keeps them under
`src/test/`. Both are the unit tier under `_config/testing_conventions.md` §0 — no D1, no network,
no filesystem; the executor is the faked I/O boundary (Rule 0.2, Rule 3.10).

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

**`@beechcms/core` — new**

1. `packages/core/src/common/canonical-json.ts` — `canonicalStringify()` +
   `CanonicalSerializationError`, moved verbatim from `schema/canonical.ts`. Byte format unchanged.
2. `packages/core/src/engine/introspection.ts` — `SchemaQueryExecutor` interface, live-D1 read
   functions, `LiveTable` / `LiveColumn` / `LiveForeignKey` / `LiveIndex` / `LiveSchema` types,
   `IntrospectionError`.
3. `packages/core/src/engine/schema-fingerprint.ts` — `SCHEMA_FINGERPRINT_VERSION`,
   `projectSchemaContract()`, `computeSchemaFingerprint()`, `SchemaContract` types.

**`@beechcms/core` — modified**

4. `packages/core/src/schema/canonical.ts` — delegates to (1); re-exports
   `CanonicalSerializationError as ManifestSerializationError`. **Public surface unchanged.**
5. `packages/core/src/index.ts` — two `export *` lines for (2) and (3). `./schema` subpath is NOT
   touched; the new modules must be reachable from the Worker-facing root entry.

**`@beechcms/core` — tests (unit tier, colocated)**

6. `packages/core/src/engine/introspection.test.ts` — new.
7. `packages/core/src/engine/schema-fingerprint.test.ts` — new.
8. `packages/core/src/common/canonical-json.test.ts` — new (format-freeze guard).
9. `packages/core/src/schema/canonical.test.ts` — **unchanged**; it must keep passing untouched.
   That is the proof the move was non-breaking. Editing it is a blocking finding
   (`testing_conventions.md` §7.10).

**`packages/cli` — new**

10. `packages/cli/src/lib/d1-executor.ts` — `createWranglerExecutor(options)` adapter over
    `queryD1`.

**`packages/cli` — modified**

11. `packages/cli/src/lib/schema-diff.ts` — `diffSeed` refactored onto `introspectTable`; local
    `PragmaRow` / `FkRow` / `IndexRow` deleted. `ColumnDiff` / `SeedDiff` / `isSeedClean` /
    `renderSeedDiff` keep their exact shapes (`migration-writer.ts` depends on them).

**`packages/cli` — tests**

12. `packages/cli/src/test/diff-seed.test.ts` — new (unit tier, fake executor).

**Explicitly NOT in this sprint:** no new `beech` subcommand, no change to `generate-types.ts`, no
file under `apps/api/` or `apps/dashboard/`, no migration, no new package dependency.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

## TASK 1 — `packages/core/src/common/canonical-json.ts` (new)

Move the serializer out of the authoring module so the Worker can reach it. **Do not "improve" the
algorithm**: `describe()`, `canonicalize()` and the output shape are copied verbatim from
`schema/canonical.ts:14-85`. Only the error class name and the exported entry point change.

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module common/canonical-json
 * Deterministic JSON serialization, shared by two callers that must never disagree:
 * the manifest writer (`schema/canonical.ts`, authoring-side) and the schema fingerprint
 * (`engine/schema-fingerprint.ts`, runtime-side).
 *
 * Moved here in sprint 2 because the fingerprint runs inside the Worker and `schema/` is the one
 * module the Worker must never import. The BYTES ARE FROZEN — sprint 1 declared this format a
 * compatibility surface, and a published client's fingerprint is only comparable as long as it
 * stays byte-stable. Changing key ordering, indentation or the trailing newline invalidates every
 * already-published client and requires a `SCHEMA_FINGERPRINT_VERSION` bump.
 */

/** Thrown when a value cannot survive a JSON round-trip. */
export class CanonicalSerializationError extends Error {
  constructor(
    /** Dotted path to the offending value, e.g. `seeds[0].branches[2].validate`. */
    readonly path: string,
    /** What was found there, e.g. `function`. */
    readonly found: string,
  ) {
    super(
      `Manifest value at '${path}' is a ${found}, which cannot be persisted. ` +
      `A manifest holds serializable JSON only — no callbacks, class instances, Date, Map, Set or RegExp.`,
    )
    this.name = 'CanonicalSerializationError'
  }
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

function describe(value: unknown): string | null {
  if (value === null) return null
  const type = typeof value
  if (type === 'function') return 'function'
  if (type === 'symbol') return 'symbol'
  if (type === 'bigint') return 'bigint'
  if (type === 'undefined') return 'undefined'
  if (type === 'number' && !Number.isFinite(value as number)) return 'non-finite number'
  if (type !== 'object') return null
  if (Array.isArray(value)) return null
  const proto = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) return (value as object).constructor?.name ?? 'class instance'
  return null
}

/**
 * Canonicalizes one value: object keys sorted lexicographically, `undefined` properties dropped,
 * array ORDER preserved (branch order is the physical column order — it is data, not formatting).
 */
function canonicalize(value: unknown, path: string): Json {
  const offence = describe(value)
  if (offence) throw new CanonicalSerializationError(path, offence)

  if (value === null) return null
  if (Array.isArray(value)) {
    return value.map((item, index) => {
      if (item === undefined) throw new CanonicalSerializationError(`${path}[${index}]`, 'undefined')
      return canonicalize(item, `${path}[${index}]`)
    })
  }
  if (typeof value === 'object') {
    const out: { [key: string]: Json } = {}
    for (const key of Object.keys(value as object).sort()) {
      const child = (value as Record<string, unknown>)[key]
      if (child === undefined) continue
      out[key] = canonicalize(child, path ? `${path}.${key}` : key)
    }
    return out
  }
  return value as Json
}

/**
 * Serializes any value to its canonical form: keys sorted, two-space indentation, trailing newline.
 * Stable across key insertion order and across authoring order.
 */
export function canonicalStringify(value: unknown): string {
  return `${JSON.stringify(canonicalize(value, ''), null, 2)}\n`
}
```

## TASK 2 — `packages/core/src/schema/canonical.ts` (rewrite body, keep surface)

The whole file becomes:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module schema/canonical
 * Deterministic serialization of a manifest. The bytes produced here are the input the schema
 * fingerprint hashes, so this format is a compatibility surface: changing it invalidates every
 * already-published client. Treat it as frozen.
 *
 * The serializer itself moved to `common/canonical-json.ts` in sprint 2 so the Worker-side
 * fingerprint can share it without importing this authoring-only module.
 */

import { canonicalStringify } from '../common/canonical-json.js'
import { MANIFEST_VERSION } from './manifest.types.js'
import type { BeechSchemaManifest } from './manifest.types.js'

/**
 * Thrown when a manifest carries a value that cannot survive a JSON round-trip.
 * Re-exported under its historical name: it is the SAME class object as
 * `CanonicalSerializationError`, so existing `instanceof` checks keep working.
 */
export { CanonicalSerializationError as ManifestSerializationError } from '../common/canonical-json.js'

/**
 * Serializes a manifest to its canonical form: seeds sorted by slug, keys sorted, two-space
 * indentation, trailing newline. Stable across authoring order and across key insertion order.
 */
export function toCanonicalJson(manifest: BeechSchemaManifest): string {
  const seeds = [...manifest.seeds].sort((a, b) => a.slug.localeCompare(b.slug))
  return canonicalStringify({ version: manifest.version, seeds })
}

/** Parses canonical JSON back into a manifest, refusing an unknown format version. */
export function fromCanonicalJson(json: string): BeechSchemaManifest {
  const parsed = JSON.parse(json) as Partial<BeechSchemaManifest>
  if (parsed.version !== MANIFEST_VERSION) {
    throw new Error(
      `Unsupported manifest version ${String(parsed.version)}; this build understands ${MANIFEST_VERSION}.`,
    )
  }
  if (!Array.isArray(parsed.seeds)) throw new Error('Manifest is missing a `seeds` array.')
  return { version: MANIFEST_VERSION, seeds: parsed.seeds }
}
```

`manifest-validation.ts` is **not edited**: its `import { toCanonicalJson, ManifestSerializationError } from './canonical.js'`
and its `error instanceof ManifestSerializationError` check both resolve to the re-exported class.
If `packages/core/src/schema/canonical.test.ts` needs a single character changed, the move was done
wrong — revert and redo.

## TASK 3 — `packages/core/src/engine/introspection.ts` (new)

The executor-agnostic live-D1 reader. Two facets, one module:

- **declared state** — the `seeds` table rows (what the engine believes the schema is; this is what
  the fingerprint hashes);
- **physical state** — PRAGMA output (what SQLite actually has; this is what `diffSeed`, and
  sprint 3's `export`/`plan`, compare against).

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module engine/introspection
 * Reads live schema state out of D1 through an INJECTED executor.
 *
 * Executor-agnostic on purpose: the CLI reaches D1 through a synchronous shell/SQLite path
 * (`queryD1`) and the Worker through its `D1Database` binding, and neither tier may import the
 * other (`graphify path "createBeechApp" "queryD1"` must keep returning no path). `@beechcms/core`
 * owns the STATEMENTS and the SHAPES; the caller owns the connection.
 *
 * Read-only by contract: every statement here is a `PRAGMA` or a `SELECT`. Schema mutation stays
 * the exclusive business of the Botanical Engine's DDL path (`engine/seed-ddl.ts`).
 */

import type { Seed } from './types.js'

/**
 * The one capability the introspection primitive needs from a database connection.
 *
 * Implementations MUST: execute the statement as-is, return one object per row with column names
 * as keys, and reject/throw on failure. They MUST NOT cache, batch, rewrite or retry — a stale
 * answer here becomes a wrong fingerprint, which becomes a false "your types are stale" error in
 * someone else's production client.
 */
export interface SchemaQueryExecutor {
  all<T extends Record<string, unknown>>(sql: string): Promise<T[]>
}

/** Thrown when live state cannot be read or cannot be trusted. */
export class IntrospectionError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'IntrospectionError'
  }
}

/** One physical column, as SQLite reports it. */
export interface LiveColumn {
  name: string
  /** Declared storage type, upper-cased (`TEXT` | `INTEGER` | `REAL` | …). */
  sqlType: string
  notNull: boolean
  isPk: boolean
  /** Declared DEFAULT expression verbatim, or null. */
  defaultValue: string | null
}

/** One foreign-key constraint on a physical table. */
export interface LiveForeignKey {
  /** Local column carrying the reference. */
  column: string
  /** Referenced table, e.g. `content_team`. */
  targetTable: string
  /** Referenced column, e.g. `id`. */
  targetColumn: string
  /** Upper-cased, e.g. `SET NULL`. */
  onDelete: string
  /** Upper-cased, e.g. `NO ACTION`. */
  onUpdate: string
}

/** One index on a physical table. SQLite's implicit `sqlite_autoindex_*` entries are excluded. */
export interface LiveIndex {
  name: string
  unique: boolean
}

/** The physical state of one table. `exists: false` means SQLite reports no such table. */
export interface LiveTable {
  name: string
  exists: boolean
  /** Physical order, as returned by `PRAGMA table_info` (cid order). */
  columns: LiveColumn[]
  /** Sorted by `column`, then `targetTable`, for deterministic output. */
  foreignKeys: LiveForeignKey[]
  /** Sorted by `name`. */
  indexes: LiveIndex[]
}

/** The physical state of a set of tables. `tables` is sorted by name. */
export interface LiveSchema {
  tables: LiveTable[]
}

// ── Raw PRAGMA row shapes (module-private: nothing outside speaks PRAGMA) ───────────────

interface TableInfoRow extends Record<string, unknown> {
  cid: number
  name: string
  type: string
  notnull: number
  dflt_value: string | null
  pk: number
}

interface ForeignKeyListRow extends Record<string, unknown> {
  id: number
  seq: number
  table: string
  from: string
  to: string | null
  on_update: string
  on_delete: string
}

interface IndexListRow extends Record<string, unknown> {
  seq: number
  name: string
  unique: number
}

interface MasterRow extends Record<string, unknown> {
  name: string
}

interface SeedRow extends Record<string, unknown> {
  slug: string
  definition: string
}

/**
 * SQLite identifiers cannot be bound as parameters, so every table name reaching a PRAGMA is
 * interpolated — and therefore must be proven safe first. Table names in this system are always
 * `content_{slug}` / `rel_{slug}_{alias}` / a structural table, all of which match this pattern.
 */
const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

/** Returns `name` unchanged when it is a safe SQL identifier; throws otherwise. */
export function assertSafeIdentifier(name: string): string {
  if (!SAFE_IDENTIFIER.test(name)) {
    throw new IntrospectionError(
      `Refusing to introspect '${name}': not a plain SQL identifier. Table names are never user input in BeechCMS.`,
    )
  }
  return name
}

/**
 * Physical state of one table. A table SQLite does not know returns `{ exists: false }` with empty
 * lists rather than throwing: "missing" is a legitimate diff outcome, not an error.
 *
 * `PRAGMA table_info` answers an unknown table with zero rows on the SQLite path and raises on some
 * wrangler paths, so both outcomes collapse to the same result.
 */
export async function introspectTable(
  executor: SchemaQueryExecutor,
  table: string,
): Promise<LiveTable> {
  const name = assertSafeIdentifier(table)
  const empty: LiveTable = { name, exists: false, columns: [], foreignKeys: [], indexes: [] }

  let info: TableInfoRow[]
  try {
    info = await executor.all<TableInfoRow>(`PRAGMA table_info(${name})`)
  } catch {
    return empty
  }
  if (info.length === 0) return empty

  const columns: LiveColumn[] = info.map(row => ({
    name: row.name,
    sqlType: String(row.type ?? '').toUpperCase(),
    notNull: row.notnull === 1,
    isPk: row.pk > 0,
    defaultValue: row.dflt_value ?? null,
  }))

  let fkRows: ForeignKeyListRow[] = []
  let indexRows: IndexListRow[] = []
  try {
    fkRows = await executor.all<ForeignKeyListRow>(`PRAGMA foreign_key_list(${name})`)
    indexRows = await executor.all<IndexListRow>(`PRAGMA index_list(${name})`)
  } catch {
    // A table with neither FKs nor indexes answers with zero rows on some drivers and raises on
    // others; an unreadable constraint list must not hide the column list we already have.
  }

  const foreignKeys: LiveForeignKey[] = fkRows
    .map(row => ({
      column: row.from,
      targetTable: row.table,
      targetColumn: row.to ?? 'id',
      onDelete: String(row.on_delete ?? '').toUpperCase(),
      onUpdate: String(row.on_update ?? '').toUpperCase(),
    }))
    .sort((a, b) => a.column.localeCompare(b.column) || a.targetTable.localeCompare(b.targetTable))

  const indexes: LiveIndex[] = indexRows
    // Implicit indexes SQLite mints for UNIQUE/PK are not schema an author declared, and their
    // names are not stable across environments.
    .filter(row => !row.name.startsWith('sqlite_autoindex_'))
    .map(row => ({ name: row.name, unique: row.unique === 1 }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return { name, exists: true, columns, foreignKeys, indexes }
}

/**
 * Names of the physical tables SQLite holds, optionally restricted to a `LIKE` prefix
 * (e.g. `content_`). Sorted, `sqlite_*` internals excluded.
 */
export async function listTables(
  executor: SchemaQueryExecutor,
  prefix?: string,
): Promise<string[]> {
  if (prefix !== undefined) assertSafeIdentifier(`${prefix}x`)
  const filter = prefix ? ` AND name LIKE '${prefix}%'` : ''
  const rows = await executor.all<MasterRow>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'${filter} ORDER BY name ASC`,
  )
  return rows.map(row => row.name)
}

/**
 * Physical state of several tables at once. With no explicit list, every `content_*` table is
 * introspected — the set a schema export or a drift check cares about.
 */
export async function introspectSchema(
  executor: SchemaQueryExecutor,
  tables?: string[],
): Promise<LiveSchema> {
  const names = tables ?? await listTables(executor, 'content_')
  const sorted = [...names].sort((a, b) => a.localeCompare(b))
  const result: LiveTable[] = []
  // Sequential on purpose: the CLI executor is a synchronous shell/SQLite call behind a Promise,
  // and D1 rejects unbounded concurrent statements from one request.
  for (const name of sorted) {
    result.push(await introspectTable(executor, name))
  }
  return { tables: result }
}

/**
 * The DECLARED schema: every active seed definition, read live from D1.
 *
 * This — not `beech.schema.ts` — is the source of truth for generated types and for the schema
 * fingerprint (feature brief, business rule 1). The manifest file is a desired-state artifact and
 * may legitimately be ahead of, or behind, what is deployed.
 */
export async function introspectSeedDefinitions(
  executor: SchemaQueryExecutor,
): Promise<Seed[]> {
  let rows: SeedRow[]
  try {
    rows = await executor.all<SeedRow>(
      `SELECT slug, definition FROM seeds WHERE status = 'active' ORDER BY slug ASC`,
    )
  } catch (error) {
    throw new IntrospectionError('Failed to read the `seeds` table from D1.', error)
  }

  return rows.map(row => {
    try {
      return JSON.parse(row.definition) as Seed
    } catch (error) {
      throw new IntrospectionError(
        `Seed '${row.slug}' holds a definition that is not valid JSON; D1 state is corrupt.`,
        error,
      )
    }
  })
}
```

**Executor contract note for the downstream agent:** the three PRAGMA statements above and the two
`SELECT`s are the complete statement set of this primitive. `introspectSeedDefinitions` uses only
plain `SELECT`, which is why sprint 4's Worker path (fingerprint header) needs no PRAGMA support at
all; PRAGMA is exercised solely from the CLI tier this sprint.

## TASK 4 — `packages/core/src/engine/schema-fingerprint.ts` (new)

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module engine/schema-fingerprint
 * A deterministic name for "the shape this API answers in".
 *
 * Computed from live seed definitions (`introspectSeedDefinitions`), embedded in generated client
 * types at build time (sprint 3), returned on every public response as `X-Schema-Revision`
 * (sprint 4), and compared by the client at request time (sprint 5). Both ends MUST compute it
 * with this function — two implementations would be free to disagree, and a drift detector whose
 * ends disagree is worse than none.
 *
 * What is hashed is a CONTRACT PROJECTION, not the whole seed definition: labels, hints, dashboard
 * icons and layout cannot change a single response byte, and hashing them would fire a hard
 * `BeechProblem` in someone else's production client over a typo fix.
 */

import { canonicalStringify } from '../common/canonical-json.js'
import { resolvePolicies } from './policies.js'
import type { Branch, Seed } from './types.js'

/**
 * Bumped ONLY when the projection below or the canonical byte format changes — i.e. when
 * fingerprints computed by two builds are no longer comparable. It is carried in the fingerprint
 * string itself so a version skew reads as a mismatch instead of as an accidental match.
 */
export const SCHEMA_FINGERPRINT_VERSION = 1

/** The response-shape-bearing subset of a `Branch`. */
export interface ContractBranch {
  alias: string
  type: Branch['type']
  format?: Branch['format']
  multiple?: boolean
  options?: string[]
  requiredOnCreate: boolean
  requiredOnUpdate: boolean
  targetSeed?: string
  /** From `resolvePolicies`, so an explicitly-written default hashes like an omitted one. */
  visibility: 'full' | 'masked' | 'hidden'
  publicRead: boolean
  publicEdit: boolean
  minItems?: number
  maxItems?: number
  /** Repeater sub-fields, same projection, recursively. */
  fields?: ContractBranch[]
}

/** The response-shape-bearing subset of a `Seed`. */
export interface ContractSeed {
  slug: string
  displayNameAlias: string
  allowDrafts: boolean
  allowPublicRead: boolean
  allowPublicPost: boolean
  allowPublicEdit: boolean
  branches: ContractBranch[]
}

/** The exact value that gets canonicalized and hashed. */
export interface SchemaContract {
  fingerprintVersion: number
  seeds: ContractSeed[]
}

function projectBranch(branch: Branch): ContractBranch {
  const policies = resolvePolicies(branch)
  return {
    alias: branch.alias,
    type: branch.type,
    ...(branch.format !== undefined ? { format: branch.format } : {}),
    ...(branch.multiple !== undefined ? { multiple: branch.multiple } : {}),
    // Option order is the contract: it is the order a select renders and a union type lists.
    ...(branch.options !== undefined ? { options: [...branch.options] } : {}),
    requiredOnCreate: branch.requiredOnCreate ?? false,
    requiredOnUpdate: branch.requiredOnUpdate ?? false,
    ...(branch.targetSeed !== undefined ? { targetSeed: branch.targetSeed } : {}),
    visibility: policies.visibility,
    publicRead: policies.public,
    publicEdit: policies.publicEdit,
    ...(branch.minItems !== undefined ? { minItems: branch.minItems } : {}),
    ...(branch.maxItems !== undefined ? { maxItems: branch.maxItems } : {}),
    ...(branch.fields ? { fields: branch.fields.map(projectBranch) } : {}),
  }
}

/**
 * Reduces seeds to what a response shape depends on.
 *
 * Deliberately EXCLUDED, and each for a reason a future reader must not "fix":
 * - `id` (`br_XX`) — a stable internal handle; it never appears in a payload, and minting order
 *   differs between an environment built by migration and one grown through the dashboard.
 * - `label`, `labelPlural`, `hint`, `dashboard`, `layout` — presentation, never response shape.
 * - `retentionDays`, `onDelete`, `policies.search|filter|sort`, `numberOptions`, `fileOptions`,
 *   `policies.classification|privacy` — behaviour and storage concerns that leave the response
 *   shape identical. (`privacy` DOES change a stored value's encoding, but the API type stays
 *   `string`; drift there is a data concern, not a type concern.)
 * - anything physical (column order, index names) — see the VETO Audit.
 *
 * Seeds are sorted by slug; BRANCH ORDER IS PRESERVED, because it is the declared field order the
 * generated types and the dashboard form both follow.
 */
export function projectSchemaContract(seeds: Seed[]): SchemaContract {
  return {
    fingerprintVersion: SCHEMA_FINGERPRINT_VERSION,
    seeds: [...seeds]
      .sort((a, b) => a.slug.localeCompare(b.slug))
      .map(seed => ({
        slug: seed.slug,
        displayNameAlias: seed.displayNameAlias,
        allowDrafts: seed.allowDrafts ?? false,
        allowPublicRead: seed.allowPublicRead ?? false,
        allowPublicPost: seed.allowPublicPost ?? false,
        allowPublicEdit: seed.allowPublicEdit ?? false,
        branches: seed.branches.map(projectBranch),
      })),
  }
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * `v{VERSION}:{32 lowercase hex}` — SHA-256 over the canonical JSON of the contract projection,
 * truncated to 128 bits.
 *
 * Truncation is deliberate: this value travels on EVERY public response as `X-Schema-Revision`,
 * and 128 bits of a SHA-256 digest carries no realistic collision risk for a value space of a few
 * hundred schema revisions. It is a revision marker, never a security token.
 *
 * Web Crypto only — the same API the Worker and Node ≥ 18 both expose, as `webhook-crypto.ts`
 * already relies on. `@beechcms/core` gains no dependency.
 */
export async function computeSchemaFingerprint(seeds: Seed[]): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalStringify(projectSchemaContract(seeds)))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return `v${SCHEMA_FINGERPRINT_VERSION}:${toHex(digest).slice(0, 32)}`
}
```

## TASK 5 — `packages/core/src/index.ts` (2 lines)

Add next to the other engine exports (after `export * from './engine/seed-registry.js'`):

```ts
export * from './engine/introspection.js'
export * from './engine/schema-fingerprint.js'
```

**Do NOT** add either module to `src/schema/index.ts`: `./schema` is the authoring subpath the
Worker must never import, and these two are Worker-facing. `common/canonical-json.ts` stays
unexported from the root — it is reached through `schema/canonical.ts` and the fingerprint module,
and publishing a second canonicalizer entry point invites a caller to hash something else.

## TASK 6 — `packages/cli/src/lib/d1-executor.ts` (new)

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { SchemaQueryExecutor } from '@beechcms/core'
import { queryD1, type WranglerOptions } from './wrangler.js'

/**
 * Adapts the CLI's synchronous D1 path (local miniflare SQLite, or `wrangler d1 execute --json`)
 * to the executor `@beechcms/core`'s introspection primitive expects.
 *
 * `queryD1` stays untouched: it is a degree-17 hub shared with `init`, `db:migrate`, `db:reset`,
 * `onboard` and `generate-types`. This wrapper adds a Promise and nothing else — no caching, no
 * retry, no statement rewriting (see the `SchemaQueryExecutor` contract).
 */
export function createWranglerExecutor(options: WranglerOptions): SchemaQueryExecutor {
  return {
    all<T extends Record<string, unknown>>(sql: string): Promise<T[]> {
      return Promise.resolve(queryD1<T>(sql, options))
    },
  }
}
```

If `queryD1<T>` does not accept `T extends Record<string, unknown>` cleanly against its
`T extends D1Row` bound, widen at the call site with `queryD1<T & Record<string, unknown>>(...)` —
`D1Row` is `{ [key: string]: unknown }`, so the two are structurally identical. Do **not** relax
`SchemaQueryExecutor`'s bound to fix a CLI-side typing wrinkle.

## TASK 7 — `packages/cli/src/lib/schema-diff.ts` (refactor)

Delete `PragmaRow`, `FkRow`, `IndexRow` and all three PRAGMA calls. `ColumnDiff`, `SeedDiff`,
`isSeedClean` and `renderSeedDiff` keep their current bodies and shapes verbatim
(`migration-writer.ts:12,15,48` depends on them). Only the imports and `diffSeed` change:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import pc from 'picocolors'
import type { Seed, SchemaQueryExecutor, LiveTable } from '@beechcms/core'
import { getExpectedColumns, introspectTable } from '@beechcms/core'

// ── ColumnDiff / SeedDiff / isSeedClean / renderSeedDiff: UNCHANGED (current L34-74) ──

/**
 * Compares one seed's CODE-derived expectation (`getExpectedColumns`) against the table's PHYSICAL
 * state, read through the shared introspection primitive in `@beechcms/core`.
 *
 * The PRAGMA statements this function used to issue itself now live in `engine/introspection.ts`,
 * so the CLI and the Worker read D1 through one definition of "what the live schema is"
 * (feature brief, business rule 1).
 */
export async function diffSeed(seed: Seed, executor: SchemaQueryExecutor): Promise<SeedDiff> {
  const live: LiveTable = await introspectTable(executor, `content_${seed.slug}`)
  const expected = getExpectedColumns(seed)

  if (!live.exists) {
    return {
      slug: seed.slug,
      tableExists: false,
      columns: expected.map(c => ({ name: c.name, status: 'missing' as const, expectedType: c.sqlType })),
    }
  }

  const actualMap = new Map(live.columns.map(c => [c.name, c]))
  const expectedSet = new Set(expected.map(c => c.name))
  const columns: ColumnDiff[] = []

  // ── Column presence + type checks ────────────────────────────────────────
  for (const col of expected) {
    const actual = actualMap.get(col.name)
    if (!actual) {
      columns.push({ name: col.name, status: 'missing', expectedType: col.sqlType })
    } else if (actual.sqlType !== col.sqlType) {
      // `sqlType` arrives already upper-cased from the primitive.
      columns.push({ name: col.name, status: 'type_mismatch', expectedType: col.sqlType, actualType: actual.sqlType })
    } else {
      columns.push({ name: col.name, status: 'ok' })
    }
  }

  for (const actual of live.columns) {
    if (!expectedSet.has(actual.name)) {
      columns.push({ name: actual.name, status: 'extra', actualType: actual.sqlType })
    }
  }

  // ── FK + index checks for relation branches ──────────────────────────────
  const relationBranches = seed.branches.filter(b => b.type === 'relation' && b.targetSeed)
  if (relationBranches.length > 0) {
    const fkByColumn = new Map(live.foreignKeys.map(fk => [fk.column, fk]))
    const indexNames = new Set(live.indexes.map(i => i.name))

    for (const branch of relationBranches) {
      const expectedFkTable = `content_${branch.targetSeed}`
      const expectedOnDelete = (branch.onDelete ?? 'SET NULL').toUpperCase()
      const expectedIndexName = `idx_${seed.slug}_${branch.alias}`

      const colDiff = columns.find(c => c.name === branch.alias)
      if (!colDiff || colDiff.status === 'missing') continue // already flagged

      const fk = fkByColumn.get(branch.alias)
      if (!fk) {
        colDiff.status = 'fk_missing'
        colDiff.expectedTarget = branch.targetSeed
      } else if (fk.targetTable !== expectedFkTable || fk.onDelete !== expectedOnDelete) {
        colDiff.status = 'fk_mismatch'
        colDiff.expected = `→ ${expectedFkTable}(id) ON DELETE ${expectedOnDelete}`
        colDiff.actual = `→ ${fk.targetTable}(id) ON DELETE ${fk.onDelete}`
        colDiff.expectedTarget = branch.targetSeed
      }

      if (!indexNames.has(expectedIndexName)) {
        // FK status takes precedence; when it already carries one, the missing index is reported
        // as its own row so neither finding is lost.
        if (colDiff.status === 'ok') colDiff.status = 'index_missing'
        else columns.push({ name: branch.alias, status: 'index_missing' })
      }
    }
  }

  return { slug: seed.slug, tableExists: true, columns }
}
```

Behavioural deltas the executing agent must accept as intentional:

1. The `WranglerOptions` parameter is replaced by a `SchemaQueryExecutor`. `diffSeed` has **no
   runtime caller** today (`graphify affected`), so nothing else needs updating; sprint 3's
   `beech schema diff` will pass `createWranglerExecutor(options)`.
2. A relation branch whose column exists but whose `PRAGMA` calls fail now yields `fk_missing`
   instead of a silently skipped check — the primitive returns empty lists, and an unverifiable FK
   must read as "not verified present", never as "fine".
3. `renderSeedDiff` and `isSeedClean` are untouched, so the CLI's printed output is unchanged.

## TASK 8 — Tests

All three files are **unit tier** (`testing_conventions.md` §0): the executor is the faked I/O
boundary and nothing touches D1, the network or the filesystem (Rule 0.2). Fixtures are hand-built
`Seed` objects — permitted here because `@beechcms/core` has no `@beechcms/testing` dependency and
these are schema-definition inputs, not content entities with a production id format (Rule 3.5/3.6
concern the content fixtures the harness owns).

**8a. `packages/core/src/common/canonical-json.test.ts`** — `describe('canonicalStringify', …)`

- `it('sorts object keys lexicographically regardless of insertion order', …)` — two objects built
  in opposite key order produce identical strings.
- `it('preserves array order, because branch order is the physical column order', …)`
- `it('drops undefined properties and ends the output with a newline', …)`
- `it('a function anywhere in the tree throws CanonicalSerializationError naming its dotted path', …)`
  — assert `error.path` and `error.found`, per Rule 5.4 (machine-readable identity, not message text).
- `it('a Date, a Map and a RegExp each throw CanonicalSerializationError', …)` — matrix form (Rule 1.6).

**8b. `packages/core/src/engine/introspection.test.ts`**

Local fake, declared inside the `describe` (Rule 3.12):

```ts
function fakeExecutor(responses: Record<string, Record<string, unknown>[]>): SchemaQueryExecutor {
  return {
    all: <T extends Record<string, unknown>>(sql: string): Promise<T[]> => {
      const rows = responses[sql]
      // An unstubbed statement must fail loudly: a silent [] would let a test pass against a
      // primitive that changed the SQL it issues.
      if (!rows) return Promise.reject(new Error(`unstubbed statement: ${sql}`))
      return Promise.resolve(rows as T[])
    },
  }
}
```

- `describe('introspectTable', …)`
  - `it('maps PRAGMA table_info rows to columns with upper-cased types and boolean flags', …)`
  - `it('reports exists: false for a table PRAGMA answers with zero rows', …)`
  - `it('reports exists: false when the executor rejects, so a missing table is a diff outcome not a crash', …)`
  - `it('excludes sqlite_autoindex_* entries and sorts the remaining indexes by name', …)`
  - `it('sorts foreign keys by column and upper-cases the ON DELETE rule', …)`
  - `it('defaults a null foreign-key target column to id', …)`
- `describe('assertSafeIdentifier', …)`
  - `it('rejects an identifier carrying a quote or a semicolon with IntrospectionError', …)` —
    matrix over `["content_posts; DROP TABLE users", "a'b", "1bad", ""]`; regression guard comment
    naming PRAGMA identifier interpolation as the mechanism (Rule 6.2.4).
- `describe('introspectSchema', …)`
  - `it('introspects every content_ table listed by sqlite_master, sorted by name', …)`
- `describe('introspectSeedDefinitions', …)`
  - `it('parses each active seed definition into a Seed', …)`
  - `it('throws IntrospectionError naming the slug whose definition is not valid JSON', …)`

**8c. `packages/core/src/engine/schema-fingerprint.test.ts`**

- `describe('projectSchemaContract', …)`
  - `it('sorts seeds by slug and keeps branch declaration order', …)`
  - `it('materializes policy defaults so an explicit default projects like an omitted one', …)`
  - `it('projects repeater sub-fields recursively', …)`
  - `it('omits branch ids, labels, hints and dashboard config from the projection', …)` — assert the
    projected object with `toEqual` (here the whole shape genuinely is the contract, Rule 5.3).
- `describe('computeSchemaFingerprint', …)`
  - `it('returns the v1 prefix followed by 32 lowercase hex characters', …)` — `toMatch(/^v1:[0-9a-f]{32}$/)`.
  - `it('is stable across seed ordering and across key insertion order', …)`
  - `it('is unchanged by a label, hint or dashboard icon edit', …)` — the false-positive guard; comment
    names the mechanism (a spurious mismatch would hard-fail external clients).
  - `it('changes when a branch alias, type, required flag or public policy changes', …)` — matrix,
    each mutation compared against the baseline fingerprint.
  - `it('changes when a seed is added or removed', …)`

**8d. `packages/cli/src/test/diff-seed.test.ts`** — `describe('diffSeed', …)`

Same fake-executor helper (local to the file — `testing_conventions.md` Rule 3.12 forbids importing
a helper from another test file; duplicating ~8 lines is the correct trade until a second CLI file
needs it, at which point it moves to `@beechcms/testing`).

- `it('reports every expected column as missing when the table does not exist', …)`
- `it('flags a column whose declared type diverges from the branch type', …)`
- `it('flags a database column no branch declares as extra', …)`
- `it('flags a relation column with no foreign key as fk_missing', …)`
- `it('flags a foreign key pointing at the wrong table or ON DELETE rule as fk_mismatch', …)`
- `it('flags a relation column whose idx_{slug}_{alias} index is absent as index_missing', …)`
- `it('returns a clean diff for a table matching its seed, so isSeedClean holds', …)`

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run from the repo root unless stated otherwise.

```bash
# 1. Core builds (tsc) — the new modules must compile with zero new dependencies.
pnpm --filter @beechcms/core build

# 2. Core type-check and unit tests (includes the UNEDITED sprint-1 canonical.test.ts,
#    which is the proof the serializer move was non-breaking).
pnpm --filter @beechcms/core type-check
pnpm --filter @beechcms/core test

# 3. CLI: `build` runs `tsc --noEmit` before esbuild, so this is the CLI type gate too.
pnpm --filter @beechcms/cli build
pnpm --filter @beechcms/cli test

# 4. API must still compile against @beechcms/core (root export surface grew by two modules).
pnpm --filter @beechcms/api exec tsc --noEmit

# 5. Whole-workspace gate.
pnpm beech test --diff
pnpm lint

# 6. Architectural regression: the Worker graph must still have no path into the CLI executor.
graphify update . --force
graphify path "createBeechApp" "queryD1"      # expected: "No directed path found"
```

Manual smoke check of the primitive against real local D1 (no new command exists yet, so drive it
through `node` with the built CLI adapter):

```bash
pnpm beech db:migrate
node -e "
import('./packages/cli/dist/index.js').then(async () => {
  const { createWranglerExecutor } = await import('./packages/cli/src/lib/d1-executor.ts');
});
" # if the .ts import path is inconvenient, assert the same via the vitest suites in step 2/3 —
  # the suites are the contract; this smoke check is optional confirmation only.
```

If the smoke check is skipped, say so in the execution log: the tiered suites above are the binding
gate, and no acceptance criterion depends on the manual run.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

**Architecture**

- [ ] `packages/core/src/engine/introspection.ts` and `schema-fingerprint.ts` import **nothing**
      from `node:*`, from `@cloudflare/*`, or from `../schema/**` — they must be Worker-safe.
- [ ] `packages/core/package.json` `dependencies` is **unchanged** (no hashing or SQL library added).
- [ ] `@beechcms/core` never opens a database connection: every D1 read goes through the injected
      `SchemaQueryExecutor`.
- [ ] The primitive issues **read-only** statements (`PRAGMA` / `SELECT`) — no DDL, no write, no
      transaction control.
- [ ] Nothing under `apps/api/` or `apps/dashboard/` is modified; no migration file is added.
- [ ] `graphify path "createBeechApp" "queryD1"` still reports no directed path after
      `graphify update . --force`.
- [ ] `packages/cli/src/lib/wrangler.ts` is unchanged.

**Canonical serializer move**

- [ ] `packages/core/src/schema/canonical.test.ts` passes **without a single character edited**.
- [ ] `schema/canonical.ts` still exports `toCanonicalJson`, `fromCanonicalJson` and
      `ManifestSerializationError`, and `manifest-validation.ts` is unmodified.
- [ ] `ManifestSerializationError` and `CanonicalSerializationError` are the same class object
      (an `instanceof` check written against either name holds for an error thrown by the other).
- [ ] The canonical byte output is unchanged: sorted keys, preserved array order, two-space indent,
      trailing newline.

**Fingerprint**

- [ ] `computeSchemaFingerprint` matches `/^v1:[0-9a-f]{32}$/`.
- [ ] Identical seeds in different order, and identical seeds with different key insertion order,
      produce identical fingerprints.
- [ ] A `label`, `labelPlural`, `hint`, `dashboard` or `layout` edit does **not** change it.
- [ ] A branch `alias`, `type`, `requiredOnCreate`, `targetSeed`, `options`, resolved `visibility`
      or resolved `public` change **does** change it.
- [ ] `SCHEMA_FINGERPRINT_VERSION` is exported and embedded in the returned string.
- [ ] The fingerprint is computed from `Seed[]` read live out of D1, never from a manifest file
      (feature brief, business rule 1).

**Typing**

- [ ] No `any` in production code or in tests (`testing_conventions.md` §7.1); every parsed row is
      typed at the call site.
- [ ] `SchemaQueryExecutor.all` is generic and bounded by `Record<string, unknown>`; its bound is
      not relaxed to satisfy a CLI-side typing wrinkle.
- [ ] Every exported symbol added this sprint carries a doc comment stating *why*, not *what*.

**CLI refactor**

- [ ] `packages/cli/src/lib/schema-diff.ts` declares no PRAGMA row interface and issues no PRAGMA
      statement of its own.
- [ ] `ColumnDiff`, `SeedDiff`, `isSeedClean` and `renderSeedDiff` keep their exact current shapes;
      `migration-writer.ts` compiles unmodified.
- [ ] `createWranglerExecutor` adds no caching, retry or statement rewriting.

**Tests**

- [ ] New test files are unit tier, correctly placed (core: colocated; CLI: `src/test/`), carry the
      SPDX header, and follow §1–§6 of `testing_conventions.md` (subject-named `describe`,
      outcome-stating `it` without "should", four zones, one act, named act result).
- [ ] Every test passes in isolation (`vitest run -t '<name>'`); no `it.only`, no `it.skip`.
- [ ] The unstubbed-statement path of the fake executor **rejects** rather than returning `[]`.
- [ ] Error-path tests assert the error identity (`IntrospectionError`, `error.path`,
      `error.found`), never message copy.

**Build**

- [ ] `pnpm --filter @beechcms/core build`, `pnpm --filter @beechcms/cli build`,
      `pnpm --filter @beechcms/api exec tsc --noEmit` all pass.
- [ ] `pnpm beech test --diff` and `pnpm lint` pass.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executing agent MUST NOT build any of the following. Each is a later roadmap entry; building it
early ships dead code against an interface its consumer has not shaped yet.

1. **Any `beech schema` subcommand** (`export`, `diff`, `plan`, `apply`) and any change to
   `packages/cli/src/commands/schema-diff.ts` (it stays the deprecation notice it is today).
   → ROADMAP sprint 3 `CliSchemaTooling`.
2. **`beech types generate`, `SeedRegistryTypes`, the generated fingerprint header, and any edit to
   `packages/cli/src/commands/generate-types.ts`.** It keeps its raw `queryD1` call this sprint.
   → ROADMAP sprint 3.
3. **The Worker-side executor adapter and the `X-Schema-Revision` response header.** No file under
   `apps/api/src/` is opened. The primitive is *shaped* to be satisfiable by a `D1Database` binding;
   it is not *wired* to one here. → ROADMAP sprint 4 `PublicApiRelationExpansion`.
4. **`include=` relation expansion on `/api/v1/public/*`.** → ROADMAP sprint 4.
5. **Any change to `packages/client/`** — no fluent builder, no runtime fingerprint comparison, no
   `.list({ validate: true })` strict mode, no `BeechProblem` for stale types.
   → ROADMAP sprints 5 and 6.
6. **Writing `seeds.source = 'code'`, or any ownership-transfer logic.** Sprint 1 settled that
   ownership never transfers implicitly; this sprint reads neither `source` nor writes any seed row.
   → standing decision in `ROADMAP.md`.
7. **Migration generation from a diff.** `migration-writer.ts` is a type consumer of `SeedDiff` and
   must compile unchanged; do not extend it, do not call it. → ROADMAP sprint 3.
8. **Hashing physical schema state, `PRAGMA index_info` expansion, or per-index column lists.**
   Rejected in the VETO Audit; re-adding requires a new brief, not a judgement call at execution time.
9. **A second canonicalizer, or any change to the canonical byte format.** The format is frozen; a
   change to it is a `SCHEMA_FINGERPRINT_VERSION` and `MANIFEST_VERSION` event, not a refactor.
10. **Caching, memoizing or batching inside the executor or the primitive.** A stale read here
    becomes a wrong fingerprint on someone else's production client. Caching belongs to the caller
    that knows its own request lifetime — sprint 4, if it ever proves necessary.
11. **Touching `packages/core/src/engine/ddl.ts`, `seed-ddl.ts` or `seed-registry.ts`.**
    `getExpectedColumns` is consumed as-is; the code-derived expectation side of the diff is not in
    play this sprint.
