# Runtime Seeds — Sprint 06: Destructive Operations (Danger Zone)

> **Audience:** an AI coding agent with no prior knowledge of Beech CMS. Everything is
> inline. Trust live code over snippets if they drift.
>
> **Depends on Sprints 01–09.** Read [`00-overview.md`](./00-overview.md). This sprint
> lifts the additive-only constraint behind explicit, guarded, irreversible operations.

> ## 0.1 Status reconciliation (this plan post-dates sprints 07–09)
>
> Sprint 06 was authored before the UI refactor in sprints **07–09**, which already
> landed on `runtime-seeds`. Its original §5 targeted `SeedEditorDialog` — **that
> component no longer exists.** Reconcile against the current code before building:
>
> - **The Seed editor is now the shared shell.** `SeedEditorDialog.tsx` and
>   `BranchEditor.tsx` were **deleted** in sprint 09. A content type is edited by
>   `SchemaFormShell` (exported from `@/features/entry-editor`) driven by
>   `useSeedEditorDialog` (`apps/dashboard/src/features/seed-builder/hooks/`). The dialog
>   is mounted by `SeedFormDialog` inside `SeedBuilderPage.tsx`.
> - **Field rows live in the `fields` slice.** The per-branch editor is `BranchItemRow`
>   (`apps/dashboard/src/features/fields/edit/repeater-branch-item.tsx`), rendered by the
>   `repeater` field type. The Seed's `branches` array is a virtual `repeater` branch on
>   the meta-seed (`lib/meta-seed-layout.ts`). `BranchItemRow` already locks `alias`/`type`
>   read-only for existing branches via `isExisting = !branch.id.startsWith("br_new_")`.
> - **Capabilities are the extension point.** `SchemaFormCapabilities`
>   (`apps/dashboard/src/features/entry-editor/renderer/schema-form-view-model.ts`) is
>   `{ drafts, backrefs, delete, layoutBuilder }`, all **false** for Seeds. Sprint 07
>   deliberately left this object open: **add a `dangerZone` flag here** rather than
>   inventing a parallel mechanism.
> - **Backend half is unbuilt and still accurate.** `D1SchemaMutator`
>   (`apps/api/src/shared/schema-mutator.d1.ts`) still exposes only `getColumns` +
>   `execDdl` (additive). `seeds.handler.ts` has GET `/`, GET `/:slug`, POST `/`,
>   PUT `/:slug`, POST `/:slug/branches`, DELETE `/:slug` (**soft-delete**, with the
>   backref guard already wired). The PUT handler **hard-rejects** alias rename
>   (`alias-rename-not-supported`) and type change (`branch-type-change-not-supported`)
>   with 422s that literally cite "(sprint 06)" — **this sprint is what lifts them**, via
>   the dedicated rename/retype routes (not by loosening PUT).
> - **Sprint 10 follows (optional).** Promoting `repeater` to a core `BranchType` is a
>   later, optional sprint. This sprint does **not** require it; treat `repeater` as a
>   dashboard-only type as in sprint 08.

## 0. Role & ground rules

Senior full-stack engineer, Beech CMS monorepo. Workers runtime, repository pattern, docs
English, tests required, admin-only. Until this sprint, **no** code path emitted
`DROP`/`RENAME`. This sprint adds them — every one **irreversible and data-destroying** —
so guardrails are the point, not an afterthought.

## 1. What this sprint builds

Real schema cleanup, opt-in and confirmed:

1. **Drop a content type (hard delete)** — `DROP TABLE content_{slug}` (+ `fts_{slug}`,
   `content_{slug}_drafts`, junction tables) and delete the `seeds` row, after a typed
   confirmation. Plus R2 media cascade for the type's file fields. This is the
   **escalation** of the existing sprint-05 **soft-delete** (`DELETE /api/seeds/:slug`,
   which only flips status and keeps the data — see `DeleteSeedDialog` copy
   `seedBuilder.delete.dataRetained` / `dangerZoneHint`).
2. **Drop a field (orphan cleanup)** — `ALTER TABLE content_{slug} DROP COLUMN {alias}`
   for a column that is orphaned (in the DB, not in the definition) or being removed now.
3. **Rename a field alias** — `ALTER TABLE content_{slug} RENAME COLUMN {old} TO {new}`,
   keeping the stable `branch.id`, and re-creating FTS table/triggers that referenced the
   old alias. **Lifts** the current PUT `alias-rename-not-supported` rejection.
4. **Change a field type** — column type change via the SQLite 12-step table rebuild
   (or a documented "add new column + copy + drop old" migration). High-risk; gate hard.
   **Lifts** the current PUT `branch-type-change-not-supported` rejection.
5. **FTS rebuild** — recreate `fts_{slug}` + triggers when searchable branches were added
   or renamed (the `ftsRebuildNeeded` signal from sprint 01/03 finally acted upon).
6. Dashboard **Danger Zone** UI surfacing all of the above with typed confirmations and
   clear data-loss warnings, hung off the **shared shell** (not the deleted
   `SeedEditorDialog`).

## 2. Backend: extend `ISchemaMutator`

Sprint 03 defined `ISchemaMutator` with `getColumns` + additive `execDdl` (the live
`D1SchemaMutator` still has only those two methods). Add explicit destructive methods so
destructive SQL is never smuggled through `execDdl` (keep `execDdl` additive-only;
reviewers can grep for the destructive methods):

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
interpolation — these are not parameterizable, and the existing `getColumns` already
applies exactly this guard before a `PRAGMA table_info`. `DROP TABLE IF EXISTS`,
`ALTER TABLE x DROP COLUMN y`, `ALTER TABLE x RENAME COLUMN a TO b`. SQLite supports
`DROP COLUMN` and `RENAME COLUMN` (modern versions; D1 is current). For type changes use
the [12-step `ALTER TABLE` procedure](https://www.sqlite.org/lang_altertable.html) inside
a single `execDestructive` batch (create new table with the corrected column, copy via
`INSERT … SELECT` with `CAST`, drop old, rename new) — or document the simpler
add/copy/drop-column path if the full rebuild is too broad for the timebox. (`execDdl`
already uses `db.batch`, which is atomic per call; `execDestructive` reuses that.)

> **Core DDL generators:** add destructive generators to `packages/core/src/engine.ts`
> (or a new `seed-ddl-destructive.ts`), alongside the existing additive planners
> `planCreateSeed` / `planExtendSeed`: `generateDropTable(seed)` (returns all of
> `content_{slug}`, `fts_{slug}`, `content_{slug}_drafts`, and each junction table),
> `generateRenameColumn(seed, from, to)`, `generateDropColumn(seed, alias)`, and an FTS
> rebuild planner `planFtsRebuild(seed)` (drop + recreate `fts_{slug}` + triggers, then
> backfill from `content_{slug}` via `INSERT INTO fts_{slug} SELECT …`). Pure, tested.

## 3. Backend: new routes (admin-only, `/api/seeds`)

These are **additive** to the live `seedsApp` (`apps/api/src/features/seeds/seeds.handler.ts`),
which already has GET `/`, GET `/:slug`, POST `/`, PUT `/:slug`, POST `/:slug/branches`,
and DELETE `/:slug` (soft-delete). Reuse its `requireAdmin`, `actorFromContext`, and
`publicProblem` helpers.

| Method | Path | Action | Guard |
|---|---|---|---|
| `DELETE` | `/api/seeds/:slug/hard` | Drop tables + delete row + R2 cascade | typed confirm + backref check |
| `DELETE` | `/api/seeds/:slug/branches/:branchId` | Drop the column | typed confirm |
| `PATCH` | `/api/seeds/:slug/branches/:branchId/rename` | Rename alias (RENAME COLUMN + FTS rebuild) | typed confirm |
| `PATCH` | `/api/seeds/:slug/branches/:branchId/retype` | Change type (table rebuild) | typed confirm |
| `POST` | `/api/seeds/:slug/fts/rebuild` | Rebuild FTS | admin |
| `GET` | `/api/seeds/:slug/orphans` | List DB columns absent from the definition | admin |

> **Unblock PUT's deferred guards.** The PUT `/:slug` handler currently returns 422
> `alias-rename-not-supported` and `branch-type-change-not-supported` when an existing
> branch's alias/type differs from the stored one — both citing "(sprint 06)". Keep
> PUT additive-only (it must still reject these), and route the actual rename/retype
> through the dedicated PATCH routes above. Update the rejection `detail` strings to
> point the caller at those routes instead of saying "not supported".

**Typed confirmation:** destructive requests must carry a body field
`confirm: "<slug>"` (or `"<slug>.<alias>"`) that the handler checks equals the target
identifier; mismatch → `400 confirmation-required`. This mirrors the GitHub "type the
repo name" pattern and prevents accidental loss.

**Backref guard for hard delete:** reuse the exact guard the soft-delete route already
runs — `const inbound = c.get('backrefMap').get(slug)`; if any **active** seed has a
`relation` targeting `slug`, reject `409 seed-referenced` and list the distinct
`sourceSlug`s; the user must remove those relations first. Also use the `backrefs` feature
(`apps/api/src/features/backrefs/`) / `DeleteButtonWithRestrict` semantics if applicable
to entry-level references.

**Each destructive write ends with `bumpRegistryVersion()`** (as every existing seeds
mutation does) + an `activityLogger.log` audit entry recording the operation, target, and
acting user (the `actorFromContext(context)` helper is already in the handler).

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
- **The read-only lock that this lifts:** in the UI, `BranchItemRow`
  (`apps/dashboard/src/features/fields/edit/repeater-branch-item.tsx`) renders `alias`
  and `type` as disabled inputs for existing branches (`isExisting`), with the
  `seedBuilder.branchEditor.aliasReadOnlyHint` / `typeReadOnlyHint` tooltips. The Danger
  Zone (§5) is the *only* place those become editable, and only through the confirmed
  PATCH routes — never through the normal additive save.

## 5. Dashboard: Danger Zone (on the shared shell)

The seed editor is no longer `SeedEditorDialog`; it is `SchemaFormShell` driven by
`useSeedEditorDialog` (sprint 09). The Danger Zone therefore plugs into the **shared
shell via a capability**, keeping all Seed-specific logic in the `seed-builder` slice.

### 5.1 Add a `dangerZone` capability + slot

Extend the sprint-07 contract in
`apps/dashboard/src/features/entry-editor/renderer/schema-form-view-model.ts` — this is
the open-for-extension move sprint 07 explicitly anticipated:

```ts
export interface SchemaFormCapabilities {
  readonly drafts: boolean
  readonly backrefs: boolean
  readonly delete: boolean
  readonly layoutBuilder: boolean
  readonly dangerZone: boolean   // NEW (sprint 06) — render the destructive section
}

export interface SchemaFormViewModel {
  // …existing fields…
  /** Rendered by SchemaFormShell only when capabilities.dangerZone is true.
   *  The Seed hook builds this node; the shell stays domain-agnostic. */
  dangerZoneSlot?: React.ReactNode   // NEW (sprint 06)
}
```

`SchemaFormShell` (`renderer/schema-form-shell.tsx`) renders the slot inside the form,
visually separated (red border / heading), gated exactly like the other chrome:

```tsx
{vm.capabilities.dangerZone && !vm.isCreate && vm.dangerZoneSlot}
```

Set `dangerZone: false` in `useEntryEditorDialog` (content entries keep their own
`delete` capability) and **`true` only on edit** in `useSeedEditorDialog`. Provide
`dangerZoneSlot: undefined` everywhere it is off — the shell never reads it when the flag
is false.

### 5.2 Build the slot in the `seed-builder` slice

A new `components/SeedDangerZone.tsx` (admin only), rendered by `useSeedEditorDialog` into
`dangerZoneSlot`, containing:

- **Hard-delete the type** — escalates beyond the existing soft-delete `DeleteSeedDialog`;
  requires typing the slug; calls `DELETE /api/seeds/:slug/hard`.
- **Drop orphaned columns** — from `GET /api/seeds/:slug/orphans`.
- **Per-field rename / retype / drop** — operate on the seed's branches. Because the
  branch list is rendered by the `repeater` (`BranchItemRow`), expose these as a
  destructive affordance on the existing row rather than a second list: pass a flag
  through `repeater.branchItemContext` (e.g. `dangerZone: true`) so `BranchItemRow`, for
  existing branches only, unlocks `alias`/`type` behind a per-row "advanced / destructive"
  toggle that calls the PATCH rename/retype or DELETE branch routes (with confirmation).
  Outside the Seed Danger Zone (a content `repeater`), the flag is absent and the
  read-only lock stays.

Each action opens a confirmation requiring the user to **type the slug** (or
`slug.alias`) before the button enables. Echo the exact data-loss consequence and any
backref/automation warnings returned by the API. After success: toast + invalidate
`["seeds"]` **and** `["schema"]` (so the sidebar/content views update live, same as the
sprint-05 mutations). Add a `seeds.api.ts` method per new route.

### 5.3 i18n

Add `seedBuilder.dangerZone.*` keys to **both** locales
(`apps/dashboard/src/locales/{it,en}.json`). The existing `seedBuilder.delete.*` keys
(soft delete) stay; the Danger Zone copy is additive.

## 6. Tests

- Core: `generateDropTable` covers main + fts + drafts + junction tables; `planFtsRebuild`
  drops, recreates, and backfills; `generateRenameColumn`/`generateDropColumn` produce
  valid SQL; identifier validation rejects unsafe names.
- API: typed-confirmation mismatch → 400; hard delete drops all tables + deletes row +
  attempts R2 cascade + bumps version + audit log; backref guard → 409 with the list;
  rename → RENAME COLUMN + FTS rebuilt, layout still resolves, affected automations
  reported; drop column also drops from drafts table; retype rebuilds the table preserving
  data (insert rows, retype, assert values cast correctly). Extend the existing
  `seeds.handler.test.ts`.
- `D1SchemaMutator` destructive methods against local D1: drop/rename/dropColumn reflected
  by `getColumns`/`sqlite_master`.
- Dashboard: `SchemaFormShell` renders `dangerZoneSlot` only when
  `capabilities.dangerZone` (extend the sprint-07 `schema-form-shell.test.tsx` gating
  cases); confirmation gating (button disabled until slug typed); `BranchItemRow` unlocks
  `alias`/`type` only when the `branchItemContext.dangerZone` flag is set; warnings
  rendered; invalidations fire.
- Regression: content `EntryEditorDialog` keeps `dangerZone:false` and its full suite
  passes unchanged.

## 7. Acceptance criteria

- [ ] Build + tests pass across packages.
- [ ] Destructive SQL lives **only** behind the new `ISchemaMutator` destructive methods
      and confirmed routes; `execDdl` remains additive-only; grep shows no `DROP`/`RENAME`
      outside this sprint's code.
- [ ] Hard delete: drops `content_/fts_/drafts/junction` tables, deletes the `seeds` row,
      cascades R2 media, bumps version, audit-logs — only after typed confirmation and
      passing the backref guard. Soft-delete (`DELETE /:slug`) is left intact.
- [ ] Field drop/rename/retype work with stable `branch.id`, FTS rebuilt where needed,
      layouts preserved, affected automations reported; the PUT `alias-rename`/`type-change`
      rejections now point at the dedicated PATCH routes.
- [ ] Orphan cleanup lists and drops columns absent from the definition.
- [ ] Danger Zone is rendered by `SchemaFormShell` via the `dangerZone` capability +
      `dangerZoneSlot`, gated by typed confirmation; all copy via `t()` in both locales.
- [ ] `BranchItemRow`'s `alias`/`type` read-only lock is unlocked **only** inside the
      Danger Zone destructive path; the normal additive save still forbids those edits.

## 8. Do NOT

- Do not allow any destructive op without the typed-confirmation check.
- Do not let `execDdl` carry destructive statements — use the dedicated methods.
- Do not loosen PUT `/:slug` to perform rename/retype — keep it additive-only and route
  destructive changes through the new PATCH routes.
- Do not auto-rewrite automations/layouts on rename — report breakage, let the user fix.
- Do not skip the R2 cascade or the audit log on hard delete.
- Do not reintroduce `SeedEditorDialog`/`BranchEditor` — the Danger Zone hangs off the
  shared `SchemaFormShell` (sprints 07–09).
- Do not break the synchronous `ISeedRegistry` contract or the version-token invalidation.
- Do not require sprint 10 (`repeater` as a core `BranchType`) — it remains optional.
