You are a senior TypeScript engineer working on the BeechCMS monorepo.

## PROJECT CONTEXT

This is **Sprint 1 of 2** for Soft Delete, Trash & GDPR Purge
(roadmap: `stages/01_sprint_planning/output/backlog/ROADMAP.md`).
Scope: `@beechcms/core` (Botanical Engine + contracts), `apps/api` (D1 repository,
R2 ledger, HTTP surface), `packages/cli` (manifest/migration awareness).
**No dashboard work** — that is Sprint 2.

### Stack
- API: Hono on Cloudflare Workers, D1 (SQLite, FTS5), R2 via the `BeechBucket` abstraction
- Shared: `@beechcms/core` (pure TypeScript, zero HTTP/cloud deps)
- Monorepo: Turborepo / pnpm workspaces, TypeScript 7.0.2

---

### Pre-Computation Analysis

**a) God Nodes identified via the graphify CLI**

| Node | Source | Degree / blast radius | Why it is a God Node here |
|---|---|---|---|
| `D1ContentRepository` | `apps/api/src/shared/db/repositories/content.repository.d1.ts:113` | degree **44**; `graphify affected --depth 2` returns 11 nodes (`src/index.ts`, `repository.middleware.ts`, `factory.ts`, `queue-consumer.ts` + 6 test suites) | Every content read and write in the product passes through it. Both `softDelete` and `purge` are implemented here. |
| `buildSelectQuery` | `packages/core/src/engine/query.ts:36` | `affected --depth 2` → only `query.test.ts` **directly**, but it is the sole SQL compiler behind `findMany` | The single chokepoint where a `deleted_at IS NULL` predicate can be applied to *every* list read at once — dashboard, Public API, relation expansion, relation subqueries. |
| `generateCreateTable` / `planCreateSeed` | `packages/core/src/engine/ddl.ts:165`, `seed-ddl.ts:25` | `affected` → `planCreateSeed`, `ddl.test.ts`, `seed-ddl.ts`, `seed-ddl.test.ts`, `core/src/index.ts` (re-export), `seed-ddl-destructive.test.ts` | Owns the physical shape of `content_{slug}`. `deleted_at` and the partial unique slug index are born here. |
| `deleteHandler` | `apps/api/src/features/content/handlers/delete.ts:17` | `affected --depth 2` → `content/index.ts` (indirect_call), `factory.ts` | The only current deletion path, and the only place `deleteR2Objects` is called for content. |
| `ContentRepository` (interface) | `packages/core/src/content/content.repository.ts:118` | implemented by `D1ContentRepository`, consumed by `apps/api/src/public/*` and every content handler | The contract both the dashboard path and the Public API path speak. New methods land here first. |

**b) Architectural boundaries affected**

- `@beechcms/core` — **owns**: the `softDelete` flag on `Seed`; the `deleted_at` system column
  in `SYSTEM_COLUMNS` / `getExpectedColumns` / `generateCreateTable` / `generateIndexes`;
  the `trashed` gate inside `buildSelectQuery`; the `ContentRepository` method signatures;
  the `IDeletionLedger` port. Zero I/O, zero Cloudflare imports — unchanged invariant.
- `apps/api` — **owns**: the D1 implementation of the new repository methods (rows, junction
  rows, `_drafts` rows), the `R2DeletionLedger` adapter over `BeechBucket`, the thin HTTP
  handlers in the `content` slice, the route table, the permission rules. R2 media deletion
  stays in the handler (`deleteR2Objects`), never in the repository.
- `apps/dashboard` — **untouched in this sprint** (Sprint 2).
- `packages/cli` — **touched minimally**: `SEED_FLAGS` in `manifest-compare.ts` gains
  `softDelete`; `migration-writer.ts` learns to emit the `deleted_at` ALTER (it is a system
  column, not a branch, so today's `seed.branches.find(...)` lookup would silently skip it).

**c) `graphify affected` impact analysis (breaking-change proof)**

```
$ graphify affected "D1ContentRepository" --depth 2
- api/src/index.ts [imports]                 apps/api/src/index.ts:L10
- repository.middleware.ts [imports]         apps/api/src/middleware/repository.middleware.ts:L7
- queue-consumer.ts [imports]                apps/api/src/shared/jobs/queue-consumer.ts:L8
- src/factory.ts [imports_from]              apps/api/src/factory.ts:L44
- content.repository.d1.test.ts, d1-repository-bulk-and-drafts.test.ts,
  d1-repository-privacy.test.ts, draft-touched-fields.test.ts, hooks-lifecycle.test.ts,
  repository-privacy-middleware.test.ts, flow-background-queues.test.ts  [tests]

$ graphify affected "generateCreateTable" --depth 2
- planCreateSeed() [calls]                   packages/core/src/engine/seed-ddl.ts:L26
- seed-ddl.ts [imports]                      packages/core/src/engine/seed-ddl.ts:L5
- core/src/index.ts [re_exports]             packages/core/src/index.ts:L83
- ddl.test.ts, seed-ddl.test.ts, seed-ddl-destructive.test.ts  [tests]

$ graphify affected "buildSelectQuery" --depth 2
- query.test.ts [imports]                    packages/core/src/engine/query.test.ts:L4

$ graphify affected "deleteHandler" --depth 2
- content/index.ts [indirect_call]           apps/api/src/features/content/index.ts:L31
- src/factory.ts [imports_from]              apps/api/src/factory.ts:L19

$ graphify affected "planCreateSeed" --depth 2
- seed-ddl.test.ts [imports]                 packages/core/src/engine/seed-ddl.test.ts:L5
```

**Reading of the impact:** every change in this sprint is **additive**. New `Seed` and
`SelectOptions` fields are optional; new `ContentRepository` methods are additions to an
interface with exactly one implementation (`D1ContentRepository`) — no second implementer
breaks. `buildSelectQuery`'s new predicate is gated on `seed.softDelete`, so for every seed
that does not opt in, the emitted SQL is **byte-identical to today** and `query.test.ts`
keeps passing unchanged. No production consumer signature is removed or narrowed.

---

### VETO Audit

Proposed boundaries evaluated against `_config/ponytail_arch.md`:

**1. THE BOTANICAL INVARIANT — no D1 access bypasses `@beechcms/core`.**
- The `deleted_at` predicate is compiled by `buildSelectQuery` in
  `packages/core/src/engine/query.ts`, not hand-written in a handler. The physical column and
  its indexes come from `generateCreateTable` / `generateIndexes` / `planExtendSeed`.
- `deleted_at` is registered in `SYSTEM_COLUMNS` (`packages/core/src/engine/ddl.ts:54`), so it
  is addressed the same way `status` and `created_at` are. Branch data is still addressed by
  Branch ID / alias — **no new hardcoded field name is introduced at any call site**.
- Every handler added in this sprint calls `context.get('repository')`. Verified by graphify:
  `graphify path "readListEntries" "buildSelectQuery"` → **no directed path**; the public read
  layer only ever reaches SQL through the `ContentRepository` port. That property is preserved.
- **PASS.**

**2. VSA ENFORCEMENT — zero cross-feature imports.**
- All new handlers live in `apps/api/src/features/content/handlers/`. No file in
  `features/content/` imports from `features/seeds/`, `features/draft/`, `features/upload/`
  or any other slice; shared code is reached through `shared/` and `@beechcms/core` only.
- `R2DeletionLedger` is cross-cutting infrastructure (content purge today, media purge
  tomorrow), so it goes to `apps/api/src/shared/storage/deletion-ledger.ts`, **not** inside the
  content slice. Its port `IDeletionLedger` is declared in `@beechcms/core` — exactly the
  "if two slices need it, move it to core" rule.
- **PASS.**

**3. Repository / handler responsibility split (feature brief §2, rules 4–5).**
- `graphify path "D1ContentRepository" "deleteR2Objects"` → **no directed path today**, and
  this sprint keeps it that way. The repository touches rows, junction rows, `_drafts` rows and
  the ledger port; it NEVER calls `deleteR2Objects`. `purgeHandler` receives the returned row
  and invokes `deleteR2Objects` itself, exactly as `deleteHandler` does today
  (`delete.ts:52-59`). **PASS.**

**4. CLOUDFLARE PURITY.**
- The ledger is R2 through the existing `BeechBucket` port — no new dependency, no ORM, no
  stateful background job. Reconciliation is an explicit, operator-triggered HTTP route on the
  Worker, not a cron. `findExpiredByRetention` is a pure query with no scheduler attached
  (feature brief §4: "retention as an interface, not a job"). **PASS.**

**5. YAGNI — one adjustment made here, before drafting.**

*Rejected as over-engineering:* a per-seed SQLite table rebuild to convert an existing
table's inline `slug TEXT NOT NULL UNIQUE` into a partial unique index. SQLite materializes an
inline UNIQUE as a `sqlite_autoindex` that no `ALTER TABLE` can drop; removing it needs the
12-step rebuild, with junction tables holding live FKs at `content_{slug}(id)` and D1 offering
no reliable `PRAGMA foreign_keys=OFF` inside a batch. That is high risk in service of a
*secondary* requirement.

*Adjusted plan:* the partial unique index `WHERE deleted_at IS NULL` is emitted for tables
**created** with `softDelete: true` — there the brief's mechanism works exactly as specified.
A pre-existing table that later opts in receives `deleted_at` + its index, and keeps its global
autoindex, so on that table a trashed slug is not freed for reuse; the create attempt fails at
INSERT and `mapError` (`base.repository.d1.ts:28`) already maps it to `SlugConflictError` →
409. No data corruption, no silent divergence, and the auto-rename-on-restore path specified in
the brief is implemented regardless. The rebuild is a roadmap deferral, not a hidden gap.

*Also rejected:* a `deletion_ledger` D1 table (feature brief §5 already discards it) and any
change to `schema-fingerprint.ts` — `softDelete` does not alter a public response shape, and
`X-Schema-Revision` is a response-contract hash. Adding it there would churn every client's
cache for nothing.

**CONCLUSION: plan respects the Botanical Dialect and Vertical Slice Architecture. Proceed.**

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Today `DELETE /api/content/:slug/:id` is a physical `DELETE FROM` (`content.repository.d1.ts:968`)
followed by an unconditional `deleteR2Objects` (`delete.ts:54`). One mis-click on an order, a
customer or a lead is unrecoverable, and there is no artefact anywhere proving a GDPR erasure
happened — a D1 Time Travel restore silently resurrects data a user already had erased.

This sprint exists first because **the deletion semantics are a Botanical Engine concern, not a
UI concern**. Three invariants have to be true before a single pixel of Trash UI is worth
drawing:

1. **One chokepoint, not N.** A trashed record must be invisible to the dashboard list, the
   Public API list, single reads, relation expansion (`relation-include.ts:51`) and relation
   subqueries (`relation-subquery.ts:113`). Those five paths share exactly one SQL compiler:
   `buildSelectQuery`. Applying `deleted_at IS NULL` there — defaulting to active-only, opt-out
   per call — closes all five at once. Applying it in five handlers would be five chances to
   leak, and the Public API leak is the one the brief calls out as unacceptable.
2. **The ledger must outlive D1.** The irreversibility guarantee is only worth something if it
   survives a restore of the database that recorded it. That forces the ledger out of D1 and
   into R2, and forces reconciliation to treat the external log as the sole source of truth.
   This is a storage-topology decision; it cannot be retrofitted under a finished UI.
3. **No deletion path may be exempt from lifecycle hooks.** `beforeDelete`/`afterDelete` already
   run in `delete()` (`content.repository.d1.ts:951,977`). Soft delete, purge, bulk restore and
   bulk purge all have to run them too, or a hook-based integration (webhook, search index,
   counter) silently desynchronizes. Hooks live in the repository; that is where symmetry is
   enforceable.

**VSA adherence:** all API work stays inside `apps/api/src/features/content/`, plus one
cross-cutting adapter under `apps/api/src/shared/storage/`. No slice imports another.
**Botanical adherence:** `deleted_at` becomes a system column of the engine, its predicate is
compiled by the engine, and no handler writes raw SQL. Sprint 2 then consumes a frozen HTTP
contract and only has to render it.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Engine / DDL — `packages/core/src/engine/`**
- `ddl.ts:54` — `export const SYSTEM_COLUMNS = new Set(['id', 'slug', 'status', 'created_at', 'updated_at'])`
- `ddl.ts:165` `generateCreateTable(seed)` — emits `id TEXT PK`, **`slug TEXT NOT NULL UNIQUE`**,
  `status TEXT NOT NULL DEFAULT 'draft' CHECK(...)`, one column per branch, then `created_at` /
  `updated_at INTEGER NOT NULL DEFAULT (unixepoch())`.
- `ddl.ts:252` `generateIndexes(seed)` — `idx_{slug}_status`, `idx_{slug}_created_at`, plus
  per-branch indexes. All `CREATE INDEX IF NOT EXISTS`.
- `ddl.ts:386` `getExpectedColumns(seed)` — the expectation `beech schema diff` compares the
  physical table against.
- `ddl.ts:108` `isValidColumn(seed, col)` — `SYSTEM_COLUMNS.has(col) || branch alias match`.
- `seed-ddl.ts:25` `planCreateSeed(seed)`; `seed-ddl.ts:55` `planExtendSeed(seed, existingColumns)`
  — the **only** additive-evolution path, called by `features/seeds/seeds.helpers.ts:150-151`
  and `features/seeds/seeds.mcp.ts:160-162,273-275`.
- `query.ts:36` `buildSelectQuery(seed, options)` — builds `whereClauses` in order: FTS MATCH →
  `status` (line 59) → filter groups → `ORDER BY` → `LIMIT/OFFSET`.
- `types.ts:219` `interface Seed` — carries `allowDrafts?`, `allowPublicRead?`,
  `allowPublicPost?`, `allowPublicEdit?`, `retentionDays?` (already declared, currently unused
  at runtime), `displayNameAlias`, `branches`.
- `types.ts:300` `interface SelectOptions` — `filters`, `filterLogic`, `orderBy`, `pagination`,
  `status`, `search`, `fields`, `kanbanOrder`, `isCount`.
- `seed-validation.ts:308` — Fatal 13 already validates `retentionDays >= 1`.
- `schema-mutator.ts:7` `ISchemaMutator` — `execDdl` (additive only) vs `execDestructive`.

**Contracts — `packages/core/src/content/content.repository.ts`**
- `RepositoryError`, `EntryNotFoundError`, `SlugConflictError`, `HookValidationError`.
- `RepositoryOptions { actor?: { id, role?, email? } }`.
- `ContentRepository` (line 118): `findMany`, `findById`, `findBySlug`,
  `findParentIdsByRelation`, `getFacets`, `create`, `update`, `delete`, `mutateField`,
  `updateWithKanbanPosition`, `runBatch`, `saveDraft`, `getDraft`, `publishDraft`,
  `deleteDraft`, `existsSlug`, `hasDraft`, `findPendingDrafts`, `bulkUpdate`.

**D1 implementation — `apps/api/src/shared/db/repositories/content.repository.d1.ts`**
- `hookCtx(seed, actor)` at line 131 → `{ seed, repository: this, actor, db, queue }`.
- `findMany` :303 (the only method going through `buildSelectQuery`);
  `findById` :344 — raw `SELECT * … WHERE id = ?`;
  `findBySlug` :370 — raw `SELECT * … WHERE slug = ?`;
  `findParentIdsByRelation` :396 — raw `SELECT DISTINCT parent_id FROM rel_… WHERE target_id IN (…)`;
  `getFacets` :428 — raw `GROUP BY status` + `json_each` per tags branch;
  `existsSlug` :464 — raw `SELECT 1 … WHERE slug = ?`;
  `delete` :950 — `beforeDelete` → `SELECT *` → `DELETE FROM` → `rowToData` → `afterDelete`,
  returns `{ row }`; relies on DB-level `ON DELETE CASCADE` for junction rows;
  `bulkUpdate` :1391.
- Base class `apps/api/src/shared/db/repositories/base.repository.d1.ts:26` `mapError` — maps
  `UNIQUE constraint failed … slug` to `SlugConflictError`.

**HTTP surface — `apps/api/src/features/content/`**
- `index.ts` route order (first match wins, literal prefixes before `:slug/:id`):
  `PATCH /:slug/:id/kanban-move` → `PATCH /:slug/:id/kanban-position` →
  `GET|PUT /:slug/view-config` → `GET /:slug` → `GET /:slug/facets` →
  `GET /:schema_slug/by-slug/:entry_slug` → `GET /:slug/:id` → `POST /:slug` →
  `PATCH /:slug/bulk` → `PUT /:slug/:id` → `DELETE /:slug/:id`.
- `handlers/delete.ts` — the thin-orchestrator template this sprint copies: resolve slug/id →
  `context.get('getSeed')` → `repository.delete(seed, id, { actor })` → `logContentActivity` →
  `dispatchContentAutomation` → `extractMediaKeysFromData` → `deleteR2Objects(...).catch(...)`.
- `handlers/helpers.ts` — `logContentActivity(context, action, id, slug, title)`,
  `dispatchContentAutomation(context, seedSlug, event, entry)`,
  `handleContentDatabaseError(context, error)` (maps `EntryNotFoundError`→404,
  `SlugConflictError`→409, `HookValidationError`→422).
- `handlers/bulk.handler.ts` — `MAX_BULK_SIZE = 500`, `{ ids: string[] }` validation, per-id
  `{ id, problem: { status, type, detail } }` failure objects.

**Middleware registration order — `apps/api/src/factory.ts`**
```
repositoryMiddleware (:129) → seedRegistryMiddleware (:143) → storageMiddleware (:146)
  → queueMiddleware (:150) → authProvidersMiddleware (:152) → rateLimiterMiddleware (:153)
  → observabilityMiddleware (:154)
apiProtected: authMiddleware({acceptOAuth:true}) (:239) → oauthScopeMiddleware (:242)
  → permissionMiddleware (:246) → … → apiProtected.route('/content', contentFeature) (:258)
apiPublic:   schemaRevisionMiddleware (:266) → publicRateLimitMiddleware (:267)
  → apiKeyMiddleware (:268) → publicRoutes (:269), mounted at /api/v1/public (:273)
```
`context.get('bucket')` is set by `storageMiddleware` (`middleware/storage.middleware.ts:21`)
for every request, so it is available to the content slice.

**Permission rules — `apps/api/src/middleware/permission.middleware.ts`**
- "ORDER IS SIGNIFICANT — first match wins" (line 62). Literal `/api/content/...` prefixes must
  precede the `:slug` patterns. Current per-seed rules use `perm('content:<verb>', 'capture1')`,
  capture group 1 being the seed slug scope. `DELETE /^\/api\/content\/([^/]+)\/[^/]+$/` →
  `perm('content:delete','capture1')` at line 129. An unmatched path fails closed with
  403 `route_not_registered`.

**Public API — `apps/api/src/public/`**
- `read-list.ts:43` and `relation-include.ts:51` and `relation-subquery.ts:113` all reach D1
  **only** through `repository.findMany(seed, options)`. `read-single.ts` uses
  `findById`/`findBySlug`. There is no raw SQL anywhere in `apps/api/src/public/`.

**CLI — `packages/cli/src/lib/`**
- `manifest-compare.ts:38` `SEED_FLAGS = ['allowDrafts','allowPublicRead','allowPublicPost','allowPublicEdit']`
  (unknown keys are copied through, so an unknown flag already shows as drift).
- `migration-writer.ts:73` resolves a `missing` column by `seed.branches.find(b => b.alias === col.name)`
  — a system column would be skipped silently.
- `schema-diff.ts:58` `diffSeed` compares `getExpectedColumns(seed)` against `introspectTable`.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

**`packages/core` — MODIFIED**
1. `src/engine/types.ts` — `Seed.softDelete?: boolean`; `SelectOptions.trashed?: TrashedMode`;
   `export type TrashedMode = 'active' | 'trashed' | 'any'`.
2. `src/engine/ddl.ts` — `deleted_at` added to `SYSTEM_COLUMNS`; `generateCreateTable` emits the
   column and drops the inline `UNIQUE` on `slug` for soft-delete seeds; `generateIndexes` emits
   `idx_{slug}_deleted_at` and the partial unique slug index; `getExpectedColumns` includes
   `deleted_at` only for soft-delete seeds; `isValidColumn` gates `deleted_at` on `seed.softDelete`;
   new `generateEnableSoftDelete(seed): string[]`.
3. `src/engine/query.ts` — the `trashed` predicate in `buildSelectQuery`, immediately after the
   `status` clause.
4. `src/engine/seed-ddl.ts` — `planExtendSeed` emits the soft-delete statements when the column
   is absent.
5. `src/engine/seed-validation.ts` — Fatal 14: `softDelete` must be a boolean when present.
6. `src/content/content.repository.ts` — `PurgeResult`, `BulkDeleteResult`; six new
   `ContentRepository` methods; `findById` gains an options argument.
7. `src/content/deletion-ledger.ts` — **NEW**: `DeletionLedgerEvent`, `IDeletionLedger`.
8. `src/index.ts` — re-export the new symbols.

**`apps/api` — MODIFIED / NEW**
9.  `src/shared/db/repositories/content.repository.d1.ts` — implements `softDelete`, `restore`,
    `purge`, `bulkRestore`, `bulkPurge`, `findExpiredByRetention`; adds the `deleted_at` guard to
    `findById`, `findBySlug`, `existsSlug`, `findParentIdsByRelation`, `getFacets`, `bulkUpdate`.
10. `src/shared/storage/deletion-ledger.ts` — **NEW**: `R2DeletionLedger implements IDeletionLedger`.
11. `src/middleware/repository.middleware.ts` — constructs the ledger and injects it into
    `D1ContentRepository`.
12. `src/features/content/handlers/delete.ts` — branches soft-delete vs purge.
13. `src/features/content/handlers/trash.ts` — **NEW**: `trashListHandler`, `restoreHandler`,
    `bulkRestoreHandler`, `bulkPurgeHandler`, `reconcilePurgesHandler`.
14. `src/features/content/index.ts` — five new routes, correctly ordered.
15. `src/features/content/constants.ts` — new error constants.
16. `src/middleware/permission.middleware.ts` — five new rules, correctly ordered.
17. `src/types.ts` — `deletionLedger: IDeletionLedger` on `Variables`.

**`packages/cli` — MODIFIED**
18. `src/lib/manifest-compare.ts` — `softDelete` added to `SEED_FLAGS`.
19. `src/lib/migration-writer.ts` — emits the `deleted_at` ALTER for the system column.

**Tests — NEW**
20. `packages/core/src/engine/ddl.test.ts` (extend), `query.test.ts` (extend),
    `seed-ddl.test.ts` (extend) — unit tier.
21. `apps/api/src/features/content/test/integration/soft-delete.integration.test.ts` — **NEW**,
    integration tier, real D1 via `createTestHarness`.
22. `apps/api/src/public/test/integration/public-trash-isolation.integration.test.ts` — **NEW**,
    integration tier.
23. `apps/api/src/shared/storage/deletion-ledger.test.ts` — **NEW**, unit tier (fake `BeechBucket`).

**Explicitly NOT in this sprint:** any file under `apps/dashboard/`, any cron/scheduler, any
MCP content tool, any D1 `deletion_ledger` table, any SQLite table rebuild.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### T1 — `packages/core/src/engine/types.ts`

Add to `interface Seed`, directly after `allowDrafts` (line 237):

```ts
  /**
   * Enables the Trash for this content type. When true, `content_{slug}` carries a
   * `deleted_at INTEGER NULL` column, `DELETE` becomes a reversible soft delete, and every
   * read excludes trashed rows unless the caller opts in via `SelectOptions.trashed`.
   * Default: false.
   */
  softDelete?: boolean
```

Add above `interface SelectOptions` (line 300):

```ts
/**
 * Soft-delete visibility for a read.
 *  - 'active'  (default) — only rows with `deleted_at IS NULL`
 *  - 'trashed'           — only rows with `deleted_at IS NOT NULL` (the Trash view)
 *  - 'any'               — no predicate (restore/purge lookups, reconciliation)
 * Ignored entirely for seeds without `softDelete: true`.
 */
export type TrashedMode = 'active' | 'trashed' | 'any'
```

Add the field to `SelectOptions`, after `status` (line 310):

```ts
  /** Soft-delete visibility. Defaults to 'active': omitting it can never leak a trashed row. */
  trashed?: TrashedMode
```

### T2 — `packages/core/src/engine/ddl.ts`

**T2.1** Replace line 54:

```ts
export const SYSTEM_COLUMNS = new Set(['id', 'slug', 'status', 'created_at', 'updated_at', 'deleted_at'])
```

**T2.2** In `generateCreateTable` (line 165), replace the `slug` line and append the column.
The inline `UNIQUE` is dropped **only** for soft-delete seeds; every other table keeps today's
byte-identical DDL.

```ts
export function generateCreateTable(seed: Seed): string {
  const table = tableName(seed)
  const lines: string[] = [
    `CREATE TABLE IF NOT EXISTS ${table} (`,
    `  id         TEXT    NOT NULL PRIMARY KEY,`,
    // Soft-delete tables carry uniqueness in a PARTIAL unique index instead, so a trashed
    // row stops reserving its slug. An inline UNIQUE would become a sqlite_autoindex that
    // no ALTER TABLE can drop later.
    seed.softDelete
      ? `  slug       TEXT    NOT NULL,`
      : `  slug       TEXT    NOT NULL UNIQUE,`,
    `  status     TEXT    NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published', 'archived')),`,
  ]
  // … branch loop unchanged …
  lines.push(`  created_at INTEGER NOT NULL DEFAULT (unixepoch()),`)
  lines.push(`  updated_at INTEGER NOT NULL DEFAULT (unixepoch())` + (seed.softDelete ? ',' : ''))
  if (seed.softDelete) lines.push(`  deleted_at INTEGER`)
  lines.push(`);`)
  return lines.join('\n')
}
```

Resulting shape for a soft-delete seed `orders`:

```sql
CREATE TABLE IF NOT EXISTS content_orders (
  id         TEXT    NOT NULL PRIMARY KEY,
  slug       TEXT    NOT NULL,
  status     TEXT    NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published', 'archived')),
  -- … branch columns …
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  deleted_at INTEGER
);
```

`deleted_at` is **nullable with no default** deliberately: `NULL` means "live", and a row is
never implicitly trashed. `generateDraftTable` is NOT touched — `_drafts` rows are purged with
their parent via `ON DELETE CASCADE` and are never independently trashed.

**T2.3** In `generateIndexes` (line 252), append to the initial `indexes` array:

```ts
  if (seed.softDelete) {
    indexes.push(`CREATE INDEX IF NOT EXISTS idx_${slug}_deleted_at ON ${table}(deleted_at);`)
    // Active rows only: a trashed row releases its slug for reuse (feature brief §4).
    indexes.push(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_${slug}_slug_active ON ${table}(slug) WHERE deleted_at IS NULL;`
    )
  }
```

**T2.4** In `getExpectedColumns` (line 386), the trailing literal becomes:

```ts
  return [
    { name: 'id',         sqlType: 'TEXT',    notNull: true,  isPk: true  },
    { name: 'slug',       sqlType: 'TEXT',    notNull: true,  isPk: false },
    { name: 'status',     sqlType: 'TEXT',    notNull: true,  isPk: false },
    ...branchCols,
    { name: 'created_at', sqlType: 'INTEGER', notNull: true,  isPk: false },
    { name: 'updated_at', sqlType: 'INTEGER', notNull: true,  isPk: false },
    ...(seed.softDelete
      ? [{ name: 'deleted_at', sqlType: 'INTEGER' as const, notNull: false, isPk: false }]
      : []),
  ]
```

Without the conditional, `beech schema diff` would report `deleted_at` missing on every
non-soft-delete table.

**T2.5** `isValidColumn` (line 108) — `deleted_at` is only addressable when the seed opted in,
otherwise a filter would compile SQL against a column that does not exist:

```ts
export function isValidColumn(seed: Seed, col: string): boolean {
  if (col === 'deleted_at') return seed.softDelete === true
  if (SYSTEM_COLUMNS.has(col)) return true
  return seed.branches.some(b => b.alias === col)
}
```

**T2.6** New export, at the end of the file:

```ts
/**
 * Additive statements that turn soft delete on for a table that already exists.
 *
 * The partial unique index is emitted for correctness on tables that were CREATED with
 * `softDelete: true`. On a pre-existing table the inline `slug … UNIQUE` survives as a
 * sqlite_autoindex that SQLite cannot drop via ALTER; there the partial index is redundant
 * and a trashed slug stays reserved until the table is rebuilt (see ROADMAP deferral).
 * Returns [] when the seed does not opt in.
 */
export function generateEnableSoftDelete(seed: Seed): string[] {
  if (!seed.softDelete) return []
  const table = tableName(seed)
  const slug = seed.slug
  return [
    `ALTER TABLE ${table} ADD COLUMN deleted_at INTEGER;`,
    `CREATE INDEX IF NOT EXISTS idx_${slug}_deleted_at ON ${table}(deleted_at);`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_${slug}_slug_active ON ${table}(slug) WHERE deleted_at IS NULL;`,
  ]
}
```

Re-export it from `packages/core/src/engine/engine.ts` alongside the other `ddl.ts` exports,
and from `packages/core/src/index.ts`.

### T3 — `packages/core/src/engine/query.ts`

In `buildSelectQuery`, insert **immediately after** the `status` block (currently lines 59-62,
before the filter-group loop). Position matters: it must be an unconditional `AND` at the top
level, never inside the `filterLogic: 'OR'` group join.

```ts
  // Soft delete: 'active' is the default, so a caller that forgets the option can never
  // observe a trashed row — including the Public API, relation expansion and subqueries,
  // which all reach SQL only through repository.findMany.
  if (seed.softDelete) {
    const trashed = options.trashed ?? 'active'
    if (trashed === 'active') {
      whereClauses.push(`${table}.deleted_at IS NULL`)
    } else if (trashed === 'trashed') {
      whereClauses.push(`${table}.deleted_at IS NOT NULL`)
    }
  }
```

Destructure `trashed` is not required — read it off `options` to keep the existing
destructuring line untouched. For a seed without `softDelete`, the emitted SQL and bindings are
unchanged, which is why `query.test.ts`'s existing cases keep passing verbatim.

### T4 — `packages/core/src/engine/seed-ddl.ts`

In `planExtendSeed` (line 55), before the final `statements.push(...generateIndexes(seed))`:

```ts
  // System column, not a branch: the branch loop above can never emit it.
  if (seed.softDelete && !existingColumns.has('deleted_at')) {
    statements.push(...generateEnableSoftDelete(seed))
  }
```

Import `generateEnableSoftDelete` from `./engine.js` alongside `generateAddColumn`.
`generateIndexes` is idempotent (`IF NOT EXISTS`), so the duplicated index statements are
harmless. This single edit covers **both** evolution callers verified by graphify:
`features/seeds/seeds.helpers.ts:151` and `features/seeds/seeds.mcp.ts:162,275`.

### T5 — `packages/core/src/engine/seed-validation.ts`

Add after Fatal 13 (line 308):

```ts
  // ── Fatal 14: softDelete type validation ───────────────────────────────────
  for (const seed of seeds) {
    if (seed.softDelete !== undefined && typeof seed.softDelete !== 'boolean') {
      issues.push({
        severity: 'fatal',
        seed: seed.slug,
        messages: [`softDelete must be a boolean (got ${typeof seed.softDelete}).`],
      })
    }
  }
```

Match the exact `SeedValidationIssue` shape used by Fatal 13 in the file — do not invent fields.

### T6 — `packages/core/src/content/deletion-ledger.ts` (NEW)

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * The GDPR erasure record. It lives OUTSIDE D1 on purpose: a D1 Time Travel restore rewinds
 * every table it wrote, including any local ledger, which would defeat the one guarantee this
 * record exists to give — that an erasure stays erased.
 */
export interface DeletionLedgerEvent {
  /** Seed slug the purged entry belonged to. */
  seedSlug: string
  /** Entry id, the reconciliation key against a restored `content_{slug}` row. */
  entryId: string
  /** Entry slug at purge time. Diagnostic only; `entryId` is the identity. */
  entrySlug: string | null
  /** Unix seconds (`IClock`), never `Date.now()`. */
  purgedAt: number
  /** Who ordered the purge. `null` for a system/reconciliation purge. */
  actorId: string | null
  /** 'purge' = operator action; 'reconcile' = re-applied after a restore. */
  reason: 'purge' | 'reconcile'
}

/**
 * Append-only erasure log. `append` must be durable before the caller reports success:
 * a purge whose event was lost is a purge that a restore can silently undo.
 */
export interface IDeletionLedger {
  /** Records one erasure. Throws if the write did not land. */
  append(event: DeletionLedgerEvent): Promise<void>
  /**
   * Streams recorded erasures for one seed, newest-first is NOT guaranteed.
   * `cursor` is opaque and comes from the previous page's `nextCursor`.
   */
  list(seedSlug: string, options?: { limit?: number; cursor?: string }): Promise<{
    events: DeletionLedgerEvent[]
    nextCursor?: string
  }>
}
```

### T7 — `packages/core/src/content/content.repository.ts`

Add above `interface ContentRepository`:

```ts
/** Everything a purge caller needs to finish cleanup outside the database. */
export interface PurgeResult {
  /** The row as it existed immediately before erasure — the source of the R2 media keys. */
  row: Record<string, any>
  /** True when a ledger event was appended. False only for a seed without `softDelete`. */
  ledgerWritten: boolean
}

/** Per-id outcome of a bulk trash operation, mirroring `bulkUpdate`'s shape. */
export interface BulkDeleteResult {
  succeeded: string[]
  failed: Array<{ id: string; reason: string }>
}
```

Change `findById` (line 128) and add the six methods to the interface:

```ts
  /**
   * Finds a single entry by its unique ID.
   * Trashed rows are invisible unless `options.trashed` says otherwise.
   * Throws EntryNotFoundError if not found.
   */
  findById(seed: Seed, id: string, options?: { trashed?: TrashedMode }): Promise<Record<string, any>>

  /**
   * Reversible delete: stamps `deleted_at` and returns the row as it was.
   * Runs `beforeDelete`/`afterDelete`, exactly like `delete`.
   * Leaves junction rows, `_drafts` rows and R2 media untouched — a trashed entry must be
   * restorable whole.
   * @throws RepositoryError if `seed.softDelete` is not true.
   * @throws EntryNotFoundError if no live row with `id` exists.
   */
  softDelete(seed: Seed, id: string, options?: RepositoryOptions): Promise<{ row: Record<string, any> }>

  /**
   * Clears `deleted_at`. When the entry's slug was taken by a live entry in the meantime the
   * UNIQUE constraint rejects the update; the implementation catches it and restores under an
   * auto-renamed slug rather than failing the operation (feature brief §4).
   * @returns The restored row, carrying the slug it actually ended up with.
   * @throws EntryNotFoundError if no TRASHED row with `id` exists.
   */
  restore(seed: Seed, id: string, options?: RepositoryOptions): Promise<{ row: Record<string, any> }>

  /**
   * Irreversible erasure: runs `beforeDelete`, reads the row, deletes it (junction and
   * `_drafts` rows follow via ON DELETE CASCADE), appends the ledger event, runs `afterDelete`.
   * Works on a live row and on a trashed one.
   * R2 media deletion is NOT performed here — the caller owns it (VSA: no external I/O in the
   * repository beyond the ledger port).
   * @throws EntryNotFoundError if no row with `id` exists.
   */
  purge(seed: Seed, id: string, options?: RepositoryOptions): Promise<PurgeResult>

  /** `restore` applied per id. Never partially fails the batch: each id reports its own outcome. */
  bulkRestore(seed: Seed, ids: string[], options?: RepositoryOptions): Promise<BulkDeleteResult>

  /**
   * `purge` applied per id. Returns the purged rows so the caller can collect R2 media keys.
   */
  bulkPurge(seed: Seed, ids: string[], options?: RepositoryOptions): Promise<
    BulkDeleteResult & { rows: Record<string, any>[] }
  >

  /**
   * Pure query, no side effects: ids of trashed entries whose retention window has elapsed
   * (`deleted_at + seed.retentionDays * 86400 <= now`).
   * Returns [] when the seed has no `retentionDays` or no `softDelete`.
   * Deliberately NOT wired to any scheduler — the recurring-automation adapter is future work
   * (feature brief §2). `now` is supplied by the caller's `IClock`; never read the clock here.
   */
  findExpiredByRetention(seed: Seed, now: number, limit: number): Promise<string[]>
```

Import `TrashedMode` from `../engine/types.js` at the top of the file.

### T8 — `apps/api/src/shared/storage/deletion-ledger.ts` (NEW)

R2 has no append primitive, so "append-only" is realized as **one immutable object per event**
under a reserved prefix. That is strictly stronger than a mutable JSONL blob: no event can
overwrite another, and `list()` is a native R2 prefix listing.

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { BeechBucket, DeletionLedgerEvent, IDeletionLedger } from '@beechcms/core'

/** Reserved key space. Leading underscore keeps it out of any media listing. */
const LEDGER_PREFIX = '_deletion-ledger'

function eventKey(event: DeletionLedgerEvent): string {
  return `${LEDGER_PREFIX}/${event.seedSlug}/${event.entryId}.json`
}

/**
 * R2-backed erasure log. One object per erasure, written with `put` and never mutated.
 * Survives a D1 Time Travel restore, which is the entire point of the design
 * (feature brief §2: the ledger must not live in D1).
 */
export class R2DeletionLedger implements IDeletionLedger {
  constructor(private readonly bucket: BeechBucket) {}

  async append(event: DeletionLedgerEvent): Promise<void> {
    const body = new TextEncoder().encode(JSON.stringify(event))
    // No catch: a purge that reports success without a durable ledger entry is precisely the
    // failure this feature exists to prevent. The caller surfaces the error to the operator.
    await this.bucket.put(eventKey(event), body, { contentType: 'application/json' })
  }

  async list(
    seedSlug: string,
    options?: { limit?: number; cursor?: string },
  ): Promise<{ events: DeletionLedgerEvent[]; nextCursor?: string }> {
    const listing = await this.bucket.list({
      prefix: `${LEDGER_PREFIX}/${seedSlug}/`,
      limit: options?.limit ?? 100,
      cursor: options?.cursor,
    })

    const events: DeletionLedgerEvent[] = []
    for (const object of listing.objects) {
      const stored = await this.bucket.get(object.key)
      if (!stored) continue
      const text = stored.body instanceof ArrayBuffer
        ? new TextDecoder().decode(stored.body)
        : await new Response(stored.body).text()
      events.push(JSON.parse(text) as DeletionLedgerEvent)
    }

    return { events, ...(listing.cursor ? { nextCursor: listing.cursor } : {}) }
  }
}
```

`BeechBucket.put/get/list` signatures are in `packages/core/src/common/storage.ts:25-32` — do
not widen them.

### T9 — `apps/api/src/middleware/repository.middleware.ts` and `src/types.ts`

`D1ContentRepository`'s constructor gains an optional `deletionLedger` (keep it optional so the
existing test suites listed by `graphify affected` construct it unchanged). In the middleware,
build it from the bucket and set it on the context:

```ts
  const deletionLedger = new R2DeletionLedger(context.get('bucket'))
  context.set('deletionLedger', deletionLedger)
```

**Ordering constraint:** `storageMiddleware` currently runs at `factory.ts:146`, AFTER
`repositoryMiddleware` at `:129`. Do **not** reorder them — reordering changes the wiring for
every other consumer of `repository`. Instead construct the ledger lazily inside
`repositoryMiddleware` using the same `createBucketProvider(context.env, baseUrl)` call
`storage.middleware.ts:21` makes, or move ledger construction into `storageMiddleware` and have
the repository read it from context at call time. Pick the lazy-construction option: it keeps
the registration order in `factory.ts` byte-identical.

Add to `Variables` in `apps/api/src/types.ts`:

```ts
  /** Append-only GDPR erasure log, stored outside D1 so a restore cannot rewind it. */
  deletionLedger: IDeletionLedger
```

### T10 — `apps/api/src/shared/db/repositories/content.repository.d1.ts`

**T10.1 — read guards.** Every raw-SQL read must exclude trashed rows for a soft-delete seed.
Add this private helper next to `getTableName`:

```ts
  /** ` AND deleted_at IS NULL` for a soft-delete seed, `''` otherwise. */
  private activeClause(seed: Seed, mode: TrashedMode = 'active'): string {
    if (!seed.softDelete || mode === 'any') return ''
    return mode === 'trashed' ? ' AND deleted_at IS NOT NULL' : ' AND deleted_at IS NULL'
  }
```

Apply it:

| Method | Line | Change |
|---|---|---|
| `findById` | :348 | `WHERE id = ?${this.activeClause(seed, options?.trashed)} LIMIT 1` |
| `findBySlug` | :374 | `WHERE slug = ?${this.activeClause(seed)} LIMIT 1` |
| `existsSlug` | :467 | `WHERE slug = ?${this.activeClause(seed)}` |
| `getFacets` | :436 | `SELECT status, COUNT(*) as count FROM ${t} WHERE 1=1${this.activeClause(seed)} GROUP BY status` — and the `json_each` tag query gets the same `WHERE`-prefixed guard, replacing `WHERE value IS NOT NULL` with `WHERE value IS NOT NULL${this.activeClause(seed)}` |
| `bulkUpdate` | :1391 | append the guard to the per-id `UPDATE … WHERE id = ?` so a bulk edit can never resurrect or mutate a trashed row |

`findParentIdsByRelation` (:396) reads the junction table, which carries no `deleted_at`.
Join to the parent instead:

```ts
      const parentTable = this.getTableName(seed.slug)
      const { results } = await this.database
        .prepare(
          `SELECT DISTINCT j.parent_id FROM ${table} j ` +
          (seed.softDelete ? `INNER JOIN ${parentTable} p ON p.id = j.parent_id ` : '') +
          `WHERE j.target_id IN (${placeholders})` +
          (seed.softDelete ? ` AND p.deleted_at IS NULL` : '') +
          ` LIMIT ?`,
        )
        .bind(...targetIds, limit)
        .all<{ parent_id: string }>()
```

Without this, a Public API relation subquery would return a trashed parent's id and the
caller would fetch it by id — the exact leak the brief forbids.

**T10.2 — `softDelete`.** Mirrors `delete` (:950) including hook symmetry:

```ts
  async softDelete(seed: Seed, id: string, options?: RepositoryOptions): Promise<{ row: Record<string, any> }> {
    if (!seed.softDelete) {
      throw new RepositoryError(`softDelete(${seed.slug}): seed has no softDelete enabled`)
    }

    if (this.hooks?.beforeDelete) {
      await this.hooks.beforeDelete(id, this.hookCtx(seed, options?.actor))
    }

    let row: Record<string, any>
    try {
      const tableName = this.getTableName(seed.slug)

      const entryRow = await this.database
        .prepare(`SELECT * FROM ${tableName} WHERE id = ? AND deleted_at IS NULL`)
        .bind(id)
        .first()

      if (!entryRow) throw new EntryNotFoundError(`Entry ${id} not found in ${seed.slug}`)

      await this.database
        .prepare(`UPDATE ${tableName} SET deleted_at = (unixepoch()) WHERE id = ? AND deleted_at IS NULL`)
        .bind(id)
        .run()

      row = await this.rowToData(seed, entryRow)
    } catch (error) {
      if (error instanceof EntryNotFoundError) throw error
      throw this.mapError(error, `softDelete(${seed.slug}, ${id})`)
    }

    // afterDelete runs after the commit: it cannot roll the write back, same as delete().
    if (this.hooks?.afterDelete) {
      await this.hooks.afterDelete(id, this.hookCtx(seed, options?.actor))
    }

    return { row }
  }
```

`deleted_at` is set by SQLite's `unixepoch()`, consistent with `created_at`/`updated_at`
(`ddl.ts:187-188`) — not from JS, so no `IClock` dependency enters the repository.

**T10.3 — `restore`** with the auto-rename-in-catch the brief mandates:

```ts
  async restore(seed: Seed, id: string, options?: RepositoryOptions): Promise<{ row: Record<string, any> }> {
    if (!seed.softDelete) {
      throw new RepositoryError(`restore(${seed.slug}): seed has no softDelete enabled`)
    }

    const tableName = this.getTableName(seed.slug)
    const entryRow = await this.database
      .prepare(`SELECT * FROM ${tableName} WHERE id = ? AND deleted_at IS NOT NULL`)
      .bind(id)
      .first()

    if (!entryRow) throw new EntryNotFoundError(`Trashed entry ${id} not found in ${seed.slug}`)

    try {
      await this.database
        .prepare(`UPDATE ${tableName} SET deleted_at = NULL, updated_at = (unixepoch()) WHERE id = ?`)
        .bind(id)
        .run()
    } catch (error) {
      // The slug was reassigned to a live entry while this one sat in the Trash. The slug is a
      // system detail, not a decision to hand back to the user (feature brief §5): rename and
      // continue rather than answering 409.
      const conflict = this.mapError(error, `restore(${seed.slug}, ${id})`)
      if (!(conflict instanceof SlugConflictError)) throw conflict

      const renamed = `${entryRow.slug as string}-restored-${id.slice(0, 8)}`
      await this.database
        .prepare(`UPDATE ${tableName} SET deleted_at = NULL, slug = ?, updated_at = (unixepoch()) WHERE id = ?`)
        .bind(renamed, id)
        .run()
      entryRow.slug = renamed
    }

    entryRow.deleted_at = null
    return { row: await this.rowToData(seed, entryRow) }
  }
```

The rename suffix uses the entry id, not a timestamp: it is deterministic, so a retried restore
produces the same slug instead of a second orphan. `mapError` already recognises
`UNIQUE constraint failed … slug` (`base.repository.d1.ts:28`).

**T10.4 — `purge`:**

```ts
  async purge(seed: Seed, id: string, options?: RepositoryOptions): Promise<PurgeResult> {
    if (this.hooks?.beforeDelete) {
      await this.hooks.beforeDelete(id, this.hookCtx(seed, options?.actor))
    }

    let row: Record<string, any>
    try {
      const tableName = this.getTableName(seed.slug)

      // No deleted_at guard: a purge is valid on a live row (seed without softDelete, or an
      // explicit ?purge=true) and on a trashed one.
      const entryRow = await this.database
        .prepare(`SELECT * FROM ${tableName} WHERE id = ?`)
        .bind(id)
        .first()

      if (!entryRow) throw new EntryNotFoundError(`Entry ${id} not found in ${seed.slug}`)

      // Junction rows and the _drafts row follow via ON DELETE CASCADE (ddl.ts:210,449).
      await this.database.prepare(`DELETE FROM ${tableName} WHERE id = ?`).bind(id).run()

      row = await this.rowToData(seed, entryRow)
    } catch (error) {
      if (error instanceof EntryNotFoundError) throw error
      throw this.mapError(error, `purge(${seed.slug}, ${id})`)
    }

    // The ledger write is awaited and NOT swallowed: an erasure a restore could undo is worse
    // than a failed request, because nothing downstream would ever notice.
    let ledgerWritten = false
    if (this.deletionLedger) {
      await this.deletionLedger.append({
        seedSlug: seed.slug,
        entryId: id,
        entrySlug: (row.slug as string) ?? null,
        purgedAt: Math.floor(Date.now() / 1000),
        actorId: options?.actor?.id ?? null,
        reason: 'purge',
      })
      ledgerWritten = true
    }

    if (this.hooks?.afterDelete) {
      await this.hooks.afterDelete(id, this.hookCtx(seed, options?.actor))
    }

    return { row, ledgerWritten }
  }
```

> `purgedAt` is the one timestamp that cannot come from SQLite (the row is already gone when it
> is written). Take it from the injected `IClock` if the repository already receives one; if it
> does not, take `Math.floor(Date.now() / 1000)` as written above and keep it out of every test
> assertion — assert `purgedAt` is a positive integer, never a literal.

**T10.5 — `bulkRestore` / `bulkPurge`:** loop over ids calling `restore` / `purge` so hooks and
the ledger run per entry (feature brief §2: no deletion path is hook-exempt). Collect per-id
outcomes; never let one failure abort the batch:

```ts
  async bulkPurge(seed: Seed, ids: string[], options?: RepositoryOptions) {
    const succeeded: string[] = []
    const failed: Array<{ id: string; reason: string }> = []
    const rows: Record<string, any>[] = []

    for (const id of ids) {
      try {
        const { row } = await this.purge(seed, id, options)
        succeeded.push(id)
        rows.push(row)
      } catch (error) {
        failed.push({ id, reason: error instanceof EntryNotFoundError ? 'not-found' : String((error as Error).message) })
      }
    }

    return { succeeded, failed, rows }
  }
```

`bulkRestore` is the same shape without `rows`.

**T10.6 — `findExpiredByRetention`:**

```ts
  async findExpiredByRetention(seed: Seed, now: number, limit: number): Promise<string[]> {
    if (!seed.softDelete || !seed.retentionDays) return []

    const tableName = this.getTableName(seed.slug)
    const cutoff = now - seed.retentionDays * 86400
    const { results } = await this.database
      .prepare(
        `SELECT id FROM ${tableName} WHERE deleted_at IS NOT NULL AND deleted_at <= ? ORDER BY deleted_at ASC LIMIT ?`,
      )
      .bind(cutoff, limit)
      .all<{ id: string }>()

    return (results ?? []).map(r => r.id)
  }
```

Pure read. No purge is triggered from here — the adapter that will call it is future work.

### T11 — `apps/api/src/features/content/handlers/delete.ts`

Keep the file's existing structure; branch on the seed flag and the `purge` query parameter,
and keep R2 cleanup in the handler:

```ts
  const forcePurge = context.req.query('purge') === 'true'
  const useSoftDelete = seed.softDelete === true && !forcePurge

  const { row } = useSoftDelete
    ? await repository.softDelete(seed, entryId, { actor })
    : await repository.purge(seed, entryId, { actor })

  const title = row.title || row.name || entryId
  logContentActivity(context, 'delete', entryId, schemaSlug, String(title))
  dispatchContentAutomation(context, schemaSlug, 'delete', { ...row, id: entryId })

  // R2 lives outside the row's lifecycle: a trashed entry must stay restorable WITH its media
  // (feature brief §4). Only an irreversible purge touches the bucket.
  if (!useSoftDelete) {
    const cdnUrl = context.env.MEDIA_CDN_URL
    const r2ObjectKeys = extractMediaKeysFromData(seed, row, cdnUrl)
    if (r2ObjectKeys.length > 0) {
      await deleteR2Objects(context, r2ObjectKeys).catch((error) => {
        if (context.env.ENV !== 'production') {
          console.warn('R2 cleanup on purge failed (orphaned files):', error)
        }
      })
    }
  }

  return context.json({ success: true, softDeleted: useSoftDelete })
```

For a seed **without** `softDelete`, `purge` reproduces today's behaviour byte-for-byte plus a
ledger entry — no existing consumer changes.

### T12 — `apps/api/src/features/content/handlers/trash.ts` (NEW)

Five thin orchestrators, following `delete.ts` and `bulk.handler.ts` verbatim in shape:
`publicProblem` for every error, `context.get('getSeed')` for resolution,
`handleContentDatabaseError` in the catch, `MAX_BULK_SIZE = 500` reused for the bulk bodies.

```ts
export async function trashListHandler(context: Context<AppEnv>)       // GET  /:slug/trash
export async function restoreHandler(context: Context<AppEnv>)         // POST /:slug/:id/restore
export async function bulkRestoreHandler(context: Context<AppEnv>)     // POST /:slug/trash/bulk-restore
export async function bulkPurgeHandler(context: Context<AppEnv>)       // POST /:slug/trash/bulk-purge
export async function reconcilePurgesHandler(context: Context<AppEnv>) // POST /:slug/trash/reconcile
```

Contract details the downstream agent must not improvise:

- **All five** answer `409` with `type: 'content-soft-delete-disabled'` when
  `seed.softDelete !== true`. Add `SOFT_DELETE_DISABLED` to `features/content/constants.ts`.
- `trashListHandler` calls
  `repository.findMany(seed, { trashed: 'trashed', pagination, orderBy: { column: 'deleted_at', dir: 'DESC' } })`
  and answers `{ items, total, page, limit }`. It reuses `parsePositiveInt` from
  `shared/utils/query-utils` and the same `limit` cap of 100 as `list.ts:128`.
- `restoreHandler` → `repository.restore(...)`, answers `{ success: true, slug: row.slug }` so the
  client learns about an auto-rename. Logs `logContentActivity(context, 'update', …)` — the
  activity vocabulary is `'create' | 'update' | 'delete'` (`helpers.ts:30`); do **not** widen it.
- `bulkPurgeHandler` collects R2 keys from every returned row via `extractMediaKeysFromData` and
  issues **one** `deleteR2Objects(context, allKeys)` call after the loop, with the same
  `.catch` swallow as `delete.ts:54`.
- `reconcilePurgesHandler` is the post-restore guarantee:

```ts
  const ledger = context.get('deletionLedger')
  const { events, nextCursor } = await ledger.list(schemaSlug, { limit, cursor })

  const repurged: string[] = []
  for (const event of events) {
    try {
      // The external log is the ONLY source of truth: a row present here was erased, so its
      // presence in D1 means a restore resurrected it. Re-erase, do not reconcile the other way.
      await repository.purge(seed, event.entryId, { actor })
      repurged.push(event.entryId)
    } catch (error) {
      // Already absent — the expected case on a database that was never restored.
      if (!(error instanceof EntryNotFoundError)) throw error
    }
  }

  return context.json({ scanned: events.length, repurged, nextCursor })
```

### T13 — `apps/api/src/features/content/index.ts`

Insert the routes, respecting Hono's first-match-wins order. `/:slug/trash` **must** precede
`/:slug/:id`, exactly as `by-slug` and `facets` already do:

```ts
content.patch('/:slug/:id/kanban-move', kanbanMoveHandler)
content.patch('/:slug/:id/kanban-position', kanbanPositionHandler)
content.get('/:slug/view-config', getViewConfigHandler)
content.put('/:slug/view-config', putViewConfigHandler)
content.get('/:slug/trash', trashListHandler)                       // NEW — before /:slug/:id
content.post('/:slug/trash/bulk-restore', bulkRestoreHandler)       // NEW
content.post('/:slug/trash/bulk-purge', bulkPurgeHandler)           // NEW
content.post('/:slug/trash/reconcile', reconcilePurgesHandler)      // NEW
content.get('/:slug', listHandler)
content.get('/:slug/facets', facetsHandler)
content.get('/:schema_slug/by-slug/:entry_slug', getBySlugHandler)
content.post('/:slug/:id/restore', restoreHandler)                  // NEW — before POST /:slug
content.get('/:slug/:id', getByIdHandler)
content.post('/:slug', createHandler)
content.patch('/:slug/bulk', bulkHandler)
content.put('/:slug/:id', updateHandler)
content.delete('/:slug/:id', deleteHandler)
```

### T14 — `apps/api/src/middleware/permission.middleware.ts`

Insert into the per-seed block (after the `PATCH …/bulk` rule at line 118, before the
`GET …/([^/]+)/[^/]+$` rule at line 127). Order is load-bearing: the file's own comment at
line 62 says first match wins.

```ts
  { method: 'GET',    pattern: /^\/api\/content\/([^/]+)\/trash$/,                 requirement: perm('content:read',   'capture1') },
  { method: 'POST',   pattern: /^\/api\/content\/([^/]+)\/trash\/bulk-restore$/,   requirement: perm('content:update', 'capture1') },
  { method: 'POST',   pattern: /^\/api\/content\/([^/]+)\/trash\/bulk-purge$/,     requirement: perm('content:delete', 'capture1') },
  { method: 'POST',   pattern: /^\/api\/content\/([^/]+)\/trash\/reconcile$/,      requirement: perm('content:delete', 'capture1') },
  { method: 'POST',   pattern: /^\/api\/content\/([^/]+)\/[^/]+\/restore$/,        requirement: perm('content:update', 'capture1') },
```

Rationale for the verb split: restoring is an edit (`content:update`); purging and reconciling
destroy data irreversibly (`content:delete`). A path with no rule fails closed with
`403 route_not_registered`, so a missing rule is a broken route, not an open one.

### T15 — `packages/cli`

`src/lib/manifest-compare.ts:38`:

```ts
const SEED_FLAGS = ['allowDrafts', 'allowPublicRead', 'allowPublicPost', 'allowPublicEdit', 'softDelete'] as const
```

`src/lib/migration-writer.ts`, inside the `missing` loop (line 72) — `deleted_at` is a system
column and `seed.branches.find(...)` will never match it:

```ts
      for (const col of missing) {
        if (col.name === 'deleted_at') {
          for (const stmt of generateEnableSoftDelete(seed)) { lines.push(stmt); additiveCount++ }
          continue
        }
        const branch = seed.branches.find(b => b.alias === col.name)
        if (branch) { lines.push(generateAddColumn(seed, branch)); additiveCount++ }
      }
```

Import `generateEnableSoftDelete` from `@beechcms/core` alongside `generateAddColumn`.

### T16 — Tests

Binding rules: `_config/testing_conventions.md`. Tier, placement and fixtures are not
negotiable.

**Unit — `packages/core/src/engine/`** (extend the existing suites; do not create new files):
- `ddl.test.ts` — `generateCreateTable` emits `deleted_at INTEGER` and drops the inline `UNIQUE`
  for `softDelete: true`; emits **today's exact DDL** for `softDelete: false`;
  `generateIndexes` emits the partial unique index; `getExpectedColumns` omits `deleted_at` for a
  non-soft-delete seed.
- `query.test.ts` — `buildSelectQuery` appends `deleted_at IS NULL` by default,
  `IS NOT NULL` for `'trashed'`, nothing for `'any'`, and **nothing at all** for a seed without
  `softDelete` (this last one is the regression guard for the whole existing suite).
- `seed-ddl.test.ts` — `planExtendSeed` emits the enable statements once when the column is
  absent and not at all when `existingColumns` already has it.

**Unit — `apps/api/src/shared/storage/deletion-ledger.test.ts`** (NEW): `describe('R2DeletionLedger', …)`,
a hand-written `BeechBucket` stub (legitimate — it is the I/O boundary this unit mocks, Rule 3.10),
asserting the key shape `_deletion-ledger/{seed}/{id}.json` and that `append` rejects when `put`
rejects. No fake timers — if a clock is needed, inject `FixedClock` from `@beechcms/testing`
(Rule 3.11).

**Integration — `apps/api/src/features/content/test/integration/soft-delete.integration.test.ts`**
(NEW). `describe('content slice — soft delete integration (real D1)')`, harness built exactly as
in `_config/testing_conventions.md` §9.1 (`__resetSeedRegistryCache()`, `createTestHarness({ db: env.DB, … })`,
`harness.asUser('admin')`). One act per test, status asserted first, body typed, and — Rule 5.5 —
every write asserts persisted state by reading `deleted_at` back out of D1:

- `DELETE` on a soft-delete seed leaves the row in place with `deleted_at` set and the entry
  absent from `GET /api/content/:slug`.
- `DELETE` on a seed without `softDelete` still removes the row (the no-regression guard).
- `POST /:slug/:id/restore` clears `deleted_at` and the entry reappears in the list.
- restoring an entry whose slug was reassigned succeeds under a renamed slug (assert the
  returned `slug`, assert both rows exist, assert neither is trashed).
- `DELETE …?purge=true` removes the row AND its junction rows AND its `_drafts` row.
- `beforeDelete`/`afterDelete` fire on soft delete, on purge, and on bulk purge — same
  assertion shape as `apps/api/test/hooks-lifecycle.test.ts`.
- `bulk-restore` / `bulk-purge` report per-id outcomes and leave untouched ids untouched.
- `GET /:slug/trash` returns only trashed rows, newest-first.
- `POST /:slug/trash/reconcile` re-purges a row that exists in D1 but is present in the ledger.

**Integration — `apps/api/src/public/test/integration/public-trash-isolation.integration.test.ts`**
(NEW), alongside the two existing public integration suites:

- `GET /api/v1/public/:seed` omits a trashed entry.
- `GET /api/v1/public/:seed/:idOrSlug` answers 404 for a trashed entry.
- `?include=<relation>` resolves a trashed target to `null` while the raw FK value stays on the
  parent (feature brief §4) — the multi-relation case asserts the trashed target is simply absent
  from the expanded array.
- a relation subquery never matches through a trashed parent (the `findParentIdsByRelation` join
  guard from T10.1 is what this test exists to protect — say so in a Rule 6.2(4) comment).

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run in this order from the repository root. Every command must pass before the PR opens.

```bash
# 1. Core builds and its contracts typecheck
pnpm --filter @beechcms/core run build

# 2. Full workspace typecheck (core → api → cli consumers of the changed signatures)
pnpm --filter @beechcms/core exec npx tsc --noEmit
pnpm --filter @beechcms/api  exec npx tsc --noEmit
pnpm --filter @beechcms/cli  exec npx tsc --noEmit

# 3. Lint (note the TS 7.0 noopParser workaround in eslint.config.js — expected, not a failure)
pnpm beech lint

# 4. Rebuild local D1 from scratch so the new DDL is exercised end to end, not just patched
pnpm beech db:reset
pnpm beech db:migrate

# 5. Unit + integration suites
pnpm beech test --diff          # fast loop while working
pnpm beech test                 # full suite before the PR — REQUIRED

# 6. Schema tooling must agree with the new expectation on a seed that opted in
pnpm beech schema:diff          # expect: no drift after db:migrate
pnpm beech types check          # the CI drift guard added in #425 must stay green
```

Manual smoke check against `pnpm beech dev`, for a seed with `softDelete: true`:

```bash
curl -X DELETE "$API/api/content/orders/$ID" -H "Authorization: Bearer $TOKEN"     # {"success":true,"softDeleted":true}
curl       "$API/api/content/orders" -H "Authorization: Bearer $TOKEN"             # entry ABSENT
curl       "$API/api/content/orders/trash" -H "Authorization: Bearer $TOKEN"       # entry PRESENT
curl "$API/api/v1/public/orders" -H "X-API-Key: $KEY"                              # entry ABSENT
curl -X POST "$API/api/content/orders/$ID/restore" -H "Authorization: Bearer $TOKEN"
curl -X DELETE "$API/api/content/orders/$ID?purge=true" -H "Authorization: Bearer $TOKEN"
npx wrangler r2 object get "$BUCKET/_deletion-ledger/orders/$ID.json"              # ledger event PRESENT
```

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

**Engine / contracts**
- [ ] `Seed.softDelete?: boolean` and `SelectOptions.trashed?: TrashedMode` are **optional**; no
      existing `Seed` or `SelectOptions` literal in the repo needs editing to compile.
- [ ] For a seed with `softDelete !== true`, `generateCreateTable`, `generateIndexes`,
      `getExpectedColumns` and `buildSelectQuery` produce **byte-identical** output to `master`.
      A unit test asserts this explicitly.
- [ ] `buildSelectQuery` defaults to `'active'`: omitting `trashed` can never return a trashed row.
- [ ] `deleted_at` is in `SYSTEM_COLUMNS`, so no branch alias can collide with it
      (seed-validation Fatal 12 covers it for `displayNameAlias` automatically).
- [ ] `@beechcms/core` still has **zero** runtime dependencies: `IDeletionLedger` is an interface,
      its R2 implementation lives in `apps/api`. No `BeechBucket` import in `content/deletion-ledger.ts`.
- [ ] `packages/core` builds with `tsc` under `strict`; no `any` in a new signature.

**Repository**
- [ ] `softDelete`, `restore`, `purge`, `bulkRestore`, `bulkPurge` all run
      `beforeDelete`/`afterDelete` — no deletion path is hook-exempt. Proven by an integration test
      per path.
- [ ] `D1ContentRepository` contains **no** reference to `deleteR2Objects` or to any R2 media API.
      `graphify path "D1ContentRepository" "deleteR2Objects"` still finds no directed path.
- [ ] `findById`, `findBySlug`, `existsSlug`, `getFacets`, `bulkUpdate` and
      `findParentIdsByRelation` exclude trashed rows for a soft-delete seed.
- [ ] `purge` awaits the ledger append and lets a failure propagate — it is never swallowed.
- [ ] `findExpiredByRetention` performs no write and starts no job.

**HTTP**
- [ ] Soft delete leaves R2 media untouched; only purge calls `deleteR2Objects`, and only from a
      handler.
- [ ] `/:slug/trash` is registered before `/:slug/:id` in `features/content/index.ts`, and the five
      new permission rules precede the generic `/:slug/:id` patterns.
- [ ] Every new route has a permission rule: no new path answers `403 route_not_registered`.
- [ ] `DELETE /api/content/:slug/:id` on a seed **without** `softDelete` behaves exactly as before
      (row gone, R2 cleaned), with a ledger event added.
- [ ] The Public API cannot observe a trashed record: not in a list, not by id or slug, not via
      `?include=`, not via a relation subquery. Four integration assertions, one per path.

**Tooling**
- [ ] `pnpm beech schema:diff` reports no drift after `db:migrate` for both a soft-delete seed and
      a plain one.
- [ ] `beech schema plan/apply` adds `deleted_at` to an existing table when a seed flips
      `softDelete: true`, with no content reset.
- [ ] `pnpm beech types check` stays green.

**Tests**
- [ ] Every new test file declares exactly one tier and sits in the matching location
      (`_config/testing_conventions.md` §0, §1.1); SPDX header byte-identical.
- [ ] Integration tests use `createTestHarness` with real D1 and real repositories; only `IClock`
      and `ITokenService` are faked (Rule 0.3). No fake repository in the integration tier.
- [ ] Fixtures come from `@beechcms/testing`; entry ids match `UUID_V4_PATTERN`, never a literal.
- [ ] Every write asserts persisted state; every rejection asserts nothing changed (Rules 5.5, 5.6).
- [ ] No `any`, no `vi.useFakeTimers()`, no sleep, no `it.only`/`it.skip`, no snapshot of an API
      response (§7).

**Build**
- [ ] `pnpm beech test` passes in full, including the six suites `graphify affected` flagged as
      importing `D1ContentRepository`, unmodified where possible.
- [ ] `pnpm beech lint` clean.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executing agent MUST NOT build or modify:

1. **Anything under `apps/dashboard/`.** No Trash view, no multi-select, no dialog copy, no query
   keys. → ROADMAP Sprint 2 (`SoftDeleteDashboardTrash`). This sprint's only obligation to the UI
   is a stable HTTP contract.
2. **Any cron, scheduler, queue consumer or automation that calls `findExpiredByRetention`.** The
   method ships as a pure query with no caller. Wiring it is the future recurring-automations
   initiative. → ROADMAP "Deferred", feature brief §5.
3. **Any SQLite table rebuild** to remove the inline `slug … UNIQUE` from a pre-existing table.
   On such a table a trashed slug stays reserved and a reuse attempt answers `409`. Documented,
   not silently worked around. → ROADMAP "Deferred — Legacy table slug rebuild".
4. **Any `deletion_ledger` table in D1**, or any mirroring of the R2 ledger into D1. The external
   store is the sole source of truth; feature brief §5 already rejected the local table.
5. **MCP content-manipulation tools** (`beech_content_delete`, `beech_content_restore`, …). MCP
   inherits `softDelete` on `Seed` for free through `@beechcms/core` and gets nothing else.
   → ROADMAP "Deferred", feature brief §5.
6. **`schema-fingerprint.ts` / `X-Schema-Revision`.** `softDelete` does not change a public
   response shape; adding it to the contract hash would invalidate every client cache for nothing.
7. **Cascading soft delete across relation graphs.** Trashing a parent does not trash its children.
   Only the explicit FK rules already in `generateJunctionTable` / `buildForeignKeyClause` apply.
   Feature brief §5 rejected undeclared polymorphic cascading.
8. **Soft delete for Seed definitions, `_drafts` rows as independent entities, or any system
   table.** The Trash applies to `content_*` instances only (feature brief §5).
9. **A `409` response on a slug conflict during restore.** The brief mandates auto-rename in
   `catch`; do not add a confirmation round-trip or an interactive resolution.
10. **Reordering `factory.ts` middleware registration.** Construct the ledger lazily inside
    `repositoryMiddleware` instead (T9). Changing that order changes wiring for every consumer of
    `repository`.
