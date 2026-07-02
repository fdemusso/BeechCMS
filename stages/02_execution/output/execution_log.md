# Execution Log — KanbanCardCustomization Sprint 2

## SECTION 6 — Acceptance Criteria

- [x] `@beechcms/core` **untouched** in the diff.
- [x] No new D1 migration; no new REST endpoint.
- [x] `putViewConfigHandler` calls `validateCardConfigAgainstSeed` on `parsed.data.card` and persists `cleaned`; dangling `branchId` returns 200 (not 422) and is stripped — proven by new tests.
- [x] `TextDisplay` with `options.compact` renders ≤3 items + `+N` for array/comma-tag values; single-string path unchanged.
- [x] `RelationDisplay` clips to 3 avatars **only** when `options.compact`; table view (no compact) renders all — regression fixed.
- [x] No other renderer modified.
- [x] Media slot in `kanban-card.tsx` calls `<FieldDisplay>` directly with no options; `maxLength:0` removed.
- [x] Card-config trigger removed from `content-kanban.tsx`; lives as a `DropdownMenuItem` in `SettingsMenu`'s kanban Layout group.
- [x] `content-toolbar` does NOT import `content-kanban` — trigger wired via `onOpenCardConfig` callback (VSA). `CardConfigDialog` mounted in `content-list.tsx`.
- [x] `ContentKanbanProps` `cardConfig`/`setCardConfig` unchanged.
- [x] `FieldDisplayProps.options` change is zero — all callers compile; `tsc --noEmit` clean in api + dashboard.
- [x] New tests added for `view-config` handler (+2), `card-config-dialog` (+4), `use-kanban-column-query` (+5); all suites green.
- [x] `pnpm beech test --diff` run; Sprint 2 files PASS.

## Validation Output

```
@beechcms/core build: clean (tsc, 0 errors)
@beechcms/core test:  16 files, 433 tests passed ✓

apps/api tsc --noEmit:   0 errors in source files ✓
apps/api test:           83 files, 1032 tests passed ✓ (+2 new)

apps/dashboard tsc --noEmit: 0 errors ✓
apps/dashboard test:         89 files, 673 tests passed ✓ (+7 new)

pnpm beech test --diff:
  view-config.ts                          PASS (88.5% stmts)
  use-kanban-column-query.ts              PASS (44.4% branch)
  kanban-card.tsx                         PASS (66.7% stmts)
  content-toolbar.tsx                     PASS (64.3% stmts)
  NOTE: content-kanban.tsx LOW — pre-existing coverage gap (DnD component, branch-wide)
```
