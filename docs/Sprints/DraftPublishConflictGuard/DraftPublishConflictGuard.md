# Sprint: DraftPublishConflictGuard

Optimistic concurrency control on `publishDraft`: a draft that would overwrite a live row
changed after the draft was created is refused with a 409 instead of silently winning.

---

### Pre-Computation Analysis

#### a) God Nodes identified via CLI

| Node | Degree | Source | Why it matters here |
|------|--------|--------|---------------------|
| `D1ContentRepository` | **52** | `apps/api/src/shared/db/repositories/content.repository.d1.ts:L117` | The single highest-degree node in the write path. Every storage concern of this sprint (`saveDraft`, `publishDraft`) is one of its 30 self-contained methods. Consumed by `repository.middleware.ts:L7`, `src/index.ts:L10`, `queue-consumer.ts:L8`, and 5 test files. Any signature change here fans out to the queue consumer and the middleware. |
| `RepositoryError` | 6 | `packages/core/src/content/content.repository.ts:L26` | Root of the domain-error hierarchy. `graphify affected "RepositoryError" --depth 2` returns exactly its four subclasses (`EntryNotFoundError`, `SlugConflictError`, `RelationTargetNotFoundError`, `HookValidationError`) — no consumer traverses the base class, so adding a fifth subclass is purely additive. |
| `generateDraftTable()` | 5 | `packages/core/src/engine/ddl.ts:L209` | The DDL authority for `content_{slug}_drafts`. Sole Botanical-Engine entry point for the new column. |
| `draftApp` | 3 | `apps/api/src/features/draft/draft.handler.ts:L23` | Low degree by design — a leaf slice. Its only storage reach is `context.get('repository')`. |

`graphify explain "Seed"` returns **Ambiguous: 76 nodes** — `Seed` is a graph-wide god concept and is
deliberately *not* touched by this sprint: no `Seed` type field is added, only a physical system column.

#### b) Architectural boundaries affected

| Boundary | Touched? | Exact surface |
|----------|----------|---------------|
| `@beechcms/core` — domain errors | **Yes** | `packages/core/src/content/content.repository.ts` — new `DraftConflictError extends RepositoryError`. Auto-exported by `packages/core/src/index.ts:L23` (`export * from './content/content.repository.js'`). |
| `@beechcms/core` — Botanical Engine DDL | **Yes** | `packages/core/src/engine/ddl.ts` — `generateDraftTable()` gains `live_snapshot_at INTEGER`; new sibling `generateAddDraftSnapshotColumn()`. Re-exported through `engine.ts:L2` (`export * from './ddl.js'`). |
| `@beechcms/core` — DDL planners | **Yes** | `packages/core/src/engine/seed-ddl.ts` — `planExtendSeed()` gains an **optional third parameter**. `planCreateSeed()` unchanged (it already delegates to `generateDraftTable` at `seed-ddl.ts:L28`). |
| `apps/api` — shared repository | **Yes** | `content.repository.d1.ts` — `saveDraft` (L1303) captures the snapshot; `publishDraft` (L1515) performs the compare-and-set. |
| `apps/api/features/draft` | **Yes** | `draft.handler.ts:L172-192` — one new `instanceof` branch mapping to a 409 Problem Details. `draft.middleware.ts` untouched. |
| `apps/api/features/seeds` | **Yes** | `seeds.helpers.ts:L151` and `seeds.mcp.ts:L162,L275` — pass the introspected draft-table columns into `planExtendSeed`. |
| `apps/dashboard` | **No** | Zero files. The dashboard already surfaces Problem Details errors from `publishDraft` (`features/drafts/api/drafts.api.ts:L12`, `features/content-management/api/content.api.ts:L149`). A 409 flows through the existing path unchanged. |
| `packages/cli` | **No** | `migration-writer.ts` / `schema-diff.ts` introspect `content_{slug}` only (`schema-diff.ts:L33,L59`) and never the drafts table. Extending drift detection to draft tables is explicitly OUT OF SCOPE (§7). |

#### c) `graphify affected` impact analysis (breaking-change proof)

```
$ graphify affected "generateDraftTable" --depth 2
- planCreateSeed()            [calls]        packages/core/src/engine/seed-ddl.ts:L28
- ddl.test.ts                 [imports]      packages/core/src/engine/ddl.test.ts:L4
- seed-ddl.ts                 [imports]      packages/core/src/engine/seed-ddl.ts:L5
- seed-ddl.test.ts            [imports]      packages/core/src/engine/seed-ddl.test.ts:L5
- core/src/index.ts           [re_exports]   packages/core/src/index.ts:L85
- seed-ddl-destructive.test.ts [imports_from] packages/core/src/engine/seed-ddl-destructive.test.ts:L11

$ graphify affected "RepositoryError" --depth 2
- EntryNotFoundError          [inherits]     packages/core/src/content/content.repository.ts:L36
- HookValidationError         [inherits]     packages/core/src/content/content.repository.ts:L77
- RelationTargetNotFoundError [inherits]     packages/core/src/content/content.repository.ts:L57
- SlugConflictError           [inherits]     packages/core/src/content/content.repository.ts:L46
```

**Breaking-change verdict: none.**
- `generateDraftTable` has **one** production consumer (`planCreateSeed`) plus three test files. Its
  return type (`string | null`) is unchanged; only the emitted column list grows. The three existing
  assertions in `ddl.test.ts` (L50-58, L266-271, L328-332) all use `toContain` / `not.toContain` on
  *other* substrings and stay green.
- `RepositoryError` has zero consumers beyond its own subclasses — adding a fifth cannot break a caller.
- `planExtendSeed`'s new parameter is optional; the CLI's `migration-writer.ts` never calls it, and the
  three API call sites are updated in this sprint.

**VSA boundary proof:**
```
$ graphify path "draftApp" "D1Database"
No directed path found between 'draftApp' and 'D1Database'.
$ graphify path "draftApp" "D1ContentRepository"
No directed path found between 'draftApp' and 'D1ContentRepository'.
```
The draft slice has no edge — direct or transitive — to either the D1 binding or the concrete
repository. It reaches storage exclusively through the `IContentRepository` interface injected by
`repository.middleware.ts`. This sprint preserves that: the handler change is a pure `instanceof` →
Problem Details translation.

---

### VETO Audit

**1. THE BOTANICAL INVARIANT — no D1 query bypasses `@beechcms/core`.**

- ✅ The new column `live_snapshot_at` is emitted **only** by `generateDraftTable()` in
  `packages/core/src/engine/ddl.ts`. No hand-written `CREATE TABLE` or `ALTER TABLE` string exists
  anywhere in `apps/api`, in a migration file, or in a test. The retroactive `ALTER` is likewise a
  core generator (`generateAddDraftSnapshotColumn`) planned by `planExtendSeed` and executed through
  `ISchemaMutator.execDdl` — the interface `schema-mutator.ts:L6` documents as *"the ONLY sanctioned
  channel for runtime DDL — handlers never touch env.DB"*.
- ✅ **No hardcoded branch names.** `live_snapshot_at` is a *system column*, in the same class as
  `_touched_fields` (`ddl.ts:L231`), `updated_at`, `status` and `deleted_at`. It is never addressed by
  a Branch ID because it is not a branch: it carries no user data, has no `Branch` entry, is absent
  from `seed.branches`, and therefore can never collide with a `br_XX` alias. `publishDraft`'s
  field-copy loop iterates `seed.branches` (L1558) and `getDraft`'s projection loop does the same
  (L1434) — both structurally incapable of reading or writing it. Consequence: the column **cannot
  leak into any API payload**. `findPendingDrafts` (L1684-1694) selects explicit columns and is
  likewise unaffected.
- ✅ `apiToDb` / `dbToApi` are not involved and must not be: the snapshot is never part of the public
  entry shape.

**2. VSA ENFORCEMENT — zero cross-feature imports.**

- ✅ `apps/api/src/features/draft/draft.handler.ts` imports `DraftConflictError` from
  `@beechcms/core` — a shared package, not a sibling slice. It already imports `EntryNotFoundError`
  and `RelationTargetNotFoundError` from the same place (L10-11); the new import joins that list.
- ✅ `apps/api/src/features/seeds/` changes are confined to the seeds slice and consume only
  `@beechcms/core` (`planExtendSeed`) and the injected `ISchemaMutator`.
- ✅ No `features/draft` → `features/seeds` edge, and none in the reverse direction. The draft slice
  does not learn that a schema column exists; it only handles a domain error.
- ✅ The conflict rule lives in `D1ContentRepository` (shared infrastructure, not a slice). Both the
  draft slice and any future caller of `publishDraft` inherit it without duplicating logic —
  precisely the rule in `ponytail_arch.md` §3.

**3. CLOUDFLARE PURITY.**

- ✅ Edge-native throughout: one extra `UPDATE` statement and one conditional `SELECT` on the loser
  path. No ORM, no background job, no stateful coordinator, no advisory-lock table.
- ✅ The schema change is additive and deterministic: `ALTER TABLE … ADD COLUMN … INTEGER` (nullable,
  no default, no table rebuild), routed through the strict migration workflow (`execDdl`), never
  through `execDestructive`.

**4. YAGNI / RUTHLESS VETO.**

- ✅ One nullable column, one error class, one CAS `UPDATE`, one `instanceof` branch. No
  `ConflictResolution` entity, no merge, no rebase endpoint, no version table, no history.
- ✅ Zero dashboard files. Zero new REST routes. Zero new middleware.

**Violation found and corrected during this audit:**

The design in `feature_brief.md` §4 mandates that the comparison live in the `WHERE` clause of the
`UPDATE`. A naïve reading places that guard on the live-row `UPDATE` *inside the existing
`this.database.batch(...)`* at `content.repository.d1.ts:L1596`. **That is unsound and the plan below
does not do it.** D1's `batch()` rolls back only when a statement *fails*; an `UPDATE` matching zero
rows **succeeds**. The batch's sibling statements — `DELETE FROM content_{slug}_drafts` (L1575) and
the junction `DELETE`/`INSERT`s (L1584-1592) — would therefore commit while the live row went
untouched: the draft is destroyed and the live content is not updated. That is *worse* than the
silent overwrite this sprint exists to fix.

**Adjusted design:** the compare-and-set is a **standalone `UPDATE … .run()` executed before the
batch**, and `meta.changes` is inspected on its own result. It is a single atomic statement, so the
TOCTOU window the brief calls out is genuinely closed; and because it runs outside the batch, a
zero-row outcome throws *before* any destructive statement is prepared. Precedent for reading
`meta.changes` off a write already exists in this exact file at L791 and across
`d1-invitation.repository.ts:L97`, `d1-session.repository.ts:L69`, `d1-oauth-token.repository.ts:L101`.

**Second correction, same audit:** `unixepoch()` has one-second granularity. If the claim lands in the
same second as the live row's last write, `updated_at` would be rewritten to its own current value and
a concurrent loser's `WHERE updated_at = ?` would *still* match — both publishes would win. The claim
therefore writes `MAX(unixepoch(), updated_at + 1)`, guaranteeing the post-claim value is strictly
greater than any snapshot that matched. Consequently the claim becomes the **sole writer** of
`updated_at` during publish, and the redundant `updated_at = (unixepoch())` clause is removed from the
batch's `UPDATE` (L1569) so it cannot undo the +1.

**VERDICT: APPROVED.** Both invariants hold. Proceed to the linear plan.

---

### Sprint Splitting (Scope Gate)

**Fits ONE sprint. No `backlog/ROADMAP.md` is written.**

Rationale: the feature spans `@beechcms/core` and `apps/api` but requires **no sequential merge**.
The core delta is one error class plus one column in one DDL generator (~25 lines); it is consumed by
`apps/api` inside the same PR through the Turborepo workspace link, exactly as
`RelationTargetNotFoundError` was. The dashboard deliverable is **empty** — the 409 rides the existing
Problem Details path — so there is no independent boundary that would need separate validation. Both
tiers are covered by one `pnpm beech test` run.

---

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

`publishDraft` (`content.repository.d1.ts:L1515`) copies every non-null draft column onto the live row
with `UPDATE content_{slug} SET … WHERE id = ?`. That `WHERE` clause carries no version predicate.
Anyone who wrote to the live row after the draft was created — a second editor, an admin, a direct API
integration, the bulk-update path, an import job — has their work overwritten with no error, no log
line, and no recovery: the draft row is deleted in the same batch. The pessimistic lock of Issue #70
guards in-session UI contention only; it cannot see an API caller and it decays.

This sprint must land before any further draft work because it is a **correctness floor, not a
feature**. Every capability built on top of drafts — rebase, merge UI, realtime conflict notification —
presupposes that a conflict can be *detected*. Detection is the primitive; everything else is
presentation. Shipping presentation first would mean shipping a UI for a condition the system cannot
observe.

**VSA adherence.** The rule is placed in `D1ContentRepository`, which is shared infrastructure and not
a slice, because it is a property of the *storage contract* of `publishDraft`, not of the HTTP surface
that happens to call it. Had it been placed in `draft.handler.ts`, the `queue-consumer.ts` path and
any future non-HTTP caller would bypass it, and the check would have to be duplicated per slice — the
exact cross-slice duplication `ponytail_arch.md` §3 forbids. The draft slice keeps a single
responsibility: translating a domain error into RFC 9457 Problem Details, which is what it already
does for `EntryNotFoundError` (404) and `RelationTargetNotFoundError` (422).

**Botanical Engine invariant adherence.** The comparison needs a durable per-draft timestamp, which
means a physical column. `generateDraftTable()` is the only authority over `content_{slug}_drafts`, so
the column is added there and nowhere else. This makes every seed created from today onward *born
protected* — the third user story — with no manual migration, because `planCreateSeed()` already
routes through that generator. Existing draft tables are repaired through the same engine via
`planExtendSeed()`, executed by `ISchemaMutator.execDdl` — the only sanctioned runtime-DDL channel.

**Backward compatibility is a first-class requirement, not an afterthought.** Drafts written before
this sprint carry `live_snapshot_at IS NULL`. A NULL snapshot disables the predicate and publishes
exactly as today. Draft tables that have not yet received the `ALTER` degrade the same way: `SELECT *`
simply returns no such key, `draftRow['live_snapshot_at']` is `undefined`, and the legacy path runs.
The feature can therefore never turn a working deployment into a broken one.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Storage layer — `apps/api/src/shared/db/repositories/content.repository.d1.ts`**

`D1ContentRepository extends BaseD1Repository` (L117, degree 52). Relevant members:

| Symbol | Line | Behaviour today |
|---|---|---|
| `saveDraft(seed, entryId, data)` | L1303 | Guard `!seed.allowDrafts → throw RepositoryError`. Builds `INSERT INTO content_{slug}_drafts (…) VALUES (…) ON CONFLICT(entry_id) DO UPDATE SET …` (L1366-1370). Always appends `_touched_fields` (union-merged via `json_each`, L1356-1362) and `updated_at = (unixepoch())` (L1364). Single `.run()` when no multi-relation branch changed (L1375); otherwise a `batch()` with junction delete+reinsert (L1379-1398). |
| `getDraft(seed, entryId)` | L1408 | `SELECT *` from the draft table, then projects **only over `seed.branches`** (L1434). System columns are structurally unreachable. |
| `hasDraft(seed, entryId)` | L1490 | `UNION` across draft table and live rows with `status='draft'`. |
| `publishDraft(seed, entryId)` | L1515 | ① `!seed.allowDrafts → return`. ② `SELECT *` draft row. ③ No draft row → if live row has `status='draft'`, `UPDATE … SET status='published', updated_at=(unixepoch())` and return; else `throw EntryNotFoundError`. ④ Parse `_touched_fields`. ⑤ `validatePublishDraftRelations(...)`. ⑥ Build `updateClauses` over `seed.branches` (L1558-1567), append `status='published'` **and `updated_at=(unixepoch())`** (L1569). ⑦ `batch([UPDATE live, DELETE draft, …junctions])` (L1573-1596). ⑧ `catch`: rethrows `EntryNotFoundError` and `RelationTargetNotFoundError`, wraps everything else via `mapError` (L1597-1601). |
| `findPendingDrafts(seeds)` | L1667 | `UNION` of explicit column lists — no `SELECT *`, unaffected by a new column. |
| `mapError(error, context)` | `base.repository.d1.ts:L26` | Maps `UNIQUE constraint failed … slug` → `SlugConflictError`; everything else → `RepositoryError`. |

`meta.changes` precedent in this very file: `processBulkUpdateSingle` at **L790-793** reads
`results[0].meta?.changes` off a `batch()` result and throws on zero.

**Botanical Engine — `packages/core/src/engine/ddl.ts`**

`generateDraftTable(seed)` (L209) returns `null` when `!seed.allowDrafts`. Emits, in order:
`entry_id TEXT NOT NULL PRIMARY KEY REFERENCES content_{slug}(id) ON DELETE CASCADE` (L216-217), one
column per non-multi-relation branch (L220-229, plus a `{alias}_bidx TEXT` when `hasBlindIndex`),
then `_touched_fields TEXT,` (L231) and `updated_at INTEGER NOT NULL DEFAULT (unixepoch())` (L232).
Re-exported via `engine.ts:L2`.

**Planners — `packages/core/src/engine/seed-ddl.ts`**

- `planCreateSeed(seed)` (L26): parent table → indexes → **draft table (L28-29)** → FTS → per
  multi-relation junction + junction-draft.
- `planExtendSeed(seed, existingColumns)` (L56): strictly additive, `existingColumns` are the
  **physical columns of `content_{slug}` only**. Contains the established precedent for a
  non-branch system column — `deleted_at` at L74-77, guarded by `!existingColumns.has('deleted_at')`
  with the comment *"System column, not a branch: the branch loop above can never emit it."*
  Re-exported via `index.ts:L85`.

**Domain errors — `packages/core/src/content/content.repository.ts`**

`RepositoryError(message, cause?)` at L26. Subclasses: `EntryNotFoundError` (L36),
`SlugConflictError` (L46), `RelationTargetNotFoundError` (L57, carries `alias`/`targetSeed`/`value`),
`HookValidationError` (L77). Interface method `publishDraft(seed, entryId): Promise<void>` at L244.
Whole module re-exported by `index.ts:L23`.

**Draft slice — `apps/api/src/features/draft/`** (3 files, `draftApp` degree 3)

`draft.middleware.ts` → `draftGuard`: 400 on missing params, 404 `content-seed-not-found`, **405
`draft-not-allowed` when `!seed.allowDrafts`**, 404 `content-not-found` when `findById` throws
`EntryNotFoundError`. Every draft route is mounted behind it.

`draft.handler.ts` routes: `GET /drafts`; `PUT /:slug/:id/draft` (L69); `GET /:slug/:id/draft` (L137);
**`POST /:slug/:id/draft/publish` (L165)**; `DELETE /:slug/:id/draft` (L200). The publish route wraps
`repository.publishDraft` in a single `try/catch` (L172-192) with two `instanceof` branches, then
`logDraftActivity(…, 'draft published')` and `return context.json({ success: true })`.

**Problem Details — `apps/api/src/public/problem-details.ts`**

`publicProblem(c, { type, title, status, detail, errors?, headers? })`. `status` is a literal union
that **already includes `409`**. A bare `type` is normalised to
`https://beechcms.dev/problems/{type}`. Response carries `Content-Type: application/problem+json` and
`instance: c.req.path`.

**Schema-apply call sites of `planExtendSeed`** (3 in production code):
`seeds.helpers.ts:L151` (`validateAndApplySeedDef`, after `getColumns('content_{slug}')` at L147);
`seeds.mcp.ts:L162` (`POST /:slug/mcp-plan`, dry run); `seeds.mcp.ts:L275` (`POST /:slug/mcp-apply`).
`ISchemaMutator.getColumns(table)` (`schema-mutator.ts:L9`) accepts **any** table name and returns
`null` when the table does not exist.

**Test provisioning.** `packages/testing/src/seeds/provision.ts:L50` runs `planCreateSeed(seed)`
statement-by-statement, so every integration-tier database gets the new column automatically with no
test-side change.

**Dashboard (read-only confirmation, no changes).** `features/drafts/api/drafts.api.ts:L12`
(`publishDraft`) and `features/content-management/api/content.api.ts:L149` both delegate to the shared
`api` client and reject on non-2xx; consumers are `use-entry-editor-dialog.tsx:L265`,
`use-content-item.ts:L59`, `pages/drafts-list.tsx:L154`. A 409 surfaces through the existing error
path with no code change.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

**Modified — `@beechcms/core` (3 files)**

1. `packages/core/src/content/content.repository.ts` — add `DraftConflictError`. No change to the
   `IContentRepository.publishDraft` signature.
2. `packages/core/src/engine/ddl.ts` — add `live_snapshot_at INTEGER` to `generateDraftTable`; add
   `generateAddDraftSnapshotColumn(seed)`.
3. `packages/core/src/engine/seed-ddl.ts` — `planExtendSeed` gains optional third parameter
   `existingDraftColumns?: Set<string> | null`.

**Modified — `apps/api` (4 files)**

4. `apps/api/src/shared/db/repositories/content.repository.d1.ts` — `saveDraft` writes the snapshot
   once; `publishDraft` performs the compare-and-set claim and throws `DraftConflictError`.
5. `apps/api/src/features/draft/draft.handler.ts` — map `DraftConflictError` → 409
   `draft-publish-conflict`.
6. `apps/api/src/features/seeds/seeds.helpers.ts` — introspect the draft table, pass it through.
7. `apps/api/src/features/seeds/seeds.mcp.ts` — same, at both the plan and apply call sites.

**New — tests (1 file)**

8. `apps/api/src/features/draft/test/integration/draft-publish-conflict.integration.test.ts`
   (integration tier — new directory `apps/api/src/features/draft/test/integration/`).

**Modified — tests (3 files)**

9. `apps/api/src/shared/db/repositories/content.repository.d1.test.ts` — unit tier, extend the
   existing `describe('publishDraft')` (L409) and add a `saveDraft` snapshot-SQL case.
10. `packages/core/src/engine/ddl.test.ts` — assert the new column and its absence when
    `allowDrafts: false`.
11. `packages/core/src/engine/seed-ddl.test.ts` — assert `planExtendSeed` emits the `ALTER` only when
    the draft column is absent and the seed allows drafts.

**Explicitly NOT produced**

- No `.sql` file in `apps/api/migrations/`. Draft tables are engine-generated at seed-apply time —
  `0000_v040_base.sql:L6` states content tables are created by the engine, and no migration in the
  repo has ever contained `content_*_drafts`. A static SQL file cannot enumerate runtime slugs.
- No dashboard file. No new route. No new middleware. No change to
  `apps/api/test/mocks/static-content.repository.ts` (its `publishDraft` at L356 is an in-memory fake
  with no live-row timestamp to conflict against; adding conflict simulation there would be fiction).

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### Task 1 — `DraftConflictError` in `@beechcms/core`

File: `packages/core/src/content/content.repository.ts`
Insert immediately after `HookValidationError` (ends L85), before `export type BulkFieldUpdate` (L87).

```ts
/**
 * Thrown by `publishDraft` when the live entry was written after the draft captured its
 * `live_snapshot_at`. Publishing would overwrite that write, so the repository refuses and the
 * caller must discard the draft or re-create it from the current live version.
 * Mapped to 409 Conflict by the API problem-mapper.
 */
export class DraftConflictError extends RepositoryError {
  readonly seedSlug: string
  readonly entryId: string
  readonly snapshotAt: number | null
  readonly liveUpdatedAt: number

  constructor(params: {
    seedSlug: string
    entryId: string
    snapshotAt: number | null
    liveUpdatedAt: number
  }) {
    super(
      `Draft conflict: entry '${params.entryId}' in '${params.seedSlug}' was modified at ` +
        `${params.liveUpdatedAt}, after the draft snapshot ${params.snapshotAt}`,
    )
    this.name = 'DraftConflictError'
    this.seedSlug = params.seedSlug
    this.entryId = params.entryId
    this.snapshotAt = params.snapshotAt
    this.liveUpdatedAt = params.liveUpdatedAt
  }
}
```

No export-barrel edit is needed: `packages/core/src/index.ts:L23` already does
`export * from './content/content.repository.js'`.

`snapshotAt` is typed `number | null` and not `number`: the claim can also fail with a NULL snapshot
when the live row was deleted between `draftGuard`'s `findById` and the claim. That case throws
`EntryNotFoundError`, but the field must not lie about its domain.

### Task 2 — `live_snapshot_at` in the draft-table DDL

File: `packages/core/src/engine/ddl.ts`, inside `generateDraftTable` (L209-236).

Replace lines L231-232:

```ts
  lines.push(`  _touched_fields  TEXT,`)
  lines.push(`  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())`)
```

with:

```ts
  lines.push(`  _touched_fields  TEXT,`)
  // Live-row `updated_at` as it stood when this draft was created, written once and never re-based.
  // Nullable on purpose: drafts created before optimistic-concurrency publish existed carry NULL and
  // publish unchecked, so enabling this feature cannot block an in-flight draft.
  lines.push(`  live_snapshot_at  INTEGER,`)
  lines.push(`  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())`)
```

Resulting DDL for a seed `articles` with branches `title`, `body`:

```sql
CREATE TABLE IF NOT EXISTS content_articles_drafts (
  entry_id  TEXT NOT NULL PRIMARY KEY
            REFERENCES content_articles(id) ON DELETE CASCADE,
  title  TEXT,
  body  TEXT,
  _touched_fields  TEXT,
  live_snapshot_at  INTEGER,
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
```

No index. The column is only ever read by primary-key lookup on `entry_id`, which is already the PK.

### Task 3 — retroactive `ALTER` generator

File: `packages/core/src/engine/ddl.ts`. Add immediately after `generateAddColumn` (ends L249).

```ts
/**
 * Generates the `ALTER TABLE content_{slug}_drafts ADD COLUMN live_snapshot_at INTEGER` statement
 * for a draft table provisioned before the column existed.
 *
 * System column, not a branch — `generateAddColumn` iterates `seed.branches` and can never emit it.
 * NOT idempotent: `ADD COLUMN` fails when the column is already present and `ISchemaMutator.execDdl`
 * aborts the whole batch on the first failing statement, so the caller MUST check the physical
 * columns first (see `planExtendSeed`).
 *
 * @param seed The seed definition. Caller must have verified `seed.allowDrafts`.
 * @returns The ALTER TABLE statement.
 */
export function generateAddDraftSnapshotColumn(seed: Seed): string {
  return `ALTER TABLE content_${seed.slug}_drafts ADD COLUMN live_snapshot_at INTEGER;`
}
```

Exported transitively by `engine.ts:L2` (`export * from './ddl.js'`).

### Task 4 — `planExtendSeed` emits the `ALTER`

File: `packages/core/src/engine/seed-ddl.ts`.

Add `generateAddDraftSnapshotColumn` to the import block (L5-17), then change the signature and add
the guard. Full replacement for L56-81:

```ts
export function planExtendSeed(
  seed: Seed,
  existingColumns: Set<string>,
  existingDraftColumns?: Set<string> | null,
): ExtendPlan {
  const statements: string[] = []
  let ftsRebuildNeeded = false

  for (const branch of seed.branches) {
    if (branch.type === 'relation' && branch.multiple === true) {
      // junction table is CREATE IF NOT EXISTS — safe to re-emit
      statements.push(generateJunctionTable(seed, branch), ...generateJunctionIndexes(seed, branch))
      const dj = generateJunctionDraftTable(seed, branch)
      if (dj) statements.push(dj)
      continue
    }
    if (existingColumns.has(branch.alias)) continue
    statements.push(generateAddColumn(seed, branch))
    if ((branch.type === 'text' || branch.type === 'richtext') && branch.policies?.search !== false) {
      ftsRebuildNeeded = true
    }
  }
  // System column, not a branch: the branch loop above can never emit it.
  if (seed.softDelete && !existingColumns.has('deleted_at')) {
    statements.push(...generateEnableSoftDelete(seed))
  }
  // Draft-table system column. Emitted only when the caller actually introspected
  // content_{slug}_drafts: `undefined` means "not introspected" and `null` means "table absent",
  // and in both cases emitting a non-idempotent ADD COLUMN would abort the caller's whole DDL batch.
  if (
    seed.allowDrafts &&
    existingDraftColumns != null &&
    !existingDraftColumns.has('live_snapshot_at')
  ) {
    statements.push(generateAddDraftSnapshotColumn(seed))
  }
  // CREATE INDEX IF NOT EXISTS — idempotent, safe to re-run
  statements.push(...generateIndexes(seed))
  return { statements, ftsRebuildNeeded }
}
```

Update the JSDoc above it (L46-55) with one added line:
`* Draft tables: pass `existingDraftColumns` (PRAGMA table_info on content_{slug}_drafts) to have the
 * `live_snapshot_at` system column added retroactively; omit it to skip that check entirely.`

### Task 5 — `saveDraft` captures the snapshot exactly once

File: `apps/api/src/shared/db/repositories/content.repository.d1.ts`, method `saveDraft` (L1303).

**5a.** After `const draftTableName = this.getTableName(seed.slug, true)` (L1309), add:

```ts
      const liveTableName = this.getTableName(seed.slug)
```

**5b.** Immediately after the `_touched_fields` block (L1353-1362) and **before**
`updateClauses.push('updated_at = (unixepoch())')` (L1364), insert:

```ts
      columnNames.push('live_snapshot_at')
      // Read inside the INSERT rather than via a prior SELECT: one statement, no window in which the
      // live row could move between the read and the write.
      placeholders.push(`(SELECT updated_at FROM ${liveTableName} WHERE id = ?)`)
      queryBindings.push(entryId)
      // COALESCE keeps the value written at draft creation. An autosave must never re-base the
      // snapshot onto a live row that changed in the meantime — doing so would silently re-authorise
      // the overwrite this column exists to block. Unqualified on the left of COALESCE is the
      // pre-existing row's value; `excluded.` is the value this statement would have inserted.
      updateClauses.push('live_snapshot_at = COALESCE(live_snapshot_at, excluded.live_snapshot_at)')
```

The emitted SQL (L1366-1370 template, unchanged) for a `PUT …/draft` touching `title` on `posts`:

```sql
INSERT INTO content_posts_drafts (entry_id, title, _touched_fields, live_snapshot_at)
VALUES (?, ?, ?, (SELECT updated_at FROM content_posts WHERE id = ?))
ON CONFLICT(entry_id) DO UPDATE SET
  title = EXCLUDED.title,
  _touched_fields = ( … existing json_each union … ),
  live_snapshot_at = COALESCE(live_snapshot_at, excluded.live_snapshot_at),
  updated_at = (unixepoch())
```

Binding order is positional and must stay `[entryId, …branch values…, touchedJson, entryId]` — the
trailing `entryId` feeds the subquery. Do not reorder the pushes.

**5c.** The multi-relation `batch()` branch (L1379-1398) needs no change; it reuses the same `sql` and
`queryBindings`.

### Task 6 — `publishDraft` compare-and-set

File: `apps/api/src/shared/db/repositories/content.repository.d1.ts`, method `publishDraft` (L1515).

**6a.** Add `DraftConflictError` to the `@beechcms/core` import at the top of the file (it already
imports `EntryNotFoundError` and `RelationTargetNotFoundError`).

**6b.** Extend the method docblock (L1505-1514) with:

```
   * @throws DraftConflictError if the live row was written after the draft captured
   *   `live_snapshot_at`. A NULL snapshot (legacy draft, or a draft table that predates the column)
   *   disables the check.
```

**6c.** Insert the claim immediately after the `validatePublishDraftRelations` call (L1552) and before
`const mRelAliases = …` (L1554):

```ts
      // Relation validation runs first on purpose: a validation failure must not leave a bumped
      // updated_at behind on a live row that was never published.
      const rawSnapshot = draftRow['live_snapshot_at']
      const snapshotAt = typeof rawSnapshot === 'number' ? rawSnapshot : null

      // Compare-and-set. The comparison MUST live in the WHERE clause: a SELECT-then-compare in
      // application code lets two concurrent publishes both pass the check before either writes.
      // MAX(unixepoch(), updated_at + 1) guarantees the post-claim value is strictly greater than
      // any snapshot that just matched — unixepoch() is second-granular, so a plain
      // `updated_at = (unixepoch())` could rewrite the same value and let the loser match too.
      // This claim is therefore the sole writer of updated_at for the whole publish; the batch
      // below deliberately does not set it again.
      const claim = await this.database
        .prepare(
          `UPDATE ${liveTableName} SET updated_at = MAX(unixepoch(), updated_at + 1) ` +
            `WHERE id = ? AND (? IS NULL OR updated_at = ?)`,
        )
        .bind(entryId, snapshotAt, snapshotAt)
        .run()

      if ((claim.meta?.changes ?? 0) === 0) {
        const live = await this.database
          .prepare(`SELECT updated_at FROM ${liveTableName} WHERE id = ?`)
          .bind(entryId)
          .first<{ updated_at: number }>()

        if (!live) {
          throw new EntryNotFoundError(`No live entry ${entryId} in ${seed.slug}`)
        }
        throw new DraftConflictError({
          seedSlug: seed.slug,
          entryId,
          snapshotAt,
          liveUpdatedAt: live.updated_at,
        })
      }
```

**6d.** Replace L1569:

```ts
      updateClauses.push("status = 'published'", 'updated_at = (unixepoch())')
```

with:

```ts
      // `updated_at` is already stamped by the claim above. Re-stamping here with a bare
      // unixepoch() would undo the +1 the claim may have applied and reopen the same-second race.
      updateClauses.push("status = 'published'")
```

**6e.** Add the rethrow in the `catch` (L1597-1601), first among the three:

```ts
    } catch (error) {
      if (error instanceof DraftConflictError) throw error
      if (error instanceof EntryNotFoundError) throw error
      if (error instanceof RelationTargetNotFoundError) throw error
      throw this.mapError(error, `publishDraft(${seed.slug}, ${entryId})`)
    }
```

**6f.** Leave the no-mirror-draft-row branch (L1527-1542) **untouched**. An entry created directly in
draft status has no `_drafts` row, therefore no snapshot, therefore no version to conflict with — the
brief's §4 explicitly rules out a false positive there. Its `UPDATE … SET status='published',
updated_at=(unixepoch())` stays as-is.

Resulting statement sequence for a normal publish of `posts/e1` with snapshot `1700000000`:

```sql
-- 1. read
SELECT * FROM content_posts_drafts WHERE entry_id = 'e1';
-- 2. (relation validation — unchanged)
-- 3. claim  ← the only place the conflict can be detected
UPDATE content_posts SET updated_at = MAX(unixepoch(), updated_at + 1)
  WHERE id = 'e1' AND (1700000000 IS NULL OR updated_at = 1700000000);
-- 4. batch (atomic)
UPDATE content_posts SET title = ?, status = 'published' WHERE id = 'e1';
DELETE FROM content_posts_drafts WHERE entry_id = 'e1';
-- …junction statements, unchanged…
```

**Known, accepted limitation to document in the docblock:** the claim commits independently of the
batch. If the batch then fails, the live row carries a bumped `updated_at` with unchanged content.
That is conservative — it invalidates other stale drafts rather than admitting them — and the publish
itself still surfaces the underlying error to the caller.

### Task 7 — 409 mapping in the draft slice

File: `apps/api/src/features/draft/draft.handler.ts`.

**7a.** Add `DraftConflictError` to the existing `@beechcms/core` import (L7-13).

**7b.** Insert as the **first** branch of the `catch` at L174, above the `EntryNotFoundError` check:

```ts
    if (err instanceof DraftConflictError) {
      return publicProblem(context, {
        type: 'draft-publish-conflict',
        title: 'Conflict',
        status: 409,
        detail:
          'The live entry was modified after this draft was created. Discard the draft and ' +
          're-open the entry to start from the current version.',
      })
    }
```

`publicProblem` normalises `type` to `https://beechcms.dev/problems/draft-publish-conflict`; `409` is
already a member of its `status` union, so no signature change is needed. The response body must not
carry `snapshotAt`/`liveUpdatedAt` — internal timestamps are not part of the public contract and the
brief specifies a plain RFC 7807/9457 409.

Ordering note: `DraftConflictError` and `EntryNotFoundError` are sibling subclasses of
`RepositoryError`, so no `instanceof` shadowing is possible; the branch is placed first for
readability only.

### Task 8 — wire draft-table introspection into schema apply

**8a.** `apps/api/src/features/seeds/seeds.helpers.ts`, in `validateAndApplySeedDef`, replace
L146-152:

```ts
  const schemaMutator = context.get('schemaMutator')
  const tableName = `content_${slug}`
  const existingCols = await schemaMutator.getColumns(tableName)
  // The drafts table carries `live_snapshot_at`, a system column the branch loop in planExtendSeed
  // cannot emit. Introspected only for draft-enabled seeds; null otherwise, which skips the check.
  const existingDraftCols = candidate.allowDrafts
    ? await schemaMutator.getColumns(`${tableName}_drafts`)
    : null

  try {
    const stmts = existingCols === null
      ? planCreateSeed(candidate)
      : planExtendSeed(candidate, existingCols, existingDraftCols).statements
    await schemaMutator.execDdl(stmts)
```

**8b.** `apps/api/src/features/seeds/seeds.mcp.ts`, `POST /:slug/mcp-plan`, replace L153-167:

```ts
  // Physical columns — the ONLY correct input for planExtendSeed.
  const existingCols = await schemaMutator.getColumns(`content_${slug}`)
  const existingDraftCols = candidate.allowDrafts
    ? await schemaMutator.getColumns(`content_${slug}_drafts`)
    : null

  let statements: string[] = []
  let ftsRebuildNeeded = false
  if (blockedReasons.length === 0 && !issues.some(i => i.fatal)) {
    if (existingCols === null) {
      statements = planCreateSeed(candidate)
    } else {
      const plan = planExtendSeed(candidate, existingCols, existingDraftCols)
      statements = plan.statements
      ftsRebuildNeeded = plan.ftsRebuildNeeded
    }
  }
```

**8c.** `apps/api/src/features/seeds/seeds.mcp.ts`, `POST /:slug/mcp-apply` at L273-276 — apply the
identical change so the applied DDL matches the planned DDL byte-for-byte. Read the surrounding lines
before editing; the local variable names there may differ from 8b.

This makes `pnpm beech schema:apply` the repair path for every manifest-owned seed, and a dashboard
seed edit the repair path for every runtime seed — both through `execDdl`, both engine-generated.

### Task 9 — tests

All four zones, one ACT per `it()`, act result named, no `// ARRANGE` labels, no `any`
(`_config/testing_conventions.md` §2, §7).

**9a. Core unit — `packages/core/src/engine/ddl.test.ts`**
Add inside the existing `generateDraftTable` describe (near L50):

```ts
    it('emits live_snapshot_at as a nullable system column so legacy drafts publish unchecked', () => {
      const sql = generateDraftTable(mockSeed)

      expect(sql).toContain('live_snapshot_at  INTEGER,')
      expect(sql).not.toContain('live_snapshot_at  INTEGER NOT NULL')
    })
```

Also extend the multi-relation case near L328 with a single assertion that the column is present even
when the seed has only multi-relation branches.

**9b. Core unit — `packages/core/src/engine/seed-ddl.test.ts`**
New describe for the third parameter. Three `it()`s, each one behaviour:

```ts
    it('adds live_snapshot_at when the draft table lacks it', () => {
      const plan = planExtendSeed(draftSeed, new Set(['id', 'title']), new Set(['entry_id', 'title']))

      expect(plan.statements).toContain(
        'ALTER TABLE content_articles_drafts ADD COLUMN live_snapshot_at INTEGER;',
      )
    })

    it('omits the ALTER when the draft table already carries the column', () => { … toEqual/not.toContain … })

    // ADD COLUMN is not idempotent and execDdl aborts the whole batch on the first failure, so an
    // un-introspected draft table must never be guessed at.
    it('omits the ALTER when the caller did not introspect the draft table', () => { … planExtendSeed(draftSeed, cols) … })
```

Add a fourth asserting that a seed with `allowDrafts: false` never emits it.

**9c. API unit — `apps/api/src/shared/db/repositories/content.repository.d1.test.ts`**
Tier: unit, `makeMockDb` (L71) already supplies `runChanges` and a chainable `firstMock`.

Inside `describe('publishDraft')` (L409):

```ts
    it('throws DraftConflictError when the guarded claim matches no row', async () => {
      const draftRow = { entry_id: 'e1', title: 'Draft', body: null, live_snapshot_at: 1000 }
      const { db, firstMock, batchMock } = makeMockDb({ runChanges: 0 })
      firstMock
        .mockResolvedValueOnce(draftRow)
        .mockResolvedValueOnce({ updated_at: 2000 })

      const publish = new D1ContentRepository(db).publishDraft(SEED, 'e1')

      await expect(publish).rejects.toBeInstanceOf(DraftConflictError)
      // The regression guard: a zero-row claim must abort BEFORE the batch, or the draft row is
      // deleted while the live row keeps the other writer's content.
      expect(batchMock).not.toHaveBeenCalled()
    })

    it('binds the snapshot into the claim WHERE clause rather than comparing in application code', async () => {
      const draftRow = { entry_id: 'e1', title: 'Draft', body: null, live_snapshot_at: 1000 }
      const { db, firstMock, prepareMock, batchMock } = makeMockDb()
      firstMock.mockResolvedValueOnce(draftRow)
      batchMock.mockResolvedValueOnce([{}, {}])

      await new D1ContentRepository(db).publishDraft(SEED, 'e1')

      const claimSql = prepareMock.mock.calls.map((c: [string]) => c[0]).find((s) => s.includes('MAX(unixepoch()'))
      expect(claimSql).toContain('WHERE id = ? AND (? IS NULL OR updated_at = ?)')
    })

    it('publishes a legacy draft whose live_snapshot_at is null', async () => { … runChanges: 1, no live_snapshot_at key … })
```

And in `describe('saveDraft')`:

```ts
    it('writes live_snapshot_at only on insert, preserving it across autosaves', async () => {
      const { db, prepareMock } = makeMockDb()

      await new D1ContentRepository(db).saveDraft(SEED, 'e1', { title: 'T' })

      const sql: string = prepareMock.mock.calls[0][0]
      expect(sql).toContain('(SELECT updated_at FROM content_posts WHERE id = ?)')
      expect(sql).toContain('live_snapshot_at = COALESCE(live_snapshot_at, excluded.live_snapshot_at)')
    })
```

Add `DraftConflictError` to the test file's `@beechcms/core` import (L7).

**9d. API integration — NEW
`apps/api/src/features/draft/test/integration/draft-publish-conflict.integration.test.ts`**

Tier: integration. Real D1 from `cloudflare:test`, real middleware, real repositories, harness-built
world (§3.4). Only `IClock`/`ITokenService` may be faked; `IIdGenerator` stays real (§0.3). Seeds come
from the canonical `@beechcms/testing` set and are provisioned through `planCreateSeed`, so the new
column exists without a hand-written `CREATE TABLE` (§3.7). Rows are created through
`POST /api/content/:slug` (§3.8).

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Draft slice — publish-conflict integration tier.
 * Covers POST /api/content/:slug/:id/draft/publish against real D1 through the full middleware
 * chain: the 409 on a stale draft, the happy path, and the legacy NULL-snapshot escape hatch.
 * The repository's SQL shape is unit tested in
 * apps/api/src/shared/db/repositories/content.repository.d1.test.ts.
 */
```

Required `it()`s — one behaviour each, four zones, status asserted before body (§5.1), body typed at
the call site (§5.2), machine-readable error identity only (§5.4), persisted state asserted (§5.5),
and the rejection proven by state that did not change (§5.6):

1. `'publishing a draft whose live entry was edited in the meantime answers 409 draft-publish-conflict'`
   — ARRANGE: create the entry, `PUT …/draft` with a changed title, then `PATCH`/`PUT` the live entry
   through the content route to bump `updated_at`. ACT: one `POST …/draft/publish`. ASSERT RESPONSE:
   `409`, then `await response.json<{ type: string; status: number }>()` and
   `expect(body.type).toBe('https://beechcms.dev/problems/draft-publish-conflict')`. ASSERT STATE: the
   live entry still carries the *other* writer's title, and the draft row still exists
   (`GET …/draft` → 200).
   Requires a comment (§6.2 case 2): `unixepoch()` is second-granular, so the live edit must be
   forced to a later second — do it by writing `updated_at` directly via `harness.db` rather than
   sleeping (§7.2 forbids sleeping).
2. `'publishing an untouched draft promotes it and removes the draft row'` — 200, live title equals
   the draft title, `GET …/draft` → 404.
3. `'a draft whose live_snapshot_at is null publishes without a conflict check'` — ARRANGE sets the
   column to NULL via `harness.db` with a comment naming the legacy mechanism it guards, then bumps
   the live row. ACT publish. ASSERT 200 and the promoted value.
4. `'an entry created directly in draft status publishes without a conflict check'` — the
   no-mirror-row path at `content.repository.d1.ts:L1527`; proves no false positive.

Direct SQL against `harness.db` is permitted here and **only** here, because `live_snapshot_at` is a
system column with no route that can set it — every such statement carries a `why` comment (§6.1).

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run in order from the repo root. Each command must pass before the next.

```bash
# 1. Core builds first — apps/api consumes DraftConflictError and the new DDL from it.
pnpm --filter @beechcms/core run build

# 2. Typecheck each tier independently.
npx tsc --noEmit --project packages/core
npx tsc --noEmit --project apps/api

# 3. Lint (noopParser workaround for TS 7.0 is already in eslint.config.js).
pnpm beech lint

# 4. Reset local D1 so every content table is re-provisioned by the engine
#    with the new live_snapshot_at column, then re-apply migrations.
pnpm beech db:reset
pnpm beech db:migrate

# 5. Full workspace test run.
pnpm beech test
```

Targeted runs while iterating:

```bash
# Core DDL + planner units
pnpm --filter @beechcms/core exec vitest run src/engine/ddl.test.ts src/engine/seed-ddl.test.ts

# Repository units
pnpm --filter @beechcms/api exec vitest run src/shared/db/repositories/content.repository.d1.test.ts

# The new integration suite
pnpm --filter @beechcms/api exec vitest run src/features/draft/test/integration/draft-publish-conflict.integration.test.ts

# Pre-existing draft suites that must stay green (no edits permitted to make them pass)
pnpm --filter @beechcms/api exec vitest run test/d1-repository-bulk-and-drafts.test.ts test/draft-touched-fields.test.ts test/draft-relation.test.ts
```

Manual verification of the retroactive `ALTER` on an already-provisioned database:

```bash
# Before: the column is absent on a pre-existing draft table.
npx wrangler d1 execute beech-db --local --command "PRAGMA table_info(content_posts_drafts);"

# Re-apply the manifest through the sanctioned control plane.
pnpm beech schema:apply

# After: live_snapshot_at present, type INTEGER, notnull 0, dflt_value NULL.
npx wrangler d1 execute beech-db --local --command "PRAGMA table_info(content_posts_drafts);"
```

Read `_config/commands.md` and `_config/database_workflow.md` before running anything in step 4 — the
exact D1 binding name and reset flags are defined there, not here.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

**Botanical Engine invariant**
- [ ] `live_snapshot_at` appears in exactly two places in the whole repo outside tests:
      `generateDraftTable` and `generateAddDraftSnapshotColumn`, both in
      `packages/core/src/engine/ddl.ts`. `grep -rn "live_snapshot_at" apps/api/migrations` returns
      nothing.
- [ ] No `CREATE TABLE content_*` or `ALTER TABLE content_*` string literal is added to `apps/api`,
      to `packages/cli`, or to any test file.
- [ ] The column is nullable with no `DEFAULT` and no index.
- [ ] `getDraft` and `findPendingDrafts` return payloads byte-identical to before: the column never
      reaches an HTTP response. Verified by the integration suite asserting the `GET …/draft` body
      shape.
- [ ] The retroactive `ALTER` is executed only through `ISchemaMutator.execDdl`, never
      `execDestructive`, and never from a handler touching `env.DB`.

**VSA**
- [ ] `apps/api/src/features/draft/` imports nothing from `apps/api/src/features/*` other than the
      pre-existing `../content/constants`.
- [ ] `apps/api/src/features/seeds/` gains no import from `features/draft`.
- [ ] `graphify path "draftApp" "D1Database"` still reports no directed path after
      `graphify update . --force`.
- [ ] The conflict predicate exists in exactly one function (`D1ContentRepository.publishDraft`). No
      `updated_at` comparison is added to any handler, middleware, or dashboard file.

**Typing**
- [ ] `DraftConflictError` declares `snapshotAt: number | null` and `liveUpdatedAt: number`; its
      constructor takes a single named-parameter object, matching `RelationTargetNotFoundError`.
- [ ] `planExtendSeed`'s third parameter is optional and typed `Set<string> | null | undefined`; every
      existing call site compiles unchanged.
- [ ] `IContentRepository.publishDraft(seed, entryId): Promise<void>` is unchanged — the new failure
      mode is a thrown error, not a new return shape or a new argument.
- [ ] No `any` introduced in production code or in any test file (§7.1).
- [ ] `npx tsc --noEmit` clean in both `packages/core` and `apps/api`.

**Correctness — the TOCTOU requirement**
- [ ] The comparison is a predicate in the `WHERE` clause of an `UPDATE`, evaluated by SQLite. No
      `if (live.updated_at !== snapshot)` exists anywhere in the diff.
- [ ] The claim runs as a standalone `.run()` **before** `this.database.batch(...)`, and a zero
      `meta.changes` throws before any statement of the batch is prepared. Proven by the unit test
      asserting `batchMock` was not called.
- [ ] The claim writes `MAX(unixepoch(), updated_at + 1)`, and `updated_at = (unixepoch())` is
      **removed** from the publish batch's `updateClauses`.
- [ ] `DraftConflictError` is rethrown unwrapped by the `publishDraft` catch and never reaches
      `mapError`.

**Backward compatibility**
- [ ] A draft row with `live_snapshot_at IS NULL` publishes with a 200 even when the live row changed.
- [ ] A draft table that has not yet received the `ALTER` does not throw: `draftRow['live_snapshot_at']`
      is `undefined` and the legacy path runs.
- [ ] The no-mirror-draft-row branch (live entry with `status='draft'`) is unmodified and publishes
      without a conflict check.
- [ ] `planExtendSeed` called with two arguments emits no `ALTER TABLE … _drafts` statement.

**API contract**
- [ ] `POST /api/content/:slug/:id/draft/publish` answers `409` with
      `Content-Type: application/problem+json` and
      `type: "https://beechcms.dev/problems/draft-publish-conflict"`.
- [ ] The 409 body contains no internal timestamp (`snapshotAt`, `liveUpdatedAt`, `updated_at`).
- [ ] The 404 and 422 branches of the same route are behaviourally unchanged.

**Tests (`_config/testing_conventions.md`)**
- [ ] The new file lives at `apps/api/src/features/draft/test/integration/` — inside the slice it
      tests (Rule 1.1) — carries the SPDX header (1.2), is named `*.integration.test.ts` (1.3), and
      mixes no tier (Rule 0.1).
- [ ] `describe('draft slice — publish conflict integration (real D1)')`; no `it()` name contains
      "should" (1.5).
- [ ] `beforeEach` holds only the baseline harness + canonical seeds + canonical users (3.1, 3.2); no
      `beforeAll` for mutable state.
- [ ] Every `it()` passes in isolation via `vitest run -t '<name>'` (3.3).
- [ ] No fake repository in the integration tier (0.1); `IIdGenerator` stays real (0.3); entry ids
      asserted with `UUID_V4_PATTERN`, never a literal (3.6).
- [ ] No `vi.useFakeTimers()`, no patched `Date`, no `setTimeout` sleep, no `it.only`/`it.skip`, no
      snapshot of an API response (§7).
- [ ] Every write asserts persisted state and the 409 test asserts that the live row and the draft row
      both survived unchanged (5.5, 5.6).
- [ ] Each direct-SQL line against `harness.db` carries a `why` comment naming the mechanism that
      forces it (6.1, 6.2).
- [ ] No existing test was edited to make new code pass (§7.10). The pre-existing
      `'calls batch with UPDATE and DELETE statements when draft exists'` (L430) stays green as
      written — verify this before touching it.

**Build & graph**
- [ ] `pnpm --filter @beechcms/core run build` succeeds and `packages/core/dist` exports
      `DraftConflictError`.
- [ ] `pnpm beech lint` clean.
- [ ] `pnpm beech test` green across the workspace.
- [ ] `graphify update . --force` run after the change so the next planning stage sees the new nodes.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executing agent MUST NOT build, modify, or "improve" any of the following.

**From the feature brief §5 (discarded during sparring)**
1. **Rebase / re-basing the snapshot.** No endpoint, no flag, no parameter that refreshes
   `live_snapshot_at` against the current live row. The `COALESCE` in Task 5b exists precisely to make
   this impossible. `idea.md`'s phrase "alla creazione o re-basata" is resolved: no rebase exists.
2. **Merge, diff, or field-level conflict resolution.** No `ConflictResolution` entity, no
   `MergeRequest`, no three-way anything.
3. **Conflict-resolution UI or diff viewer.** Zero files under `apps/dashboard/`. Do not add a
   `409` special case to `drafts.api.ts`, `content.api.ts`, `use-entry-editor-dialog.tsx`,
   `use-content-item.ts`, or `drafts-list.tsx` — the existing Problem Details error path is the
   deliverable.
4. **Realtime conflict notification** (WebSocket, polling, SSE). That is Issue #70's pessimistic-lock
   territory.
5. **Version history / audit trail of live edits.** One timestamp column, not a history table.
6. **Any behaviour change for `allowDrafts: false` seeds.** `publishDraft`'s early return at L1517 and
   `draftGuard`'s 405 stay exactly as they are.
7. **Automatic retry or backoff on conflict.** The caller decides.
8. **Role-based exemption.** Admin, editor and API integration are treated identically. Do not read
   `jwtPayload.role` anywhere in the diff.

**Additional boundaries established by this plan**
9. **No hand-written `.sql` migration.** Do not add a file to `apps/api/migrations/`. Draft tables are
   engine-generated per runtime slug; a static file cannot enumerate them and would fork the DDL
   authority away from `@beechcms/core`.
10. **No change to `packages/cli/src/lib/schema-diff.ts` or `migration-writer.ts`.** They introspect
    `content_{slug}` only. Teaching drift detection to cover `content_{slug}_drafts` is a separate,
    larger piece of work: it would need `LiveTable` introspection of a second table, new `SeedDiff`
    fields, new console rendering, and its own tests. The repair path for this sprint is
    `planExtendSeed` via `pnpm beech schema:apply`, which is sufficient and already sanctioned.
11. **Do not fix the pre-existing `allowDrafts: false → true` gap.** `planExtendSeed` never emits
    `generateDraftTable`, so flipping that flag on an existing seed leaves the draft table missing.
    Real, latent, and unrelated: Task 4's `existingDraftColumns != null` guard is written so that this
    case emits nothing and cannot crash. Leave it.
12. **Do not add an index on `live_snapshot_at`.** It is only ever read on a primary-key lookup.
13. **Do not extend `apps/api/test/mocks/static-content.repository.ts`** with conflict simulation. The
    in-memory fake has no live-row timestamp; simulating a conflict there would assert fiction.
14. **Do not add `live_snapshot_at` to `getDraft`'s projection, to `DraftSummary`, or to any generated
    type.** It is a system column and must never appear in an API payload or in
    `seed-types-generator` output.
15. **Do not refactor `publishDraft`** beyond the insertions in Task 6. Its relation-validation,
    `_touched_fields` handling, and junction promotion are out of scope and must survive byte-for-byte
    except where Task 6 names a line.
