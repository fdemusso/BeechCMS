# Sprint Plan — Schema Sync & GitOps Migrations (Sprint 8)

> Feature brief: `stages/00_ideation/output/feature_brief.md`
> Architecture VETO pass: `_config/ponytail_arch.md` · Graph routing: `_config/graph_router.md`
> Target package: `@beechcms/cli` (Node-side tooling) — **no** Worker/API runtime changes.

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Phase 5 made the **local** schema mutable from the dashboard: a developer edits a
Seed, runs `beech seed:load`, and the content tables (`content_{slug}`) are
created/extended live against local D1. That live-mutation path is correct for
local DX but is the wrong shape for **production**, where schema changes must be
reviewed, versioned in Git, and applied deterministically by CI — never by a Worker
mutating its own DB at request time. This sprint closes that gap by producing
**reviewable SQL migration artifacts** from the same Seed registry, so the
production database is advanced through `wrangler d1 migrations apply --remote`
in a pipeline rather than through runtime DDL.

Architectural rationale and how this sprint stays inside the invariants:

- **Botanical Invariant (no bypass of `@beech/core`).** The migration SQL is **not**
  hand-written in the CLI. It is emitted exclusively by the existing core generators
  — `generateAddColumn`, `generateIndexes`, `planCreateSeed`/`planExtendSeed`
  (`packages/core/src/engine.ts`, `packages/core/src/seed-ddl.ts`) — and the drift is
  computed by the existing `getExpectedColumns` contract. The CLI never composes
  `ALTER TABLE …` strings itself. One source of DDL truth, reused for both runtime
  (`D1SchemaMutator.execDdl`) and GitOps (migration files).
- **Vertical Slice Architecture.** All new code lives inside the `@beechcms/cli`
  package. No cross-feature imports into `apps/api/features/*` or
  `apps/dashboard/src/features/*`; the CLI consumes only the public `@beechcms/core`
  barrel. The diff engine that already exists (`packages/cli/src/lib/schema-diff.ts`)
  is reused, not duplicated.
- **Cloudflare Purity / YAGNI.** No new runtime, no background job, no ORM. The
  pipeline is a documented GitHub Actions **template**, not a runner we build or host.
  Migrations are **additive-only**; destructive drift (renames, drops, type changes)
  is surfaced as a commented, non-executable warning block for human review — it is
  never auto-applied, matching the additive contract of `ISchemaMutator.execDdl`.

This must come before any further production-schema feature because, until schema
changes are versioned artifacts, there is no safe way to evolve `content_{slug}`
tables on a remote D1 — every downstream production feature depends on this rail.

### Architectural VETO correction (brief vs. graph reality)

The brief names `planSeedDdl` and `D1SchemaMutator` "in dry-run mode". The graph
shows neither is usable as written from the CLI, and the plan corrects this:

1. **`planSeedDdl` does not exist.** The real, exported core functions are
   `planCreateSeed`, `planExtendSeed`, `planFtsRebuild` (`seed-ddl.ts`) plus
   `generateAddColumn` / `generateIndexes` / `getExpectedColumns` (`engine.ts`).
2. **`D1SchemaMutator` cannot run in the CLI.** It is a Worker-runtime class whose
   constructor requires a live `D1Database` binding
   (`apps/api/src/shared/schema-mutator.d1.ts`). The CLI is a **Node** process and
   reaches D1 only through the `wrangler d1 execute` subprocess wrapper
   (`packages/cli/src/lib/wrangler.ts → queryD1`). Re-instantiating `D1SchemaMutator`
   in Node is impossible and would also violate the slice boundary. **VETO** on that
   approach. The correct, already-present primitive is `diffSeed()` in
   `packages/cli/src/lib/schema-diff.ts`, which introspects the live DB via `queryD1`
   and compares against `getExpectedColumns`. Sprint 8 adds a SQL-**emitting** layer
   on top of that diff, plus a dedicated `schema:diff` command.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**CLI package (`@beechcms/cli`, v0.6.0-preview.3).** Commands live in
`packages/cli/src/commands/*` and are exported through the barrel
`packages/cli/src/index.ts`. The executable dispatcher is `bin/cli.mjs`, which maps
command strings to handlers via a `COMMANDS` lookup object and loads the local Seed
registry with `tryLoadLocalRegistry()` (reads `seeds.ts`/`seeds.js` from cwd or
`apps/api`). Adding a command means: (a) new file in `commands/`, (b) export from
`index.ts`, (c) new `cmd*` handler + `COMMANDS` entry + help text in `bin/cli.mjs`.
The `COMMANDS` map is a dispatch table, **not** an ordered middleware chain — there
is no API middleware registration in scope this sprint (this sprint touches Node
tooling only). The only ordering that matters is **seed dependency order**, enforced
everywhere by `sortSeedsByDependencies(Object.values(registry))` so relation FK
targets exist before referrers.

**Diff already exists.** `packages/cli/src/lib/schema-diff.ts` exports
`diffSeed(seed, options): Promise<SeedDiff>`. It calls `queryD1('PRAGMA
table_info(content_{slug})')` and the `foreign_key_list` / `index_list` PRAGMAs,
then compares against `getExpectedColumns(seed)` from core. Output shape:

```ts
interface SeedDiff   { slug: string; tableExists: boolean; columns: ColumnDiff[] }
interface ColumnDiff {
  name: string
  status: 'ok'|'missing'|'extra'|'type_mismatch'
        | 'fk_missing'|'fk_mismatch'|'index_missing'
  expectedType?: string; actualType?: string
  expectedTarget?: string; expected?: string; actual?: string
}
```

Today this diff is consumed **only** for human-readable printing inside
`runDiff()` in `commands/seed-load.ts` (invoked by `beech seed:load --diff`). It
emits **no SQL**. That rendering logic is currently inlined in `seed-load.ts` and
will be extracted so `schema:diff` does not duplicate it.

**Core DDL generators (the only sanctioned SQL source).**
`packages/core/src/engine.ts` exports `getExpectedColumns(seed): SchemaColumn[]`
(`{name, sqlType: 'TEXT'|'REAL'|'INTEGER', notNull, isPk}`), `generateAddColumn(seed,
branch)` → `ALTER TABLE content_{slug} ADD COLUMN {alias} {sqlType}{fk-clause};`, and
`generateIndexes(seed)` → `CREATE INDEX IF NOT EXISTS …`. `seed-ddl.ts` exports
`planCreateSeed(seed)` (full create-from-scratch set) and `planExtendSeed(seed,
existingColumns: Set<string>): { statements, ftsRebuildNeeded }` (additive ADD
COLUMN + indexes + junction tables; never drops/renames). Both modules are
re-exported from the `@beechcms/core` barrel (`packages/core/src/index.ts` lines
`export * from './engine.js'` and `export * from './seed-ddl.js'`).

**Wrangler bridge.** `packages/cli/src/lib/wrangler.ts` provides
`queryD1<T>(sql, options)`, `executeD1File(sql, options)`, `findWranglerConfig()`,
and `resolveDbName(configPath)`. SQL is passed via temp `--file` (Windows quoting
safety). `WranglerOptions = { db, local, configPath }`.

**Migrations directory.** Production migrations live in `apps/api/migrations/` with
zero-padded 4-digit incremental prefixes. Current highest is
`0033_dashboard_layouts.sql` (others: `0029_automations.sql`, `0031_site_settings.sql`,
`0032_seeds.sql`). **The next index is `0034`.** The brief's `0031_…` is illustrative
only; the generator must compute the next prefix by scanning the directory.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

Exact files produced or modified. This sprint ships **full feature code** for the
diff→SQL emitter and the `schema:diff` command (no stubs), plus docs. It ships
**only a documentation template** for CI (no runner).

**New files**
1. `packages/cli/src/lib/migration-writer.ts` — pure functions that turn a
   `SeedDiff[]` into an additive migration SQL string and write it to the migrations
   directory with the next incremental prefix. Imports DDL **only** from
   `@beechcms/core`.
2. `packages/cli/src/commands/schema-diff.ts` — the `schemaDiff(args)` command:
   resolve config → load registry → `diffSeed` per seed (dependency-sorted) →
   render drift → optionally write a migration file.
3. `packages/cli/src/test/schema-diff.test.ts` — unit tests (vitest) for
   `nextMigrationIndex`, `buildMigrationSql` (additive emit + destructive-warning
   block), and the command's no-drift / drift / `--write` branches with a mocked
   `queryD1`.
4. `docs/ci/github-actions-migrations.yml` — GitHub Actions **template** that runs
   `wrangler d1 migrations apply --remote` before `wrangler deploy`.
5. `docs/Sprints/dx-improvement/sprint_08_schema_sync_gitops_migrations.md` —
   already present as the brief stub; **expand** it into the GitOps workflow guide
   (see Task 5). *(Modified, not new.)*

**Modified files**
6. `packages/cli/src/index.ts` — `export { schemaDiff } from './commands/schema-diff.js'`
   and `export type { SchemaDiffOptions }`.
7. `bin/cli.mjs` — add `'schema:diff': cmdSchemaDiff` to `COMMANDS`, add the
   `cmdSchemaDiff(args)` handler, and add the `schema:diff` help block.
8. `packages/cli/src/commands/seed-load.ts` — replace the inlined `ColumnDiff`
   rendering inside `runDiff()` with a call to the new shared `renderSeedDiff()`
   (exported from `lib/schema-diff.ts`) to avoid duplicated printing logic (DRY/VSA).

**Explicitly excluded from code:** the CI runner itself (template only), any
destructive migration emission, and any change to `apps/api` or `apps/dashboard`.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### Task 1 — Extract shared diff renderer (`lib/schema-diff.ts`)

Move the per-column console formatting currently inlined in `seed-load.ts`'s
`runDiff()` into an exported function so both commands share it. Add to
`packages/cli/src/lib/schema-diff.ts`:

```ts
import pc from 'picocolors'

/** Returns true if the seed's table fully matches its Seed (no drift). */
export function isSeedClean(diff: SeedDiff): boolean {
  return diff.tableExists && diff.columns.every(c => c.status === 'ok')
}

/** Human-readable drift report for one seed. Pure formatting — no I/O decisions. */
export function renderSeedDiff(diff: SeedDiff): void {
  const table = `content_${diff.slug}`
  if (!diff.tableExists) { console.log(pc.red(`  ✗ ${table} — table missing`)); return }
  const problems = diff.columns.filter(c => c.status !== 'ok')
  if (problems.length === 0) { console.log(pc.green(`  ✓ ${table}`)); return }
  console.log(pc.yellow(`  ⚠ ${table}`))
  for (const col of problems) {
    switch (col.status) {
      case 'missing':       console.log(pc.red(`    + missing column: ${col.name} ${col.expectedType}`)); break
      case 'extra':         console.log(pc.dim(`    ~ orphaned column: "${col.name}" (${col.actualType}) — in DB, not in seeds.ts`)); break
      case 'type_mismatch': console.log(pc.red(`    ≠ type mismatch:  ${col.name} (expected ${col.expectedType}, got ${col.actualType})`)); break
      case 'fk_missing':    console.log(pc.red(`    ⤬ missing FK: ${col.name} → content_${col.expectedTarget}(id)`)); break
      case 'fk_mismatch':   console.log(pc.yellow(`    ⤬ FK mismatch: ${col.name} expected ${col.expected}, got ${col.actual}`)); break
      case 'index_missing': console.log(pc.yellow(`    ⊘ missing index on ${col.name}`)); break
    }
  }
}
```

Then in `seed-load.ts` `runDiff()`, delete the inlined `if/else` block and call
`renderSeedDiff(result)` per seed, keeping the existing summary footer.

### Task 2 — Migration writer (`packages/cli/src/lib/migration-writer.ts`)

Additive-only SQL emission. **All DDL comes from core generators; the CLI assembles,
it never authors SQL.** Destructive statuses become a commented warning block.

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  generateAddColumn,
  generateIndexes,
  planCreateSeed,
  type Seed,
} from '@beechcms/core'
import type { SeedDiff } from './schema-diff.js'

/** Statuses we will NOT auto-migrate — they need human review in a hand-written file. */
const DESTRUCTIVE: ReadonlySet<SeedDiff['columns'][number]['status']> = new Set([
  'extra', 'type_mismatch', 'fk_mismatch',
])

export interface MigrationPlan {
  /** Full SQL file body (may be empty if no additive changes). */
  sql: string
  /** Number of executable (additive) statements emitted. */
  additiveCount: number
  /** Slugs whose drift includes destructive changes that were NOT emitted. */
  destructiveSlugs: string[]
}

/** Scans a migrations dir and returns the next zero-padded 4-digit prefix (e.g. "0034"). */
export function nextMigrationIndex(migrationsDir: string): string {
  if (!existsSync(migrationsDir)) return '0000'
  let max = -1
  for (const f of readdirSync(migrationsDir)) {
    const m = /^(\d{4})_/.exec(f)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return String(max + 1).padStart(4, '0')
}

/**
 * Build an ADDITIVE migration from already-computed diffs.
 * - tableExists === false        → full planCreateSeed(seed)
 * - status 'missing'             → generateAddColumn(seed, branch)
 * - status 'index_missing'       → matching CREATE INDEX IF NOT EXISTS line
 * - destructive statuses         → emitted as a commented -- ⚠ block, never executable
 * `seeds` MUST be dependency-sorted by the caller (sortSeedsByDependencies).
 */
export function buildMigrationSql(
  diffs: SeedDiff[],
  registry: Record<string, Seed>,
): MigrationPlan {
  const lines: string[] = []
  let additiveCount = 0
  const destructiveSlugs: string[] = []

  for (const diff of diffs) {
    const seed = registry[diff.slug]
    if (!seed) continue

    if (!diff.tableExists) {
      lines.push(`-- ${diff.slug}: create table from scratch`)
      for (const stmt of planCreateSeed(seed)) { lines.push(stmt); additiveCount++ }
      lines.push('')
      continue
    }

    const missing = diff.columns.filter(c => c.status === 'missing')
    const idxMissing = diff.columns.filter(c => c.status === 'index_missing')
    const destructive = diff.columns.filter(c => DESTRUCTIVE.has(c.status))

    if (missing.length || idxMissing.length) {
      lines.push(`-- ${diff.slug}: additive changes`)
      for (const col of missing) {
        const branch = seed.branches.find(b => b.alias === col.name)
        if (branch) { lines.push(generateAddColumn(seed, branch)); additiveCount++ }
      }
      // generateIndexes is idempotent (CREATE INDEX IF NOT EXISTS) — re-emitting is safe.
      if (idxMissing.length) {
        for (const stmt of generateIndexes(seed)) { lines.push(stmt); additiveCount++ }
      }
      lines.push('')
    }

    if (destructive.length) {
      destructiveSlugs.push(diff.slug)
      lines.push(`-- ⚠ ${diff.slug}: DESTRUCTIVE drift NOT auto-migrated — review manually:`)
      for (const col of destructive) {
        lines.push(`--   ${col.status}: ${col.name}` +
          (col.actualType ? ` (db: ${col.actualType})` : ''))
      }
      lines.push('')
    }
  }

  return { sql: lines.join('\n').trimEnd() + '\n', additiveCount, destructiveSlugs }
}

/** Writes the migration file and returns its absolute path. */
export function writeMigrationFile(
  migrationsDir: string, index: string, name: string, sql: string,
): string {
  if (!existsSync(migrationsDir)) mkdirSync(migrationsDir, { recursive: true })
  const safe = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'schema_sync'
  const file = join(migrationsDir, `${index}_${safe}.sql`)
  writeFileSync(file, sql, 'utf-8')
  return file
}
```

### Task 3 — `schema:diff` command (`packages/cli/src/commands/schema-diff.ts`)

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import pc from 'picocolors'
import { resolve } from 'node:path'
import { SEED_REGISTRY, sortSeedsByDependencies, type Seed } from '@beechcms/core'
import { findWranglerConfig, resolveDbName, type WranglerOptions } from '../lib/wrangler.js'
import { diffSeed, renderSeedDiff, isSeedClean } from '../lib/schema-diff.js'
import { nextMigrationIndex, buildMigrationSql, writeMigrationFile } from '../lib/migration-writer.js'

export interface SchemaDiffOptions {
  /** Compare against remote D1 (default: local). */
  local: boolean
  /** When set, write an additive migration file instead of just printing. */
  write: boolean
  /** Optional migration name (used in the filename). */
  name?: string
  /** Override migrations dir (default: <cwd>/apps/api/migrations, then <cwd>/migrations). */
  migrationsDir?: string
  /** Override D1 database name. */
  db?: string
  registry?: Record<string, Seed> | null
}

function resolveMigrationsDir(override?: string): string {
  if (override) return resolve(process.cwd(), override)
  const apiDir = resolve(process.cwd(), 'apps', 'api', 'migrations')
  return apiDir // falls back to cwd/migrations only if apps/api absent — see existsSync in writer
}

export async function schemaDiff(args: SchemaDiffOptions): Promise<void> {
  const registry = args.registry ?? SEED_REGISTRY
  if (Object.keys(registry).length === 0) {
    console.log(pc.yellow('\n  ✗ No seeds found — nothing to diff.\n'))
    return
  }

  const configPath = findWranglerConfig()
  const options: WranglerOptions = { db: args.db ?? resolveDbName(configPath), local: args.local, configPath }
  const seeds = sortSeedsByDependencies(Object.values(registry))

  console.log(pc.cyan(`\n  Diffing schema vs ${args.local ? 'local' : 'remote'} D1 (${options.db})…\n`))
  const diffs = []
  let clean = true
  for (const seed of seeds) {
    const d = await diffSeed(seed, options)
    diffs.push(d)
    renderSeedDiff(d)
    if (!isSeedClean(d)) clean = false
  }

  if (clean) { console.log(pc.green('\n  Schema matches seeds. No migration needed.\n')); return }

  const plan = buildMigrationSql(diffs, registry)
  if (!args.write) {
    console.log(pc.dim('\n  -- proposed additive migration (preview):\n'))
    console.log(plan.sql)
    if (plan.destructiveSlugs.length) {
      console.log(pc.yellow(`\n  ⚠ Destructive drift in: ${plan.destructiveSlugs.join(', ')} — not auto-migrated.`))
    }
    console.log(pc.cyan('\n  → Re-run with --write to save the migration file.\n'))
    return
  }

  if (plan.additiveCount === 0) {
    console.log(pc.yellow('\n  ⚠ Only destructive drift detected — no additive migration written.'))
    console.log(pc.dim('  Author a reviewed migration by hand for renames/drops/type changes.\n'))
    return
  }

  const dir = resolveMigrationsDir(args.migrationsDir)
  const index = nextMigrationIndex(dir)
  const file = writeMigrationFile(dir, index, args.name ?? 'schema_sync', plan.sql)
  console.log(pc.green(`\n  ✓ Wrote ${file} (${plan.additiveCount} statement(s)).`))
  console.log(pc.dim('  Review, commit, then `wrangler d1 migrations apply --remote` in CI.\n'))
  if (plan.destructiveSlugs.length) {
    console.log(pc.yellow(`  ⚠ Destructive drift in ${plan.destructiveSlugs.join(', ')} was NOT included.\n`))
  }
}
```

### Task 4 — Wire the command (`packages/cli/src/index.ts` + `bin/cli.mjs`)

In `packages/cli/src/index.ts` add:

```ts
export { schemaDiff } from './commands/schema-diff.js'
export type { SchemaDiffOptions } from './commands/schema-diff.js'
```

In `bin/cli.mjs`: add the `COMMANDS` entry and handler (placement inside the object
is irrelevant — it is a lookup map, not an ordered chain):

```js
const COMMANDS = {
  // …existing…
  'schema:diff':    cmdSchemaDiff,
}

async function cmdSchemaDiff(args) {
  const remote = args.includes('--remote')
  const write  = args.includes('--write')
  const nameIdx = args.indexOf('--name')
  const name   = nameIdx !== -1 ? args[nameIdx + 1] : undefined
  const dbIdx  = args.indexOf('--db')
  const db     = dbIdx !== -1 ? args[dbIdx + 1] : undefined
  const registry = await tryLoadLocalRegistry()
  const { schemaDiff } = await import('@beechcms/cli')
  await schemaDiff({ local: !remote, write, name, db, registry })
}
```

Add to the `help()` text, after `seed:load`:

```
    schema:diff     Diff SEED_REGISTRY vs the live D1 schema and generate an
                    additive SQL migration in apps/api/migrations/
      --write         Write the migration file (default: preview only)
      --name <name>   Migration name used in the filename
      --remote        Diff against remote D1 (default: local)
      --db <name>     Override D1 database name
```

### Task 5 — CI template + GitOps docs

`docs/ci/github-actions-migrations.yml` (template — committed as docs, not active):

```yaml
name: Deploy (D1 migrations + Worker)
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      # Apply versioned migrations BEFORE deploying the Worker.
      - name: Apply D1 migrations
        run: pnpm --filter @beechcms/api exec wrangler d1 migrations apply beech-db --remote
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      - name: Deploy Worker
        run: pnpm --filter @beechcms/api exec wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

Expand `docs/Sprints/dx-improvement/sprint_08_schema_sync_gitops_migrations.md` with
the developer workflow: edit Seed → `beech schema:diff --write --name <change>` →
review/commit the `apps/api/migrations/NNNN_*.sql` → push → CI applies it. Document
that **destructive** changes are intentionally excluded and must be authored by hand.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run from the repo root unless noted.

- `pnpm --filter @beechcms/core build`           # core barrel still type-clean
- `pnpm --filter @beechcms/cli exec tsc --noEmit` # CLI types (esp. new lib + command)
- `pnpm --filter @beechcms/cli test`             # vitest: schema-diff.test.ts passes
- `pnpm --filter @beechcms/cli lint`             # eslint clean
- `pnpm run build`                               # full Turborepo build is green

Manual end-to-end (local D1):

- `npx beech init --db --local`                  # ensure system tables exist
- `npx beech seed:load --local`                  # baseline content tables
- *(edit `seeds.ts`: add one new branch to an existing seed)*
- `npx beech schema:diff --local`                # preview shows the ADD COLUMN
- `npx beech schema:diff --local --write --name add_field`
  # writes apps/api/migrations/0034_add_field.sql
- `npx wrangler d1 migrations apply beech-db --local`  # applies cleanly
- `npx beech schema:diff --local`                # now reports "Schema matches seeds"

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `beech schema:diff` (no flags) prints per-seed drift and an additive SQL
      **preview**; exits without writing files.
- [ ] `beech schema:diff --write` writes `apps/api/migrations/NNNN_<name>.sql` where
      `NNNN` is the existing max prefix + 1 (verified: next is `0034`), zero-padded
      to 4 digits.
- [ ] Every emitted `ALTER TABLE … ADD COLUMN` / `CREATE INDEX` / `CREATE TABLE`
      statement is produced by a `@beechcms/core` generator (`generateAddColumn`,
      `generateIndexes`, `planCreateSeed`). **No `ALTER`/`CREATE` string is authored
      in the CLI.** (Botanical Invariant — grep the new files: zero literal
      `ALTER TABLE`/`CREATE TABLE` outside core imports.)
- [ ] Destructive drift (`extra`, `type_mismatch`, `fk_mismatch`) is **never** emitted
      as executable SQL — only as a commented `-- ⚠` block — and the slug is reported
      to the user.
- [ ] When only destructive drift exists, `--write` writes nothing and instructs the
      user to author the migration by hand.
- [ ] `schemaDiff` reuses `diffSeed` and `getExpectedColumns`; no second diff
      implementation is introduced. `renderSeedDiff` is shared by `seed:load --diff`
      and `schema:diff` (no duplicated rendering).
- [ ] Seeds are processed in `sortSeedsByDependencies` order so FK targets precede
      referrers in the generated file.
- [ ] New code lives only in `@beechcms/cli`; it imports core via the public barrel
      and `apps/api`/`apps/dashboard` are untouched (VSA).
- [ ] `SchemaDiffOptions` is fully typed and exported; `tsc --noEmit` passes with no
      `any`/`@ts-ignore`.
- [ ] `bin/cli.mjs` registers `schema:diff` and documents it in `help()`.
- [ ] `pnpm run build`, CLI tests, and lint are all green.
- [ ] CI template `docs/ci/github-actions-migrations.yml` and the expanded sprint doc
      are committed.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executing agent MUST NOT:

- Build, host, or execute any CI runner. Only the GitHub Actions **template** in
  `docs/` is in scope — no live workflow under `.github/workflows/`.
- Emit or auto-apply **destructive** SQL (DROP TABLE, DROP/RENAME COLUMN, type
  rebuilds, FTS rebuilds). `planFtsRebuild` and the `execDestructive` path are out of
  scope; surface destructive drift as commented warnings only.
- Instantiate or import `D1SchemaMutator` in the CLI, or otherwise open a `D1Database`
  binding from Node. Live DB access stays through `queryD1` (wrangler subprocess).
- Modify `apps/api` or `apps/dashboard` source, the Worker middleware chain, or any
  runtime DDL path.
- Auto-apply migrations from `schema:diff` itself (no `wrangler d1 migrations apply`
  invocation inside the command — application is the pipeline's job).
- Introduce a second diff/inspection implementation, an ORM, or a migration-tracking
  table beyond what `wrangler d1 migrations` already manages.
- Add interactive prompts to `schema:diff` — it must be non-interactive (CI/agent
  friendly), matching `onboard --yes` conventions.
