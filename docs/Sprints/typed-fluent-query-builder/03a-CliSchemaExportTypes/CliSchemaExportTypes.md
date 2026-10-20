# Sprint Plan — `CliSchemaExportTypes`

**Chain:** Typed Fluent Query Builder (#381 → #385) — **sprint 3a of 7** (`ROADMAP.md`).
**Issue:** #382, part B (read half).
**Upstream:** sprint 1 `SchemaManifestDsl` and sprint 2 `SchemaIntrospectionFingerprint` — both
merged, archived to `docs/Sprints/`.
**Downstream blocked on this:** sprint 3b `CliSchemaPlanApply` (consumes the manifest loader and the
comparator), sprint 5 `FluentClientQueryBuilder` (consumes `SeedRegistryTypes` + `SCHEMA_FINGERPRINT`).

---

### Pre-Computation Analysis

Produced with the graphify CLI under `_config/tooling_graphify.md` (graph refreshed with
`graphify update . --force` first: 13023 nodes / 23477 edges; no `GRAPH_REPORT.md` read; `query` not
needed — every question was answerable with `explain` / `path` / `affected`).

#### a) God Nodes identified via the CLI

| Node | Degree | Community | Relevance to this sprint |
|------|--------|-----------|--------------------------|
| `engine/types.ts` (`packages/core/src/engine/types.ts`) | **76** | `engine/types.ts` | Owns `Seed` / `Branch`. Read-only here: this sprint adds **zero** fields to it. |
| `ddl.ts` (`packages/core/src/engine/ddl.ts`) | **45** | `ddl.ts` | Owns `getExpectedColumns`. Consumed unchanged through `diffSeed`; not opened. |
| `wrangler.ts` (`packages/cli/src/lib/wrangler.ts`) | **18** | `wrangler.ts` | Owns `queryD1`, `findWranglerConfig`, `resolveDbName`, `getLocalD1SqlitePath`. **Wrapped, never edited** — the new `lib/d1-context.ts` composes these four; `queryD1` itself is only reached through sprint 2's `createWranglerExecutor`. |
| `manifest.types.ts` (`packages/core/src/schema/manifest.types.ts`) | **17** | `manifest.types.ts` | Sprint-1 hub of the authoring module. Read-only; the new emitter consumes `BeechSchemaManifest` and adds no type to it. |
| `seed-types-generator.ts` (`packages/core/src/engine/seed-types-generator.ts`) | **12** | `seed-types-generator.ts` | The one core file this sprint edits, and only by **adding an optional second parameter**. |
| `generateTypes()` (`packages/cli/src/commands/generate-types.ts:33`) | 7 | `wrangler.ts` | Rewritten onto the sprint-2 primitive. Its only non-test consumer is the barrel re-export at `packages/cli/src/index.ts:20`. |

#### b) Architectural boundaries affected

| Boundary | Touched? | What lands there |
|----------|----------|------------------|
| `@beechcms/core` — `src/schema/` | **yes (1 new file + 1 export line)** | `emit.ts`: manifest → `beech.schema.ts` module source. Authoring-only subpath, exactly where a file the Worker must never import belongs. |
| `@beechcms/core` — `src/engine/` | **yes (1 file, additive signature)** | `seed-types-generator.ts` gains an optional `{ fingerprint }` option. Default call site output stays byte-identical. |
| `@beechcms/core` — `src/index.ts` | **NO** | No new root (Worker-facing) export. The emitter is authoring-only; the fingerprint is already exported from sprint 2. |
| `packages/cli` — `src/lib/` | **yes (3 new files)** | `d1-context.ts` (wrangler-options + executor composition, error mapping), `manifest-loader.ts` (load + interpret `beech.schema.ts`), `manifest-compare.ts` (manifest ↔ live declared seeds). |
| `packages/cli` — `src/commands/` | **yes (1 new, 2 rewritten)** | `schema-export.ts` (new), `schema-diff.ts` (deprecation notice → real command), `generate-types.ts` (raw `queryD1` → introspection primitive + fingerprint). |
| `packages/cli` — `src/index.ts` | **yes (2 export lines)** | `schemaExport` + its options type; `schemaDiff`'s option type changes shape. |
| `bin/cli.mjs` | **yes** | `schema:export`, `schema:diff` (rewired), `types:generate` + help text. `'types'` joins the prefix-join list at L8. |
| `docs/build/cli-workflows.md` | **yes** | Command matrix + §6 rewrite. **Not optional:** `packages/cli/src/test/cli-docs-parity.test.ts` fails the build for any `COMMANDS` key absent from that file. |
| `apps/api` | **NO** | The `source = 'code'` write and the control-plane client are sprint 3b. No file under `apps/api/src` is opened. |
| `apps/dashboard` | **NO** | No dashboard concern in the read path. |
| `apps/api/migrations` | **NO** | No DDL, no new table, no new column. This sprint performs **zero D1 writes**. |

#### c) `graphify affected` impact analysis (breaking-change proof)

```
$ graphify affected "generateSeedTypes" --depth 2
- seed-types-generator.test.ts [imports] packages/core/src/engine/seed-types-generator.test.ts:L6
```

Reading: one consumer inside the package, plus `generate-types.ts` across the package boundary
(which the AST graph does not traverse) at `packages/cli/src/commands/generate-types.ts:8`. Adding a
**second optional parameter** is therefore provably non-breaking: both call sites keep compiling and,
when the option is omitted, keep receiving byte-identical output.

```
$ graphify affected "queryD1" --depth 2
- generateTypes()        [calls]        packages/cli/src/commands/generate-types.ts:L57
- getExistingTables()    [calls]        packages/cli/src/commands/init.ts:L395
- generate-types.ts      [imports]      packages/cli/src/commands/generate-types.ts:L9
- init.ts                [imports]      packages/cli/src/commands/init.ts:L9
- d1-executor.ts         [imports]      packages/cli/src/lib/d1-executor.ts:L5
- d1-executor.test.ts    [imports]      packages/cli/src/test/d1-executor.test.ts:L8
- generate-types.test.ts [imports]      packages/cli/src/test/generate-types.test.ts:L9
- cli/src/index.ts       [re_exports]   packages/cli/src/index.ts:L20
- init()                 [calls]        packages/cli/src/commands/init.ts:L539
- dbMigrate()            [imports_from] packages/cli/src/commands/db-migrate.ts:L75
- dbReset()              [imports_from] packages/cli/src/commands/db-reset.ts:L48
- onboard.ts             [imports_from] packages/cli/src/commands/onboard.ts:L6
- db-migrate.ts          [dynamic_import]
- db-reset.ts            [dynamic_import]
```

Reading: `queryD1` is still a hub and is still **not edited**. This sprint *removes* one of its direct
callers (`generateTypes` moves behind `createWranglerExecutor` → `introspectSeedDefinitions`); `init`,
`dbMigrate`, `dbReset` and `onboard` keep calling it exactly as today.

```
$ graphify explain "diffSeed"
Degree: 2
  <-- lib/schema-diff.ts   [contains]  packages/cli/src/lib/schema-diff.ts:L58
  <-- diff-seed.test.ts    [imports]   packages/cli/src/test/diff-seed.test.ts:L7
```

Reading: sprint 2 refactored `diffSeed` onto the primitive but left it with **no production caller** —
`commands/schema-diff.ts` has been a deprecation notice since v0.4.0. This sprint is what finally
calls it. Its signature and its `SeedDiff` output are consumed unchanged, so
`migration-writer.ts:12,15,48` (a type-only consumer) compiles untouched.

```
$ graphify explain "seedsToManifest"          →  Degree: 2 (its own module + its test)
$ graphify explain "introspectSeedDefinitions" →  Degree: 2 (its own module + its test)
$ graphify explain "computeSchemaFingerprint"  →  Degree: 5 (module, test, canonicalStringify,
                                                   projectSchemaContract, toHex)
```

Reading: the three sprint-1/sprint-2 functions this sprint exists to consume have **no production
caller yet**. That is the whole point of entry 3 in the roadmap: sprints 1 and 2 shipped the
vocabulary, and this sprint is its first user. Nothing downstream can break, because nothing
downstream exists.

```
$ graphify path "createBeechApp" "queryD1"
No directed path found between 'createBeechApp' and 'queryD1'.
```

Reading: the Worker graph still has no reachability into the CLI's shell executor. This sprint must
keep that true — it is an acceptance criterion in §6.

---

### VETO Audit

Evaluated against `_config/ponytail_arch.md`.

**1. Botanical Invariant — no D1 access bypasses `@beechcms/core`.**
Every D1 read in this sprint goes through sprint 2's primitive (`introspectSeedDefinitions`,
`introspectTable`) driven by `createWranglerExecutor`. The CLI issues **no SQL string of its own** —
`generate-types.ts`'s hand-written `SELECT slug, definition FROM seeds …` is deleted, which is the
single largest bypass left in the repo's CLI tier. **Zero writes:** no DDL, no `INSERT`, no
`UPDATE`, no migration file. Field names are never hardcoded: types and manifests are built from
`Branch.alias` / `Branch.id` through `generateSeedTypes` and `seedsToManifest`, and the only literal
column names in play (`slug`, `definition`, `status`) belong to the structural `seeds` table already
owned by `introspection.ts`. ✅

**2. VSA — zero cross-feature imports.**
No file under `apps/api/src/features/**` or `apps/dashboard/src/features/**` is opened, so no
cross-slice import can be introduced. Logic shared by two tiers goes to `@beechcms/core`: the
manifest *emitter* lands in `core/src/schema/` because it is the inverse of `core`'s own
`fromCanonicalJson`/`manifestToSeeds` and must stay byte-compatible with them. Logic used by exactly
one tier (`manifest-loader`, `manifest-compare`, `d1-context`) stays in `packages/cli/src/lib/` —
moving CLI-only file I/O into `@beechcms/core` would drag `node:fs` into a Worker-facing package,
which is the opposite of rule 3. ✅

**3. Cloudflare purity.**
No ORM, no background job, no stateful process. `@beechcms/core` and `@beechcms/cli` both gain
**zero dependencies**: the manifest file is loaded through Node's own ESM loader (native TypeScript
type stripping, Node ≥ 22.18), not through a bundler or a transpiler dependency. Schema mutation
stays outside this sprint entirely, so the "non-deterministic SQLite schema change" risk is
structurally absent. ✅

**4. Sprint-splitting decision (the biggest change this audit forced).**
Roadmap entry 3 asked for `export | diff | plan | apply` + `types generate` in one sprint. Rejected:
`plan`/`apply` must mutate through `POST /api/seeds/:slug/mcp-plan` / `mcp-apply`
(`apps/api/src/features/seeds/seeds.mcp.ts:122,200`), and the CLI has **no authenticated HTTP client
and no credential story** — the only existing client is `packages/mcp/src/client.ts`, which is
OAuth-browser-flow based and is not even exported as a subpath (`@beechcms/mcp`'s `exports` map
publishes the stdio server binary only). Deciding that mechanism is a design chunk of its own, and it
does not block a single line of the read path. Additionally, `mcp-apply` hardcodes
`source: 'runtime'` (`seeds.mcp.ts:275`), so manifest-owned apply needs an `apps/api` change too —
a second boundary, validated separately. Entry 3 is therefore split into **3a (this sprint, read)**
and **3b (plan/apply, write)** in `ROADMAP.md`, and everything deferred is listed in §7.

**5. YAGNI adjustments made during this audit (plan changed as a result):**

- **REJECTED — emitting `defineField.text({…})` call trees in the exported manifest.** The first
  draft pretty-printed each branch as a DSL call. That is a second serializer for the manifest shape:
  it would need a per-`BranchType` mapping, would drift from `defineField` the moment a type is
  added, and would produce Git diffs that differ from the canonical JSON the validator reads. The
  export now embeds the **frozen canonical JSON literal** inside one `defineSchema(...)` call. JSON
  object literals are valid TypeScript expressions, the bytes come from the sprint-1 serializer, and
  a hand-authored file using the full DSL still round-trips because `defineSchema` erases to the
  same `BeechSchemaManifest`.
- **REJECTED — a second canonicalizer export.** `emit.ts` imports `canonicalStringify` from
  `../common/canonical-json.js` *inside* the package. No new public canonicalizer entry point on
  `.` or on `./schema` (sprint 2's standing decision).
- **REJECTED — generating migrations from the diff.** `lib/migration-writer.ts` exists and is
  caller-less. Wiring `beech schema diff --write` back to it would resurrect the file-based
  migration path that v0.4.0 deliberately deprecated, and would produce raw DDL from the CLI —
  a direct Botanical Invariant violation. `diff` reports; `plan`/`apply` (3b) mutate, through the
  control plane. `migration-writer.ts` is left untouched and uncalled.
- **REJECTED — a `--watch` mode, a `--json` output mode, and remote-only convenience flags on the
  three new commands.** No consumer. Added when one exists.
- **REJECTED — bumping the repo's `engines.node` to ≥ 22.18.** Only the manifest loader needs native
  type stripping, and only `beech schema diff` needs the loader. Raising the floor for every
  consumer of `beech dev` / `beech db:migrate` to serve one command is disproportionate; the loader
  maps the Node error to an actionable message instead.
- **REJECTED — sharing the fake-executor helper between `packages/cli/src/test/*.test.ts` files.**
  `testing_conventions.md` Rule 3.12 forbids importing a helper from another test file; the ~8-line
  local duplication is correct until a third file needs it, at which point it moves to
  `@beechcms/testing`.

**Verdict: APPROVED.** Minimal blueprint: 1 new + 1 edited file in `@beechcms/core`, 3 new + 3
rewritten files in `packages/cli`, 1 edited dispatcher, 1 edited doc, 0 files in `apps/api`, 0 in
`apps/dashboard`, 0 migrations, 0 new dependencies.

HANDOFF -> caveman_coder.

---

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Sprints 1 and 2 shipped a vocabulary with no speaker. `defineSchema`/`seedsToManifest`,
`introspectSeedDefinitions` and `computeSchemaFingerprint` all exist, all are tested, and all have
**zero production callers** (`graphify explain` confirms degree 2 for each). Until a command drives
them, none of it is proven against a real database, and every later sprint would build on unexercised
code.

This sprint is the first consumer, and it is deliberately the *read-only* one:

- it proves the primitive against live D1 without being able to corrupt anything (no statement it
  issues is anything but `PRAGMA` or `SELECT`);
- it produces the two artifacts every later sprint needs — a `beech.schema.ts` a human can review,
  and a `beech.generated.ts` carrying `SeedRegistryTypes` **and** the fingerprint that sprint 5's
  client compares against sprint 4's `X-Schema-Revision` header;
- it makes the drift story observable before it is made mutable. `beech schema diff` answering
  "your manifest and your database disagree" is what turns sprint 3b's `plan`/`apply` into a
  reviewable operation instead of a blind one.

**Botanical Engine adherence.** The CLI loses its last hand-written schema query. Today
`generate-types.ts:57` reaches into D1 with its own `SELECT slug, definition FROM seeds WHERE
status = 'active'`; after this sprint the only code that knows that statement is
`@beechcms/core/engine/introspection.ts`. Types, manifests and drift reports then provably derive
from one definition of "what the live schema is" — which is business rule 1 of the feature brief,
and the precondition for a fingerprint that two independent processes can agree on.

**VSA adherence.** Three tiers, cleanly separated by what each is allowed to know: `@beechcms/core`
knows schema *shape* (emitter, type generator, fingerprint) and never touches a file or a socket;
`packages/cli` knows *files and processes* (loader, output paths, wrangler options) and never
re-derives shape; `bin/cli.mjs` knows only argv. No feature slice in `apps/api` or `apps/dashboard`
is opened at all, so the cross-slice import rule is satisfied structurally rather than by review.

**Why the split from `plan`/`apply` is a boundary and not a convenience.** The read path's blast
radius is a file on disk. The write path's blast radius is a production D1 schema behind an
authentication mechanism that does not yet exist for this process. Merging them means the reviewer
of the export emitter is also the reviewer of a credential flow. Sprint 3b starts from a merged,
exercised loader and comparator — and from real `beech.schema.ts` files that exist because this
sprint can produce them.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Sprint-1 authoring surface — `packages/core/src/schema/` (shipped, consumed read-only here)**

| File | Exports | Role for this sprint |
|------|---------|----------------------|
| `manifest.types.ts` | `MANIFEST_VERSION = 1`, `ManifestBranch`, `ManifestSeed`, `FieldGroup`, `BeechSchemaManifest` | read-only |
| `define.ts` | `defineSchema({ seeds })`, `defineSeed`, `defineField.*`, `defineGroup` | referenced by emitted source; file untouched |
| `canonical.ts` | `toCanonicalJson`, `fromCanonicalJson`, `ManifestSerializationError` | `toCanonicalJson` is the comparator's byte oracle |
| `manifest-seeds.ts` | `manifestToSeeds`, `seedsToManifest` | both consumed: `seedsToManifest` for export, `manifestToSeeds` (via `validateManifest`) for load |
| `manifest-validation.ts` | `validateManifest(manifest): SeedValidationIssue[]` | the loader's gate; returns issues, never throws |
| `index.ts` | `export *` of the five above | **one line added** for `emit.js` |

`packages/core/package.json` publishes `"./schema": { "import": "./dist/schema/index.js", "types":
"./dist/schema/index.d.ts" }`. **No file in the repo imports that subpath yet** — this sprint is its
first consumer, from `packages/cli` (`moduleResolution: "Bundler"`, so the exports map resolves) and
from the emitted `beech.schema.ts` at the user's project root.

Key shapes the emitter and loader must respect:
- `defineSchema(input: { seeds: ManifestSeed[] }): BeechSchemaManifest` — it *adds* `version`
  itself, so the emitted call must pass `{ seeds: [...] }` and **must not** pass `version` (excess
  property check on an object literal would fail the user's own typecheck).
- `ManifestSeed = Omit<Seed, 'branches' | 'layout'> & { branches: ManifestBranch[] }`;
  `ManifestBranch = Omit<Branch, 'id' | 'fields'> & { id?: string; fields?: ManifestBranch[] }` —
  `id` is optional at authoring time, which is precisely why the comparator must ignore it.
- `seedsToManifest(seeds)` sorts seeds by slug and strips `layout`; it does **not** strip branch ids.
- Canonical bytes (frozen, `common/canonical-json.ts`): keys sorted lexicographically, `undefined`
  dropped, array order preserved, `JSON.stringify(value, null, 2)` + trailing newline.

**Sprint-2 primitive — `packages/core/src/engine/` (shipped, first consumer is this sprint)**

- `SchemaQueryExecutor { all<T extends Record<string, unknown>>(sql: string): Promise<T[]> }`.
- `introspectTable(executor, table): Promise<LiveTable>` — `{ name, exists, columns, foreignKeys,
  indexes }`; a missing table returns `exists: false` instead of throwing.
- `introspectSeedDefinitions(executor): Promise<Seed[]>` — runs
  `SELECT slug, definition FROM seeds WHERE status = 'active' ORDER BY slug ASC`, `JSON.parse`s each
  definition, and wraps **any** read failure in `IntrospectionError(message, cause)`. The
  "no such table: seeds" text therefore lives on `error.cause`, not on `error.message`.
- `computeSchemaFingerprint(seeds): Promise<string>` — `v1:{32 lowercase hex}`, SHA-256 over the
  canonical JSON of a contract projection. `SCHEMA_FINGERPRINT_VERSION = 1` is exported alongside.
- All three are exported from the **root** entry (`@beechcms/core`), Worker-safe.

**CLI current state — `packages/cli/`**

- `src/lib/wrangler.ts` (god node, degree 18): `WranglerOptions { db; local; configPath }`,
  `queryD1<T>(sql, options): T[]` (**synchronous**), `findWranglerConfig(): string | null`,
  `resolveDbName(configPath): string`, `getLocalD1SqlitePath(startDir?): string | null`. Untouched.
- `src/lib/d1-executor.ts` (sprint 2): `createWranglerExecutor(options): SchemaQueryExecutor`.
  Untouched.
- `src/lib/schema-diff.ts` (sprint 2): `diffSeed(seed, executor): Promise<SeedDiff>`,
  `isSeedClean(diff)`, `renderSeedDiff(diff)`, `ColumnDiff`, `SeedDiff`. **No production caller.**
  Untouched by this sprint; finally *called* by the new `schema-diff` command.
- `src/lib/migration-writer.ts`: type-only consumer of `SeedDiff`. Untouched and uncalled.
- `src/commands/generate-types.ts` (107 LOC): resolves wrangler options, runs its own raw
  `queryD1` `SELECT`, `JSON.parse`s definitions, calls `generateSeedTypes(seeds)`, writes to `--out`
  or stdout. Embeds no fingerprint.
- `src/commands/schema-diff.ts` (22 LOC): a deprecation notice.
  `SchemaDiffOptions { local?, write?, name?, migrationsDir?, db?, registry? }` — `write`, `name`,
  `migrationsDir` and `registry` are accepted and ignored.
- `src/index.ts`: the barrel every `bin/cli.mjs` handler dynamic-imports.

**Type generation today — `packages/core/src/engine/seed-types-generator.ts`**

`generateSeedTypes(seeds: Seed[]): string` emits, in order: a fixed Italian header comment, one
`export interface {PascalCase(slug)}` per seed (system fields `id`/`slug`/`status`, then one property
per branch via `tsTypeForBranch`, then `created_at`/`updated_at`), then
`export interface BeechDatabase { … }` and `export type SeedRegistryTypes = BeechDatabase`. Seeds are
sorted by slug. **`SeedRegistryTypes` already exists** — the roadmap's "emit `SeedRegistryTypes`"
requirement for this sprint reduces to *actually shipping the fingerprint next to it*.

**CLI dispatcher — `bin/cli.mjs` (309 LOC)**

- L8 joins `command` + first arg into `a:b` for the prefixes
  `['db', 'seed', 'schema', 'dev', 'generate', 'mailpit']` — `'types'` must join that list.
- L12-18 special-cases `gen types [typescript]` → `gen-types`.
- `COMMANDS` maps keys to handlers; each handler parses flags by hand and dynamic-imports
  `@beechcms/cli`.
- `packages/cli/src/test/cli-docs-parity.test.ts` asserts every `COMMANDS` key (modulo an alias
  group) appears as the literal string `beech <key>` in `docs/build/cli-workflows.md`. A new command
  without a doc line **fails the suite**.

**Control plane (read for context, NOT touched this sprint)**

`apps/api/src/features/seeds/seeds.mcp.ts` exposes `POST /api/seeds/:slug/mcp-plan` (dry run:
`classification`, `statements`, `blockedReasons`, `expectedVersion`) and `POST
/api/seeds/:slug/mcp-apply` (OCC-guarded atomic apply, hardcoded `source: 'runtime'` at L275).
`seeds.helpers.ts:99` already refuses dashboard edits to a `source = 'code'` seed (sprint 1). Both
are sprint 3b's surface.

**Test idiom in play.** `@beechcms/core` colocates unit tests beside the source; `packages/cli` keeps
them in `src/test/` (`vitest.config.ts` include: `src/test/**/*.test.ts`, coverage thresholds 50%,
with `src/lib/wrangler.ts` and `src/lib/schema-diff.ts` excluded from coverage). The CLI's proven
boundary-faking idiom is `vi.mock('../lib/wrangler.js', () => ({ queryD1: vi.fn() }))`
(`src/test/d1-executor.test.ts:6`) — use that, not `vi.spyOn` on a module namespace.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

**`@beechcms/core` — new**

1. `packages/core/src/schema/emit.ts` — `emitManifestModule(manifest): string`.

**`@beechcms/core` — modified**

2. `packages/core/src/schema/index.ts` — one `export * from './emit.js'` line.
3. `packages/core/src/engine/seed-types-generator.ts` — optional second parameter
   `options: SeedTypesOptions = {}` carrying `fingerprint`; emits `export const SCHEMA_FINGERPRINT`
   when present. Output with the option omitted is byte-identical to today's.

**`@beechcms/core` — tests (unit tier, colocated)**

4. `packages/core/src/schema/emit.test.ts` — new.
5. `packages/core/src/engine/seed-types-generator.test.ts` — **extended** (existing cases untouched).

**`packages/cli` — new**

6. `packages/cli/src/lib/d1-context.ts` — `createD1Context`, `loadLiveSeeds`, `CliError`,
   `exitWithError`.
7. `packages/cli/src/lib/manifest-loader.ts` — `DEFAULT_MANIFEST_PATH`, `ManifestLoadError`,
   `interpretManifestModule` (pure), `loadManifest` (thin I/O).
8. `packages/cli/src/lib/manifest-compare.ts` — `compareManifest`, `renderManifestDrift`,
   `SeedDrift`, `ManifestDrift`.
9. `packages/cli/src/commands/schema-export.ts` — `schemaExport`.

**`packages/cli` — rewritten**

10. `packages/cli/src/commands/schema-diff.ts` — real command replacing the deprecation notice.
11. `packages/cli/src/commands/generate-types.ts` — introspection primitive + fingerprint.
12. `packages/cli/src/index.ts` — export `schemaExport` / `SchemaExportOptions`; `SchemaDiffOptions`
    changes shape.

**`packages/cli` — tests**

13. `packages/cli/src/test/manifest-compare.test.ts` — new.
14. `packages/cli/src/test/manifest-loader.test.ts` — new (pure `interpretManifestModule` only).
15. `packages/cli/src/test/schema-export.test.ts` — new (`node:fs` and wrangler both mocked).
16. `packages/cli/src/test/schema-diff.test.ts` — **the `describe('schemaDiff command')` block is
    replaced**; the `nextMigrationIndex` / `buildMigrationSql` blocks in the same file are left
    byte-identical (they cover `migration-writer.ts`, which this sprint does not touch).
17. `packages/cli/src/test/generate-types.test.ts` — updated to the `vi.mock` boundary idiom and to
    assert the fingerprint constant.

**Repo root**

18. `bin/cli.mjs` — `'types'` prefix, three `COMMANDS` entries, three help blocks.
19. `docs/build/cli-workflows.md` — command matrix rows + §6 rewrite (parity test dependency).

**Explicitly NOT in this sprint:** no `beech schema plan`, no `beech schema apply`, no HTTP client,
no file under `apps/api/` or `apps/dashboard/`, no migration, no new dependency in any
`package.json`, no D1 write of any kind.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

## TASK 1 — `packages/core/src/schema/emit.ts` (new)

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module schema/emit
 * Renders a manifest as the source of a `beech.schema.ts` module — the inverse of the authoring DSL.
 *
 * The seed payload is embedded as the FROZEN canonical JSON literal (sprint 1's serializer), not as
 * a tree of `defineField.*` calls. Three reasons a future reader must not "improve" this:
 *  1. a call-tree emitter is a second serializer for the manifest shape, free to drift from
 *     `define.ts` the moment a branch type is added;
 *  2. the bytes here must match what `toCanonicalJson` produces, because that is what the validator
 *     and the diff compare — one format, one producer;
 *  3. a JSON object literal IS a valid TypeScript expression, so the emitted file typechecks in the
 *     consumer's project with zero extra machinery.
 *
 * A hand-authored manifest using the full DSL round-trips through this emitter unchanged in meaning:
 * `defineSchema`/`defineSeed`/`defineField` all erase to the same `BeechSchemaManifest`.
 */

import { canonicalStringify } from '../common/canonical-json.js'
import type { BeechSchemaManifest } from './manifest.types.js'

/** Header written at the top of every exported manifest. */
const HEADER =
  `// Generated by \`beech schema export\` from live D1 state.\n` +
  `//\n` +
  `// This file is DESIRED STATE, not runtime authority: the Worker never imports it and no deploy\n` +
  `// applies it. Edit it, review the diff in Git, then reconcile with \`beech schema plan\` /\n` +
  `// \`beech schema apply\`. Re-export at any time to refresh the snapshot.\n`

/**
 * Emits the full module source for a `beech.schema.ts`.
 *
 * Seeds are sorted by slug so two exports of the same database are byte-identical and a Git diff
 * shows schema change only. `version` is NOT passed to `defineSchema` — the DSL adds it, and an
 * excess property would fail the consumer's own typecheck.
 *
 * @throws CanonicalSerializationError when a seed carries a value that cannot survive a JSON
 * round-trip. That can only happen if a non-serializable value reached the `seeds` table, which is
 * a corrupt-state fault worth surfacing, not worth silently dropping.
 */
export function emitManifestModule(manifest: BeechSchemaManifest): string {
  const seeds = [...manifest.seeds].sort((a, b) => a.slug.localeCompare(b.slug))
  const literal = canonicalStringify({ seeds }).trimEnd()

  return (
    `${HEADER}\n` +
    `import { defineSchema } from '@beechcms/core/schema'\n\n` +
    `export default defineSchema(${literal})\n`
  )
}
```

## TASK 2 — `packages/core/src/schema/index.ts` (1 line)

Add after `export * from './canonical.js'`:

```ts
export * from './emit.js'
```

**Do NOT** add it to `packages/core/src/index.ts`. The emitter is authoring-only; the root entry is
the Worker-facing one and must not gain a reason to pull in `schema/`.

## TASK 3 — `packages/core/src/engine/seed-types-generator.ts` (additive signature)

Keep every existing function body. Add the option type, the fingerprint block, and the second
parameter:

```ts
/** `v{version}:{32 hex}` — the exact shape `computeSchemaFingerprint` returns. */
const FINGERPRINT_RE = /^v\d+:[0-9a-f]{32}$/

/** Options that affect the emitted module beyond the seed interfaces themselves. */
export interface SeedTypesOptions {
  /**
   * Schema fingerprint to embed as `SCHEMA_FINGERPRINT`, from `computeSchemaFingerprint`.
   * Omitted ⇒ no constant is emitted and the output is byte-identical to a pre-fingerprint build,
   * which is what keeps the legacy `beech gen-types` aliases non-breaking.
   */
  fingerprint?: string
}

/**
 * Pure entry point. Deterministic: sorts seeds by slug for stable diffs.
 *
 * The embedded fingerprint is the client's half of the drift check: `@beechcms/client` compares it
 * against the `X-Schema-Revision` header the API returns and raises an actionable error on a
 * mismatch, instead of trusting a stale response shape.
 */
export function generateSeedTypes(seeds: Seed[], options: SeedTypesOptions = {}): string {
  const sorted = [...seeds].sort((a, b) => a.slug.localeCompare(b.slug))
  const interfaces = sorted.map(interfaceForSeed).join('\n')
  const registryProps = sorted
    .map(s => `  ${propName({ alias: s.slug } as Branch)}: ${pascalCase(s.slug)}`)
    .join('\n')

  const databaseRegistry =
    `export interface BeechDatabase {\n` +
    (registryProps ? registryProps + '\n' : '') +
    `}\n\n` +
    `export type SeedRegistryTypes = BeechDatabase\n`

  return `${HEADER}\n${fingerprintBlock(options.fingerprint)}${interfaces}\n${databaseRegistry}`
}

/**
 * Emits the fingerprint constant, or nothing.
 *
 * The value is interpolated into source, so its shape is verified first: a fingerprint carrying a
 * quote or a newline would emit a file that does not parse, and the failure would surface in the
 * consumer's build rather than here.
 */
function fingerprintBlock(fingerprint: string | undefined): string {
  if (fingerprint === undefined) return ''
  if (!FINGERPRINT_RE.test(fingerprint)) {
    throw new Error(
      `Refusing to embed '${fingerprint}' as a schema fingerprint: expected the v{n}:{32 hex} form produced by computeSchemaFingerprint().`,
    )
  }
  return (
    `/**\n` +
    ` * Schema revision these types were generated from. \`@beechcms/client\` compares it against the\n` +
    ` * \`X-Schema-Revision\` response header; a mismatch means the backend schema moved and this file\n` +
    ` * must be regenerated with \`beech types generate\`.\n` +
    ` */\n` +
    `export const SCHEMA_FINGERPRINT = '${fingerprint}'\n\n`
  )
}
```

## TASK 4 — `packages/cli/src/lib/d1-context.ts` (new)

The wrangler preamble is currently copy-pasted inside `generate-types.ts`; with three commands
needing it, it becomes one function. It **throws** instead of calling `process.exit` so it stays
unit-testable and so a command owns its own exit code.

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module lib/d1-context
 * Resolves "which D1 am I reading, and through what executor" once, for every schema command.
 *
 * Commands must not re-derive this: a `beech schema diff` that resolved a different database than
 * `beech types generate` would report drift that does not exist.
 */

import pc from 'picocolors'
import type { Seed, SchemaQueryExecutor } from '@beechcms/core'
import { introspectSeedDefinitions } from '@beechcms/core'
import {
  findWranglerConfig,
  resolveDbName,
  getLocalD1SqlitePath,
  type WranglerOptions,
} from './wrangler.js'
import { createWranglerExecutor } from './d1-executor.js'

/** A failure with an operator-facing remedy already attached. */
export class CliError extends Error {
  constructor(message: string, readonly hint?: string, readonly cause?: unknown) {
    super(message)
    this.name = 'CliError'
  }
}

/** Flags every schema command shares. */
export interface D1ContextOptions {
  /** Target the local miniflare SQLite state. Default: true. */
  local?: boolean
  /** Override the D1 database name resolved from `wrangler.jsonc`. */
  db?: string
}

/** The resolved target plus the executor `@beechcms/core`'s primitive reads through. */
export interface D1Context {
  executor: SchemaQueryExecutor
  options: WranglerOptions
}

/** Resolves the wrangler target and wraps it in the executor the introspection primitive expects. */
export function createD1Context(args: D1ContextOptions = {}): D1Context {
  const local = args.local !== false
  const configPath = findWranglerConfig()
  const db = args.db ?? resolveDbName(configPath)

  if (local && !getLocalD1SqlitePath()) {
    throw new CliError(
      'Local D1 database state not found.',
      'Start the local environment with `beech dev`, or initialize it with `beech init --db`.',
    )
  }

  const options: WranglerOptions = { db, local, configPath }
  return { executor: createWranglerExecutor(options), options }
}

/**
 * Reads every active seed definition through the shared primitive.
 *
 * `introspectSeedDefinitions` wraps the driver failure in an `IntrospectionError`, so the
 * recognisable "no such table" text lives on the CAUSE, not on the message — an uninitialized
 * database is the most common failure here and deserves its own remedy rather than a stack trace.
 */
export async function loadLiveSeeds(context: D1Context): Promise<Seed[]> {
  let seeds: Seed[]
  try {
    seeds = await introspectSeedDefinitions(context.executor)
  } catch (error) {
    const detail = describeCause(error)
    if (detail.includes('no such table: seeds')) {
      throw new CliError(
        'System table `seeds` not found in the database.',
        'Run `beech init --db` or `beech onboard` to create the system tables.',
        error,
      )
    }
    throw new CliError(
      `Failed to introspect D1 database (${context.options.db}): ${detail}`,
      undefined,
      error,
    )
  }

  if (seeds.length === 0) {
    throw new CliError(
      `No active seeds found in D1 database (${context.options.db}).`,
      'Create a content type in the dashboard (/admin) or through POST /api/seeds.',
    )
  }

  return seeds
}

/** Flattens an error and its cause chain into one searchable string. */
function describeCause(error: unknown): string {
  const parts: string[] = []
  let current: unknown = error
  for (let depth = 0; current instanceof Error && depth < 5; depth++) {
    parts.push(current.message)
    current = (current as { cause?: unknown }).cause
  }
  if (parts.length === 0) parts.push(String(error))
  return parts.join(' — ')
}

/** Renders a failure the way every other command does, then terminates with a non-zero status. */
export function exitWithError(error: unknown): never {
  if (error instanceof CliError) {
    console.error(pc.red(`\n  ✗ ${error.message}`) + (error.hint ? pc.gray(`\n    ${error.hint}\n`) : '\n'))
  } else {
    console.error(pc.red(`\n  ✗ ${error instanceof Error ? error.message : String(error)}\n`))
  }
  process.exit(1)
}
```

## TASK 5 — `packages/cli/src/lib/manifest-loader.ts` (new)

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module lib/manifest-loader
 * Loads `beech.schema.ts` and hands back a validated `BeechSchemaManifest`.
 *
 * The file is imported through Node's own ESM loader, which strips TypeScript types natively from
 * Node 22.18 on. No bundler and no transpiler dependency: a manifest is plain declarative data, and
 * pulling esbuild into the CLI's runtime dependencies to read a data file fails YAGNI.
 */

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { MANIFEST_VERSION, validateManifest } from '@beechcms/core/schema'
import type { BeechSchemaManifest } from '@beechcms/core/schema'
import type { SeedValidationIssue } from '@beechcms/core'

/** Where `beech schema export` writes, and where every command looks by default. */
export const DEFAULT_MANIFEST_PATH = 'beech.schema.ts'

/** A manifest that could not be read, or that read back as something unusable. */
export class ManifestLoadError extends Error {
  constructor(message: string, readonly issues: SeedValidationIssue[] = [], readonly cause?: unknown) {
    super(message)
    this.name = 'ManifestLoadError'
  }
}

/**
 * Turns an imported module namespace into a validated manifest.
 *
 * Split out of `loadManifest` on purpose: everything decidable without I/O is decided here, so the
 * rules (default export required, version gate, fatal validation) are unit-testable without a
 * filesystem (`testing_conventions.md` Rule 0.2).
 */
export function interpretManifestModule(module: unknown, path: string): BeechSchemaManifest {
  const candidate = (module as { default?: unknown } | null)?.default
  if (candidate === undefined) {
    throw new ManifestLoadError(
      `${path} has no default export. A manifest ends with \`export default defineSchema({ seeds: [...] })\`.`,
    )
  }
  if (typeof candidate !== 'object' || candidate === null) {
    throw new ManifestLoadError(`${path} default-exports a ${typeof candidate}, not a manifest object.`)
  }

  const manifest = candidate as Partial<BeechSchemaManifest>
  if (manifest.version !== MANIFEST_VERSION) {
    throw new ManifestLoadError(
      `${path} declares manifest version ${String(manifest.version)}; this build understands ${MANIFEST_VERSION}.`,
    )
  }
  if (!Array.isArray(manifest.seeds)) {
    throw new ManifestLoadError(`${path} is missing a \`seeds\` array.`)
  }

  const complete = manifest as BeechSchemaManifest
  // Cross-seed rules (relation targets, reserved aliases, id/alias formats) can only be checked on
  // the whole set, which is why validation belongs here and not in `defineSeed`.
  const issues = validateManifest(complete)
  const fatal = issues.filter(issue => issue.fatal)
  if (fatal.length > 0) {
    throw new ManifestLoadError(
      `${path} is not a valid schema: ${fatal.flatMap(issue => issue.messages).join('; ')}`,
      issues,
    )
  }

  return complete
}

/**
 * Reads and validates the manifest at `path` (default `beech.schema.ts`, relative to the cwd).
 *
 * Node refuses to import a `.ts` file when type stripping is unavailable; that failure is mapped to
 * a remedy instead of a raw `ERR_UNKNOWN_FILE_EXTENSION`, because the operator's fix is a Node
 * upgrade and nothing in the message would otherwise say so.
 */
export async function loadManifest(path: string = DEFAULT_MANIFEST_PATH): Promise<BeechSchemaManifest> {
  const absolute = resolve(process.cwd(), path)
  if (!existsSync(absolute)) {
    throw new ManifestLoadError(
      `No manifest at ${path}. Produce one from the live database with \`beech schema export\`.`,
    )
  }

  let module: unknown
  try {
    module = await import(pathToFileURL(absolute).href)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ERR_UNKNOWN_FILE_EXTENSION' || code === 'ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING') {
      throw new ManifestLoadError(
        `This Node build cannot import ${path} directly (TypeScript type stripping unavailable).`,
        [],
        error,
      )
    }
    throw new ManifestLoadError(`${path} failed to load: ${(error as Error).message}`, [], error)
  }

  return interpretManifestModule(module, path)
}
```

**Note for the executing agent:** do not add a fallback transpiler. If `loadManifest` throws the
type-stripping error, the remedy printed by `schema-diff` is "upgrade to Node ≥ 22.18"; the repo's
`engines.node` stays `>=18` because every other command still works there (VETO Audit, rejection 5).

## TASK 6 — `packages/cli/src/lib/manifest-compare.ts` (new)

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module lib/manifest-compare
 * Compares a `beech.schema.ts` manifest against the seed definitions D1 actually holds.
 *
 * This is the "is my snapshot stale / does my authored manifest disagree with what is deployed"
 * half of `beech schema diff`. The "does the physical table match the definition" half is
 * `diffSeed` in `lib/schema-diff.ts`; the two answer different questions and are never merged.
 */

import pc from 'picocolors'
import type { Seed } from '@beechcms/core'
import { MANIFEST_VERSION, seedsToManifest, toCanonicalJson } from '@beechcms/core/schema'
import type { BeechSchemaManifest, ManifestSeed } from '@beechcms/core/schema'

/**
 * - `in_sync`        — the two sides canonicalize identically.
 * - `only_in_manifest` — authored but not deployed; a plan would create it.
 * - `only_in_database` — deployed but absent from the manifest; the snapshot is stale, re-export.
 * - `differs`        — both sides exist and disagree.
 */
export type SeedDriftStatus = 'in_sync' | 'only_in_manifest' | 'only_in_database' | 'differs'

export interface SeedDrift {
  slug: string
  status: SeedDriftStatus
}

export interface ManifestDrift {
  /** Sorted by slug, so two runs against the same pair produce identical output. */
  seeds: SeedDrift[]
  inSync: boolean
}

/** Seed-level flags the engine materializes as `false` when omitted by an author. */
const SEED_FLAGS = ['allowDrafts', 'allowPublicRead', 'allowPublicPost', 'allowPublicEdit'] as const

/** Branch-level flags with the same omitted-means-false semantics. */
const BRANCH_FLAGS = ['requiredOnCreate', 'requiredOnUpdate', 'multiple'] as const

type Comparable = Record<string, unknown>

/**
 * Reduces one seed to the form both sides are compared in.
 *
 * Three normalizations, each preventing a specific false positive:
 *  - `layout` is dropped: it is server-populated presentation state, never authored.
 *  - branch `id` is dropped, recursively: a hand-authored branch has none, and `manifestToSeeds`
 *    mints authoring-local ids that will not match the stored `br_XX`. Identity is the alias here;
 *    the AUTHORITATIVE id match happens server-side in `normalizeCandidate` at apply time.
 *  - the boolean flags above are defaulted, so an author who omits `allowDrafts` does not "differ"
 *    from a stored definition that spells out `allowDrafts: false`.
 *
 * Unknown keys are copied through untouched: a field this function has never heard of must show up
 * as drift, not vanish silently.
 */
function normalizeSeed(seed: ManifestSeed | Seed): Comparable {
  const { layout: _layout, branches, ...rest } = seed as Seed & Comparable
  const normalized: Comparable = { ...rest }
  for (const flag of SEED_FLAGS) normalized[flag] = normalized[flag] === true
  normalized.branches = (branches ?? []).map(normalizeBranch)
  return normalized
}

function normalizeBranch(branch: unknown): Comparable {
  const { id: _id, fields, ...rest } = branch as Comparable & { fields?: unknown[] }
  const normalized: Comparable = { ...rest }
  for (const flag of BRANCH_FLAGS) normalized[flag] = normalized[flag] === true
  if (fields !== undefined) normalized.fields = fields.map(normalizeBranch)
  return normalized
}

/**
 * Canonical bytes for one normalized seed, produced by the SAME frozen serializer the manifest
 * itself is written with — one format, one producer (sprint 1's compatibility surface).
 */
function canonicalize(seed: ManifestSeed | Seed): string {
  const normalized = normalizeSeed(seed) as unknown as ManifestSeed
  return toCanonicalJson({ version: MANIFEST_VERSION, seeds: [normalized] })
}

/** Compares an authored/exported manifest against the definitions live in D1. */
export function compareManifest(manifest: BeechSchemaManifest, liveSeeds: Seed[]): ManifestDrift {
  const authored = new Map(manifest.seeds.map(seed => [seed.slug, canonicalize(seed)]))
  // Live seeds go through `seedsToManifest` first so both sides enter the comparison as manifest
  // shapes (layout stripped, slug-sorted) rather than as two different shapes normalized twice.
  const deployed = new Map(seedsToManifest(liveSeeds).seeds.map(seed => [seed.slug, canonicalize(seed)]))

  const slugs = [...new Set([...authored.keys(), ...deployed.keys()])].sort((a, b) => a.localeCompare(b))
  const seeds: SeedDrift[] = slugs.map(slug => {
    const left = authored.get(slug)
    const right = deployed.get(slug)
    if (left === undefined) return { slug, status: 'only_in_database' }
    if (right === undefined) return { slug, status: 'only_in_manifest' }
    return { slug, status: left === right ? 'in_sync' : 'differs' }
  })

  return { seeds, inSync: seeds.every(seed => seed.status === 'in_sync') }
}

/** Human-readable manifest drift report. Pure formatting — no I/O decisions, no exit codes. */
export function renderManifestDrift(drift: ManifestDrift, manifestPath: string): void {
  if (drift.inSync) {
    console.log(pc.green(`  ✓ ${manifestPath} matches the deployed schema`))
    return
  }
  for (const seed of drift.seeds) {
    switch (seed.status) {
      case 'in_sync':
        console.log(pc.green(`  ✓ ${seed.slug}`)); break
      case 'only_in_manifest':
        console.log(pc.yellow(`  + ${seed.slug} — in the manifest, not deployed (apply would create it)`)); break
      case 'only_in_database':
        console.log(pc.yellow(`  - ${seed.slug} — deployed, absent from the manifest (re-export to refresh)`)); break
      case 'differs':
        console.log(pc.red(`  ≠ ${seed.slug} — manifest and deployed definition disagree`)); break
    }
  }
}
```

## TASK 7 — `packages/cli/src/commands/schema-export.ts` (new)

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import pc from 'picocolors'
import { emitManifestModule, seedsToManifest } from '@beechcms/core/schema'
import { createD1Context, exitWithError, loadLiveSeeds } from '../lib/d1-context.js'
import { DEFAULT_MANIFEST_PATH } from '../lib/manifest-loader.js'

export interface SchemaExportOptions {
  /** Destination path. `null` writes to standard output. Default: `beech.schema.ts`. */
  out?: string | null
  /** Target local D1 SQLite state (default: true). Set false for remote D1. */
  local?: boolean
  /** Override the D1 database name. */
  db?: string
}

/**
 * Writes a `beech.schema.ts` snapshot of the live schema.
 *
 * The source is LIVE D1, never an existing manifest file: a snapshot derived from another snapshot
 * can be arbitrarily stale, which is the exact failure mode `beech schema diff` exists to catch
 * (feature brief, business rule 1).
 */
export async function schemaExport(args: SchemaExportOptions = {}): Promise<void> {
  try {
    const context = createD1Context(args)
    const seeds = await loadLiveSeeds(context)
    const source = emitManifestModule(seedsToManifest(seeds))

    if (args.out === null) {
      process.stdout.write(source)
      return
    }

    const target = args.out ?? DEFAULT_MANIFEST_PATH
    const outPath = resolve(process.cwd(), target)
    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, source, 'utf-8')
    console.log(pc.green(`\n  ✓ Exported ${seeds.length} seed(s) → ${target}\n`))
  } catch (error) {
    exitWithError(error)
  }
}
```

## TASK 8 — `packages/cli/src/commands/schema-diff.ts` (rewrite)

The whole file is replaced. The deprecation notice goes away; `SchemaDiffOptions` loses `write`,
`name`, `migrationsDir` and `registry` (all of which were accepted and ignored) and gains `manifest`.

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import pc from 'picocolors'
import { createD1Context, exitWithError, loadLiveSeeds } from '../lib/d1-context.js'
import { DEFAULT_MANIFEST_PATH, loadManifest } from '../lib/manifest-loader.js'
import { compareManifest, renderManifestDrift } from '../lib/manifest-compare.js'
import { diffSeed, isSeedClean, renderSeedDiff } from '../lib/schema-diff.js'

export interface SchemaDiffOptions {
  /** Manifest to compare against. Default: `beech.schema.ts`, skipped when absent. */
  manifest?: string
  /** Target local D1 SQLite state (default: true). */
  local?: boolean
  /** Override the D1 database name. */
  db?: string
}

/**
 * Reports schema drift on two independent axes:
 *
 *  1. MANIFEST vs DEPLOYED DEFINITIONS — "is my snapshot stale, or does my authored manifest
 *     disagree with what is deployed?" Skipped when no manifest file exists.
 *  2. DEPLOYED DEFINITIONS vs PHYSICAL TABLES — "does `content_{slug}` actually match the
 *     definition the engine believes?" This is a fault report: the engine applies DDL on save, so
 *     divergence here means a failed or partial apply, not an authoring choice.
 *
 * Exits non-zero when either axis reports drift, so CI can gate on it. Nothing is written and no
 * DDL is emitted — reconciliation is `beech schema plan` / `beech schema apply`.
 */
export async function schemaDiff(args: SchemaDiffOptions = {}): Promise<void> {
  try {
    const context = createD1Context(args)
    const liveSeeds = await loadLiveSeeds(context)

    const manifestPath = args.manifest ?? DEFAULT_MANIFEST_PATH
    let manifestDrifted = false

    console.log(pc.cyan(`\n  Manifest vs deployed definitions (${context.options.db})\n`))
    if (existsSync(resolve(process.cwd(), manifestPath))) {
      const manifest = await loadManifest(manifestPath)
      const drift = compareManifest(manifest, liveSeeds)
      renderManifestDrift(drift, manifestPath)
      manifestDrifted = !drift.inSync
    } else {
      console.log(pc.dim(`  ⊘ no ${manifestPath} — run \`beech schema export\` to create one`))
    }

    console.log(pc.cyan('\n  Deployed definitions vs physical tables\n'))
    let physicalDrifted = false
    for (const seed of liveSeeds) {
      // Sequential on purpose: `queryD1` is a synchronous shell/SQLite call behind a Promise, and
      // fanning it out buys nothing while making the report order non-deterministic.
      const diff = await diffSeed(seed, context.executor)
      renderSeedDiff(diff)
      if (!isSeedClean(diff)) physicalDrifted = true
    }

    console.log('')
    if (manifestDrifted || physicalDrifted) {
      console.log(pc.yellow('  ⚠ Schema drift detected.\n'))
      process.exit(1)
    }
    console.log(pc.green('  ✓ No drift.\n'))
  } catch (error) {
    exitWithError(error)
  }
}
```

## TASK 9 — `packages/cli/src/commands/generate-types.ts` (rewrite)

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import pc from 'picocolors'
import { computeSchemaFingerprint, generateSeedTypes } from '@beechcms/core'
import { createD1Context, exitWithError, loadLiveSeeds } from '../lib/d1-context.js'

/** Where `beech types generate` writes when no destination is given. */
export const DEFAULT_TYPES_PATH = 'beech.generated.ts'

export interface GenerateTypesOptions {
  /** Output destination. `null` writes to standard output. Default: `beech.generated.ts`. */
  out?: string | null
  /** Target local D1 SQLite state (default: true). Set false for remote D1. */
  local?: boolean
  /** Override the D1 database name. */
  db?: string
}

/**
 * Emits `SeedRegistryTypes` plus the schema fingerprint from LIVE D1 state.
 *
 * Both artifacts derive from `introspectSeedDefinitions`, never from `beech.schema.ts`: a manifest
 * file may legitimately be ahead of or behind what is deployed, and types that are ahead of the
 * database are exactly the silent shape mismatch this chain exists to eliminate (feature brief,
 * business rule 1).
 */
export async function generateTypes(args: GenerateTypesOptions = {}): Promise<void> {
  try {
    const context = createD1Context(args)
    const seeds = await loadLiveSeeds(context)

    const fingerprint = await computeSchemaFingerprint(seeds)
    const code = generateSeedTypes(seeds, { fingerprint })

    if (args.out === null) {
      process.stdout.write(code)
      return
    }

    const target = args.out ?? DEFAULT_TYPES_PATH
    const outPath = resolve(process.cwd(), target)
    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, code, 'utf-8')
    console.log(
      pc.green(`\n  ✓ Generated ${seeds.length} interface(s) → ${target}`) +
      pc.gray(`\n    schema fingerprint ${fingerprint}\n`)
    )
  } catch (error) {
    exitWithError(error)
  }
}
```

**Behavioural note:** the legacy aliases (`gen-types`, `gen:types`, `generate:types`,
`gen types typescript`) keep writing to stdout, because `bin/cli.mjs` passes `out: null` for them
when no `-o` is given (TASK 11). Only the new `beech types generate` defaults to a file. The old
`process.exit(1)` error paths are preserved in behaviour by `exitWithError`.

## TASK 10 — `packages/cli/src/index.ts` (barrel)

Replace the `schemaDiff` block with:

```ts
export { schemaDiff } from './commands/schema-diff.js'
export type { SchemaDiffOptions } from './commands/schema-diff.js'
export { schemaExport } from './commands/schema-export.js'
export type { SchemaExportOptions } from './commands/schema-export.js'
```

`generateTypes` / `GenerateTypesOptions` keep their existing export lines.

## TASK 11 — `bin/cli.mjs`

**a.** Add `'types'` to the prefix-join list at L8:

```js
if (command && args[0] && ['db', 'seed', 'schema', 'types', 'dev', 'generate', 'mailpit'].includes(command)) {
```

**b.** `COMMANDS` entries (keep `'gen-types'`, `'gen:types'`, `'generate:types'` exactly as they are):

```js
  'schema:diff':    cmdSchemaDiff,
  'schema:export':  cmdSchemaExport,
  'types:generate': cmdGenerateTypes,
```

**c.** Handlers — `cmdSchemaDiff` is rewritten, `cmdSchemaExport` is new, `cmdGenerateTypes` gains
the default-destination split:

```js
async function cmdSchemaDiff(args) {
  const remote      = args.includes('--remote')
  const manifestIdx = args.indexOf('--manifest')
  const manifest    = manifestIdx !== -1 ? args[manifestIdx + 1] : undefined
  const dbIdx       = args.indexOf('--db')
  const db          = dbIdx !== -1 ? args[dbIdx + 1] : undefined
  const { schemaDiff } = await import('@beechcms/cli')
  await schemaDiff({ local: !remote, manifest, db })
}

async function cmdSchemaExport(args) {
  const remote  = args.includes('--remote')
  const stdout  = args.includes('--stdout')
  const outIdx  = args.indexOf('--out')
  const oIdx    = args.indexOf('-o')
  const out     = stdout ? null
    : outIdx !== -1 ? args[outIdx + 1]
    : oIdx !== -1 ? args[oIdx + 1]
    : undefined
  const dbIdx = args.indexOf('--db')
  const db    = dbIdx !== -1 ? args[dbIdx + 1] : undefined
  const { schemaExport } = await import('@beechcms/cli')
  await schemaExport({ out, local: !remote, db })
}
```

In `cmdGenerateTypes`, keep the existing `--out` / `--output` / `-o` parsing and replace the final
call so the legacy aliases stay stdout-first while `types generate` defaults to a file:

```js
  // `beech types generate` writes beech.generated.ts; the historical `gen-types` aliases keep
  // their stdout default, so no existing script changes behaviour.
  const isTypesGenerate = command === 'types:generate'
  const destination = out ?? (isTypesGenerate ? undefined : null)

  const { generateTypes } = await import('@beechcms/cli')
  await generateTypes({ out: destination, local, db })
```

(`command` is already in module scope at L6.)

**d.** Help text — extend section 3 and add the two schema lines:

```js
    ${pc.cyan('types generate')} (aliases: ${pc.cyan('gen-types')}, ${pc.cyan('gen types typescript')})
      Generate TypeScript interfaces + schema fingerprint from live D1
      --local / --remote   Target local SQLite state (default) or remote D1
      --db <name>          Override D1 database name
      -o, --output <file>  Output path (default: beech.generated.ts; aliases print to stdout)
    ${pc.cyan('schema export')}   Write beech.schema.ts from live D1 state
      --out <file>    Destination (default: beech.schema.ts)
      --stdout        Print instead of writing
      --remote        Target remote D1
    ${pc.cyan('schema diff')}     Report manifest-vs-deployed and definition-vs-table drift
      --manifest <f>  Manifest path (default: beech.schema.ts)
      --remote        Target remote D1
      Exits 1 when drift is found.
```

## TASK 12 — `docs/build/cli-workflows.md`

Required, not cosmetic: `cli-docs-parity.test.ts` asserts the literal string `beech <command>`
appears for every `COMMANDS` key.

**a.** Command matrix — replace the deprecated `schema:diff` row and add two rows:

```md
| `npx beech schema export` | Consumer | Writes `beech.schema.ts` — a reviewable snapshot of the live D1 schema. | `--out <file>`, `--stdout`, `--remote`, `--db <name>` |
| `npx beech schema diff` | Consumer | Reports manifest-vs-deployed drift and definition-vs-physical-table drift. Exits 1 on drift. | `--manifest <file>`, `--remote`, `--db <name>` |
| `npx beech types generate` | Consumer | Generates `beech.generated.ts` (`SeedRegistryTypes` + `SCHEMA_FINGERPRINT`) from live D1. | `--remote`, `-o`/`--output <file>`, `--db <name>` (aliases: `gen types typescript`, `gen-types`, `gen:types`, `generate:types` — these print to stdout by default) |
```

**b.** §6 "Schema Evolution & GitOps Migrations" — the `> [!IMPORTANT]` block currently states that
`beech schema:diff` is deprecated. Replace that sentence with: `beech schema export` and
`beech schema diff` read live D1 through `@beechcms/core`'s introspection primitive; D1 remains the
sole runtime authority, the Worker never imports `beech.schema.ts`, and no deploy applies it.
`beech seed:load` / `beech seed:create` stay deprecated. State plainly that **applying** a manifest
(`beech schema plan` / `apply`) is not shipped yet and that manifest reconciliation today goes
through the MCP plan/apply tools.

**c.** §3 "TypeScript Type Generation" — document that `beech types generate` writes
`beech.generated.ts` including `SCHEMA_FINGERPRINT`, and that the fingerprint is what a future
`@beechcms/client` compares against the API's `X-Schema-Revision` header.

## TASK 13 — Tests

All new files are **unit tier** (`testing_conventions.md` §0): no D1, no network, no filesystem. The
faked boundaries are `../lib/wrangler.js` (via `vi.mock`, the idiom in `d1-executor.test.ts:6`) and
`node:fs`. SPDX header: MIT in `packages/core` and `packages/cli` (matches both packages' existing
files). No `any`, no `.only`, no `.skip`, four zones, one act, named act result.

**13a. `packages/core/src/schema/emit.test.ts`** — `describe('emitManifestModule', …)`

- `it('embeds the seeds as a canonical JSON literal a JSON parser reads back unchanged', …)` —
  extract the text between the first `defineSchema(` and the final `)`, `JSON.parse` it, `toEqual`
  `{ seeds: [...] }`.
- `it('sorts seeds by slug so two exports of the same schema are byte-identical', …)` — emit the
  same seeds in two authoring orders, compare the two strings with `toBe`.
- `it('imports defineSchema from the authoring subpath, not from the package root', …)` — regression
  guard: a root import would pull the Worker entry into a user's manifest.
  Assert `toContain("from '@beechcms/core/schema'")`.
- `it('omits the manifest version from the defineSchema argument, which the DSL supplies itself', …)`
  — the parsed literal has no `version` key (an excess property would break the consumer's build).
- `it('propagates the canonical serializer error for a value that cannot round-trip', …)` — a seed
  carrying a function; assert the error class identity, never the message copy.

**13b. `packages/core/src/engine/seed-types-generator.test.ts`** — extend, do not rewrite. Add to the
existing `describe('generateSeedTypes', …)`:

- `it('embeds the fingerprint as an exported constant when one is given', …)` —
  `toContain("export const SCHEMA_FINGERPRINT = 'v1:…'")`.
- `it('emits no fingerprint constant when the option is omitted, keeping legacy output identical', …)`
  — compare against the output the pre-existing cases assert; `not.toContain('SCHEMA_FINGERPRINT')`.
- `it('refuses a fingerprint that is not the v{n}:{32 hex} form', …)` —
  `expect(() => generateSeedTypes(seeds, { fingerprint: "x'; drop" })).toThrow()`; the guard exists
  because the value is interpolated into emitted source.

**13c. `packages/cli/src/test/manifest-compare.test.ts`** — `describe('compareManifest', …)`

- `it('reports in_sync when the manifest and the deployed definition canonicalize identically', …)`
- `it('ignores branch ids, which a hand-authored manifest never carries', …)` — the regression guard:
  without it every authored manifest would read as `differs`.
- `it('ignores an omitted boolean flag that the deployed definition spells out as false', …)` —
  matrix over `allowDrafts` / `requiredOnCreate` / `multiple` (Rule 1.6: one cause, one arrangement).
- `it('ignores seed ordering on both sides', …)`
- `it('reports differs when a branch alias, type or label changes', …)` — labels ARE manifest
  content (unlike the fingerprint projection, which excludes them); state that in a comment.
- `it('reports only_in_manifest for an authored seed that is not deployed', …)`
- `it('reports only_in_database for a deployed seed the manifest does not describe', …)`
- `it('sets inSync false when any seed drifts', …)`

**13d. `packages/cli/src/test/manifest-loader.test.ts`** — `describe('interpretManifestModule', …)`
(pure function only; `loadManifest`'s I/O is exercised by the command suites and by hand)

- `it('returns the manifest unchanged for a valid default export', …)`
- `it('rejects a module with no default export', …)` — assert `ManifestLoadError` identity.
- `it('rejects a manifest declaring an unsupported version', …)`
- `it('rejects a manifest whose seeds fail whole-set validation and carries the issues', …)` — e.g. a
  relation branch pointing at a seed nobody declares; assert `error.issues` is non-empty, never the
  message text (Rule 5.4).

**13e. `packages/cli/src/test/schema-export.test.ts`** — `describe('schemaExport', …)`

```ts
vi.mock('../lib/wrangler.js', () => ({
  queryD1: vi.fn(),
  findWranglerConfig: vi.fn(() => '/fake/wrangler.jsonc'),
  resolveDbName: vi.fn(() => 'beech-db'),
  getLocalD1SqlitePath: vi.fn(() => '/fake/state.sqlite'),
}))
vi.mock('node:fs', () => ({ writeFileSync: vi.fn(), mkdirSync: vi.fn(), existsSync: vi.fn(() => true) }))
```

- `it('writes beech.schema.ts containing every active seed', …)` — assert the `writeFileSync` path
  argument ends with `beech.schema.ts` and the written source contains the slug.
- `it('writes nothing and exits non-zero when the seeds table is missing', …)` — make `queryD1`
  throw `new Error('no such table: seeds')`; stub `process.exit` with a throwing implementation and
  assert `writeFileSync` was never called (Rule 5.6: a rejection is proven by what did not happen).

**13f. `packages/cli/src/test/schema-diff.test.ts`** — the existing `nextMigrationIndex` and
`buildMigrationSql` blocks stay **byte-identical** (they cover `migration-writer.ts`, untouched this
sprint). Replace only `describe('schemaDiff command')`:

- `it('reports physical drift and exits non-zero', …)` — a live seed whose `PRAGMA table_info`
  answer is missing a column.
- `it('exits zero when definitions, tables and manifest all agree', …)`
- `it('skips the manifest section when no beech.schema.ts exists', …)` — `existsSync` mocked false;
  assert the run still completes and reports the physical axis.

**13g. `packages/cli/src/test/generate-types.test.ts`** — update:

- switch the boundary fake from `vi.spyOn(wrangler, …)` to the `vi.mock('../lib/wrangler.js', …)`
  form (the command now reaches `queryD1` indirectly through `createWranglerExecutor`, and a
  namespace spy is not guaranteed to intercept another module's import binding);
- keep the existing "writes the file / creates nested directories" coverage;
- add `it('embeds a v1 schema fingerprint in the generated module', …)` —
  `toMatch(/export const SCHEMA_FINGERPRINT = 'v1:[0-9a-f]{32}'/)`;
- add `it('writes to stdout when out is null', …)` if the current suite does not already cover it.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run from the repo root. Core must build **before** the CLI typechecks: `@beechcms/core/schema`
resolves through the package `exports` map to `dist/schema/index.d.ts`.

```bash
# 1. Core: build, typecheck, unit tests.
pnpm --filter @beechcms/core build
pnpm --filter @beechcms/core type-check
pnpm --filter @beechcms/core test

# 2. CLI: `build` runs `tsc --noEmit` before esbuild, so this is the CLI type gate too.
pnpm --filter @beechcms/cli build
pnpm --filter @beechcms/cli test

# 3. API must still compile against @beechcms/core (the schema subpath grew by one module).
pnpm --filter @beechcms/api exec tsc --noEmit

# 4. Whole-workspace gates.
pnpm beech test --diff
pnpm lint

# 5. Architectural regression: the Worker graph must still have no path into the CLI executor.
graphify update . --force
graphify path "createBeechApp" "queryD1"      # expected: "No directed path found"
```

Manual smoke check against real local D1 (this sprint ships user-visible commands, so it is expected
rather than optional):

```bash
pnpm beech db:migrate

# a. types + fingerprint
pnpm beech types generate
grep -n "SCHEMA_FINGERPRINT" beech.generated.ts      # expect: v1:<32 hex>
grep -n "SeedRegistryTypes" beech.generated.ts

# b. export, then diff against what was just exported → clean, exit 0
pnpm beech schema export
pnpm beech schema diff ; echo "exit=$?"              # expect: no drift, exit=0

# c. edit the manifest (change a label), diff again → drift, exit 1
pnpm beech schema diff ; echo "exit=$?"              # expect: ≠ <slug>, exit=1

# d. exports are deterministic
pnpm beech schema export --stdout > /tmp/a.ts
pnpm beech schema export --stdout > /tmp/b.ts
diff /tmp/a.ts /tmp/b.ts                             # expect: no output

# e. the emitted manifest typechecks in the consumer's project
npx tsc --noEmit beech.schema.ts                     # requires Node ≥ 22.18 only for `schema diff`

rm -f beech.schema.ts beech.generated.ts             # do not commit the smoke artifacts
```

Record the outcome of the smoke run in the execution log. If any step is skipped, say which and why;
the vitest suites remain the binding gate.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

**Architecture**

- [ ] No file under `apps/api/` or `apps/dashboard/` is modified; no migration is added.
- [ ] The sprint performs **zero D1 writes**: no DDL, no `INSERT`/`UPDATE`/`DELETE`, no
      `seeds.source` write anywhere in the diff.
- [ ] `packages/cli` issues **no SQL of its own**: every D1 read goes through
      `introspectSeedDefinitions` / `introspectTable` driven by `createWranglerExecutor`. The old
      `SELECT slug, definition FROM seeds …` literal is gone from `generate-types.ts`.
- [ ] `packages/cli/src/lib/wrangler.ts`, `d1-executor.ts`, `schema-diff.ts` and
      `migration-writer.ts` are **unchanged**.
- [ ] `packages/core/src/index.ts` is unchanged — `emit.ts` is reachable only through `./schema`.
- [ ] `packages/core/package.json` and `packages/cli/package.json` `dependencies` are unchanged
      (no bundler, no transpiler, no HTTP client added).
- [ ] `graphify path "createBeechApp" "queryD1"` still reports no directed path after
      `graphify update . --force`.

**Manifest export**

- [ ] `emitManifestModule` output is deterministic: the same seeds in any order produce identical
      bytes.
- [ ] The emitted module imports `defineSchema` from `@beechcms/core/schema` and default-exports
      `defineSchema({ seeds: [...] })` with **no** `version` key in the argument.
- [ ] The embedded literal is produced by the frozen canonical serializer — no second stringifier,
      no `defineField.*` call-tree emitter.
- [ ] `beech schema export` reads live D1 and never reads an existing `beech.schema.ts`.

**Manifest diff**

- [ ] A manifest exported from a database and immediately diffed against it reports `in_sync` for
      every seed and exits 0.
- [ ] Branch `id`, `layout`, and omitted-vs-explicit `false` flags never produce drift.
- [ ] An alias, type or label change **does** produce `differs`.
- [ ] The physical axis calls `diffSeed` per live seed and renders it with `renderSeedDiff`,
      unchanged in shape.
- [ ] The command exits 1 when either axis drifts and 0 when neither does; it writes no file and
      emits no DDL.
- [ ] A missing `beech.schema.ts` is a skipped section, not an error.

**Type generation**

- [ ] `beech types generate` writes `beech.generated.ts` by default; `gen-types` / `gen:types` /
      `generate:types` / `gen types typescript` still print to stdout when no `-o` is given.
- [ ] The generated module exports `SeedRegistryTypes` **and** `SCHEMA_FINGERPRINT` matching
      `/^v1:[0-9a-f]{32}$/`.
- [ ] The fingerprint is computed from `Seed[]` read live out of D1, never from a manifest file.
- [ ] `generateSeedTypes(seeds)` called with one argument emits byte-identical output to the
      pre-sprint build.
- [ ] `generateSeedTypes` throws rather than interpolating a fingerprint that is not the
      `v{n}:{32 hex} `form.

**CLI surface**

- [ ] `beech schema export`, `beech schema diff` and `beech types generate` are registered in
      `bin/cli.mjs` and appear in `beech --help`.
- [ ] `docs/build/cli-workflows.md` documents all three, and
      `packages/cli/src/test/cli-docs-parity.test.ts` passes.
- [ ] `beech schema:diff` no longer prints a deprecation notice; `seed:load` and `seed:create` still
      do (untouched).
- [ ] A manifest that cannot be loaded because Node lacks type stripping produces an actionable
      message naming Node ≥ 22.18, not a raw `ERR_UNKNOWN_FILE_EXTENSION`. `engines.node` in the
      root `package.json` is unchanged.

**Typing**

- [ ] No `any` in production code or tests (`testing_conventions.md` §7.1).
- [ ] Every exported symbol added this sprint carries a doc comment stating *why*, not *what*.
- [ ] `ManifestLoadError` and `CliError` are thrown as classes and asserted by identity in tests.

**Tests**

- [ ] New test files are unit tier, live in `packages/core/src/**` (colocated) or
      `packages/cli/src/test/`, carry the MIT SPDX header, and follow §1–§6 of
      `testing_conventions.md` (subject-named `describe`, outcome-stating `it` without "should",
      four zones, one act, named act result).
- [ ] No test touches real D1, the network, or the real filesystem; `node:fs` and `../lib/wrangler.js`
      are the mocked boundaries.
- [ ] The `nextMigrationIndex` / `buildMigrationSql` blocks inside
      `packages/cli/src/test/schema-diff.test.ts` are byte-identical to today's.
- [ ] Every test passes in isolation (`vitest run -t '<name>'`); no `it.only`, no `it.skip`.

**Build**

- [ ] `pnpm --filter @beechcms/core build`, `pnpm --filter @beechcms/cli build`,
      `pnpm --filter @beechcms/api exec tsc --noEmit` all pass.
- [ ] `pnpm beech test --diff` and `pnpm lint` pass.
- [ ] `packages/cli` coverage thresholds (50%) still hold.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executing agent MUST NOT build any of the following.

1. **`beech schema plan` and `beech schema apply`**, in any form — including a "dry-run only"
   preview that calls `POST /api/seeds/:slug/mcp-plan`. → ROADMAP sprint 3b `CliSchemaPlanApply`.
2. **Any authenticated HTTP client in `packages/cli`**, any OAuth flow, any credential store, any
   dependency on `@beechcms/mcp`. The auth mechanism is sprint 3b's first design decision and must
   not be pre-empted by a throwaway one here. → ROADMAP sprint 3b.
3. **Any change under `apps/api/`**, in particular `seeds.mcp.ts`'s hardcoded `source: 'runtime'`
   (L275) and anything touching `source = 'code'` ownership. → ROADMAP sprint 3b and the
   `ROADMAP.md` standing decision that ownership never transfers implicitly.
4. **Emitting or executing DDL from the CLI.** `lib/migration-writer.ts` stays uncalled and
   unmodified; `beech schema diff` gains no `--write` flag. Raw SQL authored by the CLI is a
   Botanical Invariant violation regardless of how convenient it looks.
5. **The `X-Schema-Revision` response header and `include=` relation expansion.**
   → ROADMAP sprint 4 `PublicApiRelationExpansion`.
6. **Any change to `packages/client/`** — no fluent builder, no runtime fingerprint comparison, no
   `.list({ validate: true })`. → ROADMAP sprints 5 and 6.
7. **Changing the canonical byte format, the fingerprint algorithm, or its contract projection.**
   Frozen in sprints 1 and 2; a change is a `MANIFEST_VERSION` / `SCHEMA_FINGERPRINT_VERSION` event
   with its own brief.
8. **A `defineField.*` call-tree emitter, a manifest pretty-printer, or a formatter dependency**
   (prettier, esbuild, ts-morph). Rejected in the VETO Audit.
9. **Caching or memoizing introspection results** inside the executor, the primitive or the
   commands. A stale read becomes a wrong fingerprint in someone else's published client.
10. **Bumping `engines.node`**, adding a transpiler fallback for manifest loading, or adding a
    `--watch` / `--json` mode to any of the three commands.
11. **Touching `packages/core/src/engine/ddl.ts`, `seed-ddl.ts`, `seed-registry.ts`,
    `introspection.ts` or `schema-fingerprint.ts`.** They are consumed exactly as sprints 1 and 2
    shipped them.
12. **Reviving `beech seed:load` / `beech seed:create`.** They stay deprecation notices.
