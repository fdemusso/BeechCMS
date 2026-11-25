# Rejections

## 2026-10-13 — TagChoiceEditing.md
Plan omits 3 existing tests that assert removed tag formats (object map `{tag: colore}`, `[{name}]`):
- `apps/dashboard/src/lib/filter-dsl.test.ts` — "tags: contains/eq su keys estratte" (lenient) and "tags strict: filtro vuoto -> false; match/non-match sulle keys"
- `apps/dashboard/src/features/content-management/test/unit/content-list-hooks.test.ts` — "normalizza tag estraendo il primo nome"

They fail because `extractTagNames` now returns `[]` for non-array input (Task 1). Plan forbids touching `filter-dsl.ts` / `use-content-list-query.ts` and does not list these test files for edit; contract forbids editing tests unprompted.
Needed: list these tests in SECTION 3/9 with their new fixtures (array of strings), or state expected behaviour.

State left: Tasks 1-7 and Task 9 tests implemented uncommitted on branch `feature/tag-choice-editing` (from `feature/schema-plan-definition-diff`, which carries Sprint 1+2; `devs` lacks them). Not done: Task 8 docs, full SECTION 5 validation, graphify update.
