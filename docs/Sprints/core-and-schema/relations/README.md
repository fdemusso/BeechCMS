# Sprint Plan — Seed Relations (Foreign Keys)

Implementation roadmap for the native `relation` field type / SQL Foreign Key
support in BeechCMS, derived from the original feasibility study and expanded
to cover everything a production CMS needs around relations (except
polymorphism, which is intentionally out of scope).

| # | Sprint | Scope |
|---|---|---|
| 1 | [01-relations-core.md](./01-relations-core.md) | `BranchType` extension, Botanical Engine DDL emission (FK + B-tree index), draft-table FK exclusion, pure `sortSeedsByDependencies` helper, unit tests in `@beechcms/core`. Reserves `multiple: true` for Sprint 5. |
| 2 | [02-relations-api.md](./02-relations-api.md) | Zod validation, `IIdGenerator.isValid()` interface extension, RFC 7807 mapping for SQLite FK errors (409 `relation-in-use`, 422 `relation-target-not-found`), first canonical `articles.author_id → team` relation, API integration tests. |
| 3 | [03-relations-migration.md](./03-relations-migration.md) | `seed:load` topological sort + FK drift detection in `diffSeed`, hardened draft promotion (pre-check against missing targets), `PRAGMA foreign_keys = ON` in the test harness. BETA workflow: edit `0000_v040_base.sql` + reset, no new migration files. |
| 4 | [04-relations-frontend.md](./04-relations-frontend.md) | Dashboard FieldRenderers (`RelationDisplay`, `RelationEdit`), N+1 mitigation via `relations` projection on the list endpoint + TanStack cache priming, list-column integration, i18n. |
| 5 | [05-relations-many-to-many.md](./05-relations-many-to-many.md) | Junction tables `rel_<seed>_<alias>` (parent CASCADE, target configurable, no SET NULL), drafts junction without target FK, multi-aware validation/repo/UI (chips + multi-select combobox). |
| 6 | [06-relations-backrefs.md](./06-relations-backrefs.md) | `buildBackrefMap()` discovery in core, `GET /content/:slug/:id/backrefs` with preview + paginated group mode, `ReferencedByPanel` in entry-editor, RESTRICT-aware delete UX. |
| 7 | [07-relations-inline-create.md](./07-relations-inline-create.md) | `InlineCreateDialog` reusing the FieldEdit registry, `useCanCreate` permission probe, `InlineCreateDepthContext` recursion guard (cap depth = 1), cache priming for the new entry. |
| 8 | [08-relations-bulk-reassign.md](./08-relations-bulk-reassign.md) | `PATCH /content/:slug/bulk` (chunked, per-id atomic, partial-failure reporting), `BulkFieldUpdate` discriminated union, `BulkEditDialog` with CSV download for failures, single bulk activity-log entry. |

## Sequencing rules

- Sprints 1–4 must be executed strictly in order — each one finalises a
  contract the next depends on.
- Sprints 5–8 are independent of one another once 1–4 are green: they can be
  parallelised or reordered to match editorial priorities, with one caveat —
  Sprint 7 (inline-create) and Sprint 8 (bulk reassign) both benefit from
  Sprint 5's multi-relation support already being in place, so prefer 5 → {6,
  7, 8} over interleaving.
- A sprint is only "done" when its completion checklist is fully green AND
  all existing tests still pass.
- `PRAGMA foreign_keys = OFF` is forbidden across the entire roadmap. The
  topological sort introduced in Sprint 1 is the only acceptable mechanism
  for table-creation ordering.

## Explicit non-goals (across all eight sprints)

- **Polymorphic relations** (one column referencing multiple target seeds).
  Intentionally deferred — the typed-column model and the back-ref discovery
  pass both assume a single target seed per branch. Reintroducing polymorphism
  would require a parallel "relation registry" table and is a separate design
  exercise.
- Inline-create from inside the back-refs panel (Sprint 6 §OUT OF SCOPE).
- Cross-seed bulk operations in a single request (Sprint 8 is one seed per
  bulk call).
- Async conflict detection when two editors create the same target
  concurrently (Sprint 7 §OUT OF SCOPE).

These can be addressed in a future "relations v2" plan after editorial
feedback lands.
