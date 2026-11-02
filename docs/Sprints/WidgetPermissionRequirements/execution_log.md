# Execution log — WidgetPermissionRequirements

Branch: `feature/widget-permission-requirements`, created from `feature/dashboard-role-aware-layout` (not `devs`: sprints 1–3 live only there). No commit made.

## SECTION 6 — ACCEPTANCE CRITERIA

- [x] `WidgetRequirement`, `WidgetRequirementLookup`, `isWidgetRequirementMet`, `resolveCoreWidgetRequirement`, `filterDashboardLayoutByWidgetRequirements` exported from `@beechcms/core` with the T1 signatures.
- [x] `resolveCoreWidgetRequirement` implements the T1 table exactly; `core/stat` follows `seedSlug` → `statKey`.
- [x] `widget-requirements.ts` imports only `../rbac/*` and types from `./dashboard-layout.js`.
- [x] `generateDefaultDashboardLayout(seeds, permissions, opts?)`:
  - [x] `permissions` mandatory
  - [x] output holds only widgets `permissions` can use
  - [x] seed bindings use readable seeds only
  - [x] `pages: []` when nothing survives
- [x] `WidgetDefinition.requires?: WidgetRequirement` added; `WidgetRequirement` re-exported by `@beechcms/widget-sdk`; no built-in registration sets `requires`.
- [x] Dashboard renders only widgets whose requirement is met:
  - [x] emptied section/tab not rendered
  - [x] first-visible-tab fallback and empty state unchanged
  - [x] nothing renders until layout and `/me` resolved
- [x] Builder palette omits unusable widgets; empty category loses its heading.
- [x] Builder draft never projected.
- [x] Every UI requirement decision goes through `widgetRequirementOf` + core `isWidgetRequirementMet`.
- [x] Zero changes under `apps/api/`. API `tsc` errors: 51 after rebuilding core `dist`; 0 of them in dashboard-layout / widget-requirements code. (First reading of 80 was taken against a stale core `dist`.)
- [x] `filterDashboardLayoutForViewer` and its tests byte-identical.
- [x] Every SECTION 5 command passes; every T8 test exists and passes.
- [x] Changed test arrangements (`/me` mocks, full-authority generator argument) change no existing assertion.
- [x] `docs/build/custom-widgets.md` documents `requires`.

## SECTION 5 — VALIDATION

1. `pnpm run build` in `packages/core/`, `packages/widget-sdk/`: exit 0.
2. `npx vitest run src/dashboard-layout` in `packages/core/`: 9 files, 198 tests passed.
3. `npx vitest run` in `packages/widget-sdk/`: 2 files, 8 tests passed.
4. `npx tsc --noEmit` in `apps/dashboard/`: No errors found.
5. `npx vitest run src/features/dashboard` in `apps/dashboard/`: 30 files, 210 tests passed.
6. `npx tsc --noEmit | grep -c "error TS"` in `apps/api/`: 51 (plan reference: 51).
7. `pnpm beech test --diff`: PASS (96 files, 706 tests; changed-line coverage PASS).
8. `pnpm beech lint`: 19/19 tasks successful.
9. Invariant greps: all 0 matches (`requires` in `builtin-widgets.tsx`; `features/rbac` in dashboard slice; `usePermissions` in `builder-pane.tsx` / `widget-picker-dialog.tsx`; `git diff --stat -- apps/api` empty).
10. `graphify update .`: done (29 030 nodes, 41 738 edges).

Manual check (`pnpm beech dev`, two browsers): not run.
