# Verdict
PASS

# Findings

None blocking. One non-blocking observation:

1. **`apps/dashboard/src/features/content-toolbar/toolbar-components/settings-menu.tsx:657-672` — a trailing separator can render with nothing below it, not a doubled separator.**
   This is a different shape than the two prior rounds' Finding 1 (which was about *adjacent* separators) and the sprint's own conformance rule only requires "no two separators may end up adjacent" — that rule now holds in every combination I traced (see Verification Evidence). The residual case is: `settingsSectionNode` falsy, `showLayoutGroup` false, `showDisplayGroup` false, and `onDeleteView` **undefined** (no delete permission). Then the unconditional separator at line 343 renders with nothing after it — a single stray divider at the bottom of the menu, cosmetic only. `onDeleteView` is optional at `ContentViewWorkspace`/`ContentToolbar` (`content-toolbar.tsx:287`: `onDeleteView ? () => onDeleteView(activeView.id) : undefined`), so this is reachable for a user without delete rights viewing a Kanban view with no axis candidates yet. Not a regression introduced by this sprint — the same unconditional separator existed before this refactor — and out of scope for the plan's own acceptance bar. Flagging for awareness only; does not block.

# Verification Evidence

Independent re-run, from a clean shell, of every SECTION 5 step:

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
Rebuilt: 24651 nodes, 36552 edges, 2297 communities
```

**Finding-1 fix (second rework) verified by hand-trace, not just by the new test.** Read `settings-menu.tsx` end to
end and enumerated every reachable combination of `settingsSectionNode` (truthy/null), `showLayoutGroup`,
`showDisplayGroup` and `onDeleteView`:
- `showDisplayGroup` true → `deleteSeparatorAlreadyEmitted = false` → delete gets its own separator. Correct: the
  display group is the one block that never ends in its own trailing separator.
- `showDisplayGroup` false, `showLayoutGroup` true (any section state) → layout group's own trailing separator
  (`settings-menu.tsx:522`) already precedes delete; `deleteSeparatorAlreadyEmitted = true` correctly suppresses a
  second one.
- `showDisplayGroup` false, `showLayoutGroup` false, `settingsSectionNode` truthy → the section's own trailing
  separator (`:349`) already precedes delete; correctly suppressed.
- `showDisplayGroup` false, `showLayoutGroup` false, `settingsSectionNode` falsy (the exact repro from the prior
  review round: `KanbanSettingsSection` returning `null` for the canonical `posts` fixture) → nothing renders between
  the quick-actions separator (`:343`) and delete; `deleteSeparatorAlreadyEmitted = true` correctly suppresses the
  second separator, leaving exactly one. **This is the path the previous round's fix missed; it is fixed now.**

Confirmed `DropdownMenuSeparator` renders `data-slot="dropdown-menu-separator"`
(`apps/dashboard/src/components/ui/dropdown-menu.tsx:189`), which is what the new regression test
(`settings-menu.test.tsx`: "never renders two adjacent separators when a wired settings section renders nothing and
delete is present") asserts against via `separator.nextElementSibling` — a structurally sound adjacency check,
independent of which branch produced the DOM.

**Plan conformance**, read against SECTION 3/4 line by line:
- `features/shared/view-registry.ts`: Task 1's contract types present byte-for-byte (`ViewSetting`,
  `ViewQueryState`, `ViewLayout`, `ViewEntrySavedInfo`, `ViewEntryActions`, `ViewRendererProps`,
  `ViewSettingsSectionProps`, `ViewDefinition`), imports no `@/features/*` module.
- `pages/view-registry.ts`: `ViewRegistryImpl` moved unchanged; registers `TABLE_VIEW_DEFINITION`,
  `GALLERY_VIEW_DEFINITION`, `KANBAN_VIEW_DEFINITION` at module load, in that order; `main.tsx:25`'s bootstrap
  import is gone.
- `pages/content-view-workspace.tsx`: `useViewLayoutState` replaces the old local states; `definition =
  viewRegistry.get(view.type)`; renders `definition.Renderer` generically with no `view.type ===` branch outside
  `toContentViewConfig(…, view.type)`; `subscribeSaved`/`handleSaved` via a ref-backed `Set`; `ContentListModals`
  gets `onSaved={handleSaved}` and none of the deleted kanban props.
- `content-table-renderer.tsx` / `gallery-view-renderer.tsx` / `kanban-view-renderer.tsx` /
  `kanban-settings-section.tsx`: prop mappings match Tasks 5–7 exactly, including the kanban save-sync's ref pattern
  (`useKanbanEntrySync` result stored in a ref, subscribed once via `entries.subscribeSaved`) and `CardConfigDialog`
  hosted only inside `KanbanViewRenderer`.
- `use-view-layout-state.ts` / `use-content-table-config.ts`: the persisted fields (`groupBy`, `dateGroupPrecision`,
  `columnVisibility`, `density`, `conditionalFormats`, `kanban`, `card`) live only in the new hook; the table hook
  is reduced to table-only derived state and takes `layout` instead of `activeView`; `defaultHiddenColumns` is
  shared via `lib/dynamic-columns.tsx` exactly as specified in Task 2.
- `content-toolbar.tsx` / `settings-menu.tsx` / `types.ts`: kanban props gone from `ContentToolbarProps`;
  `settings={activeView.settings}`, `showSort={isToolEnabled("sort")}`, `renderSettingsSection` forwarded; viewport
  named `data-slot="view-viewport"` (`content-toolbar.tsx:334`).
- `pages/content-list.tsx` / `drafts-list.tsx`: `settings` added to `switcherViews`
  (`viewRegistry.get(view.type)?.settings ?? DEFAULT_VIEW_SETTINGS`) and to the single drafts view
  (`DEFAULT_VIEW_SETTINGS`).
- Deletions: `features/content-toolbar/view-registry.ts`, `view-registry.bootstrap.ts`, and its test are gone,
  confirmed by the grep above; their two cases moved into `test/cross-slice/view-registry.test.ts`.
- All new/edited test files: SPDX header, correct tier/placement, four-zone anatomy, canonical `posts` fixture (or a
  one-field delta with its reason commented, e.g. the injected `metadata` branch in `dynamic-columns.test.tsx` and
  `allowDrafts: false` in `kanban-settings-section.test.tsx`), no `any`, no fake timers.

**On the width of the raw `git diff`:** the working tree also contains sprints 1–3 (`ContentViewsPersistence`,
`ViewInstancesDashboard`, `ViewSwitcherRedesign`) and the whole API/core persistence layer, still uncommitted per
the plan's own Precondition note. None of that is this sprint's doing — traced several of the largest outliers
(`view-switcher.tsx` drag-and-drop, `use-content-list-query.ts`'s filter persistence, `lib/filter-dsl.ts`,
`lib/content-api.ts`'s view-config endpoint removal, the locale additions for the view picker/switcher/template
menu, `use-kanban-view-config.ts`'s deletion) back to decisions the feature brief attributes to earlier sprints
(per-slug Kanban config explicitly discarded, drag-reorder and the view-type picker are Sprint 2/3 deliverables),
confirmed none of it intersects SECTION 3's file list or this sprint's own Tasks. SECTION 3's own files match the
plan's Create/Edit/Delete lists exactly, including the two incidental `UserViewInstance` fixture updates
(`toolbar-hooks.test.ts`, `automation-panel.test.tsx`) the prior review already adjudicated as harmless.

Step 9 (manual `pnpm beech dev` runtime walk) was not performed — no browser/display available in this environment,
the same constraint the executor and both prior review rounds logged.

# Sprint Documentation

ViewHarnessContract (Sprint 4 of 6, Saved Views) turns `ViewDefinition` into the real harness contract:
`features/shared/view-registry.ts` now carries `settings`, `Renderer` and an optional `SettingsSection`, with
`pages/view-registry.ts` as the sole composition root registering Table/Gallery/Kanban. `ContentViewWorkspace`
renders `definition.Renderer` generically — no `view.type ===` branch remains outside the registry lookup and the
persistence-mapping call. `useContentTableConfig` was reduced to table-only derived state; the new
`useViewLayoutState` (in `content-views`) owns the shared per-instance layout (groupBy, date precision, column
visibility, density, conditional formats, kanban config, card config). `SettingsMenu` lost `activeViewType` and the
five kanban-specific props, replaced by a declarative `settings: ViewSetting[]` list, `showSort`, and a
`renderSettingsSection` slot; Kanban's layout block moved into
`content-kanban/components/kanban-settings-section.tsx`. `CardConfigDialog` now lives only in `KanbanViewRenderer`;
`ContentListModals` no longer imports from `content-kanban`. Two production cross-slice edges were removed
(`content-toolbar → content-gallery`/`content-kanban` via the old bootstrap, and `content-management →
content-kanban` via the modals) with none added. Gallery dropped its inert Density control.

**Resolved this pass:** the adjacent-separator defect (prior review's Finding 1) is fixed for the path the second
round's partial fix missed — a wired `SettingsSection` that renders `null` (Kanban with no axis candidate, e.g. the
canonical `posts` fixture) combined with a present, enabled delete item. `deleteSeparatorAlreadyEmitted` is now
`!showDisplayGroup`, which holds correctly across every render-path combination (traced above), backed by a
regression test exercising the exact repro.

**Known non-blocking cosmetic gap:** a lone trailing separator (not a double) can render at the bottom of the menu
when no settings content and no delete item render at all (no-delete-permission + Kanban-with-no-candidates). See
Findings. Pre-existing structural behaviour, not introduced by this sprint, and outside the plan's own conformance
bar ("no two separators adjacent").

**Deferred as logged by the executor and both prior reviews:** two `UserViewInstance` test fixtures outside
SECTION 3 (`toolbar-hooks.test.ts`, `automation-panel.test.tsx`) needed `settings: []` once the field became
required — mechanical, no behavioural change, independently verified harmless (full suite green).

**Out of scope, unchanged:** universal element/conditional formatting on Gallery/Kanban cards (roadmap §5),
Gallery/Entry-Editor unification (§6), any new View Type runtime behaviour, and the kanban/card persistence mapping
rule.
