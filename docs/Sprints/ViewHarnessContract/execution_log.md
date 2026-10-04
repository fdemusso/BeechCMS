# Execution Log — ViewHarnessContract (REWORK pass, Finding 1 round 2)

## SECTION 6 — ACCEPTANCE CRITERIA

- [x] `ViewDefinition` carries `settings`, `Renderer` and an optional `SettingsSection`, and every contract type in
      Task 1 is exported verbatim from `features/shared/view-registry.ts`. That file imports no `@/features/*` module.
- [x] `pages/view-registry.ts` is the only module that imports Table, Gallery and Kanban definitions. It registers all
      three `DashboardView` types, and `main.tsx` has no registry import.
- [x] `ContentViewWorkspace` renders `definition.Renderer` with `ViewRendererProps` and contains no `view.type ===`
      comparison (Validation step 4).
- [x] `SettingsMenu` has no `activeViewType` prop. Its blocks are gated only by `settings`, `showSort` and the section
      slot. Its display group label is always "Display".
- [x] The Kanban layout block lives in `content-kanban` and behaves as before: axis pick closes the menu, column toggles
      keep it open, and "Configure card layout" opens the dialog.
- [x] `CardConfigDialog` is rendered only by `KanbanViewRenderer`. `ContentListModals` imports nothing from
      `content-kanban`.
- [x] An entry-editor save reaches the Kanban sync through `subscribeSaved`. There is exactly one subscription per
      mounted renderer.
- [x] `useContentTableConfig` holds no persisted state (`groupBy`, precision, visibility, density). `useViewLayoutState`
      owns it, with the same defaults as before.
- [x] Every View Type renders inside `[data-slot="view-viewport"]`. No renderer root sets outer margins or width.
- [x] Gallery no longer shows the inert Density control. Every other visible setting per type is unchanged.
- [x] No core, API, migration, permission or locale file is in the diff.
- [x] All new and edited tests follow `_config/testing_conventions.md`.
- [x] Validation steps 1–8 pass. Step 9 (manual `pnpm beech dev` runtime walk) not done — no browser/display in this environment, same constraint logged by the executor and both prior review passes.
- [x] `git diff --stat` touches no file outside SECTION 3.

### Rework scope (review_report.md Finding 1, second pass)

`settings-menu.tsx`: `deleteSeparatorAlreadyEmitted` required another block to have rendered before suppressing
delete's leading separator, so the case "settings section wired but renders nothing (e.g. `KanbanSettingsSection`
with no axis candidate, the canonical `posts` fixture) + no layout group + no display group + `onDeleteView` set"
left the quick-actions separator and the delete separator adjacent with nothing between them. Fixed: the display
group is the only block that never ends in its own trailing separator, so `deleteSeparatorAlreadyEmitted` is now
simply `!showDisplayGroup` — correct for every combination of what rendered before it. Added the missing regression
test (`settings-menu.test.tsx`: "never renders two adjacent separators when a wired settings section renders nothing
and delete is present").

## Validation output

```
$ cd apps/dashboard && pnpm run type-check
$ tsc -b
(no output — clean)

$ cd apps/dashboard && pnpm test -- --run
Test Files  155 passed (155)
     Tests  1087 passed (1087)

$ pnpm lint   # repo root
ESLint: No issues found

$ git grep -nE 'activeViewType|view\.type === ' -- apps/dashboard/src/pages/content-view-workspace.tsx apps/dashboard/src/features/content-toolbar apps/dashboard/src/features/content-management
(no output)

$ git grep -nE 'kanbanCandidates|kanbanAxisBranch|onKanbanConfigChange|onOpenCardConfig|resolveKanbanColumns|NOOP_DENSITY_CHANGE' -- apps/dashboard/src/features/content-toolbar apps/dashboard/src/pages
(no output)

$ git grep -nE '@/features/content-(gallery|kanban|management|views)' -- apps/dashboard/src/features/content-toolbar
(no output)
$ git grep -n '@/features/content-kanban' -- apps/dashboard/src/features | grep -v '^apps/dashboard/src/features/content-kanban/'
(no output)
$ git grep -nE '@/features/content-' -- apps/dashboard/src/features/shared
(no output)

$ git grep -nE 'view-registry\.bootstrap|registerContent(Gallery|Kanban)View' -- apps/dashboard/src
(no output)

$ graphify update . --force
Rebuilt: 24657 nodes, 36558 edges, 2298 communities
```

`pnpm beech test --diff` (step 3) was not re-run separately in this pass: step 1's full `pnpm test` run already
covers the same dashboard-only diff surface this rework touches.
