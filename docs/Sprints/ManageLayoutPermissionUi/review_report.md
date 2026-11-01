# Verdict
PASS

(The runtime check in SECTION 5 was not run. See Verification Evidence. Please run that manual check before merging.)

# Findings
No blocking findings. Two non-blocking notes:

1. `apps/dashboard/src/features/dashboard/test/unit/dashboard-builder-dialog.test.tsx`, test "reloading from the conflict prompt refetches the layout and the next save sends the new version as If-Match":
   - It has two acts (the reload click and the second Save), which bends testing_conventions Rule 2.1.
   - SECTION 4 T9 prescribes this exact test, so it is not a defect of the implementation.
   - If it is ever split, put the reload in ARRANGE and keep the second Save as the only ACT.
2. The `PageTabPill` Enter/Space path with `canEditStructure=false` (T5: "clicking a pill, or Enter/Space on it, still calls `onSetActive`") has no test.
   - Only click is covered, which the plan's T9 list also covers.
   - The code is correct: the `onKeyDown` handler at `page-tabs-manager.tsx:~140` runs outside `useSortable`.
   - A keyboard test would be a cheap addition.

# Verification Evidence

Diff basis: the work is uncommitted on `feature/manage-layout-permission-ui`. I reviewed `git diff` of the working tree against `HEAD` (`5441a90d`) plus the untracked `locked-widgets.ts` and `locked-widgets.test.ts`. `git log devs..HEAD` lists the sprint 1–5 commits because `devs` lacks them. The plan records this as a known deviation.

SECTION 5 commands, re-run by me:
1. `pnpm run build` in `packages/core`: ran `tsc`, no errors.
2. `npx tsc --noEmit` in `apps/dashboard`: `TypeScript: No errors found`.
3. `npx vitest run src/features/dashboard src/features/rbac`: the JSON report shows 276 tests, 276 passed, 0 failed, 95 suites, `success: true`.
4. `pnpm beech test --diff`:
   - apps/api integration: 96 files, 725 tests passed.
   - `PASS Tests`, and `PASS Coverage: all 13 changed file(s) meet the changed-line threshold`.
   - `dashboard-layout.handler.ts` is NOT MEASURED (workerd tier). This sprint does not touch it (see grep 4).
5. `pnpm beech lint`: `Tasks: 19 successful, 19 total`. Turbo served this from cache (`FULL TURBO`), so lint did not run fresh. Cached hashes cover the current inputs.
6. Invariant greps:
   - `features/rbac` in `apps/dashboard/src/features/dashboard`: 0 matches.
   - `canGlobally("manage_roles")` in `features/dashboard/pages` (fixed-string grep; my first regex attempt errored): 0 matches.
   - `user\.role|isDeveloper` in non-test dashboard-slice files: 0 matches.
   - `git diff --stat feature/manage-layout-permission-api -- packages apps/api`, plus `git status --short packages apps/api`: both empty.
7. `graphify update . --force`: not re-run by me. The graph is not an input to the verdict.

Scope check: `git diff --name-only` outside `apps/dashboard/src/features/dashboard`, `apps/dashboard/src/locales` and `ROADMAP.md` is empty.
- The `ROADMAP.md` edit is the pipeline's bookkeeping (entry 5 marked SHIPPED, entry 6 annotated).
- No file under `packages/`, `apps/api/`, `docs/`, `features/rbac/` or `features/shared/` is touched.

Code review (manual read of the full production diff, 11 files + new `locked-widgets.ts`):
- T1 `dashboard-page.tsx`: the gate is core `isDashboardLayoutEditor(effective)`.
- T2 `locked-widgets.ts`: signatures match the plan verbatim. `isLockedWidget` compares against `LOCKED_WIDGET_TYPE`. `lockedColumnFloor` is the last locked column index plus one.
- T3 `use-dashboard-builder.ts`:
  - `duplicateSection` filters locked widgets out of the clone before re-id'ing.
  - `setColumnPreset` returns `d` unchanged when `targetCount < lockedColumnFloor(section)`.
- T4:
  - `WidgetChip` renders the opaque Lock card with no grip, menu, badge or `widget.type`.
  - `useSortable` is still called before the early return, with `disabled: { draggable: locked }`, so hook order holds and the card stays a drop target.
  - `SectionCard` hides Remove when the floor is above 0 and disables presets below the floor.
- T5:
  - `BuilderPaneProps.hasStoredLayout` and `PageTabsManagerProps.canEditStructure` match the plan.
  - `canEditStructure` is core `hasPermission(permissions, 'manage_roles', GLOBAL_SCOPE)`.
  - Add Page, the tab dropdown, `PageAudiencePicker` and Reset are all gated.
  - The `page:` drag branch is guarded.
  - Save is disabled and the notice is shown when `!canEditStructure && !hasStoredLayout`.
  - The preview uses `filterDashboardLayoutByWidgetRequirements` with `widgetRequirementOf`, memoized.
- T6 `SeedSelect`: filtered with `can('content:read', slug)` from `usePermissions`. Props are unchanged.
- T7:
  - `useLayoutRoles(enabled = true)` matches the plan signature.
  - The roles fetch is gated by `hasPermission(manage_roles, *)`.
  - The builder query has `staleTime: 0`, `refetchOnWindowFocus: false`, `refetchOnReconnect: false`, and the loader is `isFetching || permissionsLoading`.
  - A 409 `layout-conflict` in save and in reset calls `onConflict()` with no toast.
  - `ConfirmDialog` confirm closes the prompt, invalidates the layout key and refetches. Cancel only closes it.
- T8: the five locale keys exist in both `en.json` and `it.json`, with the exact plan strings.
- No authorization rule is re-implemented: every gate resolves to core `hasPermission` / `isDashboardLayoutEditor`.

Test audit (§8 checklist):
- Tier: all files are dashboard unit tier. `locked-widgets.test.ts` has the `// @vitest-environment node` pragma on line 1.
- Mocks: they stop at the `@/lib/rpc`, `sonner` and dropdown-menu boundary.
- Grep over added test lines for `useFakeTimers`, `any`, `.skip`, `.only`, `setTimeout`, `ARRANGE/ACT/ASSERT` labels, `toBeTruthy`, `toBeDefined` and snapshots: no violation. The one hit was the English word "any" in a test title.
- Every test T9 lists is present. The L150 toast-on-409 test was replaced by the conflict-prompt test, as the plan states.
- Assertions are specific. Examples: `If-Match: "<version>"`, `toHaveLength(sectionsBefore + 1)`, and `toEqual` on the verdict arrays.
- The always-open dropdown mock makes the `queryAllByRole("menuitem")` absence assertion meaningful.
- Fixture-only changes are the ones the plan names: `config-fields`, `builtin-widgets`, `empty-column-drop`, `page-tabs-manager`.
- The extra `section-card.test.tsx` change (the dropdown mock forwards `disabled`) is a mock extension needed to test disabled presets. The execution log flags it for the PR.

Acceptance criteria (SECTION 6): every item was checked against the code and tests above and holds. The "SeedSelect via `usePermissions().can`" and "no `features/rbac` import" items were additionally confirmed by grep.

Runtime verification: NOT PERFORMED.
- The Docker daemon was down (`docker info` failed) and nothing listened on 5173/5174/8787/3000.
- The plan's manual check needs the full dev stack and two browser sessions with different roles.
- The execution log also says it was not run.
- Behaviours still unproven in a real browser:
  - dnd-kit `disabled: { draggable: true }` leaving the locked card a drop target;
  - the real Radix `ConfirmDialog` stacking over the builder `Dialog`;
  - the loader-remount on conflict reload.
- Unit tests cover these under jsdom, with the dropdown primitive mocked.

# Sprint Documentation
- Shipped: the dashboard builder now follows the sprint-5 server contract.
  - `manage_layout@*` or `manage_roles@*` holders (core `isDashboardLayoutEditor`) get the Customize button.
  - Only `manage_roles@*` holders see the tab-structure controls, the audience picker and Reset. They are the only ones whose builder requests `GET /api/dashboard-layout/roles`.
  - A `manage_layout`-only author cannot save when nothing is stored, and sees a notice explaining why.
- `core/locked` placeholders render as an opaque "Widget unavailable" card: not draggable, configurable, removable or movable. A section holding one cannot be removed. `duplicateSection` omits placeholders from the clone. `setColumnPreset` refuses to shrink below the last locked column.
- The builder preview applies `filterDashboardLayoutByWidgetRequirements`, so it matches what the author sees on the dashboard. `SeedSelect` lists only seeds the author may `content:read`. Both items were deferred from sprint 4.
- The builder layout query is refetched on every opening, with focus and reconnect refetches off so a draft is never dropped. A 409 `layout-conflict` on save or reset opens a confirm prompt. Confirm refetches and rebuilds the draft from the new version, so edits are reapplied by hand. Cancel keeps the draft.
- Decisions: the lock signal is only the server placeholder (no client lock computation). There is no client structural pre-check. There is no automatic merge. There is no core or API change. `locked-widgets.ts` is builder-local.
- Deviations: none from the plan. The branch was cut from `feature/manage-layout-permission-api` because `devs` lacks sprints 1–5 (same as sprints 4–5).
- Known limitations:
  - Custom widgets with an unmet `requires` are not locked, because the server cannot see them.
  - An existing `SeedSelect` value the author cannot read shows an empty trigger and is preserved.
  - A conflict reload discards the whole draft.
  - The two-browser manual check was not run at review time.
