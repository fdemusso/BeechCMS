# Sprint: UniversalSoftDelete

Sprint 1 of 3 of **Universal Soft Delete & Trash Retention** (roadmap: `backlog/ROADMAP.md`).
Feature brief: `stages/00_ideation/output/feature_brief.md`.

Today a `DELETE` on an entry is soft only when the seed declares `softDelete: true`. On every other seed it is a
physical `DELETE FROM`, which cannot be undone. This sprint makes soft delete the only ordinary deletion path on every
seed:
- trashing renames the slug to `<slug>_old_<ms>`;
- restore brings back the original slug, auto-renaming when it was taken in the meantime;
- an irreversible purge is possible only on an entry that is already in the Trash;
- `softDelete` becomes a deprecated no-op that no code reads.

Retention enforcement (sprint 2) and the instant-delete / undo-toast UX (sprint 3) are deferred. See SECTION 7.

---

### Pre-Computation Analysis

Graph rebuilt at planning time with `graphify update . --force`: 27 924 nodes, 40 367 edges, 2 733 communities.

**a) God nodes on the path of this sprint (degree from `graphify explain`)**

| Node | Degree | Why it matters here |
|------|--------|---------------------|
| `createBeechApp()` (`apps/api/src/factory.ts:L123`) | 150 | Every route and middleware is wired here. This sprint does **not** touch it, and the middleware order stays the same. |
| `D1ContentRepository` (`apps/api/src/shared/db/repositories/content.repository.d1.ts:L124`) | 58 | Owns `softDelete`, `restore`, `purge`, `bulkPurge`, `findExpiredByRetention` and the active-row clause. This is where most of the behaviour change happens. Imported by `repository.middleware.ts`, `index.ts` (cron), `queue-consumer.ts` and 4 test files. |
| `handleContentDatabaseError()` (`features/content/handlers/helpers.ts:L68`) | 15 | Maps `EntryNotFoundError` → 404 and `SlugConflictError` → 409 for every content handler. It is reused unchanged. |
| `buildSelectQuery()` (`packages/core/src/engine/query/query.ts:L126`) | 14 | The single SQL compiler. Its `seed.softDelete` guard (L157) is what makes the active-only read universal. |

**b) Architectural boundaries affected**

- `@beechcms/core`:
  - `engine/ddl/ddl.ts`: `generateCreateTable`, `generateIndexes`, `getExpectedColumns`, `generateEnableSoftDelete`, `isValidColumn`.
  - `engine/ddl/seed-ddl.ts`: `planExtendSeed`.
  - `engine/query/active-clause.ts` and `engine/query/query.ts`.
  - `engine/seeds/seed-validation.ts`: Fatal 16.
  - `engine/seeds/seed-definition-diff.ts`.
  - `engine/types.ts`: `Seed.softDelete` and `TrashedMode` docs.
  - `content/content.repository.ts`: the `ContentRepository` contract.
  - `content/slug-utils.ts`: new trashed-slug helpers.
- `apps/api`:
  - slice `features/content`: `handlers/delete.ts`, `handlers/trash.ts`.
  - shared repositories: `content.repository.d1.ts`, `d1-backref.repository.ts`, `d1-widget.repository.ts`.
  - shared constants `shared/content/constants.ts`.
  - test mock `test/mocks/static-content.repository.ts`.
  - new migration `0038`.

  No other slice is edited. `features/backrefs` and `features/widget` change only through the shared repositories they already consume.
- `apps/dashboard`:
  - `pages/content-list.tsx`, `pages/content-trash.tsx`;
  - `features/content-delete-dialog/use-content-delete-dialog.ts`;
  - `features/content-management/components/ContentTrashView.tsx`;
  - `features/content-management/api/content.api.ts` (doc comment only);
  - locales.
- `packages/cli`: `lib/migration-writer.ts:L75-76` calls `generateEnableSoftDelete` when `deleted_at` is missing. It needs no edit: the guard removed in core makes it emit the column for every seed.

**c) `graphify affected` impact analysis (depth 2)**

```
affected "activeCondition()"
  .getBulkArrayUpdateStmts()  content.repository.d1.ts:L762
  buildFtsQuery()             d1-search.query.ts:L104
  activeClause()              active-clause.ts:L31
  buildSelectQuery()          query.ts:L126
  .processBulkUpdateSingle()  content.repository.d1.ts:L810
  search-utils.ts [re_exports], d1-search.repository.ts (.count L53, .search L31)
  engine.ts [re_exports], .findMany()  content.repository.d1.ts:L327
  tests: active-clause.test.ts, query.test.ts, search-utils.test.ts
affected "generateCreateTable()"
  planCreateSeed() seed-ddl.ts:L27, validateAndApplySeedDef() seeds.helpers.ts:L209,
  buildMigrationSql() cli/lib/migration-writer.ts:L48, provisionSeeds() testing/seeds/provision.ts:L57,
  index.ts [re_exports]; tests: ddl.test.ts, ddl-destructive(.exec).test.ts, seed-ddl.test.ts
affected "generateEnableSoftDelete()"
  planExtendSeed() seed-ddl.ts:L60, buildMigrationSql() migration-writer.ts:L48,
  schemaDiff() cli/commands/schema-diff.ts:L33, validateAndApplySeedDef() seeds.helpers.ts:L209;
  tests: ddl.test.ts, seed-ddl.test.ts, schema-diff.test.ts
affected "planExtendSeed()"
  validateAndApplySeedDef() seeds.helpers.ts:L209, seeds.handler.ts, features/setup/index.ts
affected "deleteHandler()"   → features/content/index.ts, factory.ts
affected "restoreHandler()"  → features/content/index.ts, factory.ts
```

Breaking-change conclusions:
1. Search (`buildFtsQuery`, `D1SearchRepository`) and bulk update pick up the universal predicate through `activeCondition`. They need no edit, only a regression test.
2. Any `content_*` table that has no `deleted_at` column now fails every read with `no such column`. Two sources produce such tables:
   - **migration-created tables:** `0030_test_seeds.sql` (`content_products`, `content_reviews`, `content_tasks`) and `0031_import_jobs_seed.sql` (`content_import_jobs`). Migration `0038` fixes them.
   - **hand-rolled test DDL:** `apps/api/test/flow/flow-relations.test.ts`, `flow-rbac-projections.test.ts`, `flow-backrefs.test.ts` and `apps/api/test/draft-relation.test.ts`. Each gets the column.

   Tables built by the engine (`planCreateSeed`, `provisionSeeds`) gain it automatically.
3. `ContentRepository.delete` has **zero production callers**. A Grep for `.delete(seed` finds only 4 calls, all in `content.repository.d1.test.ts`. Removing it breaks no route.
4. `purge` callers: `deleteHandler` (`?purge=true`), `bulkPurge` and `reconcilePurgesHandler`. Only reconcile still needs to purge a row that may be live, so it gets the explicit `'any'` opt-in.
5. On `flow-relations.test.ts` FK semantics, the RESTRICT test (L219) and the CASCADE / SET NULL tests: the FK action used to fire on a plain `DELETE`. Now it fires on the purge. Those tests move to "soft delete, then `DELETE ?purge=true`". `fkViolationKind` keys on the HTTP method, and that is still `DELETE`, so `409 relation-in-use` is preserved.

---

### VETO Audit

| Check (`_config/ponytail_arch.md`) | Verdict |
|---|---|
| **YAGNI (rule 1)** | Pass. Nothing speculative is added. `ContentRepository.delete`, the 409 `content-soft-delete-disabled`, `CONTENT_ERRORS.SOFT_DELETE_DISABLED`, seed-validation Fatal 16, the `content.trash.disabled` locale key and the Trash empty-state branch are all **removed**. The new core surface is two pure helpers plus one optional option on `purge`. Bulk delete of active entries stays client-side: `useContentListModals.handleConfirmDelete` already loops with `Promise.allSettled`, so no server bulk-delete route is added. |
| **Botanical invariant (rule 2)** | Pass. Every `deleted_at` predicate comes from core's `activeCondition` / `activeClause`, including the new widget-repository filter. All DDL comes from core's `generateCreateTable` / `generateIndexes` / `generateEnableSoftDelete`. The trashed-slug format lives in core `slug-utils.ts`, so API and dashboard use one definition. No D1 statement is added outside a repository. `deleted_at` and `slug` are system columns (`SYSTEM_COLUMNS`, `ddl.ts:L54`), not branch aliases, so the no-hardcoded-field rule holds. Migration `0038` touches only the system column `deleted_at`. |
| **VSA (rule 3)** | Pass. API edits stay in `features/content` plus `shared/*` repositories that every slice already consumes. No `features/X` imports `features/Y`. Dashboard edits stay in `pages/*`, `features/content-delete-dialog` and `features/content-management`, and add no new cross-feature import. `ContentTrashView` imports `fromTrashedSlug` from `@beechcms/core`, not from another feature. |
| **Cloudflare purity (rule 4)** | Pass. No background job, no ORM. The schema change goes through the numbered migration workflow (`_config/database_workflow.md`: `migrations_dir: "migrations"` in `apps/api/wrangler.jsonc:L25`, so no array entry is needed). The brief's "no migration required" means no **data** migration. `0038` is a schema migration, and without it every read of a migration-created table fails. |
| **Minimal blueprint (rule 5)** | Pass. Core contract, then API behaviour, then three dashboard gating removals. The dashboard edits are only the flag reads the brief requires to "behave as `true`". All UX work is deferred to sprint 3. |

No violation found. No plan adjustment needed.

---

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Retention (sprint 2) and the undo toast (sprint 3) both assume that every entry of every seed ends up in the Trash, that the Trash is reachable on every seed, and that `deleted_at` is stamped from `IClock` (the sweep and the tests compare it against `IClock`). None of that is true today: `deleted_at` exists only on opted-in tables, `DELETE` erases everywhere else, and the trash routes answer 409. The contract therefore has to change first, in core where the DDL and the read predicate live. The API behaviour follows. The dashboard only stops reading the flag, so it does not hide the Trash for seeds whose deletions now land there.

VSA: all behaviour stays in the `content` slice and the shared repositories it already owns. Botanical Engine: every SQL predicate and every DDL statement is compiled by `@beechcms/core`. Removing the `seed.softDelete` guards in core is what makes the behaviour universal without any handler reading the flag.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Middleware order** (`factory.ts`):
1. `repositoryMiddleware` (L135). It builds `R2DeletionLedger`, then `new D1ContentRepository(database, hooks, privacyService, undefined, deletionLedger, resolvedClock)` (`repository.middleware.ts:L127-130`).
2. `seedRegistryMiddleware` (L153).
3. `storageMiddleware` (L156).
4. `queueMiddleware` (L160).
5. `authProvidersMiddleware` (L162).
6. `rateLimiterMiddleware` (L163).
7. `observabilityMiddleware` (L164).
8. Inline middlewares (L166, L207, `/api/*` L218).
9. Then `apiProtected`: `authMiddleware` → `oauthScopeMiddleware` → `permissionMiddleware` → routes. `contentFeature` is mounted at `/content` (factory L268).

This sprint changes none of it.

**Context variables used:** `context.get('repository')`, `context.get('getSeed')`, `context.get('jwtPayload')`, `context.get('actor')`, `context.get('deletionLedger')`, `context.env.MEDIA_CDN_URL`.

**Routes and permissions.** Content routes are in `features/content/index.ts:L33-47`. The permission rows (`permission.middleware.ts:L130-143`) are already per-seed, with capture group 1 as the scope:
- `GET /trash` needs `content:read`;
- `bulk-restore` and `/:id/restore` need `content:update`;
- `bulk-purge`, `reconcile` and `DELETE /:id` need `content:delete`.

So a read-only user sees the Trash but cannot restore or purge, and a user with no grant on the seed gets 403. This sprint keeps the table unchanged and adds tests that prove it on a seed with no `softDelete` flag. Field visibility on the Trash already goes through `toEntryEnvelope` (`trash.ts:L81-90`).

**Flag reads that must disappear** (every place that reads `softDelete` from a seed):
- core:
  - `ddl.ts:L109` `isValidColumn`
  - `ddl.ts:L174-176`, `L194-195` `generateCreateTable`
  - `ddl.ts:L331-337` `generateIndexes`
  - `ddl.ts:L476-478` `getExpectedColumns`
  - `ddl.ts:L757` `generateEnableSoftDelete`
  - `seed-ddl.ts:L83`
  - `active-clause.ts:L19`
  - `query.ts:L157`
  - `seed-validation.ts:L356-363` (Fatal 16)
  - `seed-definition-diff.ts:L15` (`SEED_DEFINITION_FLAGS`)
- api:
  - `delete.ts:L45`
  - `trash.ts:L27-36`
  - `content.repository.d1.ts:L443`, `L445`, `L1069-1071`, `L1112-1114`, `L1253`
  - `d1-backref.repository.ts:L13-14`, `L32`, `L55-58`
  - `test/mocks/static-content.repository.ts:L134`, `L218`, `L227`, `L279`
- dashboard:
  - `content-list.tsx:L206`
  - `content-trash.tsx:L40-41`, `L162-168`
  - `use-content-delete-dialog.ts:L30`

Not flag reads, and out of scope: `seeds.handler.ts:L265`, `seed.repository.d1.ts:L79` and `in-memory-seed.repository.ts:L48` are the **seed** lifecycle (`ISeedRepository.softDelete`).

**Existing soft-delete mechanics to keep:**
- `softDelete` (`content.repository.d1.ts:L1068-1105`): hooks, active-row `SELECT`, then `UPDATE … SET deleted_at = (unixepoch())`.
- `restore` (`L1111-1146`): clears `deleted_at`. On `SlugConflictError` it retries with `${slug}-restored-${id.slice(0,8)}`.
- `purge` (`L1159-1210`): the ledger is written **before** the `DELETE`, which makes a ledger failure leave the row intact (#470).
- `bulkPurge` (`L1230-1246`) and `bulkRestore` (`L1213-1227`): per-id loops, no batch-wide failure.
- `deleteHandler` (`delete.ts:L56-68`): R2 cleanup only on the purge path, failure swallowed in production.

**Slug invariant used by the rename.** `slugify` (`packages/core/src/content/slug-utils.ts:L13-23`) maps `_` to `-` and runs on every slug write path: `create.ts:L62`, `update.ts`, `public-add.ts`, `public-edit.ts`, `import-chunk.worker.ts`. No active entry can therefore carry `_`, and `_old_<digits>` can never collide with or be mistaken for a live slug.

**Tables without `deleted_at`:** see Pre-Computation c) point 2.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

**Create**
- `apps/api/migrations/0038_content_deleted_at.sql`

**Edit: `@beechcms/core`**
- `packages/core/src/content/slug-utils.ts`: trashed-slug helpers
- `packages/core/src/content/slug-utils.test.ts`
- `packages/core/src/content/content.repository.ts`: contract
- `packages/core/src/engine/types.ts`: deprecation docs
- `packages/core/src/engine/ddl/ddl.ts`
- `packages/core/src/engine/ddl/ddl.test.ts`
- `packages/core/src/engine/ddl/seed-ddl.ts`
- `packages/core/src/engine/ddl/seed-ddl.test.ts`
- `packages/core/src/engine/query/active-clause.ts`
- `packages/core/src/engine/query/active-clause.test.ts`
- `packages/core/src/engine/query/query.ts`
- `packages/core/src/engine/query/query.test.ts`
- `packages/core/src/engine/seeds/seed-validation.ts`
- `packages/core/src/engine/seeds/seed-definition-diff.ts`
- `packages/core/src/engine/seeds/seed-definition-diff.test.ts`

**Edit: `apps/api`**
- `src/features/content/handlers/delete.ts`
- `src/features/content/handlers/trash.ts`
- `src/shared/content/constants.ts`: remove `SOFT_DELETE_DISABLED`
- `src/shared/db/repositories/content.repository.d1.ts`
- `src/shared/db/repositories/content.repository.d1.test.ts`
- `src/shared/db/repositories/d1-backref.repository.ts`
- `src/shared/db/repositories/d1-backref.repository.test.ts`
- `src/shared/db/repositories/d1-widget.repository.ts`
- `src/shared/db/repositories/d1-widget.repository.test.ts`
- `src/features/search/utils/search-utils.test.ts`
- `src/features/content/test/integration/soft-delete.integration.test.ts`
- `test/mocks/static-content.repository.ts`
- `test/flow/flow-relations.test.ts`
- `test/flow/flow-rbac-projections.test.ts`
- `test/flow/flow-backrefs.test.ts`
- `test/draft-relation.test.ts`

**Edit: `apps/dashboard`**
- `src/pages/content-list.tsx`
- `src/pages/content-trash.tsx`
- `src/features/content-delete-dialog/use-content-delete-dialog.ts`
- `src/features/content-delete-dialog/test/unit/use-content-delete-dialog.test.ts`
- `src/features/content-management/components/ContentTrashView.tsx`
- `src/features/content-management/api/content.api.ts` (JSDoc only)
- `src/locales/en.json`, `src/locales/it.json`

**Edit: docs (hand-written only; `docs/api/**` is typedoc output regenerated by `pnpm docs:generate`, never hand-edited)**
- `docs/features/trash.md`
- `docs/build/schema-modeling.md`
- `docs/build/schema-manifest.md`
- `docs/reference/internal-content.md`
- `docs/reference/error-model.md`
- `docs/reference/public-api.md`
- `docs/reference/architecture.md`
- `docs/resources/architecture.md`
- `docs/manage/content-editor.md`
- `docs/manage/roles-permissions.md`
- `.github/README.md`

Excluded on purpose: retention sweep, the global retention setting, the undo toast, and any new route. See SECTION 7.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### Task 1 — Core: trashed-slug helpers (`packages/core/src/content/slug-utils.ts`)

These helpers live in core because the API writes the format and the dashboard reads it. One definition, no cross-slice copy. Exported through the existing `export * from './content/slug-utils.js'` (`packages/core/src/index.ts:L23`).

Building blocks (verbatim):

```ts
/** Separator between an entry's slug and its deletion timestamp while it sits in the Trash. */
export const TRASHED_SLUG_INFIX = '_old_'

/** `<slug>_old_<deletedAtMs>`, lower-cased. Frees the slug for reuse under any UNIQUE constraint. */
export function toTrashedSlug(slug: string, deletedAtMs: number): string

/** Inverse of toTrashedSlug: strips a trailing `_old_<digits>`; returns the input unchanged when absent. */
export function fromTrashedSlug(slug: string): string
```

Rules:
- `fromTrashedSlug` strips only a **trailing** `_old_` followed by one or more digits, end-anchored. A slug without the suffix is returned unchanged. That case covers entries trashed before this feature, which keep their original slug (brief §4, "Compatibilità dati").
- `toTrashedSlug` never validates. It is pure and gives the same output for the same input.
- `fromTrashedSlug(toTrashedSlug(s, t)) === s.toLowerCase()` for every `s` that `slugify` can produce.

Add one JSDoc line to `slugify` stating the invariant the format relies on: `slugify` never emits `_`.

### Task 2 — Core: universal DDL (`engine/ddl/ddl.ts`, `engine/ddl/seed-ddl.ts`)

The current `softDelete: true` shape becomes the only shape. Existing opted-in tables already have it, so their DDL stays byte-identical. Pre-feature trashed rows keep their original slug, and under the partial index they still never block a new entry.

- `generateCreateTable` (L166): always `slug TEXT NOT NULL` with no inline `UNIQUE`, and always a trailing `deleted_at INTEGER`. Delete the ternary at L174-176 and the conditionals at L194-195. Keep the existing comment about the sqlite_autoindex. It becomes the reason for the only shape.
- `generateIndexes` (L317): always push `idx_{slug}_deleted_at` and `idx_{slug}_slug_active` (`WHERE deleted_at IS NULL`). Remove the `if` at L331.
- `getExpectedColumns` (L449): always include `{ name: 'deleted_at', sqlType: 'INTEGER', notNull: false, isPk: false }`.
- `generateEnableSoftDelete` (L757): remove the guard. It always returns the 3 statements, and the callers decide when to emit them. Rewrite its JSDoc: it now upgrades a table that predates universal soft delete.
- `isValidColumn` (L108): delete the `deleted_at` special case. `deleted_at` is already in `SYSTEM_COLUMNS` (L54), so it becomes a valid filter target on every seed.
- `seed-ddl.ts:L83` `planExtendSeed`: emit `generateEnableSoftDelete(seed)` whenever `!existingColumns.has('deleted_at')`. This is the self-healing path for tables created before this sprint by the engine (`PUT /api/seeds/:slug`, `beech schema apply`). The CLI path (`migration-writer.ts:L75`) heals the same way with no edit.

### Task 3 — Core: universal read predicate (`engine/query/active-clause.ts`, `engine/query/query.ts`, `engine/types.ts`)

- `activeCondition` (`active-clause.ts:L19`): return `null` only for `mode === 'any'`. Update both JSDoc blocks to drop "does not use soft delete".
- `buildSelectQuery` (`query.ts:L157`): remove the `if (seed.softDelete)` wrapper. Keep the comment that explains why `'active'` is the default.
- `types.ts:L262-268`: replace the `softDelete` JSDoc with a `@deprecated` block. It says the flag is ignored, every seed has a Trash, and the field is kept only so existing seed definitions still type-check. Keep it optional `boolean`.
- `types.ts:L336`: delete the "Ignored entirely for seeds without `softDelete: true`" line from the `TrashedMode` JSDoc.
- `types.ts:L274-278` `retentionDays`: leave untouched. Sprint 2 owns it.

### Task 4 — Core: stop reading the flag in validation and diff

- `seed-validation.ts:L356-363`: delete Fatal 16, the `softDelete` type check. The field is never read, so an arbitrary value is harmless.
- `seed-definition-diff.ts`: remove `'softDelete'` from `SEED_DEFINITION_FLAGS` (L15). In `normalizeSeedDefinition` (L38-43), drop the key. Destructure it out next to `layout`, as `softDelete: _deprecated`. Toggling or omitting the no-op flag must never count as a definition change or as manifest drift.

### Task 5 — Core: `ContentRepository` contract (`content/content.repository.ts`)

Building blocks (verbatim):

```ts
/** Options for `purge`. */
export interface PurgeOptions extends RepositoryOptions {
  /**
   * Which rows the purge may erase. Default `'trashed'`: an ordinary purge only ever erases an entry
   * already in the Trash. `'any'` is reserved for ledger reconciliation, which must re-erase a row a
   * database restore resurrected as live.
   */
  trashed?: Exclude<TrashedMode, 'active'>
}

purge(seed: Seed, id: string, options?: PurgeOptions): Promise<PurgeResult>
```

Edits:
- **Remove** `delete(...)` from `ContentRepository`. It is the only hard-delete path and has no production caller (Pre-Computation c) point 3).
- `softDelete` JSDoc (L392-399): drop `@throws RepositoryError if seed.softDelete is not true`. State that it stamps `deleted_at` from the repository's `IClock` and renames the slug with `toTrashedSlug`.
- `restore` JSDoc (L402-409): state that it restores `fromTrashedSlug(slug)` and falls back to `<original>-restored-<id8>` on conflict.
- `purge` JSDoc (L411-420): replace "Works on a live row and on a trashed one" with the `PurgeOptions.trashed` rule. `@throws EntryNotFoundError` when no row matches the mode.
- `PurgeResult.ledgerWritten` (L213): "False only when the repository has no ledger configured".
- `findExpiredByRetention` (L430-438): "Returns [] when the seed has no `retentionDays`" (drop "or no `softDelete`"). The rest is unchanged; sprint 2 rewrites it.

Export `PurgeOptions` from wherever `RepositoryOptions` is exported today.

### Task 6 — API: D1 repository (`shared/db/repositories/content.repository.d1.ts`)

- **Delete** `delete()` (L1022-1062).
- `softDelete` (L1068):
  - Remove the guard at L1069-1071.
  - Read the clock once: `deletedAtMs = this.clock.now()`.
  - Write `deleted_at = Math.floor(deletedAtMs / 1000)` and `slug = toTrashedSlug(entryRow.slug, deletedAtMs)` in **one** `UPDATE … WHERE id = ? AND deleted_at IS NULL`. `deleted_at` stops using SQL `unixepoch()`, so `FixedClock` controls it in tests and the sprint-2 sweep compares like with like.
  - The returned `row` stays the pre-delete row with its original slug, so activity log and automation payloads are unchanged.
  - If the `UPDATE` raises a slug conflict, let it map through `mapError` to `SlugConflictError` → 409. No retry. That can only happen on a legacy inline-UNIQUE table, with two deletions of the same slug in the same millisecond.
- `restore` (L1111):
  - Remove the guard at L1112-1114.
  - The first `UPDATE` sets `slug = fromTrashedSlug(entryRow.slug)` together with `deleted_at = NULL`.
  - The conflict fallback builds the renamed slug from the **stripped** original: `${fromTrashedSlug(slug)}-restored-${id.slice(0, 8)}`.
  - Set `entryRow.slug` to whichever slug landed before `rowToData`.
- `purge` (L1159):
  - Signature becomes `purge(seed, id, options?: PurgeOptions)`.
  - The row `SELECT` (L1170-1173) appends `this.activeClause(seed, options?.trashed ?? 'trashed')`. With `'any'` this appends nothing.
  - Not found means `EntryNotFoundError`, thrown before the ledger is touched.
  - Update the comment at L1168-1169.
  - The ledger-before-delete order and its comment are unchanged.
- `bulkPurge` (L1230): no signature change. It calls `this.purge(seed, id, options)` and inherits the `'trashed'` default, so a live id reports `failed: [{ id, reason: 'not-found' }]`.
- `findParentIdsByRelation` (L440-446): always `INNER JOIN` the parent and filter `p.deleted_at IS NULL`. Build the predicate with `activeCondition(seed, 'active', 'p')` instead of the literal, and drop both ternaries.
- `findExpiredByRetention` (L1253): drop `!seed.softDelete ||`.
- Import `toTrashedSlug`, `fromTrashedSlug`, `PurgeOptions` from `@beechcms/core`.

### Task 7 — API: other repositories

- `d1-backref.repository.ts`:
  - `entryExists` (L11-19): always append the active predicate, including when called with a bare slug string (every table now has `deleted_at`).
  - `findBackrefs` single (L32) and multi (L55-58) paths: always filter. Keep only the joined `COUNT(DISTINCT r.parent_id)` form of `countSql`.
  - Build every predicate with core `activeCondition` / `activeClause` (alias `c` where joined), not with literals.
- `d1-widget.repository.ts`: `aggregate` (L55), `growth` (L72, both current and previous statements), `leaderboard` (L98), `list` (L125, both data and count SQL), `timeseries` (L175) and `distribution` (L209, both branches) gain `activeCondition(seed, 'active')` ANDed into their `WHERE`. Today widgets count trashed rows. Once every seed has a Trash, that would inflate every dashboard number. The predicate has no bindings, so binding order is unchanged.
- `test/mocks/static-content.repository.ts`: mirror the D1 semantics.
  - Remove the `seed.softDelete` guards (L134, L218, L227, L279) and `delete()`.
  - `softDelete` stamps the slug with `toTrashedSlug`, `restore` strips it, `purge` honours `PurgeOptions.trashed` with default `'trashed'`.

### Task 8 — API: handlers

- `handlers/delete.ts`:
  - `forcePurge = query('purge') === 'true'`. Delete `useSoftDelete`.
  - Without purge: `repository.softDelete(...)`.
  - With purge: `repository.purge(seed, entryId, { actor })`, default `'trashed'`, so a live entry answers 404 `content-not-found` through `handleContentDatabaseError` and nothing is erased.
  - The activity log, automation dispatch and R2 cleanup blocks stay exactly as they are. R2 still runs only when `forcePurge`.
  - Response: `{ success: true, softDeleted: !forcePurge }`. The shape is unchanged; the dashboard reads it.
  - Update the comment at L56-57 to "Only a purge from the Trash touches the bucket".
- `handlers/trash.ts`:
  - In `resolveSeedOrProblem`, delete the 409 block (L27-36).
  - In `reconcilePurgesHandler`, the purge call (L187) passes `{ actor, trashed: 'any' }`. Extend the existing comment: a resurrected row may be live, which is why this caller alone opts out of the trashed-only default.
  - `bulkPurgeHandler` and `bulkRestoreHandler` are unchanged.
- `shared/content/constants.ts:L18`: delete `SOFT_DELETE_DISABLED`.

Error table after this sprint (content slice, delete/trash surface):

| Condition | Status | Problem type |
|---|---|---|
| `DELETE /:slug/:id` on an absent or already-trashed id | 404 | `content-not-found` |
| `DELETE /:slug/:id?purge=true` on an id that is not in the Trash | 404 | `content-not-found` |
| `POST /:slug/trash/bulk-purge` with a live id | 200, `failed[]` entry `{ status: 404, type: 'content-not-found' }` | — |
| Purge blocked by an `onDelete: 'restrict'` reference | 409 | `relation-in-use` (unchanged mapping) |
| Any trash route on a seed without the flag | **no longer 409**: behaves as on any seed | — (`content-soft-delete-disabled` removed) |

### Task 9 — Migration `apps/api/migrations/0038_content_deleted_at.sql`

Verbatim:

```sql
-- Universal soft delete: every content_{slug} table carries deleted_at (NULL = live).
-- Only the tables created by earlier migrations need it; engine-built tables get it from
-- generateCreateTable / planExtendSeed. Their inline slug UNIQUE stays: the _old_<ms> slug
-- rename on soft delete frees the slug without a partial index.
ALTER TABLE content_products    ADD COLUMN deleted_at INTEGER;
ALTER TABLE content_reviews     ADD COLUMN deleted_at INTEGER;
ALTER TABLE content_tasks       ADD COLUMN deleted_at INTEGER;
ALTER TABLE content_import_jobs ADD COLUMN deleted_at INTEGER;
CREATE INDEX IF NOT EXISTS idx_products_deleted_at    ON content_products(deleted_at);
CREATE INDEX IF NOT EXISTS idx_reviews_deleted_at     ON content_reviews(deleted_at);
CREATE INDEX IF NOT EXISTS idx_tasks_deleted_at       ON content_tasks(deleted_at);
CREATE INDEX IF NOT EXISTS idx_import_jobs_deleted_at ON content_import_jobs(deleted_at);
```

Before writing it, the executor confirms with a Grep that none of the four tables already has `deleted_at` in `0030` / `0031` (verified at planning time: none does). A local DB where someone ran `beech schema apply` on one of these seeds between the code update and the migration fails with "duplicate column". Per project policy (DB is test-only) the fix is `pnpm beech db:reset`. Note this in the PR.

### Task 10 — Dashboard: stop reading the flag

- `pages/content-list.tsx:L206`: render the Trash button unconditionally. Drop the `seed.softDelete === true &&` wrapper.
- `pages/content-trash.tsx`:
  - Delete `softDeleteEnabled` (L40).
  - Call `useContentTrash(slug, { page, limit: PAGE_SIZE })` without the `enabled` option (L41). Check the hook's options signature in `hooks/use-content-trash.ts`; if `enabled` becomes unused everywhere, remove the parameter.
  - Delete the `!softDeleteEnabled` empty-state branch (L162-168), so `ContentTrashView` always renders.
- `features/content-delete-dialog/use-content-delete-dialog.ts`:
  - `resolvedMode = mode ?? "trash"` (L30).
  - Drop the `seed` parameter from the hook if nothing else reads it. Check `content-delete-dialog.tsx`; it still passes `seed` for labels, so keep the prop on `ContentDeleteDialogProps`.
  - Update the JSDoc at L17: "Defaults to `trash`; `purge` is the Trash's Delete-forever path".
- `features/content-management/components/ContentTrashView.tsx:L74`: the slug column shows `fromTrashedSlug(row.slug)`, imported from `@beechcms/core`. The user sees the slug the entry will get back, not the storage suffix.
- `features/content-management/api/content.api.ts:L124-128`: JSDoc now reads "moves the entry to the Trash; `options.purge` erases an entry that is already in the Trash".
- Locales: delete `content.trash.disabled` from `en.json:L684` and `it.json:L684`. Its only consumer goes away (`content-trash.tsx:L165`).

No new components, no toast, no flow change. A single delete still opens the existing dialog, now always in `trash` mode, until sprint 3.

### Task 11 — Docs

Rules for every file: the flag is **deprecated and ignored**. Every seed has a Trash. `DELETE` always soft-deletes and renames the slug to `<slug>_old_<ms>`. Purge only erases entries already in the Trash. Restore brings back the original slug, auto-renaming to `<slug>-restored-<id8>` when taken. Remove every "opt-in", "byte-identical for seeds without the flag", "irreversible on other seeds", "409 content-soft-delete-disabled" and "SEED_FLAGS drift" statement.

- `docs/features/trash.md`:
  - L8-10 intro, L16, L18 (slug release now via rename plus partial index), L19, L26-49 ("Enabling the Trash on a Seed" becomes a short "Deprecated `softDelete` flag" note).
  - L51-71 provisioning table: always emitted. Legacy-table warning: the rename removes the reserved-slug problem.
  - L77-82 deletion semantics: drop the "Seed without softDelete" row, and the purge row says "from the Trash only".
  - L94-96 and L169-179 dashboard: Trash on every seed, no disabled empty state.
  - L189-197 endpoints: `?purge=true` acts only on trashed entries, and the 409 line is gone.
  - Retention section L155-163: unchanged; sprint 2 owns it.
- `docs/build/schema-modeling.md:L58-59, L189, L192` and `docs/build/schema-manifest.md:L98-99`: the `softDelete` row reads "Deprecated, ignored: every seed has a Trash". `deleted_at` and the indexes are always present.
- `docs/reference/internal-content.md:L61, L361-402, L492, L541`: DELETE semantics table with a single row, `softDeleted` meaning, purge from Trash only, remove the 409 rows.
- `docs/reference/error-model.md:L67`: delete the `content-soft-delete-disabled` row.
- `docs/reference/public-api.md:L34-36`, `docs/reference/architecture.md:L41-49`, `docs/resources/architecture.md:L119`: "every Seed" instead of "Seeds with `softDelete: true`".
- `docs/manage/content-editor.md:L220-245`: delete the "On every other Seed, deleting is immediate and permanent" paragraph (L242). Deleting always moves to the Trash.
- `docs/manage/roles-permissions.md:L24, L55`: `?purge=true` erases an entry from the Trash.
- `.github/README.md:L84`: drop `softDelete: true` from the example seed.

### Task 12 — Tests

Placement and anatomy follow `_config/testing_conventions.md`. Integration tests use `createTestHarness` with real D1 and the existing `MEDIA_BUCKET` env pass-through (copy `soft-delete.integration.test.ts:L70-82`). Time comes from `harness.clock` (`FixedClock`). No `Date.now()`, no fake timers.

**`packages/core/src/content/slug-utils.test.ts`** (unit, inline input):
- `toTrashedSlug` appends `_old_` and the millisecond timestamp to a lower-cased slug.
- `fromTrashedSlug` returns the original slug for a value produced by `toTrashedSlug`.
- `fromTrashedSlug` returns a slug without the suffix unchanged, so pre-feature trashed entries keep theirs.
- `fromTrashedSlug` strips only a trailing suffix of digits: `a_old_x` and `a_old_1-b` are returned unchanged.
- `slugify` never emits an underscore, so no live slug can carry the trashed infix. Table-driven over inputs with `_`, spaces and mixed case.

**`packages/core/src/engine/ddl/ddl.test.ts`**: replace the `describe('softDelete')` cases (L445-495) with a `describe('deleted_at')`:
- `generateCreateTable` emits a nullable `deleted_at` and no inline slug `UNIQUE` for a seed that declares no flag.
- `generateCreateTable` output is identical for `softDelete: true`, `false` and absent (the flag is a no-op).
- `generateIndexes` always emits `idx_{slug}_deleted_at` and the partial unique `idx_{slug}_slug_active`.
- `getExpectedColumns` includes `deleted_at` for every seed.
- `generateEnableSoftDelete` returns the ALTER plus both indexes for a seed with no flag.

**`packages/core/src/engine/ddl/seed-ddl.test.ts`** (`describe('softDelete')`, L225):
- `planExtendSeed` emits the enable statements when introspected columns lack `deleted_at`, with no flag on the seed.
- `planExtendSeed` emits no `ADD COLUMN deleted_at` when the column already exists.

**`packages/core/src/engine/query/active-clause.test.ts`**: replace the "without softDelete" cases (L43, L69):
- `activeCondition` returns `deleted_at IS NULL` for a seed with no flag in default mode.
- `activeCondition` returns `null` only for `'any'`.
- `activeClause` returns `' AND deleted_at IS NULL'` for a seed with no flag.

**`packages/core/src/engine/query/query.test.ts`**: replace L505:
- `buildSelectQuery` appends the active predicate for a seed that declares no flag.
- `trashed: 'trashed'` compiles `deleted_at IS NOT NULL` for a seed with no flag.

**`packages/core/src/engine/seeds/seed-definition-diff.test.ts`**:
- Two definitions that differ only in `softDelete` (`true` vs absent) are reported as unchanged.

**`apps/api/src/shared/db/repositories/content.repository.d1.test.ts`** (unit, existing D1 test double):
- Remove the `delete()` cases (L400, L408, L963, L1322).
- Port the hook case at L963 to `softDelete`: `beforeDelete`/`afterDelete` fire with the actor on soft delete. Skip this if an equivalent case already exists in the file.

**`apps/api/src/shared/db/repositories/d1-backref.repository.test.ts`**: replace the three "softDelete: false" cases (L59, L105, L145):
- `entryExists` appends the active predicate for a seed with no flag and for a bare slug string.
- The single-relation list and count queries filter trashed sources for a seed with no flag.
- The multi-relation queries join the source table and filter trashed sources for a seed with no flag.

**`apps/api/src/shared/db/repositories/d1-widget.repository.test.ts`** (unit, existing mock style):
- `aggregate`, `list` (data and count), `timeseries` and `distribution` each include `deleted_at IS NULL` in their SQL. One matrix `it()` (Rule 1.6) over the methods.

**`apps/api/src/features/search/utils/search-utils.test.ts`**: replace L225:
- The data and count queries include `ce.deleted_at IS NULL` for a seed that declares no flag.

**`apps/api/src/features/content/test/integration/soft-delete.integration.test.ts`** (integration, real D1).

Fixture changes:
- Drop `softDelete: true` from `trashSeed` and `bulkSourceSeed`. Every case now runs on seeds with no flag; this is the regression guard for "the flag is not read".
- Keep `plainSeed`.
- Add a read-only role user and a user with no grant on `trash_orders` through `harness.asUser({ role })`. Use the role names the canonical set provides (copy from `flow-rbac-enforcement.test.ts`).

Cases removed: L103 ("seed without softDelete still removes the row") and L302 (409).

Cases added or rewritten:
- `DELETE` on a seed with no flag answers `softDeleted: true`, keeps the row with `deleted_at` equal to the harness clock's second, and stores the slug as `toTrashedSlug(original, clock ms)`.
- After a soft delete, `POST` with the same slug answers 201.
- Restore puts back the original slug and clears `deleted_at`. Rewrite the L118 case to assert the stored slug.
- Restore of an entry whose original slug was reassigned lands on `<original>-restored-<id8>`, built from the stripped slug, never from the `_old_` form. Rewrite L137 to assert the exact value.
- Restore of a row trashed before this feature (arranged by direct SQL `UPDATE … SET deleted_at = ?` with no slug change) keeps its slug.
- `DELETE ?purge=true` on a live entry answers 404 `content-not-found`. The row is still present and live, and no ledger object exists under `_deletion-ledger/{slug}/{id}.json`.
- `DELETE ?purge=true` on a trashed entry removes the row, its junction rows and its `_drafts` row. Keep the L160 case and add a preceding soft delete in ARRANGE.
- `bulk-purge` with one trashed and one live id: the trashed one is in `succeeded`, and the live one is in `failed` with status 404 and is still present.
- `GET /trash` works on a seed with no flag and lists only trashed rows. The L223 case already covers this once the flag is dropped.
- A read-only user gets 200 on `GET /trash` and 403 on restore, bulk-restore and bulk-purge, and the trashed row stays trashed. Matrix `it()`.
- A user with no grant on the seed gets 403 on `GET /trash`.
- `POST /trash/reconcile` re-purges a ledger-recorded row that is **live** in D1. Keep L278, and make the arranged row live to prove the `'any'` opt-in.
- `GET /api/search` excludes trashed entries on a seed with no flag. The L310 case already covers this once the flag is dropped.

**`apps/api/test/flow/flow-relations.test.ts`** (flow tier, existing D1TestDatabase):
- Every hand-rolled `CREATE TABLE content_*` gains `deleted_at INTEGER`. Add one comment above the first constant: the engine now reads `deleted_at` on every content table.
- The CASCADE, SET NULL and RESTRICT tests (incl. L219) ARRANGE a `DELETE` (soft), then ACT with `DELETE …?purge=true`. Names become "purging a trashed … → …". Assertions are unchanged (`409 relation-in-use` for RESTRICT). Add a regression comment: FK actions fire at purge, never at soft delete.

**`apps/api/test/flow/flow-rbac-projections.test.ts`**, **`flow-backrefs.test.ts`**, **`apps/api/test/draft-relation.test.ts`**:
- Add `deleted_at INTEGER` to each hand-rolled content DDL. No assertion changes, unless a test asserted physical removal after a plain `DELETE`; then apply the same soft-then-purge pattern.

**`apps/dashboard/src/features/content-delete-dialog/test/unit/use-content-delete-dialog.test.ts`**:
- With no `mode`, the hook resolves `trash`, whatever the seed.

Every other existing test must pass unchanged. If one asserts the old hard-delete or 409 behaviour, it is updated to the new contract and the PR says so (testing_conventions §7.10).

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

```bash
# core
pnpm --filter @beechcms/core run build
pnpm --filter @beechcms/core test

# api
pnpm beech db:reset              # fresh local D1 with 0038 applied
npx tsc --noEmit                 # in apps/api/
pnpm --filter ./apps/api test    # unit + flow + workers integration

# dashboard
npx tsc --noEmit                 # in apps/dashboard/
pnpm --filter ./apps/dashboard test

# workspace
pnpm lint
pnpm beech test --diff
node scripts/check-test-placement.mjs
node scripts/docs-fact-check.mjs

# residual flag reads (must print nothing)
rg -n "seed\??\.softDelete|\.softDelete ===|softDelete !==" packages/core/src apps/api/src apps/dashboard/src apps/api/test --glob '!**/*.test.*'
rg -n "content-soft-delete-disabled|SOFT_DELETE_DISABLED|content\.trash\.disabled" packages apps docs --glob '!docs/api/**'
```

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] No production file under `packages/core/src`, `apps/api/src` or `apps/dashboard/src` reads `softDelete` from a content seed. The residual `rg` prints nothing. Seed-lifecycle `ISeedRepository.softDelete` is untouched.
- [ ] `Seed.softDelete` is still in the type, optional, with a `@deprecated` JSDoc. Existing seeds that declare it type-check and validate.
- [ ] `generateCreateTable` / `generateIndexes` / `getExpectedColumns` give byte-identical output for `softDelete: true`, `false` and absent.
- [ ] `normalizeSeedDefinition` ignores `softDelete`, so toggling it is not reported as a change or as drift.
- [ ] `ContentRepository.delete` no longer exists in core, the D1 implementation or the static mock.
- [ ] `PurgeOptions` is exported from `@beechcms/core`. `purge` defaults to `'trashed'`, and only `reconcilePurgesHandler` passes `'any'`.
- [ ] `DELETE /api/content/:slug/:id` soft-deletes on every seed, stamps `deleted_at` from `IClock`, and stores `<slug>_old_<ms>`.
- [ ] `DELETE …?purge=true` and `bulk-purge` never erase a live entry. 404 / per-id `not-found`, row intact, no ledger object.
- [ ] Restore puts back the original slug. On conflict it lands on `<original>-restored-<id8>`. Pre-feature trashed rows keep their slug.
- [ ] The ledger is still written before the row is deleted. A ledger failure leaves the row intact (existing guard unchanged).
- [ ] R2 media are untouched by soft delete and deleted only on purge, non-blocking.
- [ ] Trash routes no longer answer 409. The permission table is unchanged. The read-only and no-grant integration cases pass.
- [ ] Widgets, backrefs, search, the Public API and relation subqueries exclude trashed rows on seeds with no flag.
- [ ] `0038_content_deleted_at.sql` applies cleanly on `pnpm beech db:reset`.
- [ ] The dashboard shows the Trash button and Trash page on every seed. The delete dialog defaults to `trash`. The Trash slug column shows the original slug.
- [ ] Hand-written docs describe the flag as deprecated and ignored. No doc mentions `content-soft-delete-disabled`.
- [ ] `core` build, `tsc --noEmit` (api and dashboard), `pnpm lint`, all test suites and `check-test-placement` are green.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executor MUST NOT build or change:

- **Retention:**
  - the global retention setting (`SiteSettings`, settings API);
  - `retentionDays` accepting `0`, and the effective-retention resolver;
  - any change to `findExpiredByRetention` beyond dropping the flag guard;
  - wiring a retention sweep into `scheduled()` (`apps/api/src/index.ts:L95`);
  - the trash payload exposing effective retention.

  → ROADMAP §2 `TrashRetentionSweep`.
- **Dashboard UX:**
  - single delete without a dialog, the optimistic removal, the 5-second Undo toast;
  - bulk-delete modal copy and per-id result reporting changes;
  - the Settings retention field and the Trash countdown on effective retention;
  - any Seed Builder field.

  → ROADMAP §3 `InstantDeleteUndo`.
- A server-side bulk soft-delete route. The dashboard already loops per id with `Promise.allSettled` (`use-content-list-modals.ts:L96-110`).
- Rejecting writes that reference a trashed relation target (`validatePublishDraftRelations`, `content.repository.d1.ts:L705-740`; DB-level FKs). The brief requires reads to exclude trashed rows, not writes to refuse them.
- Filtering trashed rows from `d1-content-scan.repository.ts` (media orphan scan: a trashed entry's media must stay referenced, because they are restorable), `seed-media-purge.repository.d1.ts`, `schema-mutator.d1.ts` and `d1-setup-checklist.repository.ts`.
- De-duplicating the `delete` automation and activity event that a purge emits after the soft delete already emitted one. This is pre-existing behaviour on opted-in seeds.
- Converting the hand-rolled flow-test DDL to `planCreateSeed`. Only the `deleted_at` column is added.
- Editing `docs/api/**` (typedoc output), the seed lifecycle (`ISeedRepository.softDelete`, `seeds.handler.ts`), the permission table, or `factory.ts` middleware order.
- Rebuilding legacy tables to drop an inline slug `UNIQUE`. The `_old_<ms>` rename makes that unnecessary.

HANDOFF -> caveman_coder
