# Sprint: SchemaManifestDsl (#381)

### Pre-Computation Analysis

**a) God Nodes identified via the graphify CLI**

| Node | Degree | Why it matters here |
|------|--------|---------------------|
| `core/src/index.ts` (`packages_core_src_index`) | **81** | The single barrel every package imports `@beechcms/core` through. `graphify explain "core/src/index.ts"` shows it re-exporting `engine/types.ts` (L14), `seed-validation.ts` (L80), `seed-ddl.ts` (L81), `seed-types-generator.ts` (L83), `define-seed.ts` (L16). Adding the manifest DSL to this barrel would pull Node-flavoured authoring code into the Worker bundle — this sprint therefore ships it as a **separate subpath export**, not through the god node. |
| `seeds.helpers.ts` (`apps_api_src_features_seeds_seeds_helpers`) | **26** | The seeds-slice chokepoint. `graphify explain "seeds.helpers.ts"` shows inbound edges from `seeds.handler.ts` (re_exports L321), `seeds.destructive.ts` (imports_from L18), `seeds.mcp.ts` (imports_from L17) and `setup/index.ts` (imports_from L11). It `contains` `getActiveSeed()`, `validateAndApplySeedDef()`, `applyDestructiveSeedDef()`. Every dashboard mutation route already funnels through it — so the ownership guard needs exactly ONE new function there, not seven scattered checks. |

**b) Architectural boundaries affected**

- `@beechcms/core` — **new** `src/schema/` module (pure data + pure functions, zero I/O, zero Worker
  imports), reachable only via the new `@beechcms/core/schema` subpath. Reads existing types
  (`Seed`, `Branch`) and existing pure helpers (`validateSeedDefinitions`, `nextBranchId`). Writes
  nothing, touches no D1.
- `apps/api` — **seeds slice only** (`src/features/seeds/`). One new exported guard in
  `seeds.helpers.ts`, called from `seeds.handler.ts` (3 routes) and `seeds.destructive.ts`
  (4 routes). No new route, no new middleware, no change to the middleware registration order.
- `apps/dashboard` — **untouched**. The dashboard learns about manifest ownership from the 409
  Problem Details response it already knows how to render; no client change is in scope.

**c) `graphify affected` impact analysis (proof of breaking-change check)**

```
$ graphify affected "getActiveSeed" --depth 2
Affected nodes for getActiveSeed()
- seeds.destructive.ts   [imports]      apps/api/src/features/seeds/seeds.destructive.ts:L18
- seeds.handler.ts       [imports]      apps/api/src/features/seeds/seeds.handler.ts:L22
- seeds/index.ts         [re_exports]   apps/api/src/features/seeds/index.ts:L5
- seeds.test.ts          [imports_from] apps/api/src/features/seeds/seeds.test.ts:L8

$ graphify affected "validateSeedDefinitions" --depth 2
Affected nodes for validateSeedDefinitions()
- isSeedSetValid()          [calls]   packages/core/src/engine/seed-validation.ts:L351
- seed-validation.test.ts   [imports] packages/core/src/engine/seed-validation.test.ts:L5

$ graphify affected "generateSeedTypes" --depth 2
Affected nodes for generateSeedTypes()
- seed-types-generator.test.ts [imports] packages/core/src/engine/seed-types-generator.test.ts:L6

$ graphify explain "defineSeed"
Node: defineSeed()   Source: packages/core/src/engine/define-seed.ts L6   Degree: 1
Connections (1):  <-- define-seed.ts [contains]
```

Reading of the impact analysis:

1. The guard's blast radius is fully contained in the seeds slice plus its own test file. Nothing
   outside `apps/api/src/features/seeds/` consumes `getActiveSeed`.
2. `validateSeedDefinitions` is consumed only inside core and by its own test **in the AST graph** —
   but grep shows it is ALSO called from `apps/api/src/features/seeds/seeds.helpers.ts:L110` and
   `seeds.mcp.ts:L147,L233`. This sprint therefore **does not modify its signature or behaviour**; it
   only calls it.
3. `graphify explain "defineSeed"` reports degree 1 — i.e. the AST graph believes nothing imports it.
   **That reading is wrong and was corrected by direct grep**: `defineSeed` is used by
   `@beechcms/testing` canonical seeds and by `docs/features/drafts.md` / `docs/testing.md`. The
   existing identity-passthrough `defineSeed` in `packages/core/src/engine/define-seed.ts` is
   therefore **left exactly as it is** — turning it into a throwing validator would break the canonical
   test seeds that the whole harness effort is built on. The manifest-flavoured `defineSeed` is a new,
   separate symbol living behind the `@beechcms/core/schema` subpath.

---

### VETO Audit

Proposed boundaries evaluated against `_config/ponytail_arch.md`.

**Rule 2 — THE BOTANICAL INVARIANT (no bypass of `@beechcms/core`, no hardcoded field names,
Branch IDs `br_XX`).**
PASS. The new module performs **zero** database interaction — it is pure data transformation, and the
sprint ships no code path that can reach D1. Manifest-driven mutation is deliberately deferred to
sprint 3, where it goes through the existing MCP control plane (`POST /api/seeds/:slug/mcp-plan` and
`mcp-apply`), which already plans DDL via `planCreateSeed` / `planExtendSeed` from the engine. No
field name is hardcoded anywhere in the manifest module: fields are addressed by `Branch.alias` for
authoring ergonomics and carry `Branch.id` (`^br_[A-Za-z0-9]+$`) as their stable identity, assigned
through the existing `nextBranchId` helper — never invented by this module.

*Adjustment forced by this audit:* the manifest allows `id` to be **omitted** at authoring time
(nobody hand-writes `br_07`). `manifestToSeeds()` fills the gaps with `nextBranchId` so validation has
a complete `Seed[]` to chew on. Those fill-in ids are **authoring-local and non-authoritative**: the
real, rename-surviving assignment happens at plan/apply time, where `normalizeCandidate()`
(`seeds.mcp.ts:L25`) preserves the stored id by alias match before minting a new one. This is stated
in Task Details so sprint 3 cannot get it wrong.

**Rule 3 — VSA ENFORCEMENT (no cross-feature imports).**
PASS. All `apps/api` changes live inside `src/features/seeds/`. The guard is added to
`seeds.helpers.ts`, which `seeds.handler.ts` and `seeds.destructive.ts` already import — an
intra-slice import, not a cross-slice one. `apps/api/src/features/setup/index.ts` imports
`validateAndApplySeedDef` from the seeds slice today; that edge is pre-existing and is **not touched**
(setup creates seeds, and creation is never blocked by the guard — the guard only fires on an
EXISTING `source = 'code'` row). The shared logic that both the CLI and the API will need (canonical
serialization, manifest validation) is placed in `@beechcms/core`, exactly as the rule mandates —
never duplicated per consumer.

**Rule 4 — CLOUDFLARE PURITY (edge-native, no heavy ORM, no non-deterministic schema changes).**
PASS. No new dependency of any kind: the module uses plain TypeScript. `zod@4.3.6` is already a core
dependency and is deliberately **not** used here — canonical serializability is enforced by an
explicit walker that names the offending path, which produces a far better authoring error than a
zod union failure. Nothing in this sprint emits SQL, so the deterministic-migration rule is not
engaged.

*Adjustment forced by this audit:* the manifest module must not enter the Worker bundle. Hence the
`./schema` subpath export instead of adding it to the `core/src/index.ts` god node.

**Rule 1 / Rule 5 — RUTHLESS VETO, MINIMALIST BLUEPRINT.**
Two candidate scope items were cut here rather than downstream:

- `defineGroup()` is kept, but reduced to an **author-time macro**: it returns a plain
  `{ name, branches }` bundle that `defineSeed()` splices into `branches`. It creates no persisted
  concept, no D1 shape, no new registry, and leaves **zero trace** in canonical JSON. Anything more
  would be a second grouping mechanism competing with `DashboardSeedConfig.group` and `Seed.layout`.
- A manifest-level `layout` field is **rejected**. `Seed.layout` is typed `unknown`, is populated
  server-side by `GET /api/schema`, and is not a schema concern. Round-tripping it through the
  manifest would make `beech schema diff` report permanent false drift.

No VSA violation and no Botanical bypass survives into the plan. Drafting proceeds.

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

This sprint exists first because **everything downstream in the #381→#385 chain is defined in terms
of a canonical schema shape that does not exist yet.**

Sprint 2 computes a schema fingerprint. Sprint 3 embeds that fingerprint in published client types.
Sprint 4 returns it on every Public API response. Sprint 5 makes an external consumer's client trust
or reject a payload based on comparing the two. That fingerprint is only meaningful if the bytes it
hashes are produced deterministically and identically by every producer. If the canonical
serialization lands after the fingerprint, the first correction to it silently invalidates every
client already published to npm — precisely the drift failure this whole feature exists to kill. The
canonical form must be frozen before anything hashes it.

The second reason is ownership. `seeds.source` (`apps/api/migrations/0000_v040_base.sql:296`) exists,
is constrained to `('code','runtime')`, is read back by `D1SeedRepository.listAll/get`, and is
**written as `'runtime'` by every path in the codebase**: `validateAndApplySeedDef`
(`seeds.helpers.ts:L139`), `mcp-apply` (`seeds.mcp.ts:L275`), and the repository's own default
(`seed.repository.d1.ts:L71,L106`). Nothing produces a `'code'` seed today. Sprint 3 will. The moment
it does, a manifest-owned seed becomes editable from the dashboard, and `beech schema diff` — the
signal the entire manifest workflow rests on — starts chasing drift it can never explain. The guard
must exist **before** its first producer, not alongside it, so that sprint 3 lands into a surface that
is already closed.

**VSA adherence.** The manifest DSL is shared logic consumed by two future callers (the CLI in
sprint 3, the API in sprint 4's fingerprint header), so by Rule 3 it belongs in `@beechcms/core`, not
in either consumer. The API-side change is a single guard inside the seeds slice, called from the two
route files that already import that slice's helpers — no new cross-feature edge is created.

**Botanical Engine adherence.** The module is pure and I/O-free. It hands `Seed[]` to the existing
engine and never reaches past it: the manifest can describe a schema, but only `planCreateSeed` /
`planExtendSeed` can turn a description into DDL, and only in a later sprint. Field identity stays on
`Branch.id` (`br_XX`) throughout; alias is treated as a renameable label, never as identity.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**`@beechcms/core` — engine surface (all re-exported through the `core/src/index.ts` god node)**

| Symbol | File | State |
|--------|------|-------|
| `Seed`, `Branch`, `BranchType`, `DashboardSeedConfig` | `src/engine/types.ts` | Complete. `Branch.id` is **required**; `Seed.layout` is `unknown` and populated server-side. |
| `defineSeed(seed: Seed): Seed` | `src/engine/define-seed.ts:L6` | Identity passthrough, no validation. **Used by `@beechcms/testing` canonical seeds and by docs** — not dead code, despite graphify degree 1. |
| `validateSeedDefinitions(seeds: Seed[]): SeedValidationIssue[]` | `src/engine/seed-validation.ts:L41` | Complete, whole-set. Fatals on invalid/duplicate `Branch.id` (L116-123, regex `^br_[A-Za-z0-9]+$` at L10), invalid alias, system-column aliases, invalid `displayNameAlias`, invalid slug, and cross-seed relation targets. **Cannot validate a single seed in isolation** — relation targets need the full set. |
| `nextBranchId(seed: Pick<Seed,'branches'>): string` | `src/engine/seed-registry.ts:L122` | Returns `br_NN`, zero-padded to 2, max+1 over existing ids. |
| `planCreateSeed` / `planExtendSeed` / `planFtsRebuild` | `src/engine/seed-ddl.ts` | Complete. The only sanctioned DDL producers. |
| `generateSeedTypes(seeds): string` | `src/engine/seed-types-generator.ts:L96` | Already emits `BeechDatabase` + `export type SeedRegistryTypes = BeechDatabase`. **No fingerprint** in the header (`HEADER`, L6). Sprint 3's problem, not this one. |
| `getExpectedColumns(seed)` | `src/engine/ddl.ts` | Derives expected columns from Seed **code**. A separate, narrower concern from D1 introspection. |

`packages/core/package.json` declares exactly three exports today: `.`, `./richtext-render`,
`./webhook-crypto`. `tsconfig.json` has `rootDir: "src"`, `outDir: "dist"`, `include: ["src/**/*"]`,
so any new `src/schema/**` compiles to `dist/schema/**` with no build change. `zod@4.3.6` is already a
dependency.

**`apps/api` — seeds slice (`src/features/seeds/`)**

Route composition in `seeds.handler.ts`:

```
seedsApp.use('*', requireAdmin-gate)          // L39-43  — admin-only for the whole slice
seedsApp.route('/', destructiveApp)           // L48
seedsApp.route('/', mcpApp)                   // L49
```

Mutation routes and their current owner-blind behaviour:

| Route | File:line | Reads existing seed via |
|-------|-----------|-------------------------|
| `POST   /api/seeds` | `seeds.handler.ts:L107` | `repo.get(slug)` — **creation, guard must NOT fire** |
| `PUT    /api/seeds/:slug` | `seeds.handler.ts:L167` | `getActiveSeed` (L173) |
| `POST   /api/seeds/:slug/branches` | `seeds.handler.ts:L202` | `getActiveSeed` (L208) |
| `DELETE /api/seeds/:slug` | `seeds.handler.ts:L235` | `getActiveSeed` (L239) |
| `DELETE /api/seeds/:slug/hard` | `seeds.destructive.ts:L44` | `getActiveSeed` (L52) |
| `DELETE /api/seeds/:slug/branches/:branchId` | `seeds.destructive.ts:L97` | `getActiveSeed` (L103) |
| `PATCH  /api/seeds/:slug/branches/:branchId/rename` | `seeds.destructive.ts:L141` | `getActiveSeed` (L152) |
| `PATCH  /api/seeds/:slug/branches/:branchId/retype` | `seeds.destructive.ts:L206` | `getActiveSeed` (L218) |
| `POST   /api/seeds/:slug/mcp-plan` \| `mcp-apply` | `seeds.mcp.ts:L122,L200` | `repo.get(slug)` — **control plane, guard must NOT fire** |

`getActiveSeed(context, slug)` (`seeds.helpers.ts:L78`) returns the full `SeedRecord` — including
`source` — or a 404 Problem Details `Response`. Seven of the eight mutation routes above already hold
that record in hand; the guard is a one-line call after each.

**`apps/api` — persistence**

`D1SeedRepository` (`src/shared/db/repositories/seed.repository.d1.ts`):

```sql
-- UPSERT_SEED_SQL, L9-16
INSERT INTO seeds (slug, definition, status, source, created_at, updated_at)
VALUES (?, ?, 'active', ?, ?, ?)
ON CONFLICT(slug) DO UPDATE SET
  definition = excluded.definition,
  status     = 'active',
  updated_at = excluded.updated_at
```

The `DO UPDATE` clause deliberately omits `source`. **Ownership is therefore already immutable after
row creation** — this is the mechanism that answers the brief's deferred symmetric question, and it
requires no code change.

`seeds` table DDL (`apps/api/migrations/0000_v040_base.sql`):

```sql
CREATE TABLE IF NOT EXISTS seeds (
    slug        TEXT    NOT NULL PRIMARY KEY,
    definition  TEXT    NOT NULL,
    status      TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
    source      TEXT    NOT NULL DEFAULT 'runtime' CHECK (source IN ('code', 'runtime')),
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
```

**No migration is needed in this sprint.** The column, its CHECK constraint and its default already
exist.

**MCP control plane (#328, CLOSED — available as the sprint-3 apply path)**

`packages/mcp/src/index.ts` exposes `beech_schema_export`, `beech_schema_validate`,
`beech_schema_plan`, `beech_schema_apply`, mapped by `docs/reference/mcp-server.md:358-360` onto
`GET /api/schema`, `POST /api/seeds/:slug/mcp-plan` (`schema:read`) and
`POST /api/seeds/:slug/mcp-apply` (`schema:write`). `mcp-apply` does full-set validation, an
additive-only gate via `classifyCandidate`, physical-column planning, and one CAS-guarded atomic
batch (`applyAtomic`, `seed.repository.d1.ts:L105`). It hardcodes `source: 'runtime'` at
`seeds.mcp.ts:L275`. **That single literal is the one line sprint 3 has to parameterise** — this
sprint does not touch it.

**`packages/cli`** — `src/lib/schema-diff.ts` reads `PRAGMA table_info` / `foreign_key_list` /
`index_list` through `queryD1` and compares against `getExpectedColumns(seed)`. `src/commands/
generate-types.ts` reads `SELECT slug, definition FROM seeds WHERE status='active'` and calls
`generateSeedTypes`. Both are sprint-2/3 material and are **not modified here**.

**Not present anywhere in the repo** (verified by grep, not assumed): `defineSchema`, `defineField`,
`defineGroup`, `beech.schema.ts`, any `beech schema` subcommand, any writer of `source = 'code'` to
D1, any fingerprint.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

**New — `@beechcms/core` manifest module** (pure; zero I/O; no `zod`; no Worker imports)

| File | Contents |
|------|----------|
| `packages/core/src/schema/manifest.types.ts` | `MANIFEST_VERSION`, `ManifestBranch`, `ManifestSeed`, `FieldGroup`, `BeechSchemaManifest` |
| `packages/core/src/schema/define.ts` | `defineSchema()`, `defineSeed()` (manifest flavour), `defineField.*`, `defineGroup()` |
| `packages/core/src/schema/canonical.ts` | `toCanonicalJson()`, `fromCanonicalJson()`, `ManifestSerializationError` |
| `packages/core/src/schema/manifest-seeds.ts` | `manifestToSeeds()`, `seedsToManifest()` |
| `packages/core/src/schema/manifest-validation.ts` | `validateManifest()` |
| `packages/core/src/schema/index.ts` | Barrel for the `./schema` subpath — re-exports the five files above and nothing else |

**Modified — `@beechcms/core`**

| File | Change |
|------|--------|
| `packages/core/package.json` | Add the `"./schema"` export entry. **Nothing else.** |

`packages/core/src/index.ts` is **deliberately NOT modified** — the manifest module must not reach
the Worker bundle through the god node.

**Modified — `apps/api` seeds slice**

| File | Change |
|------|--------|
| `src/features/seeds/seeds.helpers.ts` | New exported `rejectManifestOwned()`; import `SeedRecord` type |
| `src/features/seeds/seeds.handler.ts` | Call the guard in `PUT /:slug`, `POST /:slug/branches`, `DELETE /:slug` |
| `src/features/seeds/seeds.destructive.ts` | Call the guard in the four destructive routes |

**New — tests**

| File | Tier |
|------|------|
| `packages/core/src/schema/define.test.ts` | unit |
| `packages/core/src/schema/canonical.test.ts` | unit |
| `packages/core/src/schema/manifest-seeds.test.ts` | unit |
| `packages/core/src/schema/manifest-validation.test.ts` | unit |
| `apps/api/src/features/seeds/test/integration/seed-ownership.integration.test.ts` | integration |

**Explicitly excluded from this sprint's code:** no `beech.schema.ts` file is committed to the repo,
no CLI command, no D1 read or write from the manifest module, no fingerprint, no change to
`generateSeedTypes`, no dashboard change, no migration.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

## D1 migrations

**None.** The `seeds.source` column, its `CHECK (source IN ('code','runtime'))` constraint and its
`DEFAULT 'runtime'` already ship in `apps/api/migrations/0000_v040_base.sql`. Creating a migration
here would be a non-deterministic schema change for no gain — an automatic VETO under Rule 4.

---

## T1 — `packages/core/src/schema/manifest.types.ts`

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module schema/manifest.types
 * Data shapes for the `beech.schema.ts` desired-state manifest. Pure types — no runtime logic.
 *
 * A manifest is NOT a runtime authority: D1 remains the sole runtime source of truth. These types
 * describe an artifact that is authored, reviewed in Git, and reconciled through an explicit
 * plan/apply step.
 */

import type { Branch, Seed } from '../engine/types.js'

/**
 * Manifest format version. Bumped ONLY on a breaking change to the manifest shape — never on an
 * additive field. `fromCanonicalJson` refuses any other value rather than guessing.
 */
export const MANIFEST_VERSION = 1

/**
 * A field as written by hand in a manifest.
 *
 * `id` is optional at authoring time: nobody hand-writes `br_07`, and an author-invented id would
 * collide with the ids the engine already minted. It is filled in by `manifestToSeeds()` purely so
 * validation has a complete `Seed`; the AUTHORITATIVE assignment happens at plan/apply time, where
 * `normalizeCandidate()` preserves the stored id by alias match before minting a new one.
 * `fields` is recursive for `repeater` sub-fields, which carry the same rule.
 */
export type ManifestBranch = Omit<Branch, 'id' | 'fields'> & {
  id?: string
  fields?: ManifestBranch[]
}

/**
 * A content type as written in a manifest.
 *
 * `layout` is deliberately absent: it is typed `unknown`, is populated server-side by
 * `GET /api/schema`, and is not a schema concern. Round-tripping it would make a future
 * `beech schema diff` report permanent false drift.
 */
export type ManifestSeed = Omit<Seed, 'branches' | 'layout'> & {
  branches: ManifestBranch[]
}

/**
 * A reusable bundle of fields (e.g. an SEO block shared by several seeds).
 *
 * Author-time only: `defineSeed()` splices `branches` into the seed's own list and the group leaves
 * ZERO trace in canonical JSON. It is a macro, not a persisted concept — there is exactly one
 * grouping mechanism in D1, and this is not it.
 */
export interface FieldGroup {
  name: string
  branches: ManifestBranch[]
}

/** The root artifact: the whole desired schema state. */
export interface BeechSchemaManifest {
  version: typeof MANIFEST_VERSION
  seeds: ManifestSeed[]
}
```

---

## T2 — `packages/core/src/schema/define.ts`

Authoring helpers. Every one of them is a typed identity or a typed splice — no validation, no
throwing, no I/O. Validation is a whole-set concern and lives in `validateManifest()`, because
cross-seed relation targets cannot be checked one seed at a time.

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module schema/define
 * Authoring DSL for `beech.schema.ts`. Pure, allocation-only helpers: they give the author
 * inference and autocomplete, and they never validate, throw, or touch I/O.
 */

import { MANIFEST_VERSION } from './manifest.types.js'
import type {
  BeechSchemaManifest,
  FieldGroup,
  ManifestBranch,
  ManifestSeed,
} from './manifest.types.js'

/** A field bundle, or the fields themselves, as accepted by `defineSeed`. */
type BranchInput = ManifestBranch | FieldGroup

function isFieldGroup(input: BranchInput): input is FieldGroup {
  return Array.isArray((input as FieldGroup).branches)
}

/**
 * Declares the root manifest. Seeds are stored in authoring order here; canonical ordering is
 * applied by `toCanonicalJson`, so a reordered manifest file produces byte-identical canonical JSON.
 */
export function defineSchema(input: { seeds: ManifestSeed[] }): BeechSchemaManifest {
  return { version: MANIFEST_VERSION, seeds: input.seeds }
}

/**
 * Declares one content type, flattening any `defineGroup()` bundles into the branch list.
 * Branch ORDER is preserved: it is the physical column order `planCreateSeed` will emit.
 */
export function defineSeed(
  input: Omit<ManifestSeed, 'branches'> & { branches: BranchInput[] },
): ManifestSeed {
  const branches: ManifestBranch[] = []
  for (const item of input.branches) {
    if (isFieldGroup(item)) branches.push(...item.branches)
    else branches.push(item)
  }
  return { ...input, branches }
}

/** Declares a reusable field bundle. Expanded at author time by `defineSeed`; never persisted. */
export function defineGroup(name: string, branches: ManifestBranch[]): FieldGroup {
  return { name, branches }
}

type FieldInput<T extends ManifestBranch['type']> = Omit<ManifestBranch, 'type'> & {
  type?: never
} extends infer _ ? Omit<ManifestBranch, 'type'> : never

function field<T extends ManifestBranch['type']>(type: T) {
  return (input: Omit<ManifestBranch, 'type'>): ManifestBranch => ({ ...input, type })
}

/**
 * Typed field constructors. `relation` and `repeater` narrow their input because the engine treats
 * `targetSeed` / `fields` as required for those types — making the compiler enforce what
 * `validateSeedDefinitions` would otherwise only catch at apply time.
 */
export const defineField = {
  text: field('text'),
  number: field('number'),
  boolean: field('boolean'),
  json: field('json'),
  date: field('date'),
  richtext: field('richtext'),
  file: field('file'),
  tags: field('tags'),
  relation: (
    input: Omit<ManifestBranch, 'type' | 'targetSeed'> & { targetSeed: string },
  ): ManifestBranch => ({ ...input, type: 'relation' }),
  repeater: (
    input: Omit<ManifestBranch, 'type' | 'fields'> & { fields: ManifestBranch[] },
  ): ManifestBranch => ({ ...input, type: 'repeater' }),
} as const
```

> Implementation note for the executing agent: the `FieldInput` helper type above is scaffolding —
> delete it if `field()` already infers correctly under TS 7.0.2. Do not ship an unused type alias;
> `pnpm lint` will flag it.

---

## T3 — `packages/core/src/schema/canonical.ts`

The byte-level contract that sprint 2's fingerprint will hash. Three properties, in priority order:
**deterministic** (same manifest ⇒ same bytes, regardless of key insertion order), **lossless**
(round-trips), **serializable-only** (a function, class instance, `Date`, `Map`, `Set`, `RegExp`,
`BigInt` or `Symbol` anywhere in the tree is a hard error naming its path).

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module schema/canonical
 * Deterministic serialization of a manifest. The bytes produced here are the input a later schema
 * fingerprint hashes, so this format is a compatibility surface: changing it invalidates every
 * already-published client. Treat it as frozen.
 */

import { MANIFEST_VERSION } from './manifest.types.js'
import type { BeechSchemaManifest } from './manifest.types.js'

/** Thrown when a manifest carries a value that cannot survive a JSON round-trip. */
export class ManifestSerializationError extends Error {
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
    this.name = 'ManifestSerializationError'
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
  if (offence) throw new ManifestSerializationError(path, offence)

  if (value === null) return null
  if (Array.isArray(value)) {
    return value.map((item, index) => {
      if (item === undefined) throw new ManifestSerializationError(`${path}[${index}]`, 'undefined')
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
 * Serializes a manifest to its canonical form: seeds sorted by slug, keys sorted, two-space
 * indentation, trailing newline. Stable across authoring order and across key insertion order.
 */
export function toCanonicalJson(manifest: BeechSchemaManifest): string {
  const seeds = [...manifest.seeds].sort((a, b) => a.slug.localeCompare(b.slug))
  const canonical = canonicalize({ version: manifest.version, seeds }, '')
  return `${JSON.stringify(canonical, null, 2)}\n`
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

**Round-trip law the tests must pin:**
`toCanonicalJson(fromCanonicalJson(s)) === s` for every `s` this module produces.

---

## T4 — `packages/core/src/schema/manifest-seeds.ts`

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module schema/manifest-seeds
 * Bridges the manifest shape and the engine's `Seed` shape, in both directions.
 */

import { nextBranchId } from '../engine/seed-registry.js'
import { MANIFEST_VERSION } from './manifest.types.js'
import type { BeechSchemaManifest, ManifestBranch, ManifestSeed } from './manifest.types.js'
import type { Branch, Seed } from '../engine/types.js'

/**
 * Fills in ids for branches authored without one, in declaration order.
 *
 * These ids are AUTHORING-LOCAL and non-authoritative — they exist so `validateSeedDefinitions`,
 * which fatals on a missing id, has a complete `Seed` to check. At plan/apply time the stored id
 * wins: `normalizeCandidate()` in the API's MCP slice matches by alias against the stored
 * definition before minting anything. Never persist an id minted here as if it were stable.
 */
function withBranchIds(branches: ManifestBranch[]): Branch[] {
  const accumulated: Branch[] = []
  for (const branch of branches) {
    const resolved: Branch = {
      ...branch,
      id: branch.id ?? nextBranchId({ branches: accumulated }),
      ...(branch.fields ? { fields: withBranchIds(branch.fields) } : {}),
    } as Branch
    accumulated.push(resolved)
  }
  return accumulated
}

/** Manifest → engine `Seed[]`, ready for `validateSeedDefinitions` or an MCP plan candidate. */
export function manifestToSeeds(manifest: BeechSchemaManifest): Seed[] {
  return manifest.seeds.map((seed: ManifestSeed) => ({
    ...seed,
    branches: withBranchIds(seed.branches),
  }))
}

/**
 * Engine `Seed[]` → manifest, for a future `beech schema export`.
 *
 * `layout` is stripped: it is server-populated presentation state, not schema. Seeds are sorted by
 * slug so an export is diffable; branch order is preserved because it is the physical column order.
 */
export function seedsToManifest(seeds: Seed[]): BeechSchemaManifest {
  const sorted = [...seeds].sort((a, b) => a.slug.localeCompare(b.slug))
  return {
    version: MANIFEST_VERSION,
    seeds: sorted.map(({ layout: _layout, ...seed }) => seed as ManifestSeed),
  }
}
```

---

## T5 — `packages/core/src/schema/manifest-validation.ts`

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module schema/manifest-validation
 * Whole-manifest validation. Reuses the engine's `validateSeedDefinitions` rather than
 * reimplementing it: a manifest that passes here is a candidate set the API would also accept.
 */

import { validateSeedDefinitions } from '../engine/seed-validation.js'
import type { SeedValidationIssue } from '../engine/seed-validation.js'
import { MANIFEST_VERSION } from './manifest.types.js'
import { toCanonicalJson, ManifestSerializationError } from './canonical.js'
import { manifestToSeeds } from './manifest-seeds.js'
import type { BeechSchemaManifest } from './manifest.types.js'

/**
 * Validates a manifest end to end:
 *  1. format version is one this build understands;
 *  2. every value survives canonical serialization (no callbacks or executable code persisted);
 *  3. the derived `Seed[]` passes the engine's whole-set validation — including cross-seed relation
 *     targets, which is exactly why this is a manifest-level and not a seed-level function.
 *
 * Returns issues; never throws. A caller decides whether a non-fatal issue blocks.
 */
export function validateManifest(manifest: BeechSchemaManifest): SeedValidationIssue[] {
  if (manifest.version !== MANIFEST_VERSION) {
    return [{
      slug: '*',
      fatal: true,
      messages: [
        `unsupported manifest version ${String(manifest.version)}; this build understands ${MANIFEST_VERSION}.`,
      ],
    }]
  }

  try {
    toCanonicalJson(manifest)
  } catch (error) {
    if (error instanceof ManifestSerializationError) {
      return [{ slug: '*', fatal: true, messages: [error.message] }]
    }
    throw error
  }

  return validateSeedDefinitions(manifestToSeeds(manifest))
}
```

> The executing agent must read `packages/core/src/engine/seed-validation.ts:L30` and match the real
> `SeedValidationIssue` field names exactly. The shape assumed above is `{ slug, fatal, messages }`,
> consistent with its use at `seeds.helpers.ts:L111` and `seeds.mcp.ts:L148`. If it differs, the real
> shape wins — do not add a field to `SeedValidationIssue` to fit this file.

---

## T6 — `packages/core/src/schema/index.ts` + subpath export

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module schema
 * Authoring surface for `beech.schema.ts`. Imported by authoring tools and the CLI — NEVER by the
 * Worker, which is why this module is a separate subpath and is absent from `src/index.ts`.
 */

export * from './manifest.types.js'
export * from './define.js'
export * from './canonical.js'
export * from './manifest-seeds.js'
export * from './manifest-validation.js'
```

`packages/core/package.json` — add the third entry, leaving the existing two untouched:

```json
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./schema": {
      "import": "./dist/schema/index.js",
      "types": "./dist/schema/index.d.ts"
    },
    "./richtext-render": {
      "import": "./dist/content/richtext/richtext-render.js",
      "types": "./dist/content/richtext/richtext-render.d.ts"
    },
    "./webhook-crypto": {
      "import": "./dist/webhook-crypto.js",
      "types": "./dist/webhook-crypto.d.ts"
    }
  },
```

> Copy the `richtext-render` and `webhook-crypto` entries verbatim from the file on disk — the paths
> above are indicative. `rootDir: "src"` / `outDir: "dist"` already map `src/schema/index.ts` to
> `dist/schema/index.js`; no `tsconfig.json` change is required.

**Naming collision, stated so nobody trips on it:** `@beechcms/core` exports an identity
`defineSeed(seed: Seed): Seed`, and `@beechcms/core/schema` now exports a manifest
`defineSeed(...): ManifestSeed`. They are different symbols on different subpaths, and the engine one
is NOT modified — it is load-bearing for `@beechcms/testing`'s canonical seeds. The binding rule: a
`beech.schema.ts` manifest imports **only** from `@beechcms/core/schema`; nothing imports both in one
file.

---

## T7 — `apps/api/src/features/seeds/seeds.helpers.ts` — the ownership guard

Add the import (`SeedRecord` comes from `@beechcms/core`, alongside the existing `Branch`/`Seed`
type import at L7):

```ts
import type { Branch, Seed, SeedRecord } from '@beechcms/core'
```

Add the guard next to `getActiveSeed` (after L85):

```ts
/**
 * Refuses an interactive (dashboard/REST) mutation of a manifest-owned seed.
 *
 * A seed with `source = 'code'` is owned by `beech.schema.ts`. Letting the dashboard edit it would
 * make `beech schema diff` report drift it can never explain — the manifest would be silently wrong
 * about a schema it is supposed to describe. Ownership is set at row creation and is immutable:
 * `D1SeedRepository.UPSERT_SEED_SQL`'s `ON CONFLICT DO UPDATE` clause deliberately omits `source`.
 *
 * NOT called on creation (`POST /api/seeds`) — a seed that does not exist has no owner — and NOT
 * called on the MCP control-plane routes, which are the sanctioned manifest apply path.
 *
 * @returns A 409 Problem Details Response when the seed is manifest-owned, or `null` when it is not.
 */
export function rejectManifestOwned(context: AppContext, record: SeedRecord) {
  if (record.source !== 'code') return null
  return publicProblem(context, {
    type: 'seed-manifest-owned',
    title: 'Seed is manifest-owned',
    status: 409,
    detail:
      `Seed '${record.slug}' is owned by beech.schema.ts (source='code') and cannot be edited here. ` +
      `Edit the manifest and re-apply it.`,
  })
}
```

Status choice: **409, not 403.** The caller is an authenticated admin who is allowed to manage
seeds — the request conflicts with the resource's ownership state, which is exactly the semantic the
slice already uses for `seed-referenced` (`seeds.handler.ts:L248`). A 403 would tell the dashboard to
re-authenticate, which would be wrong and unactionable.

---

## T8 — wire the guard into the seven interactive mutation routes

The pattern is identical everywhere: immediately after the existing `getActiveSeed` result is
narrowed, before any other work.

`apps/api/src/features/seeds/seeds.handler.ts` — import it from the helpers block at L22-30, then:

```ts
// PUT /:slug  (after L173-174)
  const existing = await getActiveSeed(context, slug)
  if (existing instanceof Response) return existing
  const owned = rejectManifestOwned(context, existing)
  if (owned) return owned

// POST /:slug/branches  (after L208-209)
  const existing = await getActiveSeed(context, slug)
  if (existing instanceof Response) return existing
  const owned = rejectManifestOwned(context, existing)
  if (owned) return owned

// DELETE /:slug  (after L239-240, BEFORE the backref check — ownership outranks referencing)
  const existing = await getActiveSeed(context, slug)
  if (existing instanceof Response) return existing
  const owned = rejectManifestOwned(context, existing)
  if (owned) return owned
```

`apps/api/src/features/seeds/seeds.destructive.ts` — same insertion after `getActiveSeed` at L52,
L103, L152 and L218 (`DELETE /:slug/hard`, `DELETE /:slug/branches/:branchId`,
`PATCH /:slug/branches/:branchId/rename`, `PATCH /:slug/branches/:branchId/retype`). Add
`rejectManifestOwned` to the existing helpers import at L18-26.

**Routes that must NOT get the guard, and why:**

| Route | Reason |
|-------|--------|
| `POST /api/seeds` | Creation. No existing row ⇒ no owner. Adding the guard here would make the manifest path unable to create its own seeds in sprint 3. |
| `POST /api/seeds/:slug/mcp-plan` | Dry-run, writes nothing. |
| `POST /api/seeds/:slug/mcp-apply` | **The sanctioned manifest apply path.** Guarding it would wall the manifest out of its own seeds. |
| `POST /api/seeds/:slug/fts/rebuild` | Index maintenance, not a schema edit. The manifest does not describe FTS state. |
| `GET` routes, `GET /:slug/orphans` | Reads. |

---

## T9 — tests

Binding: `_config/testing_conventions.md`. Tier, placement and fixture source are specified here;
anything the plan leaves open follows the conventions file, not the executing agent's preference.

### Unit tier — `packages/core/src/schema/*.test.ts`

Placement: next to the source file (Rule 0/§1.1). Filename `<subject>.test.ts` (Rule 1.3). SPDX
header byte-identical to the repo's MIT header used across `packages/core` (Rule 1.2 — note
`packages/core` uses the MIT header, not the BUSL one; match the file you sit next to). `describe()`
names the exported symbol (Rule 1.4). Four zones, one act, named result (§2). No D1, no filesystem,
no network (Rule 0.2) — trivially satisfied, the module has no I/O.

Behaviours that must each have their own `it()`:

`define.test.ts`
- `defineSeed` splices a `defineGroup()` bundle into `branches` in declaration position, and the
  group name appears nowhere in the result.
- `defineSeed` preserves branch declaration order (it is the physical column order).
- `defineField.relation` produces `type: 'relation'` and carries `targetSeed` through.
- `defineField.repeater` produces `type: 'repeater'` and carries `fields` through.
- `defineSchema` stamps `version: MANIFEST_VERSION`.

`canonical.test.ts`
- Two manifests differing only in key insertion order and in seed declaration order serialize to
  byte-identical output. *(This is the fingerprint contract: state that in a §6.2 regression-guard
  comment, naming the mechanism — sprint 2 hashes these bytes.)*
- `undefined`-valued properties are dropped; `null` is preserved as data.
- Branch array order is preserved (contrast with seed order, which is sorted).
- A function anywhere in the tree throws `ManifestSerializationError` whose `path` names the
  offending location — assert `error.path`, not the message text (Rule 5.4).
- A `Date`, a `Map` and a `RegExp` each throw. Drive these from an array in ONE `it()` (Rule 1.6 —
  one cause, one arrangement) and name the `it()` after the whole matrix.
- `toCanonicalJson(fromCanonicalJson(s)) === s` for a manifest with two seeds and a relation.
- `fromCanonicalJson` throws on a version that is not `MANIFEST_VERSION`.

`manifest-seeds.test.ts`
- A manifest whose branches have no `id` yields ids `br_01`, `br_02`, … in declaration order.
- An author-supplied `br_*` id is preserved verbatim and the next generated id does not collide
  with it.
- `repeater` sub-fields get ids under the same rule.
- `seedsToManifest` strips `layout` and sorts seeds by slug; `manifestToSeeds` of that result
  reproduces the input seeds' branch ids.

`manifest-validation.test.ts`
- A valid two-seed manifest with a relation between them returns zero fatal issues. *(The point of
  the test: the relation target resolves only because validation sees the whole set.)*
- A relation pointing at a slug absent from the manifest returns a fatal issue for the owning seed.
- A duplicate branch alias within one seed returns a fatal issue.
- A manifest carrying a function returns ONE fatal issue and does not throw.
- A wrong `version` returns a fatal issue and never reaches `validateSeedDefinitions`.

Fixtures are plain manifest literals built with the DSL — the canonical `@beechcms/testing` seeds are
`Seed` objects, a different shape, and reaching for them here would couple a core unit test to the
testing package. Malformed inputs are hand-rolled, which Rule 3.5 permits for exactly this purpose.

### Integration tier — `apps/api/src/features/seeds/test/integration/seed-ownership.integration.test.ts`

Placement mirrors the slice and the existing idiom
(`apps/api/src/features/content/test/integration/content-management.integration.test.ts`); this path
is what `apps/api/vitest.workers.config.ts:L17` (`src/features/**/test/integration/**/*.test.ts`)
selects. SPDX header: the BUSL one used throughout `apps/api`. Real D1 from `cloudflare:test`, real
middleware, harness-built world, only `IClock`/`ITokenService` faked (Rules 0.3, 3.4). Auth via
`harness.asUser('admin')` — the slice is admin-gated at `seeds.handler.ts:L39` (Rule 4.2).

`describe('seeds slice — manifest ownership (real D1)', …)`, with a nested `describe` per route group.

Arrangement, in `beforeEach` only for the shared baseline (Rule 3.1): harness + admin client. Each
test arranges its own subject seed. A manifest-owned seed has to be arranged by direct SQL, because
**no code path writes `source = 'code'` until sprint 3** — that is the precise non-obvious coupling
Rule 6.2.1 requires a comment for:

```ts
// No production path writes source='code' until the manifest apply command lands, so the
// ownership row is arranged directly. The column, its CHECK and its default already exist in
// apps/api/migrations/0000_v040_base.sql.
await harness.db
  .prepare(`UPDATE seeds SET source = 'code' WHERE slug = ?`)
  .bind(slug)
  .run()
```

Behaviours, one `it()` each:

- `PUT /api/seeds/:slug` on a manifest-owned seed returns 409 with `type: 'seed-manifest-owned'`,
  and the stored definition is unchanged (Rule 5.6 — read the row back and assert the branch count
  held).
- `POST /api/seeds/:slug/branches` on a manifest-owned seed returns 409 and adds no physical column
  (`PRAGMA table_info(content_<slug>)` count unchanged).
- `DELETE /api/seeds/:slug` on a manifest-owned seed returns 409 and the row's `status` is still
  `'active'`.
- Each of the four destructive routes on a manifest-owned seed returns 409. Drive from an array in
  one `it()` (Rule 1.6): one cause, one arrangement.
- A `source = 'runtime'` seed still accepts `PUT /api/seeds/:slug` with 200 and the new branch is
  readable back. *(The regression guard: a guard that fires on everything is indistinguishable from
  a broken slice.)*
- `POST /api/seeds/:slug/mcp-apply` succeeds against a manifest-owned seed and the row's `source`
  is still `'code'` afterwards. *(Two contracts in one act: the control plane is not walled out, and
  `ON CONFLICT DO UPDATE` really does leave `source` alone.)*
- `POST /api/seeds` creating a brand-new seed returns 201 while a manifest-owned seed exists.

Error assertions name status + `type`, never message copy (Rule 5.4). Every write asserts persisted
state; every rejection asserts nothing changed (Rules 5.5, 5.6). Bodies are typed at the call site
(Rule 5.2).

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

```bash
# 1 — core compiles, including the new subpath's declaration output
pnpm --filter @beechcms/core build

# 2 — core unit tests (vitest include: src/**/*.test.ts) + coverage thresholds
pnpm --filter @beechcms/core test

# 3 — the subpath actually resolves from a consumer, not just from inside the package
pnpm --filter @beechcms/api type-check

# 4 — api unit + integration tiers (the second config is the workers pool that picks up
#     src/features/**/test/integration/**/*.test.ts)
pnpm --filter @beechcms/api test

# 5 — whole workspace, scoped to what changed
pnpm beech test --diff

# 6 — lint (TS-ESLint runs through the noopParser workaround; it still catches unused exports)
pnpm lint

# 7 — full build, last
pnpm build
```

No `pnpm beech db:migrate` and no `pnpm beech db:reset` are required: this sprint ships no migration.
If the local D1 state is missing entirely, `pnpm beech onboard --yes` bootstraps it before step 4.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

**Module boundaries**

- [ ] `packages/core/src/schema/` contains no import from `apps/`, from `packages/cli`, from
      `packages/client`, from `node:*`, or from any Cloudflare type.
- [ ] `packages/core/src/schema/` performs no I/O: no `fetch`, no filesystem, no D1, no `console`.
- [ ] `packages/core/src/index.ts` is **unchanged** — `grep -n "schema/" packages/core/src/index.ts`
      returns nothing.
- [ ] `packages/core/package.json` exposes `"./schema"` and the two pre-existing subpath exports are
      byte-identical to before.
- [ ] `packages/core/src/engine/define-seed.ts` is **unchanged**.
- [ ] No new dependency in any `package.json`. `zod` is not imported by the new module.

**Typing**

- [ ] No `any` in any file added or modified by this sprint, tests included.
- [ ] `pnpm --filter @beechcms/core build` emits `dist/schema/index.d.ts`.
- [ ] `defineField.relation` does not compile without `targetSeed`; `defineField.repeater` does not
      compile without `fields`. Prove it with an inline `// @ts-expect-error` in the unit test.
- [ ] `ManifestSeed` has no `layout` property.
- [ ] No unused export and no unused type alias survives in the new module.

**Canonical form (the sprint's compatibility surface)**

- [ ] `toCanonicalJson` is stable across object key insertion order and across seed declaration
      order, proven by a test asserting byte equality.
- [ ] Branch array order is preserved.
- [ ] A function, `Date`, `Map`, `Set` or `RegExp` anywhere in the manifest raises
      `ManifestSerializationError` carrying the dotted path to the value.
- [ ] `toCanonicalJson(fromCanonicalJson(s)) === s` holds for a two-seed manifest with a relation.

**Ownership guard**

- [ ] `rejectManifestOwned` is called on exactly seven routes: `PUT /:slug`,
      `POST /:slug/branches`, `DELETE /:slug`, `DELETE /:slug/hard`,
      `DELETE /:slug/branches/:branchId`, `PATCH /:slug/branches/:branchId/rename`,
      `PATCH /:slug/branches/:branchId/retype`.
- [ ] It is called on **none** of: `POST /api/seeds`, `mcp-plan`, `mcp-apply`, `fts/rebuild`, any
      `GET`.
- [ ] A manifest-owned seed rejects every one of the seven with 409 and
      `type: 'seed-manifest-owned'`, and each rejection is proven by an unchanged-state assertion.
- [ ] A `source = 'runtime'` seed is unaffected on all seven.
- [ ] `mcp-apply` against a manifest-owned seed succeeds and leaves `source = 'code'`.
- [ ] No change to `apps/api/migrations/`.
- [ ] No change to `apps/dashboard/`.

**Tests**

- [ ] Every new test file declares exactly one tier and sits in the placement that tier mandates.
- [ ] `pnpm lint:tests` (`scripts/check-test-placement.mjs`) passes.
- [ ] `describe`/`it` names follow §1.4–1.6; no `should`; no `// ARRANGE`/`// ACT`/`// ASSERT`.
- [ ] Nothing from `_config/testing_conventions.md` §7 appears: no `any`, no sleep, no fake timers,
      no conditional assertion, no `it.only`/`it.skip`, no snapshot of an API response.
- [ ] The direct-SQL `source='code'` arrangement carries the §6.2.1 coupling comment.
- [ ] `packages/core` coverage thresholds (statements 80 / branches 75 / functions 80 / lines 80)
      still pass; the new module is not added to the vitest coverage `exclude` list.

**Build**

- [ ] `pnpm build`, `pnpm lint`, `pnpm beech test --diff` all green.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executing agent MUST NOT build or modify any of the following.

**Deferred to `ROADMAP.md` sprint 2 — `SchemaIntrospectionFingerprint`**
- Any D1 introspection primitive, any `PRAGMA` reading, any refactor of
  `packages/cli/src/lib/schema-diff.ts`.
- Any schema fingerprint, hash, or revision token. This sprint only freezes the bytes a fingerprint
  will later hash.

**Deferred to `ROADMAP.md` sprint 3 — `CliSchemaTooling`**
- `beech schema export`, `beech schema diff`, `beech schema plan`, `beech schema apply` — no
  command, no stub, no entry in the CLI's command table.
- Any change to `packages/cli/src/commands/generate-types.ts` or to `generateSeedTypes`
  (`packages/core/src/engine/seed-types-generator.ts`), including adding a fingerprint to its
  `HEADER`.
- Changing `source: 'runtime'` at `apps/api/src/features/seeds/seeds.mcp.ts:L275`, or
  `repo.upsert(slug, candidate, 'runtime')` at `seeds.helpers.ts:L139`. Nothing in this sprint writes
  `source = 'code'` from production code; the integration test arranges it with direct SQL.
- Committing a `beech.schema.ts` file anywhere in the repo, root included. The DSL ships; the
  artifact does not.

**Deferred to `ROADMAP.md` sprint 4 — `PublicApiRelationExpansion`**
- The `include=` query parameter, relation expansion, and the `X-Schema-Revision` response header on
  `apps/api/src/public/*`.

**Deferred to `ROADMAP.md` sprints 5 and 6**
- Every change to `packages/client`: the fluent chain, the generated-registry generics, the runtime
  fingerprint check, `.list({ validate: true })`, and subquery `IN` support.

**Rejected outright — do not build, in this sprint or a later one, without a new brief**
- Turning the engine's `defineSeed` (`packages/core/src/engine/define-seed.ts`) into a validating or
  throwing function. It is consumed by `@beechcms/testing`'s canonical seeds; changing it breaks the
  harness the rest of the test suite depends on.
- Adding the manifest module to `packages/core/src/index.ts`. It would pull authoring code into the
  Worker bundle.
- A `layout` field on `ManifestSeed`, or any other round-tripping of server-populated presentation
  state through the manifest.
- A `'runtime'` → `'code'` ownership-transfer command or endpoint. Ownership is immutable after row
  creation, by design and by the existing `ON CONFLICT DO UPDATE` clause. A transfer needs its own
  brief — see the standing decisions in `ROADMAP.md`.
- Any implicit manifest execution: a Worker-boot import of `beech.schema.ts`, an apply on deploy, or
  a background reconciler.
- Raw SQL authored in or derived from the manifest. All DDL comes from `planCreateSeed` /
  `planExtendSeed`, forever.
- Any new middleware, any change to the middleware registration order, any change to
  `apps/dashboard/`, and any D1 migration.
