# Execution Log — ManageLayoutPermissionUi

Branch: `feature/manage-layout-permission-ui` (cut from `feature/manage-layout-permission-api`, as the plan states). Nothing committed.

## SECTION 6 — ACCEPTANCE CRITERIA

- [x] The Customize button and the builder mount are gated by core `isDashboardLayoutEditor`. A seed-scoped `manage_layout` does not open them.
- [x] A non-`manage_roles@*` author:
  - [x] sees no add, rename, delete or reorder tab control, no audience picker and no Reset;
  - [x] never requests `GET /api/dashboard-layout/roles`;
  - [x] cannot save when nothing is stored, and sees `firstSaveNeedsRoles`.
- [x] A `manage_roles@*` author keeps every control and behaviour shipped by sprints 3–5.
- [x] A `core/locked` widget renders as an opaque card that cannot be dragged, configured, removed or moved, and shows no type, seed or config.
- [x] A section holding a locked widget cannot be removed. No column preset or draft op moves a locked widget out of its column. A duplicated section contains no placeholder.
- [x] The builder preview equals `filterDashboardLayoutByWidgetRequirements` of the active page, and never shows a placeholder.
- [x] `SeedSelect` lists only seeds the author may `content:read`, via `usePermissions().can`.
- [x] A 409 `layout-conflict` on save or reset opens the conflict prompt:
  - [x] Confirm refetches and rebuilds the draft from the new version;
  - [x] Cancel keeps the draft.
- [x] Every opening of the builder fetches the current version. Focus and reconnect never discard a draft.
- [x] `isLockedWidget` / `lockedColumnFloor` match the T2 signatures, and `useLayoutRoles` / `BuilderPaneProps` / `PageTabsManagerProps` match T5/T7 exactly.
- [x] No file under `packages/` or `apps/api/` changes. No import of `features/rbac` from the dashboard slice. No authorization rule is re-implemented in the UI.
- [x] The five locale keys exist in both `en.json` and `it.json`.
- [x] Every SECTION 5 command passes, and every T9 test exists and passes. Fixture-only changes (`config-fields`, `builtin-widgets`, `empty-column-drop`, `page-tabs-manager` renders) and the replaced `L150` conflict test are listed below for the PR.

Fixture changes to flag in the PR:
- `config-fields.test.tsx`, `builtin-widgets.test.tsx`: `settings.me` mock with `FULL_AUTHORITY` (SeedSelect now reads permissions).
- `empty-column-drop.test.tsx`: `hasStoredLayout` on both harnesses.
- `page-tabs-manager.test.tsx`: `canEditStructure` on `renderManager` (defaults true).
- `section-card.test.tsx`: dropdown-menu mock forwards `disabled` as `aria-disabled` and skips `onSelect` when disabled.
- `builder-pane.test.tsx`: `me` and `getLayout` rpc mocks are now per-test configurable.
- `dashboard-builder-dialog.test.tsx`: old `L150` toast-on-409 test replaced by the conflict-prompt test.

## SECTION 5 — VALIDATION

1. `pnpm run build` in `packages/core/`: exit 0.
2. `npx tsc --noEmit` in `apps/dashboard/`: `TypeScript: No errors found`.
3. `npx vitest run src/features/dashboard src/features/rbac`: 276 passed, 0 failed.
4. `pnpm beech test --diff`: `PASS Tests: every selected test run passed.` / `PASS Coverage: all 13 changed file(s) meet the changed-line threshold.` (apps/api integration: 96 files, 725 tests passed. `dashboard-layout.handler.ts` is NOT MEASURED, a workerd-tier limitation, and is not touched by this sprint.)
5. `pnpm beech lint`: `Tasks: 19 successful, 19 total`.
6. Invariant greps, each 0 matches:
   - `features/rbac` in `apps/dashboard/src/features/dashboard`: 0
   - `canGlobally("manage_roles")` in `apps/dashboard/src/features/dashboard/pages`: 0
   - `user\.role|isDeveloper` in non-test dashboard-slice files: 0
   - `git diff --stat feature/manage-layout-permission-api -- packages apps/api`: empty
7. `graphify update . --force`: `Rebuilt: 29075 nodes, 41868 edges, 2880 communities`.

Manual check (`pnpm beech dev`, two browsers) not run here.
