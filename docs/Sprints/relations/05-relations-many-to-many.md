You are a senior TypeScript engineer working on the Beech CMS monorepo.

## PROJECT CONTEXT

Do NOT explore the codebase further. All relevant context is provided in this prompt.
Read it fully before writing any code.

This is **Sprint 5 of 8** for the `relation` field type. Sprints 1–4 shipped
many-to-one relations (a single `author_id` per `article`). This sprint adds
**many-to-many** by flipping the existing `multiple?: boolean` flag on relation
branches and emitting a dedicated **junction table** per branch.

### Stack

- API: Hono on Cloudflare Workers, D1 (SQLite). D1 supports `batch()` for
  atomic multi-statement transactions.
- Engine: `@beechcms/core` (verified Sprint 1 contracts: `targetSeed`,
  `onDelete`, `buildForeignKeyClause`).
- Dashboard: React 19, TanStack Query v5, Shadcn `Command` + `Badge`.
- CLI: `packages/cli/src/commands/seed-load.ts` (verified Sprint 3 emitter).

==========================================================================
SECTION 1 — DATA MODEL
==========================================================================

A relation branch with `multiple: true` produces NO column on the parent
`content_<seedSlug>` table. Instead the engine emits a dedicated junction
table:

```sql
CREATE TABLE IF NOT EXISTS rel_<seedSlug>_<branchAlias> (
  parent_id  TEXT NOT NULL REFERENCES content_<seedSlug>(id)    ON DELETE CASCADE,
  target_id  TEXT NOT NULL REFERENCES content_<targetSlug>(id)  ON DELETE <branch.onDelete ?? 'CASCADE'>,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (parent_id, target_id)
);

CREATE INDEX IF NOT EXISTS idx_rel_<seedSlug>_<branchAlias>_parent ON rel_<seedSlug>_<branchAlias>(parent_id);
CREATE INDEX IF NOT EXISTS idx_rel_<seedSlug>_<branchAlias>_target ON rel_<seedSlug>_<branchAlias>(target_id);
```

Design choices:
- `parent_id ON DELETE CASCADE`: hard-bound to the parent's lifecycle. If
  the article is deleted, its relationships vanish. This is not configurable
  and matches the implicit semantics of "this article has these tags".
- `target_id ON DELETE <branch.onDelete>`: configurable. For a tags-like
  branch use `CASCADE` (removing the tag also strips it from articles); for
  a curated `featured_authors` branch use `SET NULL` semantically by
  preferring `CASCADE` (no nulls in a junction) — see note below.
- `position` preserves user-defined ordering: critical for editorial UX
  ("first author shown first").
- Composite PK `(parent_id, target_id)` enforces "no duplicate links" at
  the DB level — no application-side dedup required.

NULL semantics: a junction row with NULL target is meaningless. If the user
declares `onDelete: 'SET NULL'` on a multi-relation, the validator rejects
it (Step 1 of this sprint). Allowed `onDelete` for multi-relations:
`'CASCADE' | 'RESTRICT'`.

==========================================================================
SECTION 2 — WHAT THIS SPRINT DELIVERS
==========================================================================

1. Engine: `generateJunctionTable(seed, branch)` + `generateJunctionIndexes(seed, branch)`.
   `generateCreateTable` skips multi-relation branches (no column emitted).
2. `validateSeeds()` (Sprint 3 entry point) rejects:
   - `multiple: true` on a relation branch with `onDelete: 'SET NULL'`.
   - Junction table name collisions (truncation can collide on very long slugs).
3. `seed:load` emits junction tables and indexes AFTER the parent+target
   tables exist (topological order from Sprint 1 already gives this).
4. ContentRepository (`apps/api/src/shared/content.repository.d1.ts`) reads
   and writes many-to-many values:
   - Read: a single batched query per multi-relation branch fetching
     `(parent_id, target_id, position)` for the page's parent ids, then
     groups into `Record<parentId, string[]>` and attaches under `branch.alias`
     on each entry.
   - Write: in a D1 `batch()`, `DELETE FROM rel_… WHERE parent_id = ?`
     followed by `INSERT INTO rel_… (parent_id, target_id, position) VALUES …`
     for each id in the new array. Atomic — partial failure rolls back.
5. API validation: a multi-relation field expects `string[]` (each id valid
   per `IIdGenerator.isValid` from Sprint 2). Empty array `[]` is allowed
   and means "no relations". Duplicates are rejected with a 400.
6. Public list / detail endpoints embed the resolved ids under the alias
   (no embedded labels — labels still come via the `relations` field added
   in Sprint 4 §4a, extended in Step 6 below).
7. Dashboard:
   - `RelationDisplay` detects `branch.multiple === true` and renders a chip
     row (Shadcn `Badge` per resolved label).
   - `RelationEdit` detects `multiple === true` and switches to a multi-select
     combobox with drag-to-reorder (use `@dnd-kit/sortable` already in the
     project, or a lightweight up/down button pair if not present).

==========================================================================
SECTION 3 — STEP-BY-STEP PLAN
==========================================================================

--------------------------------------------------------------------------
STEP 1 — Validation rules (Core)
File: packages/core/src/seed-registry.ts (extend `validateSeeds`)
      packages/core/src/engine.ts        (drop the Sprint 1 guard)
--------------------------------------------------------------------------

Remove the Sprint 1 guard inside `buildForeignKeyClause()` that throws on
`multiple: true`. Multi-relations no longer go through `buildForeignKeyClause`
because they don't produce a column on the parent table.

Add to `validateSeeds()`:

```ts
for (const branch of seed.branches) {
  if (branch.type !== 'relation' || branch.multiple !== true) continue
  if (branch.onDelete === 'SET NULL') {
    errors.push({
      seed: seed.slug,
      messages: [
        `Branch '${branch.alias}': multi-relations cannot use ON DELETE SET NULL. ` +
        `Use 'CASCADE' or 'RESTRICT'.`,
      ],
    })
  }
  // Collision check: SQLite table names are case-insensitive and limited in
  // practice to ~256 chars. Junction names are `rel_<seed>_<alias>` — verify
  // length and uniqueness across the registry.
}
```

--------------------------------------------------------------------------
STEP 2 — Engine: junction table emission
File: packages/core/src/engine.ts
--------------------------------------------------------------------------

Add two exported functions next to `generateCreateTable`:

```ts
export function junctionTableName(seedSlug: string, branchAlias: string): string {
  return `rel_${seedSlug}_${branchAlias}`
}

export function generateJunctionTable(seed: Seed, branch: Branch): string {
  if (branch.type !== 'relation' || branch.multiple !== true) {
    throw new Error(`Branch ${branch.alias} is not a multi-relation`)
  }
  if (!branch.targetSeed) {
    throw new Error(`Branch ${branch.alias} has no targetSeed`)
  }
  const onDeleteRule = branch.onDelete ?? 'CASCADE'
  const table = junctionTableName(seed.slug, branch.alias)
  return [
    `CREATE TABLE IF NOT EXISTS ${table} (`,
    `  parent_id  TEXT NOT NULL REFERENCES content_${seed.slug}(id)    ON DELETE CASCADE,`,
    `  target_id  TEXT NOT NULL REFERENCES content_${branch.targetSeed}(id) ON DELETE ${onDeleteRule},`,
    `  position   INTEGER NOT NULL DEFAULT 0,`,
    `  created_at INTEGER NOT NULL DEFAULT (unixepoch()),`,
    `  PRIMARY KEY (parent_id, target_id)`,
    `);`,
  ].join('\n')
}

export function generateJunctionIndexes(seed: Seed, branch: Branch): string[] {
  const table = junctionTableName(seed.slug, branch.alias)
  return [
    `CREATE INDEX IF NOT EXISTS idx_${table}_parent ON ${table}(parent_id);`,
    `CREATE INDEX IF NOT EXISTS idx_${table}_target ON ${table}(target_id);`,
  ]
}
```

Modify `generateCreateTable`: when iterating branches, SKIP `relation` branches
with `multiple === true` — they don't produce a column. Add a comment above
the loop explaining why.

Modify `generateIndexes`: skip multi-relation branches (no column to index;
their indexes live on the junction table).

`generateDraftTable`: same — skip multi-relation branches. The drafts table
mirrors only single-value branch columns.

Add `sortSeedsByDependencies` awareness: a multi-relation also creates a
dependency from `seed.slug` to `branch.targetSeed`. The existing edge
extraction already does this if it inspects `branch.targetSeed` regardless
of `branch.multiple` — verify.

--------------------------------------------------------------------------
STEP 3 — Draft semantics for multi-relations
File: packages/core/src/engine.ts (`generateDraftTable` already created)
      apps/api/src/shared/content.repository.d1.ts (draft save/promote)
--------------------------------------------------------------------------

Drafts store multi-relation values in a SEPARATE drafts junction table:

```sql
CREATE TABLE IF NOT EXISTS rel_<seedSlug>_<branchAlias>_drafts (
  entry_id   TEXT NOT NULL REFERENCES content_<seedSlug>_drafts(entry_id) ON DELETE CASCADE,
  target_id  TEXT NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (entry_id, target_id)
);
```

NOTE: no FK on `target_id` in the drafts junction — by the same logic Sprint
1 used for single-value relation columns in drafts. The target may be deleted
between save and publish, so the constraint would be wrong here.

Emit `generateJunctionTable_drafts(seed, branch)` only when `seed.allowDrafts`.

Draft promotion (Sprint 3's pre-check is extended):
1. For each multi-relation branch, read `target_id`s from
   `rel_<seed>_<alias>_drafts WHERE entry_id = ?`.
2. Verify each exists in `content_<targetSlug>`. Any miss → `RelationTargetNotFoundError`.
3. Inside the same D1 `batch()` that promotes the row, also:
   - `DELETE FROM rel_<seed>_<alias> WHERE parent_id = ?`
   - Bulk INSERT from the drafts junction.

--------------------------------------------------------------------------
STEP 4 — API contract
Files: validation, content handlers, list/detail projection
--------------------------------------------------------------------------

### Validation (Sprint 2's Zod compiler)

For `branch.type === 'relation' && branch.multiple === true`:

```ts
case 'relation': {
  const idSchema = z.string().refine(v => idGenerator.isValid(v), {
    message: 'Invalid relation id format',
  })
  if (branch.multiple === true) {
    return z.array(idSchema)
      .refine(arr => new Set(arr).size === arr.length, {
        message: 'Duplicate ids in multi-relation array',
      })
  }
  return idSchema
}
```

### Write path

In `D1ContentRepository.create` and `update`:
1. Strip multi-relation aliases from the main column INSERT/UPDATE.
2. After the main row write, for each multi-relation branch:
   - Build the batch: `DELETE`, then `INSERT` per id with `position = index`.
   - Append to the D1 `batch()` array.
3. Execute the batch atomically. If the user supplied a target id that does
   not exist, the FK violation raises `relation-target-not-found` (mapped by
   Sprint 2's problem mapper to 422).

For PUT: if the array key is OMITTED, leave existing links untouched. If
present (even `[]`), replace the set.

### Read path

In `D1ContentRepository.findById`:
- After the main SELECT, for each multi-relation branch on the seed:
  ```sql
  SELECT target_id FROM rel_<seed>_<alias> WHERE parent_id = ? ORDER BY position ASC
  ```
- Attach the array under `data[branch.alias]`.

In `D1ContentRepository.findMany` (list):
- After the main SELECT returns N rows, collect their ids.
- One batched query per multi-relation branch:
  ```sql
  SELECT parent_id, target_id, position FROM rel_<seed>_<alias>
   WHERE parent_id IN (?, ?, …) ORDER BY parent_id, position ASC
  ```
- Group into `Map<parentId, string[]>` and attach.
- Query count: O(R) per list page, R = multi-relation branches. Same budget
  Sprint 4 already approved.

--------------------------------------------------------------------------
STEP 5 — Public API
--------------------------------------------------------------------------

Identical projection rules to the dashboard read path. The Public API does
NOT receive labels — it only emits `target_id` arrays. Consumers can do a
second call if they want labels. This is consistent with the existing
single-value relation Public API behaviour.

--------------------------------------------------------------------------
STEP 6 — Dashboard renderers
--------------------------------------------------------------------------

### RelationDisplay (extend, file from Sprint 4)

When `branch.multiple === true`:
- Value is `string[]`.
- For each id, resolve via the `relations` payload primed by Sprint 4's list
  handler (extend Sprint 4 §4a to also resolve multi-relation labels into
  the SAME `relations: Record<alias, Record<id, label>>` map — no new shape).
- Render a horizontal row of Shadcn `<Badge variant="secondary">` chips, each
  a link to `/content/<targetSlug>/<id>`.
- Empty array → em-dash.

### RelationEdit (extend, file from Sprint 4)

When `branch.multiple === true`:
- Render the selected items as a sortable chip row above the trigger.
- Combobox lets the user add another target (filters out already-selected ids).
- Drag-to-reorder OR up/down buttons per chip (pick the lighter option that
  already has deps in the project). The order maps to `position` server-side.
- Remove (×) per chip clears that item without opening the combobox.
- Honour `requiredOnCreate` / `requiredOnUpdate`: when required, the array
  must have at least one element (Zod check on the validator side too).

==========================================================================
SECTION 4 — TESTS
==========================================================================

### Engine
- `generateJunctionTable` produces exactly the documented DDL for a sample seed.
- `generateCreateTable` does NOT include any column for multi-relation branches.
- `generateIndexes` skips multi-relation branches on the main table.
- Junction draft table omits FK on `target_id`.

### Validation
- `multiple: true` + `onDelete: 'SET NULL'` → fatal validation error.
- A duplicate id array (`['a-id','a-id']`) rejected.

### Repository (better-sqlite3)
- create → linked rows appear in junction in declared order.
- update with reordered array → positions match the new order.
- update with `[]` → all junction rows for the entry are deleted.
- delete the parent → junction rows cascade-deleted.
- delete a target with `onDelete: 'CASCADE'` → junction rows referencing it
  are removed; with `'RESTRICT'` → deletion blocked, 409 returned.

### Drafts
- Save a draft with new multi-relation set, delete one target, publish →
  422 with `relation-target-not-found` naming the missing id.
- Save + publish with a clean target set → live junction matches drafts.

### Dashboard
- Display renders the correct chip count and labels from primed cache.
- Edit reorders chips → onChange payload reflects new order.
- Cannot select the same id twice.

==========================================================================
SECTION 5 — OUT OF SCOPE
==========================================================================

- Back-references — Sprint 6.
- Inline create from the combobox — Sprint 7.
- Bulk reassign — Sprint 8.
- Indexed "first N" projection on lists (e.g. show only the first 3 chips
  with a "+5 more" affordance) — UX polish, not blocking.

==========================================================================
SECTION 6 — COMPLETION CHECKLIST
==========================================================================

[ ] `generateJunctionTable` + `generateJunctionIndexes` exported from engine.
[ ] `generateCreateTable` / `generateDraftTable` / `generateIndexes` skip
    multi-relation branches.
[ ] Draft junction table omits FK on `target_id`.
[ ] `seed:load` emits junction tables in topological order.
[ ] `validateSeeds` rejects `multiple+SET NULL` and name collisions.
[ ] D1 content repo reads, writes, and promotes multi-relations atomically.
[ ] Validation accepts `string[]`, rejects duplicates, enforces id format.
[ ] List endpoint resolves multi-relation labels into the same
    `relations` field shape introduced in Sprint 4.
[ ] `RelationDisplay` renders chip row for arrays.
[ ] `RelationEdit` renders multi-select combobox with ordering.
[ ] All tests pass; existing single-value relation tests unaffected.
