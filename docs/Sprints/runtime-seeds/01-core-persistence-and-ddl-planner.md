# Runtime Seeds — Sprint 01: Core Persistence Contract + DDL Planner

> **Audience:** an AI coding agent implementing this sprint with no prior knowledge of
> Beech CMS. Everything needed is inline. If the live code disagrees with a snippet
> here, trust the live code and note the drift.
>
> Read [`00-overview.md`](./00-overview.md) first for the end-state and ground rules.

## 0. Role & ground rules

You are a senior TypeScript engineer on the **Beech CMS monorepo** (Turborepo: `apps/api`,
`apps/dashboard`, `packages/core`, `packages/cli`).

Hard rules:

1. Cloudflare Workers runtime — no filesystem at request time. SQL is a TS string or
   engine-generated.
2. Repository pattern: interfaces in `@beechcms/core`, D1 impls in `apps/api/src/shared/`,
   wired in `apps/api/src/middleware/repository.middleware.ts`, typed in
   `apps/api/src/types.ts`.
3. Botanical Engine invariant: `branch.id` (`^br_[A-Za-z0-9]+$`) is the only stable key.
4. **Additive-only.** This sprint produces no `DROP`/`RENAME` anywhere.
5. Docs English. Tests required.

## 1. What this sprint builds

This is a **pure foundation sprint — no runtime behaviour changes**. It produces the
building blocks the later sprints assemble:

1. A new migration `apps/api/migrations/0032_seeds.sql` creating two tables:
   - `seeds` — one row per content type, holding the full `Seed` definition as JSON.
   - `seed_meta` — a single-row key/value table holding `registry_version` (the cache
     invalidation token from the overview).
2. The matching DDL embedded into the CLI base schema string
   (`packages/cli/src/commands/init.ts` `BASE_SCHEMA_SQL`) and the `SYSTEM_TABLES` list.
3. New core contracts in `@beechcms/core`:
   - `ISeedRepository` + `SeedRecord` (persistence interface).
   - `validateSeedDefinitions(seeds)` — a runtime-callable port of the CLI's
     `validateSeeds`, returning structured errors (no `console`, no `process.exit`).
   - `nextBranchId(seed)` — deterministic `br_NN` id allocator that never reuses an id.
   - `planSeedDdl(...)` — additive DDL planner that returns the ordered SQL statements to
     create or extend a seed's tables.
4. `D1SeedRepository` in `apps/api/src/shared/seed.repository.d1.ts`, wired into
   `repository.middleware.ts` and typed on the context (but **not yet consumed** by any
   handler — that is sprint 02/03).

Nothing in this sprint changes how seeds are loaded or how requests behave. After it,
`npm run build` and all tests pass, and the new repository is reachable via
`c.get('seedRepository')` but unused.

## 2. The `seeds` and `seed_meta` tables

### 2.1 New migration — `apps/api/migrations/0032_seeds.sql`

```sql
-- =============================================================================
-- Runtime Seeds — Seed definitions stored in D1 (source of truth at runtime)
--
-- `seeds`      : one row per content type. `definition` is the full Seed JSON.
-- `seed_meta`  : single-row table holding the registry version token used for
--                multi-isolate cache invalidation (see docs/Sprints/runtime-seeds).
-- =============================================================================

CREATE TABLE IF NOT EXISTS seeds (
    slug        TEXT    NOT NULL PRIMARY KEY,
    definition  TEXT    NOT NULL,                       -- JSON-serialized Seed
    status      TEXT    NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'deleted')),
    source      TEXT    NOT NULL DEFAULT 'runtime'
                        CHECK (source IN ('code', 'runtime')),
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_seeds_status ON seeds(status);

CREATE TABLE IF NOT EXISTS seed_meta (
    id      TEXT NOT NULL PRIMARY KEY,
    value   TEXT NOT NULL
);

-- registry_version starts at 1; bumped on every seed write (sprint 03/04).
INSERT OR IGNORE INTO seed_meta (id, value) VALUES ('registry_version', '1');
```

Column notes:
- `status`: `'deleted'` is the **soft-delete** marker (additive-only rule). Deleted seeds
  keep their row and their `content_{slug}` table; they are excluded from the registry.
- `source`: `'code'` = loaded from `seed.ts` via the CLI; `'runtime'` = created in the UI.
  Sprint 05 may surface this (e.g. a "defined in code" badge), but the runtime treats
  both identically — DB is the source of truth regardless.
- `definition` is the entire `Seed` object as JSON, including `branches`, `dashboard`,
  flags. It does **not** include `layout` (layouts stay in the existing `seed_layouts`
  table, keyed by slug — do not move them).

### 2.2 Keep the CLI base schema in sync — `packages/cli/src/commands/init.ts`

`BASE_SCHEMA_SQL` is an embedded copy of the system schema used by `beech init --db`.
Append the two `CREATE TABLE IF NOT EXISTS` statements above (and the `INSERT OR IGNORE`)
to that string, and add `'seeds'` and `'seed_meta'` to the `SYSTEM_TABLES` array so
`init` recognises an initialised DB.

> The migration file (0032) is applied by `wrangler deploy` in production; the embedded
> string is applied by `beech init --db --local` in dev. Both must contain the same DDL.

## 3. Core contract — `ISeedRepository`

Create `packages/core/src/seed.repository.ts`:

```ts
// SPDX-License-Identifier: MIT
import type { Seed } from './types.js'

export interface SeedRecord {
  slug: string
  definition: Seed
  status: 'active' | 'deleted'
  source: 'code' | 'runtime'
  createdAt: number
  updatedAt: number
}

/**
 * Persistence contract for runtime Seed definitions.
 * Implemented by D1SeedRepository in apps/api/src/shared/seed.repository.d1.ts.
 *
 * `listActive()` returns only status='active' rows — this is what the registry is
 * hydrated from. `getRegistryVersion` / `bumpRegistryVersion` back the multi-isolate
 * cache token (see docs/Sprints/runtime-seeds/00-overview.md).
 */
export interface ISeedRepository {
  /** All active seed definitions, ordered by created_at ASC. */
  listActive(): Promise<Seed[]>
  /** Every row including soft-deleted ones (for admin/diff use). */
  listAll(): Promise<SeedRecord[]>
  /** Single active-or-deleted record by slug, or null. */
  get(slug: string): Promise<SeedRecord | null>
  /** Insert or replace a definition. Sets source on insert; preserves it on update unless given. */
  upsert(slug: string, definition: Seed, source?: 'code' | 'runtime'): Promise<void>
  /** Soft-delete: set status='deleted'. Table is NOT dropped (additive-only). */
  softDelete(slug: string): Promise<void>
  /** Current cache token. */
  getRegistryVersion(): Promise<number>
  /** Atomically increment and return the new token. Call after any write. */
  bumpRegistryVersion(): Promise<number>
}
```

Export it from `packages/core/src/index.ts` (barrel) alongside the other repository
interfaces.

## 4. Runtime-reusable validation — `validateSeedDefinitions`

The CLI already validates seeds in `packages/cli/src/commands/validate.ts`
(`validateSeeds`), but that function lives in the CLI package and is shaped around
console output. The runtime CRUD API (sprint 03) needs the same checks as a pure
function in core.

Create `packages/core/src/seed-validation.ts` with a pure port. Replicate **exactly**
these checks from the current `validateSeeds` (do not weaken any):

Fatal (reject the write):
1. **Unknown relation target** — a `relation` branch whose `targetSeed` is not among the
   provided seeds.
2. **Multi-relation with `SET NULL`** — `relation` + `multiple:true` + `onDelete:'SET NULL'`
   is illegal (must be `CASCADE` or `RESTRICT`).
3. **Junction name collision / length** — `rel_{slug}_{alias}` must be unique and ≤ 256
   chars across all multi-relation branches.
4. **Dependency cycle** — run `sortSeedsByDependencies` (from `seed-registry.ts`) and
   convert its throw into a fatal error. Skip if any unknown-target error already fired
   (it would duplicate).
5. **Branch id format / uniqueness** — every branch must have `id` matching
   `^br_[A-Za-z0-9]+$`, unique within the seed. (`SeedRegistry`'s constructor already
   enforces this on boot; the API must enforce it *before* persisting so a bad write
   never reaches the DB.)
6. **Reserved alias** — no branch alias may be in `AUTOMATION_RESERVED_WORDS`
   (imported from `automations-grammar-words.js`; `SeedRegistry` checks this too).

Warning (allow, but report):
7. Duplicate slug across the set.
8. Duplicate branch alias within a seed.
9. `displayNameAlias` not present among branch aliases.

Shape it so the API can map fatals → `400/422` and surface messages:

```ts
export interface SeedValidationIssue {
  slug: string
  messages: string[]
  fatal: boolean
}

/** Pure, console-free, throw-free. The single seed being created/edited is validated
 *  in the context of the full active set (relation targets may live in other seeds). */
export function validateSeedDefinitions(seeds: Seed[]): SeedValidationIssue[] { /* … */ }

/** Convenience: true iff no fatal issues. */
export function isSeedSetValid(seeds: Seed[]): boolean {
  return validateSeedDefinitions(seeds).every(i => !i.fatal)
}
```

Then **refactor the CLI** `validateSeeds` to delegate to `validateSeedDefinitions`
(keep the CLI's console/`process.exit` wrapper; just stop duplicating the logic). This
guarantees the two paths can never diverge. Export `validateSeedDefinitions`,
`isSeedSetValid`, and `SeedValidationIssue` from the core barrel.

> When validating one new/edited seed, call `validateSeedDefinitions([...otherActiveSeeds, edited])`
> so relation targets and cycles are checked against reality, not just the one seed.

## 5. Branch id allocation — `nextBranchId`

Runtime branch creation needs stable ids. Add to `packages/core/src/seed-registry.ts`
(next to `findBranchById`):

```ts
/**
 * Returns the next free branch id for a seed in the form `br_NN` (zero-padded to 2,
 * growing as needed). Scans existing ids, never reuses a number already present —
 * even if a branch was removed, its id is not recycled (ids must be globally stable
 * for the life of the seed so layouts/automations/FTS triggers never collide).
 *
 * Pure: derives the next id from the seed's current branches only.
 */
export function nextBranchId(seed: Pick<Seed, 'branches'>): string {
  let max = 0
  for (const b of seed.branches) {
    const m = /^br_0*([0-9]+)$/.exec(b.id)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  const n = max + 1
  return `br_${String(n).padStart(2, '0')}`
}
```

> Custom non-numeric ids (e.g. `br_title`) are allowed by the format regex but are not
> produced by this allocator. If a seed mixes them, `nextBranchId` simply ignores the
> non-numeric ones when computing the max — that is correct and safe.

## 6. The additive DDL planner — `planSeedDdl`

This is the heart of the sprint. The CLI's `seed-load.ts` `buildStatements(seed)`
already assembles the full create-from-scratch statement list. Runtime needs two modes:

- **Create** (table does not exist): the full statement set (same as `buildStatements`).
- **Extend** (table exists): only the **new** columns/indexes/triggers — additive.

Create `packages/core/src/seed-ddl.ts`:

```ts
// SPDX-License-Identifier: MIT
import type { Seed, Branch } from './types.js'
import {
  generateCreateTable, generateDraftTable, generateIndexes,
  generateFtsTable, generateFtsTriggers, generateAddColumn,
  generateJunctionTable, generateJunctionIndexes, generateJunctionDraftTable,
} from './engine.js'

/** Full create-from-scratch statement set for a seed. Mirrors the CLI's buildStatements.
 *  Order matters: parent table → indexes → draft table → FTS table → FTS triggers →
 *  per multi-relation: junction table → junction indexes → junction draft table.
 *  Callers that create several seeds must order the seeds with sortSeedsByDependencies
 *  first so relation FK targets exist. */
export function planCreateSeed(seed: Seed): string[] {
  const stmts: string[] = [generateCreateTable(seed), ...generateIndexes(seed)]
  const draft = generateDraftTable(seed)
  if (draft) stmts.push(draft)
  const fts = generateFtsTable(seed)
  if (fts) stmts.push(fts, ...generateFtsTriggers(seed))
  for (const branch of seed.branches) {
    if (branch.type !== 'relation' || branch.multiple !== true) continue
    stmts.push(generateJunctionTable(seed, branch), ...generateJunctionIndexes(seed, branch))
    const dj = generateJunctionDraftTable(seed, branch)
    if (dj) stmts.push(dj)
  }
  return stmts
}

/** Additive extension: given the columns that already exist on content_{slug}
 *  (from PRAGMA table_info, passed in by the caller), return ONLY the statements
 *  needed to add the new branches — ADD COLUMN + their indexes, plus junction
 *  tables for any new multi-relation branches. Never drops or renames.
 *
 *  FTS: SQLite cannot ALTER an fts5 table's columns. If a NEW text/richtext
 *  searchable branch was added, the existing fts_{slug} table cannot gain a column
 *  in place. Return a sentinel in `ftsRebuildNeeded` so the caller (sprint 03) can
 *  decide to leave FTS as-is for now (the new field simply isn't searchable until a
 *  rebuild). Do NOT emit DROP. */
export interface ExtendPlan {
  statements: string[]
  ftsRebuildNeeded: boolean
}

export function planExtendSeed(seed: Seed, existingColumns: Set<string>): ExtendPlan {
  const statements: string[] = []
  let ftsRebuildNeeded = false

  for (const branch of seed.branches) {
    // multi-relation branches have no column on the parent table
    if (branch.type === 'relation' && branch.multiple === true) {
      // a brand-new junction table is additive and safe
      statements.push(generateJunctionTable(seed, branch), ...generateJunctionIndexes(seed, branch))
      const dj = generateJunctionDraftTable(seed, branch)
      if (dj) statements.push(dj)
      continue
    }
    if (existingColumns.has(branch.alias)) continue   // already present — skip
    statements.push(generateAddColumn(seed, branch))
    // re-emit indexes; CREATE INDEX IF NOT EXISTS is idempotent
    if ((branch.type === 'text' || branch.type === 'richtext') && branch.policies?.search !== false) {
      ftsRebuildNeeded = true
    }
  }
  // indexes are IF NOT EXISTS — safe to re-run the whole set
  statements.push(...generateIndexes(seed))
  return { statements, ftsRebuildNeeded }
}
```

> Why pass `existingColumns` in rather than reading the DB here? `packages/core` is pure
> and has no D1 access. Sprint 03's handler reads `PRAGMA table_info(content_{slug})`
> via the repository and passes the column-name set in. Keep core DB-free.

Export `planCreateSeed`, `planExtendSeed`, `ExtendPlan` from the barrel.

> **Note on `generateJunctionTable` being called twice in extend mode if it already
> exists:** it emits `CREATE TABLE IF NOT EXISTS`, so re-running is harmless. The only
> non-idempotent statement is `ADD COLUMN`, which is why it is guarded by
> `existingColumns.has(...)`.

## 7. `D1SeedRepository`

Create `apps/api/src/shared/seed.repository.d1.ts`. Model it on the existing
`D1SeedLayoutRepository` (`apps/api/src/shared/seed-layout.repository.d1.ts`).

```ts
// SPDX-License-Identifier: BUSL-1.1
/// <reference types="@cloudflare/workers-types" />
import type { ISeedRepository, SeedRecord, Seed } from '@beechcms/core'

export class D1SeedRepository implements ISeedRepository {
  constructor(private readonly db: D1Database) {}

  async listActive(): Promise<Seed[]> {
    const rs = await this.db
      .prepare(`SELECT definition FROM seeds WHERE status = 'active' ORDER BY created_at ASC`)
      .all<{ definition: string }>()
    const seeds: Seed[] = []
    for (const r of rs.results ?? []) {
      try { seeds.push(JSON.parse(r.definition) as Seed) } catch { /* skip corrupt */ }
    }
    return seeds
  }

  async listAll(): Promise<SeedRecord[]> {
    const rs = await this.db
      .prepare(`SELECT slug, definition, status, source, created_at, updated_at FROM seeds ORDER BY created_at ASC`)
      .all<{ slug: string; definition: string; status: string; source: string; created_at: number; updated_at: number }>()
    const out: SeedRecord[] = []
    for (const r of rs.results ?? []) {
      try {
        out.push({
          slug: r.slug, definition: JSON.parse(r.definition) as Seed,
          status: r.status as 'active' | 'deleted', source: r.source as 'code' | 'runtime',
          createdAt: r.created_at, updatedAt: r.updated_at,
        })
      } catch { /* skip corrupt */ }
    }
    return out
  }

  async get(slug: string): Promise<SeedRecord | null> {
    const r = await this.db
      .prepare(`SELECT slug, definition, status, source, created_at, updated_at FROM seeds WHERE slug = ? LIMIT 1`)
      .bind(slug)
      .first<{ slug: string; definition: string; status: string; source: string; created_at: number; updated_at: number }>()
    if (!r) return null
    return {
      slug: r.slug, definition: JSON.parse(r.definition) as Seed,
      status: r.status as 'active' | 'deleted', source: r.source as 'code' | 'runtime',
      createdAt: r.created_at, updatedAt: r.updated_at,
    }
  }

  async upsert(slug: string, definition: Seed, source: 'code' | 'runtime' = 'runtime'): Promise<void> {
    const now = Math.floor(Date.now() / 1000)
    await this.db
      .prepare(`
        INSERT INTO seeds (slug, definition, status, source, created_at, updated_at)
        VALUES (?, ?, 'active', ?, ?, ?)
        ON CONFLICT(slug) DO UPDATE SET
          definition = excluded.definition,
          status     = 'active',
          updated_at = excluded.updated_at
      `)
      .bind(slug, JSON.stringify(definition), source, now, now)
      .run()
  }

  async softDelete(slug: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000)
    await this.db
      .prepare(`UPDATE seeds SET status = 'deleted', updated_at = ? WHERE slug = ?`)
      .bind(now, slug)
      .run()
  }

  async getRegistryVersion(): Promise<number> {
    const r = await this.db
      .prepare(`SELECT value FROM seed_meta WHERE id = 'registry_version' LIMIT 1`)
      .first<{ value: string }>()
    return r ? parseInt(r.value, 10) || 1 : 1
  }

  async bumpRegistryVersion(): Promise<number> {
    // UPDATE … RETURNING is supported by D1's SQLite.
    const r = await this.db
      .prepare(`UPDATE seed_meta SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE id = 'registry_version' RETURNING value`)
      .first<{ value: string }>()
    return r ? parseInt(r.value, 10) : 1
  }
}
```

> On `upsert` preserving `source`: the `ON CONFLICT` branch above does **not** overwrite
> `source`, so a runtime edit to a code-loaded seed keeps `source='code'`. The insert
> branch sets it from the param (default `'runtime'`). That matches the intent.

## 8. Wire the repository into the context

In `apps/api/src/middleware/repository.middleware.ts`:
- Import `D1SeedRepository` and `ISeedRepository`.
- Add `seedRepository?: ISeedRepository` to `RepositoryOverrides`.
- Set it: `context.set('seedRepository', overrides?.seedRepository ?? new D1SeedRepository(database))`.

In `apps/api/src/types.ts`, add `seedRepository: ISeedRepository` to the `Variables`
type (find where `seedLayoutRepository` is declared and add alongside).

Do **not** consume it anywhere yet.

## 9. Tests

- `packages/core/src/seed-validation.test.ts` — one case per fatal + warning rule above,
  plus a clean-set pass. Assert the CLI's `validateSeeds` still produces identical
  fatal/warning classification on a representative fixture (regression against the
  delegation refactor).
- `packages/core/src/seed-ddl.test.ts` — `planCreateSeed` snapshot equals the CLI's
  prior `buildStatements` output for a seed with: a text branch, a searchable richtext
  branch (asserts FTS table + triggers present), `allowDrafts`, and a multi-relation
  branch (asserts junction). `planExtendSeed`: given an `existingColumns` set missing one
  alias, returns exactly one `ADD COLUMN` for it, `ftsRebuildNeeded=true` when the new
  branch is searchable text, and a junction `CREATE TABLE IF NOT EXISTS` for a new
  multi-relation branch.
- `packages/core/src/seed-registry.test.ts` — extend with `nextBranchId`: empty seed →
  `br_01`; seed with `br_01, br_03` → `br_04`; seed with custom `br_title` only → `br_01`.
- `apps/api/src/shared/seed.repository.d1.test.ts` — using the in-memory/Miniflare D1
  test harness used by `seed-layout.repository.d1`-style tests (follow the closest
  existing `*.repository.d1.test.ts`): upsert→get round-trip; `listActive` excludes
  `status='deleted'`; `softDelete` flips status; `bumpRegistryVersion` increments and
  returns the new value.

## 10. Acceptance criteria

- [ ] `npm run build` passes across all packages.
- [ ] `npm run test` passes (new + existing).
- [ ] `0032_seeds.sql` exists; `seeds` + `seed_meta` are also in `BASE_SCHEMA_SQL` and
      `SYSTEM_TABLES` in `init.ts`.
- [ ] `ISeedRepository`, `SeedRecord`, `validateSeedDefinitions`, `isSeedSetValid`,
      `SeedValidationIssue`, `nextBranchId`, `planCreateSeed`, `planExtendSeed`,
      `ExtendPlan` are all exported from the `@beechcms/core` barrel.
- [ ] CLI `validateSeeds` delegates to `validateSeedDefinitions` (no duplicated logic).
- [ ] `c.get('seedRepository')` resolves to a `D1SeedRepository` but is unused by handlers.
- [ ] Request behaviour is **unchanged** (no consumer reads the new repo yet).

## 11. Do NOT

- Do not change `index.ts` / `factory.ts` seed loading (sprint 02).
- Do not add any CRUD endpoint (sprint 03).
- Do not emit any `DROP`/`RENAME` SQL.
- Do not move layouts out of `seed_layouts`.
- Do not make `ISeedRegistry` async.
