# Verdict
PASS

# Findings
None blocking. Two non-blocking notes for the human gate:

1. Runtime verification (SECTION 5 manual check, two browsers) was **not performed** by the executor or by this review. Unit and hook tests cover the logic, but the plan's UI checks are unproven in a live app: the `content:read@posts`-only account seeing no 403s, the tab disappearing for that account, and the builder palette for a `manage_roles@*` + `content:read@*` author. Run these before merging.
2. The work is uncommitted and the branch was cut from `feature/dashboard-role-aware-layout`, not `devs` (stated in the execution log). `git diff devs...HEAD` therefore does not contain this sprint. The review used `git diff HEAD` plus the untracked files instead.

# Verification Evidence
Commands run by me, not taken from `execution_log.md`:

- `pnpm run build` in `packages/core` and `packages/widget-sdk`: both exit 0.
- `npx vitest run src/dashboard-layout` in `packages/core`: 9 files, 198 tests passed.
- `npx vitest run` in `packages/widget-sdk`: 2 files, 8 tests passed.
- `npx tsc --noEmit` in `apps/dashboard`: exit 0, no errors.
- `npx vitest run src/features/dashboard` in `apps/dashboard`: 210 tests passed.
- `npx tsc --noEmit | grep -c "error TS"` in `apps/api`: **51**, equal to the baseline.
- `pnpm beech test --diff`: PASS on tests and on the changed-line coverage threshold (7 files). One file, `dashboard-layout.handler.ts`, is NOT MEASURED because it is workerd-tier only. It comes from earlier sprints on this branch base, not from this sprint.
- `pnpm beech lint`: 19/19 tasks successful.
- Invariant greps, all empty:
  - `requires` in `builtin-widgets.tsx`;
  - `features/rbac` in `apps/dashboard/src/features/dashboard`;
  - `usePermissions` in `builder-pane.tsx` and `widget-picker-dialog.tsx`;
  - `git diff HEAD --stat -- apps/api`;
  - `git diff HEAD --stat` on `dashboard-layout-audience.ts` and its test, so `filterDashboardLayoutForViewer` is byte-identical.
- Plan conformance, read from source:
  - `widget-requirements.ts` matches the T1 building blocks verbatim: the type unions, `WidgetRequirementLookup`, the four exports and the `core/stat` order (`seedSlug`, then `statKey`).
  - Its runtime imports are only `../rbac/*`. The import from `./dashboard-layout.js` is type-only, so there is no runtime cycle.
  - `generateDefaultDashboardLayout(seeds, permissions, opts?)` matches T2: `permissions` is mandatory, it works from `readableSeeds`, and it finishes by reusing `filterDashboardLayoutByWidgetRequirements`.
  - `requires?` and the `WidgetRequirement` re-export match T3.
  - `widgetRequirementOf` and `isWidgetDefinitionUsable` match T4.
  - T5: the hook projects the layout and combines the loading flag, and the page mounts the renderer only when `!isLoading`.
  - T6: only `DashboardBuilderDialog` calls `usePermissions`, the picker omits unusable widgets, and the draft is never projected.
  - T7: the docs subsection and the `requires` example line are present.
- Test audit (§8): all new and edited tests are unit tier, in slice or next to the source, and have the SPDX header. Each has one named ACT, a typed result and no `any`, fake timers, skips or conditional assertions. Core fixtures are built with the real `buildEffectivePermissions`, and dashboard fixtures with the real `hydrateEffectivePermissions`. The negative assertions use strings that exist in `en.json` ("Setup Checklist", "Media Gallery", "Stats", "Nothing to show yet"), so none is vacuous. The role fixtures in `widget-requirements.test.ts` are hand-built because core cannot depend on `@beechcms/testing`. The plan prescribes this and the file comments on it.
- Runtime verification: not performed (see finding 1).

# Sprint Documentation
Widget permission requirements (ROADMAP entry 4). Every widget now declares an optional requirement, and the dashboard evaluates it with one core evaluator in three places.
- Core (`widget-requirements.ts`): the `WidgetRequirement` vocabulary (`global-permission`, `seed-read`, `any-seed-read`), `isWidgetRequirementMet`, the built-in requirement table and the layout projection. `generateDefaultDashboardLayout` now takes a mandatory `permissions` argument. It binds seeds to readable ones only, and it may return `pages: []`.
- The widget SDK gained an optional `requires` for custom widgets (static union only).
- The dashboard hook projects the stored or generated layout and stays loading until `/me` resolves. The page renders nothing while loading.
- The builder palette omits widgets the author cannot use, and the builder draft is never projected, so saving cannot delete widgets.
- Decisions kept from the plan: the requirement table lives in core and `builtin-widgets.tsx` carries no `requires`. There is no server-side filtering (`filterDashboardLayoutForViewer` is unchanged, left to ROADMAP entry 5), and no locked-widget placeholder (left to entry 6).
- Deviations: none from the plan. The branch is based on `feature/dashboard-role-aware-layout`, not `devs`.
- Known limitation: the check is cosmetic. Data routes remain the enforcement point, and `StatWidgetAdapter`'s double fetch can still 403 harmlessly.
