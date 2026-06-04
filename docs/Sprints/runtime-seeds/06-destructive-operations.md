# Runtime Seeds — Sprint 06: Destructive Operations (Danger Zone)

> **Audience:** an AI coding agent with no prior knowledge of Beech CMS. Everything is
> inline. Trust live code over snippets if they drift.
>
> **Depends on Sprints 01–05.** Read [`00-overview.md`](./00-overview.md). This is the
> **final** sprint — it lifts the additive-only constraint behind explicit, guarded,
> irreversible operations.

## 0. Role & ground rules

Senior full-stack engineer, Beech CMS monorepo. Workers runtime, repository pattern, docs
English, tests required, admin-only. Until this sprint, **no** code path emitted
`DROP`/`RENAME`. This sprint adds them — every one **irreversible and data-destroying** —
so guardrails are the point, not an afterthought.

## 1. What this sprint builds

Real schema cleanup, opt-in and confirmed:

1. **Drop a content type** — `DROP TABLE content_{slug}` (+ `fts_{slug}`,
   `content_{slug}_drafts`, junction tables) and delete the `seeds` row, after a typed
   confirmation. Plus R2 media cascade for the type's file fields.
2. **Drop a field (orphan cleanup)** — `ALTER TABLE content_{slug} DROP COLUMN {alias}`
   for a column that is orphaned (in the DB, not in the definition) or being removed now.
3. **Rename a field alias** — `ALTER TABLE content_{slug} RENAME COLUMN {old} TO {new}`,
   keeping the stable `branch.id`, and re-creating FTS table/triggers that referenced the
   old alias.
4. **Change a field type** — column type change via the SQLite 12-step table rebuild
   (or a documented "add new column + copy + drop old" migration). High-risk; gate hard.
5. **FTS rebuild** — recreate `fts_{slug}` + triggers when searchable branches were added
   or renamed (the `ftsRebuildNeeded` signal from sprint 01/03 finally acted upon).
6. Dashboard **Danger Zone** UI surfacing all of the above with typed confirmations and
   clear data-loss warnings.

## 2. Backend: extend `ISchemaMutator`

Sprint 03 defined `ISchemaMutator` with `getColumns` + additive `execDdl`. Add explicit
destructive methods so destructive SQL is never smuggled through `execDdl` (keep
`execDdl` additive-only; reviewers can grep for the destructive methods):

```ts
export interface ISchemaMutator {
  getColumns(table: string): Promise<Set<string> | null>
  execDdl(statements: string[]): Promise<void>            // additive only
  // --- destructive (sprint 06) ---
  dropTable(table: string): Promise<void>                 // DROP TABLE IF EXISTS
  dropColumn(table: string, column: string): Promise<void> // ALTER TABLE … DROP COLUMN
  renameColumn(table: string, from: string, to: string): Promise<void>
  /** Run a multi-statement destructive batch (used by FTS rebuild + table-rebuild type
   *  changes) atomically. Caller assembles the statements; impl validates identifiers. */
  execDestructive(statements: string[]): Promise<void>
}
```

`D1SchemaMutator` (`apps/api/src/shared/schema-mutator.d1.ts`): implement with strict
identifier validation (`/^[A-Za-z0-9_]+$/`) on every table/column name before
interpolation — these are not parameterizable. `DROP TABLE IF EXISTS`,
`ALTER TABLE x DROP COLUMN y`, `ALTER TABLE x RENAME COLUMN a TO b`. SQLite supports
`DROP COLUMN` and `RENAME COLUMN` (modern versions; D1 is current). For type changes use
the [12-step `ALTER TABLE` procedure](https://www.sqlite.org/lang_altertable.html) inside
a single `execDestructive` batch (create new table with the corrected column, copy via
`INSERT … SELECT` with `CAST`, drop old, rename new) — or document the simpler
add/copy/drop-column path if the full rebuild is too broad for the timebox.

> **Core DDL generators:** add destructive generators to `packages/core/src/engine.ts`
> (or a new `seed-ddl-destructive.ts`): `generateDropTable(seed)` (returns all of
> `content_{slug}`, `fts_{slug}`, `content_{slug}_drafts`, and each junction table),
> `generateRenameColumn(seed, from, to)`, `generateDropColumn(seed, alias)`, and an FTS
> rebuild planner `planFtsRebuild(seed)` (drop + recreate `fts_{slug}` + triggers, then
> backfill from `content_{slug}` via `INSERT INTO fts_{slug} SELECT …`). Pure, tested.

## 3. Backend: new routes (admin-only, `/api/seeds`)

| Method | Path | Action | Guard |
|---|---|---|---|
| `DELETE` | `/api/seeds/:slug/hard` | Drop tables + delete row + R2 cascade | typed confirm + backref check |
| `DELETE` | `/api/seeds/:slug/branches/:branchId` | Drop the column | typed confirm |
| `PATCH` | `/api/seeds/:slug/branches/:branchId/rename` | Rename alias (RENAME COLUMN + FTS rebuild) | typed confirm |
| `PATCH` | `/api/seeds/:slug/branches/:branchId/retype` | Change type (table rebuild) | typed confirm |
| `POST` | `/api/seeds/:slug/fts/rebuild` | Rebuild FTS | admin |
| `GET` | `/api/seeds/:slug/orphans` | List DB columns absent from the definition | admin |

**Typed confirmation:** destructive requests must carry a body field
`confirm: "<slug>"` (or `"<slug>.<alias>"`) that the handler checks equals the target
identifier; mismatch → `400 confirmation-required`. This mirrors the GitHub "type the
repo name" pattern and prevents accidental loss.

**Backref guard for hard delete:** reuse `c.get('backrefMap')` — if any **active** seed
has a `relation` targeting `slug`, reject `409 seed-referenced` and list them; the user
must remove those relations first. Also use the `backrefs` feature
(`apps/api/src/features/backrefs/`) / `DeleteButtonWithRestrict` semantics if applicable
to entry-level references.

**Each destructive write ends with `bumpRegistryVersion()`** + an `activityLogger.log`
audit entry recording the operation, target, and acting user.

**R2 media cascade on hard delete:** before `DROP TABLE`, enumerate the type's `file`
branches, select their values, and delete the R2 objects (best-effort, mirroring the
content delete cascade in `apps/api/src/features/content/handlers/delete.ts` and the
Media Engine in SYSTEM_MAP). Failures are non-fatal; the drop proceeds.

## 4. Rename / retype interactions to preserve

- **Stable id:** rename changes only `alias` (the column) — `branch.id` is unchanged, so
  stored `FormLayout`s (`seed_layouts`, keyed by branch id) keep working untouched. Verify
  `validateLayoutAgainstSeed` still resolves the layout after rename.
- **FTS:** if the renamed/retyped/added branch is searchable text/richtext, FTS triggers
  reference the old alias and must be rebuilt (`planFtsRebuild`). Do this in the same
  `execDestructive` batch as the rename so search never references a missing column.
- **Automations / set_variable / templates** may reference aliases (`{{this.alias}}`).
  Renaming an alias can break them. At minimum, scan `automations` for the old alias and
  **warn** in the response (list affected automation ids). Auto-rewrite is out of scope;
  surfacing the breakage is required.
- **Drafts + junctions:** dropping a column must also drop it from `content_{slug}_drafts`
  if present. Dropping a multi-relation branch drops its `rel_{slug}_{alias}` (+ `_drafts`)
  table. `generateDropTable`/`generateDropColumn` must account for these.

## 5. Dashboard: Danger Zone

Extend the sprint-05 `seed-builder` slice (do not make a new slice):

- A collapsible "Danger Zone" section in `SeedEditorDialog` (admin only), visually
  separated (red), containing: hard-delete the type, drop orphaned columns (from
  `GET /api/seeds/:slug/orphans`), and per-field rename/retype/drop actions.
- Each action opens a confirmation dialog requiring the user to **type the slug** (or
  `slug.alias`) before the button enables. Echo the exact data-loss consequence and any
  backref/automation warnings returned by the API.
- After success: toast + invalidate `["seeds"]` and `["schema"]`.
- Field rename/retype inputs that sprint 05 rendered read-only now become editable
  **inside** the Danger Zone flow (regular edit still forbids them — destructive changes
  only happen through the explicit confirmed path).
- i18n: add `seedBuilder.dangerZone.*` keys to both locales.

## 6. Tests

- Core: `generateDropTable` covers main + fts + drafts + junction tables; `planFtsRebuild`
  drops, recreates, and backfills; `generateRenameColumn`/`generateDropColumn` produce
  valid SQL; identifier validation rejects unsafe names.
- API: typed-confirmation mismatch → 400; hard delete drops all tables + deletes row +
  attempts R2 cascade + bumps version + audit log; backref guard → 409 with the list;
  rename → RENAME COLUMN + FTS rebuilt, layout still resolves, affected automations
  reported; drop column also drops from drafts table; retype rebuilds the table preserving
  data (insert rows, retype, assert values cast correctly).
- `D1SchemaMutator` destructive methods against local D1: drop/rename/dropColumn reflected
  by `getColumns`/`sqlite_master`.
- Dashboard: confirmation gating (button disabled until slug typed); warnings rendered;
  invalidations fire.

## 7. Acceptance criteria

- [ ] Build + tests pass across packages.
- [ ] Destructive SQL lives **only** behind the new `ISchemaMutator` destructive methods
      and confirmed routes; `execDdl` remains additive-only; grep shows no `DROP`/`RENAME`
      outside this sprint's code.
- [ ] Hard delete: drops `content_/fts_/drafts/junction` tables, deletes the `seeds` row,
      cascades R2 media, bumps version, audit-logs — only after typed confirmation and
      passing the backref guard.
- [ ] Field drop/rename/retype work with stable `branch.id`, FTS rebuilt where needed,
      layouts preserved, affected automations reported.
- [ ] Orphan cleanup lists and drops columns absent from the definition.
- [ ] Danger Zone UI gated by typed confirmation; all copy via `t()` in both locales.

## 8. Do NOT

- Do not allow any destructive op without the typed-confirmation check.
- Do not let `execDdl` carry destructive statements — use the dedicated methods.
- Do not auto-rewrite automations/layouts on rename — report breakage, let the user fix.
- Do not skip the R2 cascade or the audit log on hard delete.
- Do not break the synchronous `ISeedRegistry` contract or the version-token invalidation.
