# STABLE_ID_AUDIT — Persisted Branch Alias References

> Backlog for the follow-up "Stable ID Migration" sprint (after Sprint 04).
> Each entry is a place in the codebase that persists `branch.alias` as a
> reference instead of `branch.id`. A future alias rename would silently
> break these references. Sprint 04-pre introduces `branch.id` but does NOT
> migrate these sites — that requires a D1 migration and re-index.

## Pending migrations

### FTS5 virtual table column names
**File:** `packages/core/src/engine.ts:238`
```ts
const cols = rtBranches.map(b => `  ${b.alias}`)
```
The FTS5 virtual table (`fts_{slug}`) declares columns using `branch.alias`.
These are SQL column names embedded in `CREATE VIRTUAL TABLE` DDL, persisted
in the D1 schema. Any alias rename would require dropping and recreating the
FTS table + re-indexing all entries.

**Status:** uses alias — pre-stable-id. Migrate in Stable ID Migration sprint.

---

### FTS trigger column references (INSERT / UPDATE / DELETE)
**File:** `packages/core/src/engine.ts:261`
```ts
const cols = rtBranches.map(b => b.alias)
```
The three FTS sync triggers (`fts_{slug}_insert`, `fts_{slug}_update`,
`fts_{slug}_delete`) reference content table columns by alias both in the
`AFTER UPDATE OF <cols>` clause and in INSERT/SELECT expressions. These
triggers are persisted DDL in D1.

**Status:** uses alias — pre-stable-id. Migrate together with FTS table above.

---

### Draft table column mapping
**File:** `packages/core/src/engine.ts:179`
```ts
let col = `  ${branch.alias}  ${sqlType}`
```
The drafts table (`content_{slug}_drafts`) mirrors the live table's column
layout using `branch.alias` as SQL column names. Drafts are partial rows
keyed by `entry_id`; the column names are aliases and would need an ALTER
TABLE or table recreation if any alias is renamed.

**Status:** uses alias — pre-stable-id. Migrate in Stable ID Migration sprint.

---

### Junction table names for multi-relation branches
**File:** `packages/core/src/engine.ts:578`
```ts
const table = junctionTableName(seed.slug, branch.alias)
```
`junctionTableName` constructs the table name `rel_{seed_slug}_{branch_alias}`
for many-to-many relations. The alias is baked into the table name itself in
D1. Renaming would require creating a new table and migrating data.

**File:** `packages/core/src/engine.ts:612`
```ts
const table = `${junctionTableName(seed.slug, branch.alias)}_drafts`
```
Same applies to the draft junction table `rel_{seed_slug}_{branch_alias}_drafts`.

**Status:** uses alias — pre-stable-id. Higher migration cost (table rename);
schedule as a dedicated migration step.

---

## Already stable (no migration needed)

- `branch.id` — introduced in sprint 04-pre; all new layout JSON from sprint 04a
  onward uses `branchId` (the stable id) not the alias.
- System column names (`id`, `slug`, `status`, `created_at`, `updated_at`) —
  these are fixed by the Botanical Engine and are not branch aliases.
