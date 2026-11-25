# Runtime Seeds — Sprint 03: Seed CRUD API + Runtime DDL Execution

> **Audience:** an AI coding agent with no prior knowledge of Beech CMS. Everything is
> inline. Trust live code over snippets if they drift.
>
> **Depends on Sprints 01 + 02.** Read [`00-overview.md`](./00-overview.md).

## 0. Role & ground rules

Senior TypeScript engineer, Beech CMS monorepo. Workers runtime, repository pattern,
**additive-only** (no DROP/RENAME — that is sprint 06), docs English, tests required.
Admin-gated writes. RFC 7807 Problem Details for errors (reuse `publicProblem`, the
helper used by `schema.handler.ts`).

## 1. What this sprint builds

A new vertical slice `apps/api/src/features/seeds/` exposing an authenticated,
admin-only API to **create, edit, and soft-delete content types at runtime**. Each write:

1. Validates the resulting full active seed set (`validateSeedDefinitions`, sprint 01).
2. Persists the definition to the `seeds` table (`ISeedRepository.upsert`).
3. Applies **additive** DDL to D1 (create/extend tables, indexes, FTS, junctions) via the
   sprint-01 `planCreateSeed` / `planExtendSeed`.
4. Bumps `registry_version` (`bumpRegistryVersion`) so every isolate re-hydrates.

It also needs one new repository capability: **executing arbitrary DDL batches** and
**reading existing columns** (`PRAGMA table_info`). The Botanical content repository
must not be abused for this; add a dedicated `ISchemaMutator` contract.

## 2. The DDL execution contract

`packages/core` is DB-free, so the contract lives there; the impl lives in the API.

Create `packages/core/src/schema-mutator.ts`:

```ts
// SPDX-License-Identifier: MIT

/** Executes additive schema DDL against the live database and introspects columns.
 *  Implemented by D1SchemaMutator in apps/api/src/shared/schema-mutator.d1.ts.
 *  This is the ONLY sanctioned channel for runtime DDL — handlers never touch env.DB. */
export interface ISchemaMutator {
  /** Column names currently on a table, or null if the table does not exist. */
  getColumns(table: string): Promise<Set<string> | null>
  /** Runs the given DDL statements in order as a single D1 batch.
   *  All statements must be additive (CREATE … IF NOT EXISTS / ALTER … ADD COLUMN /
   *  CREATE INDEX IF NOT EXISTS). Throws on the first failing statement. */
  execDdl(statements: string[]): Promise<void>
}
```

Export from the barrel.

Create `apps/api/src/shared/schema-mutator.d1.ts`:

```ts
// SPDX-License-Identifier: BUSL-1.1
/// <reference types="@cloudflare/workers-types" />
import type { ISchemaMutator } from '@beechcms/core'

export class D1SchemaMutator implements ISchemaMutator {
  constructor(private readonly db: D1Database) {}

  async getColumns(table: string): Promise<Set<string> | null> {
    // PRAGMA table_info returns rows {cid,name,type,notnull,dflt_value,pk}.
    // Table name cannot be parameterized in PRAGMA — validate it is a safe identifier.
    if (!/^[A-Za-z0-9_]+$/.test(table)) throw new Error(`Unsafe table name: ${table}`)
    const rs = await this.db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>()
    const rows = rs.results ?? []
    if (rows.length === 0) return null   // table absent
    return new Set(rows.map(r => r.name))
  }

  async execDdl(statements: string[]): Promise<void> {
    if (statements.length === 0) return
    // D1 batch is atomic per call. Each statement is a prepared no-bind DDL string.
    await this.db.batch(statements.map(s => this.db.prepare(s)))
  }
}
```

Wire into `repository.middleware.ts` (import, add `schemaMutator?: ISchemaMutator` to
overrides, `context.set('schemaMutator', overrides?.schemaMutator ?? new D1SchemaMutator(database))`)
and type `schemaMutator: ISchemaMutator` in `apps/api/src/types.ts`.

> **Why batch and not exec?** `db.batch` runs the statements atomically; if one fails the
> rest roll back, so a half-created table can't leave the DB inconsistent. `PRAGMA` and
> some statements like `CREATE VIRTUAL TABLE` are valid in D1 batches. If a specific
> statement type is rejected inside a batch at implementation time, fall back to issuing
> that single statement via `db.exec` **after** the batch, and document it in a code
> comment — but prefer the batch.

## 3. The feature slice

Create `apps/api/src/features/seeds/` with `index.ts` (public barrel exporting
`seedsApp`) and `seeds.handler.ts`.

### Routes (all under `/api/seeds`, admin-only)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/seeds` | List all seed records (active + deleted) for the builder. |
| `GET` | `/api/seeds/:slug` | One seed record. |
| `POST` | `/api/seeds` | Create a new content type. |
| `PUT` | `/api/seeds/:slug` | Replace a content type's definition (additive DDL only). |
| `POST` | `/api/seeds/:slug/branches` | Add a single branch (convenience; allocates `br_NN`). |
| `DELETE` | `/api/seeds/:slug` | Soft-delete a content type. |

> The dashboard already reads the *enriched* schema (with layouts) from `GET /api/schema`
> — keep using that for rendering. `/api/seeds` is the **editing** surface (raw
> definitions, including deleted ones and `source`). Do not duplicate layout logic here.

### Admin gate

Reuse the role check used by `schema.handler.ts`:

```ts
const role = context.get('jwtPayload')?.role
if (role !== 'admin') return publicProblem(context, { type: 'forbidden', title: 'Forbidden', status: 403, detail: 'Seed management requires admin role.' })
```

Mount in `factory.ts` inside the protected group, next to `schema`:

```ts
apiProtected.route('/seeds', seedsApp)
```

## 4. Create — `POST /api/seeds`

Request body is a full `Seed` **without** branch ids (the client sends branches with
alias/label/type/policies; the server assigns ids) — or with ids, which the server
validates. Decide one contract and document it; **recommended:** server assigns ids so
the client never invents them.

Pipeline:

1. Parse JSON (→ `400 invalid-json` on failure).
2. Reject if `slug` already exists as an **active** seed (`409 slug-conflict`). If it
   exists as `deleted`, treat the create as a **revive + replace** (upsert reactivates
   the row; the existing `content_{slug}` table is reused — additive). Document this.
3. Normalise: ensure `slug` matches `^[a-z0-9_]+$` (it becomes a table name); for each
   branch missing an `id`, assign `nextBranchId(accumulatingSeed)` (allocate
   sequentially so ids are unique within the seed). Default `displayNameAlias` if absent
   to the first text branch's alias (or `400` if none).
4. Build the candidate active set: `[...repo.listActive().filter(s => s.slug !== slug), candidate]`.
   Run `validateSeedDefinitions(set)`. Any fatal issue for this slug → `422 validation-failed`
   with the messages. (Warnings are allowed; optionally echo them in the response.)
5. Persist: `repo.upsert(slug, candidate, 'runtime')`.
6. DDL: `existingCols = schemaMutator.getColumns('content_'+slug)`. If `null`,
   `planCreateSeed(candidate)`; else `planExtendSeed(candidate, existingCols).statements`.
   `schemaMutator.execDdl(stmts)`.
   - Relations: a create whose relation targets a not-yet-created seed is already caught
     by validation (unknown target). FK targets must exist as tables. Since each seed is
     created independently here (not a batch of seeds), the target table must already
     exist; validation guarantees the *definition* exists, but if the target seed was
     created in this same session moments earlier its table exists too. If a relation
     targets an active seed whose table is somehow absent, `execDdl` will fail — surface
     `422` with the SQL error message (masked in production per existing convention).
7. `repo.bumpRegistryVersion()`.
8. Log activity: `context.get('activityLogger').log({ action: 'create', entityType: 'seed', entityId: slug, … })` (follow existing logger usage, e.g. in `upload.ts`).
9. Respond `201 { slug }`.

> **Ordering / atomicity caveat:** persist-then-DDL is two operations. If DDL fails after
> the row is written, you have a definition with no (or partial, but additive) table. To
> keep it recoverable: do DDL **before** the `upsert` is committed is not possible (DDL
> needs the validated definition, not the DB row). Instead: run `execDdl` first, then
> `upsert`, then `bumpRegistryVersion`. If `execDdl` throws, nothing was persisted — the
> seed simply wasn't created. If `upsert` throws after successful DDL, the table exists
> but the seed isn't registered; `CREATE TABLE IF NOT EXISTS` makes a retry idempotent.
> **Order: validate → execDdl → upsert → bump → log.**

## 5. Edit — `PUT /api/seeds/:slug` and `POST /api/seeds/:slug/branches`

`PUT` replaces the definition. Enforce additive-only **at the API layer**:

- Compare incoming branches against the stored definition's branches **by `id`**.
- **Adding** a branch (new id) → allowed; `planExtendSeed` emits its `ADD COLUMN`.
- **Removing** a branch (id present in stored, absent in incoming) → allowed, but it is
  an **orphan**: the column stays in the DB, the engine ignores it (it's no longer in the
  definition). Do **not** emit `DROP`. Document in the response/log that the column is
  retained.
- **Renaming an alias** (same id, different alias) → **reject with `422` in this sprint**
  (`alias-rename-not-supported`) — alias rename means `ALTER … RENAME COLUMN`, which is
  destructive-adjacent and lands in sprint 06. The id stays stable so layouts survive;
  only the SQL column rename is deferred.
- **Changing a branch's `type`** on an existing id → **reject `422`** (`branch-type-change-not-supported`):
  the column's SQL affinity is fixed; changing type needs a migration (sprint 06).
- Changing label/policies/options/number/file options on an existing branch → allowed
  (no DDL; just re-persist). Note `policies.search` toggling does not retroactively add
  an FTS column (`ftsRebuildNeeded` is informational; FTS rebuild is sprint 06).

`POST /api/seeds/:slug/branches` is sugar: accept a single branch (no id), allocate
`nextBranchId(stored)`, append to the stored definition, then run the same validate →
extend-DDL → upsert → bump path. Returns the assigned `id`.

Both run `validateSeedDefinitions` over the full active set with the edited seed swapped
in, exactly as create.

## 6. Soft-delete — `DELETE /api/seeds/:slug`

- `repo.softDelete(slug)` (status → 'deleted'); **no `DROP TABLE`**.
- `bumpRegistryVersion()`; log activity.
- The `content_{slug}` table, its rows, FTS, drafts, junctions all remain on disk,
  invisible to the registry. Reviving (a later create with the same slug) reuses them.
- **Backref guard (recommended):** before delete, if other active seeds have `relation`
  branches whose `targetSeed === slug`, reject `409 seed-referenced` listing them — a
  dangling FK target would break those tables' inserts. The `buildBackrefMap` data is on
  `c.get('backrefMap')`; use it to find inbound references. (Full backref-aware UX is
  sprint 06; this is the minimal safety check.)
- Respond `200 { success: true }`.

## 7. Error model

Use `publicProblem(context, { type, title, status, detail })`. Suggested `type` slugs:
`invalid-json` (400), `slug-conflict` (409), `seed-not-found` (404),
`validation-failed` (422, include the validation messages in `detail` or an `errors`
array), `alias-rename-not-supported` (422), `branch-type-change-not-supported` (422),
`seed-referenced` (409), `forbidden` (403), `ddl-failed` (422/500 — mask detail in
production via the existing convention: `context.env.ENV !== 'production'` gates detail).

## 8. Live propagation

Because every write ends with `bumpRegistryVersion()`, the next request on each isolate
re-hydrates (sprint 02). No extra cache plumbing needed here. Verify end-to-end: create a
seed → immediately `GET /api/schema` → the new seed is present and its table accepts a
content `POST`.

## 9. Tests

`apps/api/src/features/seeds/seeds.handler.test.ts` (stub or in-memory D1 `ISeedRepository`
+ a fake/real `ISchemaMutator`):

- Non-admin → 403 on every write route.
- Create: persists, runs `planCreateSeed` DDL (assert the mutator received a
  `CREATE TABLE content_<slug>` statement), bumps version, returns 201; ids assigned
  `br_01…`.
- Create with existing active slug → 409. Create over a soft-deleted slug → revives
  (200/201) without a fresh `CREATE TABLE` failing (IF NOT EXISTS).
- Create with unknown relation target → 422 validation-failed.
- Add branch / PUT add: emits exactly one `ADD COLUMN` for the new alias; column already
  present (mutator `getColumns` includes it) → no `ADD COLUMN`.
- PUT removing a branch → 200, no DROP emitted, column retained (assert mutator never got
  a `DROP`).
- PUT renaming an alias (same id) → 422 alias-rename-not-supported.
- PUT changing a branch type → 422.
- DELETE → soft-delete (status flips, table not dropped), version bumped.
- DELETE of a seed referenced by another seed's relation → 409 seed-referenced.
- `D1SchemaMutator` unit test against local D1: `getColumns` null for missing table,
  set for existing; `execDdl` creates a table then `getColumns` reflects it.

## 10. Acceptance criteria

- [ ] Build + tests pass.
- [ ] `ISchemaMutator` in core; `D1SchemaMutator` wired and typed on context.
- [ ] `seedsApp` mounted at `/api/seeds`, all writes admin-gated.
- [ ] Create/edit/add-branch/soft-delete all: validate → (DDL) → upsert → bump → log,
      in that order, with create using `execDdl` before `upsert`.
- [ ] **No `DROP` or `RENAME` SQL is ever emitted.** Orphan-on-remove,
      reject-on-rename/type-change.
- [ ] A seed created via the API is usable for content CRUD on the next request, no
      redeploy.

## 11. Do NOT

- No `DROP TABLE` / `DROP COLUMN` / `RENAME COLUMN` (sprint 06).
- No FTS rebuild (sprint 06) — `ftsRebuildNeeded` is informational only.
- Do not bypass `ISchemaMutator` / `ISeedRepository` with raw `env.DB`.
- Do not change `GET /api/schema` (it stays the render path; layouts unchanged).
- Do not make the registry interface async.
