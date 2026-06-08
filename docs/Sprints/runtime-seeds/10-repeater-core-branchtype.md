# Runtime Seeds — Sprint 10: Promote `repeater` to a Core BranchType *(optional / future)*

> **Audience:** an AI coding agent with no prior knowledge of Beech CMS. Everything is
> inline. Trust live code over snippets if they drift.
>
> **Depends on Sprint 08** (the `repeater` field renderer) and **Sprint 09** (the unified
> Seed editor). Read [`00-overview.md`](./00-overview.md) first.
>
> **Status: OPTIONAL.** Sprints 07–09 already deliver the analysis goal (the Seed modal IS
> the content modal) **without** this sprint. This sprint is a *product upgrade*, not a
> requirement: it makes `repeater` a real, persisted content field type so **any** content
> type can have inline "list of objects" fields (FAQ, timeline, gallery with captions, CTA
> lists). Do it only when that capability is wanted.

## 0. What changes vs. sprints 07–09

In sprints 08–09 `repeater` is **dashboard-only**: it renders the Seed's `branches` array,
which the Seed hook serializes to the `seeds` table — never to a `content_` table. So the
engine never had to know `repeater` exists.

This sprint makes `repeater` a **first-class `BranchType` in `@beechcms/core`**, so a
branch of type `repeater` on a *real* content Seed is persisted, validated, and round-
tripped like any other field. The dashboard already has the renderer (sprint 08); the work
here is almost entirely in `packages/core` + one migration concern.

Because sprint 08 deliberately scaffolded the **generic sub-field item body** behind
`// SPRINT 10` guards, the dashboard side of this sprint is small: flip those guards on and
implement `GenericItemRow`.

## 1. The data model decision

A `repeater` value is `Array<Record<string, unknown>>` — a list of items, each item a map
of **sub-branch alias → value**. The sub-schema is declared on the branch:

```ts
// packages/core/src/types.ts — additions to Branch
export type BranchType =
  | 'text' | 'number' | 'boolean' | 'json' | 'date'
  | 'richtext' | 'file' | 'tags' | 'relation'
  | 'repeater'                                   // NEW

export interface Branch {
  // …existing fields…
  /** Sub-schema for type==='repeater'. Each item is a record keyed by sub-branch alias.
   *  Sub-branches are restricted to scalar/leaf types (no nested repeater, no relation,
   *  no file in v1) to keep serialization and the JSON column tractable. */
  fields?: Branch[]
}
```

**Storage:** one **JSON column** `content_{slug}.{alias}` (TEXT holding `JSON.stringify`),
the same mechanism `json` branches already use. Repeaters are **not** filterable,
sortable, searchable, or facetable in v1 — enforce by forcing
`policies.filter/sort/search = false` and skipping them in facet/FTS generation. This is
the simplest correct model and avoids touching the junction/FTS machinery.

## 2. Engine changes — `packages/core/src/engine.ts`

- **`generateCreateTable` / `generateAddColumn`**: emit a nullable `TEXT` column for a
  `repeater` branch (treat like `json`). Confirm the existing `json` column path and reuse
  it — a repeater is "json with a known shape".
- **`getExpectedColumns`**: include the repeater column (one column, like `json`).
- **`generateIndexes`**: **skip** repeater branches (never indexed).
- **`generateFtsTable` / `generateFtsTriggers`**: **skip** repeater branches.
- **`serializeForDb`**: `JSON.stringify(value ?? [])`; reject non-arrays.
- **`deserializeFromDb`**: `JSON.parse` → array; coerce `null`/empty to `[]`.
- **Junctions**: repeaters never create junction tables (only `relation` multiple does).

Keep every change behind `case 'repeater':` so existing types are untouched. Same Seed →
same SQL must still hold (pure functions).

## 3. Validation — `packages/core/src/validation.ts`

Compile a nested Zod schema for a repeater branch: `z.array(z.object({ … per sub-branch … }))`.
Each sub-branch reuses the **existing** per-type leaf validators (text/number/boolean/
date/tags/json). Honour `requiredOnCreate` per sub-branch *within* each item. Reject:
- non-array values,
- sub-branch types outside the allowed leaf set (no `relation`/`file`/nested `repeater` in
  v1 — fail closed with a clear message),
- unknown keys (strip, like the rest of the engine does).

Mirror this on both the internal and public API paths (validation is shared — that is the
point of `validateAndSanitizeSeedPayload`).

## 4. Sprint-03 CRUD + DDL planner — `apps/api/src/features/seeds/`

The runtime DDL planner (`planSeedDdl`, sprint 01/03) must handle a repeater branch as an
**additive JSON column** (`ADD COLUMN … TEXT`). Adding a repeater field to an existing
content type is additive and safe; removing one orphans the column (series rule). No new
destructive paths. Add tests: creating a Seed with a repeater branch plans exactly one
`ADD COLUMN`; no index/FTS/junction statements for it.

## 5. Dashboard — light up the generic item body

In `apps/dashboard/src/features/fields/edit/`:
- Create `repeater-generic-item.tsx` → `GenericItemRow`: renders each sub-branch via the
  registry's `FieldEdit` recursively (`getEditComponent(subBranch.type)`), driven by the
  item record + an `onChange(record)`. Guard against `repeater` sub-types (not allowed).
- In `repeater.tsx`, replace the sprint-08 `// SPRINT 10` `null` branch with
  `<GenericItemRow subBranches={meta.fields ?? []} value={item} onChange={…} />` and seed
  `add()`'s blank record from `meta.fields` (already stubbed in sprint 08).
- The **branch-item** path (used by the Seed editor, sprint 09) is unchanged — both item
  kinds now coexist.
- Add a `RepeaterDisplay` (read view): a compact "N items" summary or an expandable list,
  registered via `fieldRegistry.registerDisplay('repeater', RepeaterDisplay)`.

In the **Seed Builder**, the `BranchEditor` (now the sprint-08 `BranchItemRow`) gains
`repeater` as a selectable branch type, with a nested sub-field editor (a `repeater` whose
items are leaf sub-branches — reuse the same machinery one level down, capped at depth 1).

## 6. Migration

No migration edits existing tables. New repeater columns are added at **runtime** by the
sprint-03 DDL path when a content type gains a repeater branch (`ADD COLUMN … TEXT`). The
base-schema string in the CLI (`packages/cli/src/commands/init.ts`, `BASE_SCHEMA_SQL`)
does not change — repeaters live on content tables, not system tables. Document that a
repeater added to a Seed with existing rows leaves those rows' column `NULL`, deserialized
to `[]`.

## 7. Tests

- **core/engine**: create-table + add-column emit a TEXT column for repeater; no index,
  FTS, or junction; `serializeForDb`/`deserializeFromDb` round-trip an array of records;
  non-array rejected.
- **core/validation**: valid nested array passes; required sub-branch missing fails;
  disallowed sub-type (`relation`/`file`/nested `repeater`) fails; unknown keys stripped.
- **api/seeds**: adding a repeater branch plans one additive `ADD COLUMN`; content
  create/read with a repeater value persists and returns the array.
- **api/content**: write → read round-trip of a repeater field through the real handler.
- **dashboard**: `GenericItemRow` renders sub-fields; `repeater.tsx` generic path adds an
  item with blank sub-values; `RepeaterDisplay` shows the item count; Seed Builder can
  define a `repeater` branch with sub-fields.

## 8. Acceptance criteria

- [ ] `'repeater'` is a `BranchType` in `@beechcms/core`; `Branch.fields` typed.
- [ ] Engine: repeater → nullable JSON/TEXT column; skipped by indexes/FTS/junctions;
      serialize/deserialize implemented; pure-function determinism preserved.
- [ ] Validation: nested array validated, leaf-only sub-types enforced, fail-closed.
- [ ] Runtime DDL adds a repeater column additively (sprint-03 path); no destructive ops.
- [ ] Dashboard generic item body (`GenericItemRow`) live; `RepeaterDisplay` registered;
      Seed Builder can author repeater fields with sub-fields.
- [ ] Existing field types and all prior sprints unaffected; full test suites green.
- [ ] `npm run build` / `npm run test` pass in `packages/core`, `apps/api`,
      `apps/dashboard`.

## 9. Do NOT

- Do **not** make repeaters filterable/sortable/searchable/facetable in v1 — force those
  policies off and skip them in generation.
- Do **not** allow nested repeaters, `relation`, or `file` as sub-branch types in v1.
- Do **not** create junction or FTS tables for repeater branches.
- Do **not** edit an applied migration; repeater columns are added at runtime via the
  additive DDL path.
- Do **not** regress the sprint-09 Seed editor — the branch-item repeater path must keep
  working alongside the new generic path.
