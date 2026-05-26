You are a senior TypeScript engineer working on the Beech CMS monorepo.

## PROJECT CONTEXT

Do NOT explore the codebase further. All relevant context is provided in this prompt.
Read it fully before writing any code.

This is **Sprint 3 of 4** for the introduction of the native `relation` field type.

Sprint 1 added DDL emission (FK + index) and the pure `sortSeedsByDependencies`
helper. Sprint 2 wired the type into validation, the API problem-mapper, and
declared the canonical `articles.author_id → team` relation in the project's
`seed.ts`. This sprint adapts the **seed:load CLI** to the new ordering
requirement and hardens **draft promotion** against missing FK targets.

### Stack

- API: Cloudflare D1 (SQLite)
- CLI: `packages/cli` — TypeScript built to `packages/cli/dist/index.js`,
  invoked through `bin/cli.mjs` (root) and consumed by
  `apps/api/scripts/bootstrap-d1.mjs`.
- Tests: Vitest with `better-sqlite3` for SQLite-accurate FK semantics.

==========================================================================
SECTION 1 — VERIFIED FACTS (do not re-derive)
==========================================================================

VERIFIED via direct read of `packages/cli/src/commands/seed-load.ts`:

- `seed:load` is THE schema emitter. It iterates `Object.values(SEED_REGISTRY)`
  (or `args.registry`) in arbitrary insertion order and, for each seed, emits:
    1. `generateCreateTable(seed)`
    2. `...generateIndexes(seed)`
    3. `generateDraftTable(seed)` if `allowDrafts: true`
    4. `generateFtsTable(seed)` + `generateFtsTriggers(seed)` if applicable
  Then runs the concatenated SQL via `executeD1File()`.

- Order today is `Object.values(registry)` → insertion order of the project's
  `seed.ts` file. With foreign keys this is fragile: if `articles` is declared
  before `team`, `seed:load` fails because `content_team` does not yet exist
  when the FK on `author_id` is parsed.

- `packages/cli/src/lib/schema-diff.ts` is the source of `diffSeed()`, used
  by `seed:load --diff`. Sprint 3 extends it to surface FK drift.

- `validateSeeds()` (in `packages/cli/src/commands/validate.ts`) is called
  before `seed:load` runs. Sprint 3 extends it to fail-fast on broken relation
  graphs (unknown target, cycles).

VERIFIED policy: **BeechCMS is in BETA.** No backwards-compatibility burden.
Schema changes go into `apps/api/migrations/0000_v040_base.sql` (system tables
only — users, sessions, media, etc.) and the developer runs
`npm run dev:reset` to wipe and re-init. Content tables are NEVER added via
numbered migrations; they are always emitted by `seed:load` from the project's
`seed.ts`. Sprint 3 honours this: no new migration file is created.

==========================================================================
SECTION 2 — WHAT THIS SPRINT DELIVERS
==========================================================================

1. `seed:load` orders seeds via `sortSeedsByDependencies()` before emission.
   First-load of a fresh DB succeeds even when the project's `seed.ts`
   declares dependent seeds in arbitrary order.

2. `validateSeeds()` learns to fail-fast on:
   - A relation branch pointing to a `targetSeed` that is not in the registry.
   - A dependency cycle between relation branches.
   These errors are reported with `pc.red` formatting matching the existing
   CLI style. Cycles include the participating slugs in the message.

3. `diffSeed()` surfaces FK drift:
   - A relation column missing the expected `REFERENCES content_<target>(id)`
     clause is reported as `≠ FK mismatch`.
   - A relation column missing the expected index is reported alongside.
   The shape mirrors the existing `type_mismatch` / `missing` status output.

4. The draft promotion path (`publishDraft` in the D1 content repository)
   pre-validates every relation branch before the atomic `INSERT OR REPLACE`.
   If any non-null relation value points to a missing target, promotion fails
   with a typed `RelationTargetNotFoundError` mapped by Sprint 2's problem
   mapper to a `422 Unprocessable Entity`.

5. The test harness enables `PRAGMA foreign_keys = ON` at connection
   bootstrap. Without this, the FK assertions added in Sprint 2 and below
   silently pass under `better-sqlite3` (which ships with FKs disabled).

==========================================================================
SECTION 3 — STEP-BY-STEP PLAN
==========================================================================

--------------------------------------------------------------------------
STEP 1 — Topological ordering inside `seed:load`
File: packages/cli/src/commands/seed-load.ts
--------------------------------------------------------------------------

Import the new helper from core and apply it at the two call sites that
turn `registry` into an iterable list (currently `Object.values(registry)`
at lines 38 and 80):

```ts
import { sortSeedsByDependencies, /* … */ } from '@beechcms/core'

// …

async function runDiff(options: WranglerOptions, registry: Record<string, Seed>) {
  const seeds = sortSeedsByDependencies(Object.values(registry))
  // …
}

async function runLoad(options: WranglerOptions, dryRun: boolean, registry: Record<string, Seed>) {
  const seeds = sortSeedsByDependencies(Object.values(registry))
  // …
}
```

Do NOT touch `buildStatements(seed)` — per-seed SQL generation is correct
already.

Do NOT introduce `PRAGMA foreign_keys = OFF` anywhere. Topological order
is the ONLY accepted mechanism for ordering FK-bearing CREATE TABLE
statements in BeechCMS.

After editing, rebuild the package:

```bash
cd packages/cli && npm run build
```

This refreshes `packages/cli/dist/index.js`, which `bin/cli.mjs` resolves.

--------------------------------------------------------------------------
STEP 2 — Pre-load relation graph validation
File: packages/cli/src/commands/validate.ts
--------------------------------------------------------------------------

Locate the `validateSeeds(registry)` function (already invoked by
`seedLoad()` at line 133 of `seed-load.ts`). Extend it with two checks
performed BEFORE the existing validators:

1. **Unknown relation target**: for each relation branch in each seed,
   verify `registry[branch.targetSeed]` exists. Otherwise emit an error:
   ```
   Seed 'articles': branch 'author_id' targets unknown seed 'team'
   ```

2. **Dependency cycle**: call `sortSeedsByDependencies(Object.values(registry))`
   inside a `try/catch`. The helper already throws on cycles with the
   participating slugs in the message — surface it verbatim into the
   validation errors list.

Errors must use the same `{ seed: slug, messages: string[] }` shape the
existing validators return so that the count and formatting at
`seed-load.ts:135` remain correct.

These two checks must abort `seed:load` (treat them as ERRORS, not warnings)
because both states would produce broken SQL that the engine cannot recover
from. If `validateSeeds()` currently does not have a "fatal vs warning"
distinction, add one — relation graph errors are fatal; the existing checks
remain warnings as they are today.

--------------------------------------------------------------------------
STEP 3 — Schema diff: detect FK drift
File: packages/cli/src/lib/schema-diff.ts
--------------------------------------------------------------------------

`diffSeed()` already inspects column presence and SQL type. Extend it for
relation branches:

1. For each relation branch, query SQLite's
   `PRAGMA foreign_key_list('content_<slug>')` and confirm:
   - An FK exists on `branch.alias` pointing to `content_<targetSeed>(id)`.
   - The `on_delete` action matches `branch.onDelete ?? 'SET NULL'`.

2. Confirm the B-tree index `idx_<slug>_<alias>` exists via
   `PRAGMA index_list('content_<slug>')`.

Add new status values to the column result type:
- `'fk_missing'` — column exists but no FK constraint references the expected target
- `'fk_mismatch'` — FK exists but points to a different target or has a different ON DELETE rule
- `'index_missing'` — relation column has no covering index

Add matching pretty-print branches in `runDiff()` (`seed-load.ts:42-67`):
```ts
} else if (col.status === 'fk_missing') {
  console.log(pc.red(`    ⤬ missing FK: ${col.name} → content_${col.expectedTarget}(id)`))
} else if (col.status === 'fk_mismatch') {
  console.log(pc.yellow(`    ⤬ FK mismatch: ${col.name} expected ${col.expected}, got ${col.actual}`))
} else if (col.status === 'index_missing') {
  console.log(pc.yellow(`    ⊘ missing index on ${col.name}`))
}
```

Resolution path for `fk_*` drift on a BETA project: edit `seed.ts` if the
declaration is wrong, then `npm run dev:reset && npx beech seed:load --local`.
SQLite cannot ALTER an existing column to add an FK without a full table
rewrite, and BETA explicitly accepts wipes. Do NOT attempt a recreate-table
migration path in this sprint.

--------------------------------------------------------------------------
STEP 4 — Harden draft promotion against missing targets
File: apps/api/src/shared/content.repository.d1.ts (locate `publishDraft`)
--------------------------------------------------------------------------

Before the existing atomic `INSERT OR REPLACE INTO content_<slug> SELECT …
FROM content_<slug>_drafts WHERE entry_id = ?`, run a pre-check:

```ts
const relationBranches = seed.branches.filter(b => b.type === 'relation')
if (relationBranches.length > 0) {
  // Read draft row once to avoid N queries to the drafts table inside the loop.
  const draftRow = await db
    .prepare(`SELECT * FROM content_${seed.slug}_drafts WHERE entry_id = ?`)
    .bind(entryId)
    .first<Record<string, unknown>>()

  for (const branch of relationBranches) {
    const value = draftRow?.[branch.alias]
    if (value == null) continue
    const exists = await db
      .prepare(`SELECT 1 FROM content_${branch.targetSeed} WHERE id = ? LIMIT 1`)
      .bind(value)
      .first()
    if (!exists) {
      throw new RelationTargetNotFoundError({
        alias: branch.alias,
        targetSeed: branch.targetSeed!,
        value: String(value),
      })
    }
  }
}
```

`RelationTargetNotFoundError` is the typed error introduced in Sprint 2.
The problem-mapper there already routes it to 422 with the
`relation-target-not-found` type. Verify the mapper handles this case; if
not, extend it.

Rationale: the drafts mirror table does NOT carry FK constraints on branch
columns (verified at `engine.ts:130–153` — `generateDraftTable` emits only
the `entry_id → main(id) ON DELETE CASCADE` FK, never on branches). So a
draft can legitimately reference a `team-X` that has since been deleted.
The pre-check catches this BEFORE the atomic promote raises an opaque
SQLite FK violation, producing a clean, attributable error.

This pre-check is O(R) per publish where R = number of relation branches on
the seed. It runs only on promote, never on save. Add a one-line comment to
document the trade-off.

--------------------------------------------------------------------------
STEP 5 — Test harness FK enforcement
File: apps/api/src/test/setup.ts (or the existing D1TestDatabase factory)
--------------------------------------------------------------------------

After opening the `better-sqlite3` connection, immediately run:

```ts
testDb.pragma('foreign_keys = ON')
```

`better-sqlite3` ships with FK enforcement OFF by default. Without this,
every FK test in Sprint 2 and the new ones below silently passes. Confirm
this is set exactly once at connection construction.

D1 in production already enables FKs by default — no change needed there.

--------------------------------------------------------------------------
STEP 6 — Tests
Files:
  packages/cli/src/test/seed-load.test.ts        -- extend if exists, else create
  packages/cli/src/test/validate.test.ts         -- extend
  apps/api/src/test/draft-relation.test.ts       -- new
--------------------------------------------------------------------------

### CLI tests

1. `seed:load --dry-run` on a registry where `articles` is declared BEFORE
   `team` emits the `content_team` CREATE TABLE before the `content_articles`
   one. Assert string ordering in the dry-run output.

2. `validate` on a registry with `articles.author_id → unknownSlug` reports
   exactly one fatal error containing both the seed slug and the unknown
   target. `seed:load` aborts (exit non-zero) on this input.

3. `validate` on a cyclic registry (`a → b → a`) reports a cycle error
   containing both slugs.

### Draft promotion integration tests (`draft-relation.test.ts`)

Using the D1TestDatabase harness with `pragma foreign_keys = ON`:

1. Save a draft on `articles/X` with `author_id: 'team-1'`. Delete `team-1`
   from `content_team` (no error — drafts mirror has no FK on branch columns).
   Publish the draft. Expect HTTP 422 with the
   `relation-target-not-found` problem type and a `detail` mentioning
   `author_id` and `team-1`.

2. Save a draft with `author_id: null`. Publish. Expect 204.

3. Save a draft with a valid `author_id` whose target still exists. Publish.
   Expect 204 and the live row to carry the value.

==========================================================================
SECTION 4 — OUT OF SCOPE
==========================================================================

- Dashboard FieldRenderers and `displayNameAlias` resolution — Sprint 4.
- Embedding target labels in list endpoint responses to mitigate N+1 — Sprint 4.
- An ALTER-based path to add FKs to columns created by older `seed:load` runs
  — not needed in BETA; `npm run dev:reset` is the documented escape hatch.
- Many-to-many / polymorphic relations.

==========================================================================
SECTION 5 — COMPLETION CHECKLIST
==========================================================================

[ ] `seed:load` consumes `sortSeedsByDependencies` at both `runDiff` and
    `runLoad`.
[ ] `packages/cli` is rebuilt (`dist/index.js` updated).
[ ] `validateSeeds()` fails fatally on unknown targets and dependency cycles.
[ ] `diffSeed()` reports `fk_missing`, `fk_mismatch`, and `index_missing`
    for relation branches.
[ ] `publishDraft` pre-validates every relation branch against its target
    table and raises `RelationTargetNotFoundError` on misses.
[ ] The Sprint 2 problem-mapper routes `RelationTargetNotFoundError` to a
    422 with `relation-target-not-found`.
[ ] Test harness enables `PRAGMA foreign_keys = ON`.
[ ] All new tests pass; no existing test regresses.
[ ] `PRAGMA foreign_keys = OFF` does NOT appear anywhere in the codebase.
[ ] No new numbered migration file was added; `0000_v040_base.sql` is
    edited only if a system-table change is genuinely required.
