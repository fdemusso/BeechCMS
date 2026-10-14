# Execution Log — TagChoiceViews

## SECTION 6 — ACCEPTANCE CRITERIA

- [x] Sprint 3 committed before start (HEAD `2b40b0d3`); new branch `feature/tag-choice-views` from that commit.
- [x] `resolveKanbanConfig` proposes as axis only `tags` with `multiple: false` and options; `resolveKanbanColumns` has one parameter and gives `color` to tags columns.
- [x] `KanbanMoveBody.axis` is `{ value: string | null }`; `grep -rn "oldValue\|kind: 'tags'\|kind: \"tags\""` over `apps`/`packages` (excl. `node_modules`/`dist`) is empty.
- [x] `kanbanColumnEntryValue` is the only column → value translation: used by `kanban-move.ts`, prefill and optimistic update in `content-kanban.tsx`.
- [x] `viewConfigChoiceIssues` exported from `@beechcms/core`; `POST`/`PATCH /api/content/:slug/views` answer 422 `content-invalid-view` on forbidden references and write nothing.
- [x] `buildSelectQuery`: single-choice tag ordered by option position (bound) or alphabetically, empty last; `orderBy` on multiple-choice tag ignored; `eq`/`neq`/`contains`/`not_contains`/`in`/`not_in` on `tags` = membership.
- [x] `evaluateWhen` applies array semantics to `eq`/`neq`/`contains`/`in`/`notin`/`isempty`/`isnotempty`.
- [x] Dashboard: no "alias contains `tag`" heuristic (`grep -rn 'includes("tag")' apps/dashboard/src` empty); `buildFilterableColumns` types `tags` as `"tags"`; multiple-choice tags neither sortable nor groupable; table groups and gallery folders follow option order; folder prefill on `tags` = array.
- [x] No change to `packages/cli`, `packages/mcp`, `packages/client`, `packages/forms-react`, migrations, demo seeds, `automation-value-input.tsx`.
- [x] Docs and `CHANGELOG.md` updated per Task 11.
- [x] All SECTION 5 commands exit 0; no `it.skip`/`it.only`; tests follow `testing_conventions.md`.

## SECTION 5 — VALIDATION

```
pnpm --filter @beechcms/core run type-check   OK
pnpm --filter @beechcms/core run build        OK
pnpm --filter @beechcms/core test             61 files, 1113 tests passed
pnpm --filter @beechcms/testing build         OK
pnpm --filter @beechcms/api run type-check    OK
pnpm --filter @beechcms/dashboard run type-check  OK
pnpm --filter @beechcms/dashboard test       164 files, 1191 tests passed
pnpm run type-check                           19/19 tasks successful
pnpm beech test                               18/18 tasks successful (api: 60 files, 336 tests passed, integration D1 included)
pnpm run lint                                 20/20 tasks successful
pnpm run lint:tests                           test placement — OK
graphify update .                             17085 nodes, 38273 edges, 1087 communities
```

## REWORK (review_report.md, REWORK_CODE)

- [x] F1: kanban "+" prefill uses `kanbanColumnEntryValue(axisBranch, col.value)` (`content-kanban.tsx`).
- [x] F2: `query.ts` uses `Object.hasOwn(TAGS_MEMBERSHIP_OPS, op)`.
- [x] F3: `kanban-move.test.ts` legacy-body test sends real `{ kind, oldValue, newValue }`.
- Re-run: core/api/dashboard type-check OK; core 1113, api 336, dashboard 1191 tests passed; `pnpm run type-check` 19/19; `pnpm beech test` 18/18 (first run flaked under load, rerun green); `pnpm run lint` 20/20; `lint:tests` OK; `graphify update .` OK.

Not run: final manual browser check (`pnpm beech dev`, steps 1–4 of SECTION 5).
