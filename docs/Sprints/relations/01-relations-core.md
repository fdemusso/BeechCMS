You are a senior TypeScript engineer working on the Beech CMS monorepo.

## PROJECT CONTEXT

Do NOT explore the codebase further. All relevant context is provided in this prompt.
Read it fully before writing any code.

This is **Sprint 1 of 4** for the introduction of a native `relation` (Foreign Key) field
type in BeechCMS. Scope is strictly limited to the Botanical Engine and `@beechcms/core`:
type system extension, DDL generation, indexing, and unit tests. No API handler, no
dashboard work, no migration tooling — those are delivered in Sprints 2–4.

### Stack

- API: Hono on Cloudflare Workers, D1 (SQLite, FTS5)
- Dashboard: React 19 + Vite + TanStack Query v5
- Shared: `@beechcms/core` (pure TypeScript, no HTTP / cloud deps)
- Monorepo: Turborepo / npm workspaces

==========================================================================
SECTION 1 — RELEVANT FILES (current state)
==========================================================================

packages/core/src/
  types.ts            -- defines `BranchType` (union) and `Branch` interface (lines 3, 54)
                         Current BranchType: 'text' | 'number' | 'boolean' | 'json'
                                            | 'date' | 'richtext' | 'file' | 'tags'
  engine.ts           -- Botanical Engine. Holds:
                           BRANCH_TYPE_SQL map (line 25)
                           generateCreateTable (line 101)
                           generateAddColumn   (line 159)
                           generateIndexes     (line 168)
                           a duplicate column-spec block around line 439–460
                         All current types map to TEXT / REAL / INTEGER. No FK syntax.
  engine.test.ts      -- existing Vitest suite for engine; extend here, do not duplicate.
  seed-registry.ts    -- `SEED_REGISTRY` and topology helpers (see Sprint 3).
  seeds.ts            -- canonical Seed definitions; do NOT add a real `relation` branch
                         here yet — Sprint 2 introduces a guarded example after the
                         API layer can resolve it.
  validation.ts       -- Zod schema compiler (extended in Sprint 2, not here).
  index.ts            -- public barrel.

==========================================================================
SECTION 2 — WHAT THIS SPRINT DELIVERS
==========================================================================

1. The string literal `'relation'` is added to `BranchType`.
2. The `Branch` interface gains two optional fields: `targetSeed` and `onDelete`.
3. `BRANCH_TYPE_SQL` maps `'relation'` → `sqlType: 'TEXT'`.
4. `generateCreateTable` and `generateAddColumn` emit the SQL Foreign Key constraint
   `REFERENCES content_<targetSeed>(id) ON DELETE <rule>` when the branch is a relation.
5. `generateIndexes` always emits a B-tree index on relation columns (JOIN performance).
6. A pure helper `buildForeignKeyClause(branch)` lives next to the SQL builders and is
   unit-tested directly.
7. A topological-sort utility `sortSeedsByDependencies(seeds)` is added to
   `seed-registry.ts` and unit-tested. It will be consumed by Sprint 3 (CLI) but lives
   in core because it is pure logic.
8. New types and helpers are exported from `packages/core/src/index.ts`.

Nothing else changes in this sprint. The new type is **declared but not yet used** by
any real seed — Sprint 2 is the first consumer.

==========================================================================
SECTION 3 — DDL CONTRACT (single source of truth)
==========================================================================

Input branch (TypeScript):
```ts
{
  id: 'br_07',
  alias: 'author_id',
  label: 'Author',
  type: 'relation',
  targetSeed: 'team',
  onDelete: 'SET NULL',   // optional, default 'SET NULL'
}
```

Required DDL output inside `CREATE TABLE content_articles (...)`:
```
author_id  TEXT REFERENCES content_team(id) ON DELETE SET NULL
```

Required output of `generateAddColumn`:
```sql
ALTER TABLE content_articles ADD COLUMN author_id TEXT REFERENCES content_team(id) ON DELETE SET NULL;
```

Required output of `generateIndexes` for the same branch:
```sql
CREATE INDEX IF NOT EXISTS idx_content_articles_author_id ON content_articles(author_id);
```

Rules:
- `targetSeed` is REQUIRED when `type === 'relation'`. Missing target → throw a clear
  `Error("Branch <id> is of type 'relation' but has no targetSeed")` at DDL time.
- `onDelete` defaults to `'SET NULL'`. Allowed values: `'CASCADE' | 'SET NULL' | 'RESTRICT'`.
- The referenced table is always `content_<targetSeed>` (use the existing `tableName()`
  helper if a helper accepting a slug exists; otherwise inline the prefix once and
  document it).
- The same FK clause must be emitted by both `generateCreateTable` and
  `generateAddColumn` — extract it into a `buildForeignKeyClause(branch)` function to
  avoid duplication.
- Drafts: the `content_<slug>_drafts` table introduced by `allowDrafts: true` must NOT
  emit the FK constraint. Drafts are partial and may legitimately reference deleted
  parents during editing. Sprint 3 will revisit promotion safety; here, just skip the
  `REFERENCES ...` clause when generating the drafts mirror table.

==========================================================================
SECTION 4 — STEP-BY-STEP PLAN
==========================================================================

--------------------------------------------------------------------------
STEP 1 — Extend `BranchType` and `Branch`
File: packages/core/src/types.ts
--------------------------------------------------------------------------

Add `'relation'` to the `BranchType` union.

Inside the `Branch` interface add two optional fields with full JSDoc:

```ts
/**
 * Slug of the referenced Seed (without the `content_` prefix).
 * REQUIRED when `type === 'relation'`. Ignored otherwise.
 * Example: 'team' → references table `content_team(id)`.
 */
targetSeed?: string

/**
 * SQLite ON DELETE rule applied to the foreign-key constraint.
 * Defaults to 'SET NULL' when `type === 'relation'` and no value is provided.
 * - CASCADE  : delete dependent rows when the parent is deleted.
 * - SET NULL : null out the column when the parent is deleted (default).
 * - RESTRICT : block parent deletion while dependent rows exist.
 *
 * NOTE: When `multiple: true` (introduced in Sprint 5 for many-to-many), this
 * rule applies to the FK from the junction table to the target table.
 */
onDelete?: 'CASCADE' | 'SET NULL' | 'RESTRICT'
```

The existing `multiple?: boolean` field (types.ts:71, today used only for `file`)
will be REUSED in Sprint 5 to flip a relation branch into many-to-many mode.
For this sprint, Sprint 1 MUST reject relation + multiple: in `validateSeeds()`
(extended in Sprint 3) and in the engine itself: if `branch.type === 'relation'
&& branch.multiple === true` is encountered, `buildForeignKeyClause()` throws
`Error("multiple relations not yet supported — see Sprint 5")`. Sprint 5 will
remove this guard and add real junction-table emission.

Do not touch any other field on `Branch`.

--------------------------------------------------------------------------
STEP 2 — Extend `BRANCH_TYPE_SQL`
File: packages/core/src/engine.ts
--------------------------------------------------------------------------

Add the new mapping inside `BRANCH_TYPE_SQL`:

```ts
relation: { sqlType: 'TEXT' },
```

Apply the same change to the duplicate column-spec block around line 439–460
(the second place where each type is enumerated for typing). Both maps must stay
in lockstep — leave a single-line comment above the second block reminding readers
of this invariant if it is not already present.

--------------------------------------------------------------------------
STEP 3 — Helper: `buildForeignKeyClause(branch)`
File: packages/core/src/engine.ts (top-level, near the SQL builders)
--------------------------------------------------------------------------

```ts
const DEFAULT_ON_DELETE_RULE: NonNullable<Branch['onDelete']> = 'SET NULL'

/**
 * Returns the trailing FK fragment for a relation branch, or '' if the branch
 * is not a relation. Throws when a relation branch is missing `targetSeed`,
 * because that is a programmer error that must surface immediately at DDL time
 * rather than producing silently invalid SQL.
 */
function buildForeignKeyClause(branch: Branch): string {
  if (branch.type !== 'relation') return ''
  if (!branch.targetSeed) {
    throw new Error(
      `Branch ${branch.id} (${branch.alias}) is of type 'relation' but has no targetSeed`
    )
  }
  const onDeleteRule = branch.onDelete ?? DEFAULT_ON_DELETE_RULE
  return ` REFERENCES content_${branch.targetSeed}(id) ON DELETE ${onDeleteRule}`
}
```

--------------------------------------------------------------------------
STEP 4 — Wire the helper into `generateCreateTable` and `generateAddColumn`
File: packages/core/src/engine.ts
--------------------------------------------------------------------------

VERIFIED via direct read: `generateCreateTable` (lines 101–123) and
`generateDraftTable` (lines 130–153) are SEPARATE functions. The branch loop
in `generateCreateTable` is at line 110–116; the drafts function is independent.
There is no shared loop to disambiguate.

In `generateCreateTable`, modify the branch column assembly (line 111–115):

```ts
const { sqlType } = BRANCH_TYPE_SQL[branch.type]
let col = `  ${branch.alias}  ${sqlType}`
if (branch.requiredOnCreate) col += ' NOT NULL'
if (branch.type === 'boolean') col += ` CHECK (${branch.alias} IN (0, 1))`
col += buildForeignKeyClause(branch)   // <-- new line, appended last
lines.push(col + ',')
```

`generateDraftTable` (line 130) MUST stay untouched. Drafts already exclude
relation FK by design: the only `REFERENCES` they emit is `entry_id → main(id)
ON DELETE CASCADE`. Branch columns in drafts are nullable and unconstrained —
that is the invariant Sprint 3 relies on for safe draft promotion.

In `generateAddColumn` (line 159):

```ts
return `ALTER TABLE ${tableName(seed)} ADD COLUMN ${branch.alias} ${sqlType}${buildForeignKeyClause(branch)};`
```

`generateAddColumn` is only ever called on the live table, so the FK clause
applies unconditionally here.

--------------------------------------------------------------------------
STEP 5 — Indexing
File: packages/core/src/engine.ts (`generateIndexes`, line 168)
--------------------------------------------------------------------------

VERIFIED current behaviour (lines 168–186):
- Always emits `idx_{slug}_status` and `idx_{slug}_created_at`.
- For each branch: SKIPS if `branch.policies?.filter === false`.
- Then: emits index ONLY if branch type is in `['text', 'number', 'date', 'boolean']`.

Required changes:
1. Add `'relation'` to the indexable-types list.
2. For `type === 'relation'`, BYPASS the `policies.filter === false` check —
   JOIN performance is a system concern, not an editorial one.

```ts
for (const branch of seed.branches) {
  const isRelation = branch.type === 'relation'
  if (!isRelation && branch.policies?.filter === false) continue
  const isIndexable = ['text', 'number', 'date', 'boolean', 'relation'].includes(branch.type)
  if (isIndexable) {
    indexes.push(
      `CREATE INDEX IF NOT EXISTS idx_${slug}_${branch.alias} ON ${table}(${branch.alias});`
    )
  }
}
```

Naming convention `idx_{slug}_{alias}` — matches the existing format exactly.

--------------------------------------------------------------------------
STEP 6 — Topological sort utility
File: packages/core/src/seed-registry.ts
--------------------------------------------------------------------------

Add and export:

```ts
/**
 * Returns the input seeds reordered so that every seed appears AFTER all the
 * seeds it depends on (its `relation` branch targets). Pure function — does
 * not read from any global registry.
 *
 * Throws on cyclic dependencies with a message listing the participating slugs.
 * Sprint 3 (CLI / migration runner) consumes this to create tables in the
 * correct order without disabling SQLite FK constraints.
 */
export function sortSeedsByDependencies(seeds: ReadonlyArray<Seed>): Seed[]
```

Implementation: standard Kahn's algorithm (BFS on in-degree) or DFS with a
visiting/visited tri-state. Use seed slugs as graph node identifiers.

Edge extraction:
```ts
for (const seed of seeds) {
  for (const branch of seed.branches) {
    if (branch.type === 'relation' && branch.targetSeed) {
      // edge: seed.slug depends on branch.targetSeed
    }
  }
}
```

A relation pointing to a missing target (target slug not in the input array)
must throw: `Error("Seed '<slug>' relates to unknown target '<target>'")`.

--------------------------------------------------------------------------
STEP 7 — Public exports
File: packages/core/src/index.ts
--------------------------------------------------------------------------

Re-export anything newly public:
- `sortSeedsByDependencies` from `./seed-registry`.

`BranchType`, `Branch`, and the engine functions are already exported — no change
needed unless the existing barrel is selective.

==========================================================================
SECTION 5 — TESTS (Vitest)
==========================================================================

Add tests in the existing `packages/core/src/engine.test.ts` and a new
`packages/core/src/seed-registry.test.ts` augmentation (the file already exists).

### engine.test.ts — new describe block: `relation branches`

1. `BRANCH_TYPE_SQL['relation'].sqlType === 'TEXT'`.
2. `generateCreateTable` on a seed with one `relation` branch produces a column
   whose definition ends with
   `TEXT REFERENCES content_<target>(id) ON DELETE SET NULL`.
3. With `onDelete: 'CASCADE'`, the same column ends with
   `ON DELETE CASCADE`.
4. With `onDelete: 'RESTRICT'`, ditto for `RESTRICT`.
5. A relation branch with missing `targetSeed` causes `generateCreateTable`
   to throw with a message including the branch id and the word `targetSeed`.
6. `generateAddColumn` on the same branch emits a single `ALTER TABLE ... ADD COLUMN`
   statement ending with the same `REFERENCES ... ON DELETE ...` clause.
7. `generateIndexes` includes
   `CREATE INDEX IF NOT EXISTS idx_content_<slug>_<alias> ON content_<slug>(<alias>)`
   for the relation branch, even when no `searchable` / `filterable` policy
   is set.
8. When the seed has `allowDrafts: true`, the **drafts mirror table** must NOT
   contain the `REFERENCES` clause for the relation column. Assert that the
   substring `REFERENCES` does not appear inside the drafts CREATE TABLE output.

### seed-registry.test.ts — new describe block: `sortSeedsByDependencies`

1. Independent seeds are returned in input order (or any order — assert by set
   equality, not list equality, when no dependencies exist).
2. A seed `articles` with a relation to `team` is placed after `team` in the
   output array.
3. A diamond (`a → b, a → c, b → d, c → d`) resolves so that `d` precedes
   `b` and `c`, and both precede `a`.
4. A cycle (`a → b → a`) throws an error whose message contains both `a` and `b`.
5. A relation pointing to a slug that is not in the input array throws with
   a message containing the missing slug.

==========================================================================
SECTION 6 — OUT OF SCOPE (will be addressed in later sprints)
==========================================================================

- Validation (Zod) of relation values — Sprint 2.
- API handler error mapping for `SQLITE_CONSTRAINT` → RFC 7807 — Sprint 2.
- Migration ordering / `PRAGMA foreign_keys` handling — Sprint 3.
- Draft promotion (`INSERT ... SELECT`) referential safety — Sprint 3.
- Dashboard Field Renderers (display + edit) — Sprint 4.
- N+1 mitigation on list endpoints — Sprint 4.

==========================================================================
SECTION 7 — COMPLETION CHECKLIST
==========================================================================

[ ] `BranchType` includes `'relation'`.
[ ] `Branch` exposes `targetSeed?` and `onDelete?` with JSDoc.
[ ] `BRANCH_TYPE_SQL.relation` is `{ sqlType: 'TEXT' }`, mirrored in both maps.
[ ] `buildForeignKeyClause(branch)` lives next to the DDL builders, single source of truth.
[ ] `generateCreateTable` emits the FK clause on the live table only.
[ ] `generateAddColumn` emits the FK clause unconditionally.
[ ] `generateIndexes` always emits a B-tree index for relation branches.
[ ] Draft mirror tables contain no `REFERENCES` for relation columns.
[ ] `sortSeedsByDependencies` is exported from `seed-registry.ts` and from the barrel.
[ ] All new tests pass (`npm run test` in `packages/core`).
[ ] Existing tests still pass — no regression on `text`, `number`, `boolean`,
    `date`, `json`, `richtext`, `file`, `tags`.
[ ] No file outside `packages/core/src/` was touched.
