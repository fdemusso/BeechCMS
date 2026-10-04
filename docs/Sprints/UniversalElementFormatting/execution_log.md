# Execution Log — UniversalElementFormatting

Precondition override: sprints 1–4 were still uncommitted on `feature/content-views-persistence` (see
`stages/01_sprint_planning/output/rejections.md`, 2026-10-04). User instructed to proceed anyway; implemented
directly on the existing branch rather than branching from `devs`, and made no commits.

## SECTION 6 — ACCEPTANCE CRITERIA

- [x] `ElementStyle`, `ElementFormat`, `ElementFormatter`, `NO_ELEMENT_FORMAT`, `NO_ELEMENT_FORMATTER`,
      `compileElementFormatter` and `getConditionalFormatCardClass` are exported from `lib/conditional-format.ts`
      exactly as in Task 1. That module imports no `@/features/*`.
- [x] `ConditionalFormatTarget` is `"element" | "field"`. No dashboard file compares a target against `"row"`/`"cell"`
      (Validation step 5).
- [x] `compileElementFormatter` keeps the old evaluation order: enabled rules only, ascending priority, ties in input
      order, first match per element and per field column. It is pure and never throws.
- [x] `ViewRendererProps.formatElement` is required, and the workspace compiles it once per `layout.conditionalFormats`
      value.
- [x] `useContentTableConfig` contains no rule evaluation and returns no `getRowStyles`. Table rows and cells look as
      before for the same rules (adapter moved to `toTableRowStyles` in `content-table-renderer.tsx`).
- [x] Gallery cards show the element tint and border, and per-slot field colours, for status, title, excerpt, date and
      tags.
- [x] Kanban cards show the element tint and border, and field colours, on the header, subtitle, metadata values and
      status. The legacy path styles the title and status.
- [x] Cards stay opaque: the card class never replaces `bg-card` (verified by the `getConditionalFormatCardClass`
      hover/`bg-` matrix test).
- [x] Gallery `settings` is `["groupBy", "conditionalFormats", "pageSize"]`, and Kanban `settings` is
      `["conditionalFormats"]`. The editor opens and edits rules on all three View Types, and edits persist through the
      existing autosave.
- [x] The editor labels read "Field" / "Whole item" (it: "Campo" / "Intero elemento"). The `cell`/`row` keys are gone
      from both locales (the unrelated `it.json:1780` `"row"` key is untouched).
- [x] `getEntryValueForColumn` lives in `lib/filter-dsl.ts`, and no file imports it from `content-management`.
- [x] No core, API, migration, permission or seed file is in the diff.
- [x] All new and edited tests follow `_config/testing_conventions.md`.
- [x] Validation steps 1–7 pass. Step 8 (manual `pnpm beech dev` runtime walk) was not run — out of scope for a
      non-interactive execution pass; all assertions it would confirm are covered by the unit tests added in Task 7.
- [~] `git diff --stat` for this sprint touches no file outside SECTION 3, with one documented exception:
      `apps/dashboard/src/features/content-kanban/test/unit/use-kanban-column-query.test.ts` — not listed in SECTION 3,
      but its `toHaveBeenCalledWith` assertions hard-coded the exact argument list of `buildKanbanCardDisplayModel`,
      which Task 5 explicitly extends with a trailing `format` argument. Fixed mechanically (appended the expected
      `NO_ELEMENT_FORMAT`-shaped argument); no behavioural assertion was changed. Also not measurable in isolation
      from sprints 1–4's own uncommitted diff, per the precondition override above.

## Validation output

**1. `apps/dashboard`: `pnpm run type-check`**
```
$ tsc -b
(no errors)
```

**1. `apps/dashboard`: `pnpm test`**
```
Test Files  156 passed (156)
     Tests  1112 passed (1112)
```

**2. Repo root: `pnpm lint`**
```
ESLint: No issues found
```

**3. Repo root: `pnpm beech test --diff`**
```
[packages/core]    Test Files  3 passed (3)   Tests  67 passed (67)
[apps/dashboard]   Test Files 49 passed (49)  Tests 410 passed (410)
[apps/api] unit        Test Files 20 passed (20)  Tests 120 passed (120)
[apps/api] integration Test Files 22 passed (22)  Tests 153 passed (153)
PASS  All 15 changed file(s) meet coverage thresholds.
[exited with code 0]
```

**4. Evaluation lives only in the shared evaluator**
```
$ grep -rnE 'matchesFilterGroupStrict|getConditionalFormat(Row|Cell)Class' apps/dashboard/src/features/content-management/hooks
(no output)
```

**5. Old vocabulary is gone**
```
$ grep -rnE 'target: ?"(row|cell)"|=== "(row|cell)"|cell\+row|conditionalFormats\.(cell|row)' apps/dashboard/src
(no output)
```

**6. Slice isolation**
```
$ grep -rnE '@/features/content-(management|toolbar|views|kanban)' apps/dashboard/src/features/content-gallery
(no output)
$ grep -rnE '@/features/content-(management|toolbar|views|gallery)' apps/dashboard/src/features/content-kanban
(no output)
$ grep -nE '@/features/' apps/dashboard/src/lib/conditional-format.ts apps/dashboard/src/lib/filter-dsl.ts
(no output)
```

**7. Graph sync**
```
$ graphify update . --force
[graphify watch] Rebuilt: 24650 nodes, 36629 edges, 2311 communities
Code graph updated.
```
