# Execution Log - Sprint 7: RbacContentActionGating

## Objectives
Implement UI cosmetic feedback for RBAC (Role-Based Access Control) inside the Dashboard. The goal is to disable interactive elements when the user lacks permissions, providing clear feedback via tooltips instead of completely hiding the affordances.

## Acceptance Criteria
- [x] Use `usePermissions()` and `hasPermission` across the UI to lock affordances for unauthorized users.
- [x] Standardize tooltip feedback over disabled buttons (`<TooltipTrigger asChild>` with `<span className="inline-flex">`).
- [x] Content List (`content-list.tsx`): Disable ContextMenu (Modifica / Elimina) and empty state CTA if lacking permissions. Pass `readonly` to `EntryEditorDialog`.
- [x] Dynamic Columns (`dynamic-columns.tsx`): Disable Modifica / Elimina, Modifica di gruppo, Elimina (selezione multipla) if lacking permissions.
- [x] Schema Form Shell (`schema-form-shell.tsx`): Disable the edit pencil / read-only override toggle.
- [x] Gallery Peek Panel (`gallery-peek-panel.tsx`): Disable the Modifica CTA.
- [x] Content Toolbar (`content-toolbar.tsx`): Disable `+ Nuova Voce` CTA.
- [x] Kanban Board (`content-kanban.tsx`, `kanban-column.tsx`): Disable column header `+`, empty state create buttons, and drag-and-drop based on `canUpdate` and `canCreate`.
- [x] Drafts List (`drafts-list.tsx`): Disable Publish / Discard Draft actions and new target selection in the Seed Picker dialog.
- [x] Automations Panel (`automation-panel.tsx`, `automation-row.tsx`, `automation-empty-state.tsx`): Disable new rule creation, toggling rules, and deleting rules without global `content:update` / `content:delete` (`*`) scopes.
- [x] Delete Dialog (`content-delete-dialog.tsx`): Disable the final confirmation button and show a tooltip if `!canDelete`.
- [x] Test Coverage: Mock `usePermissions` globally within failing test files to ensure all 848 tests pass smoothly without triggering TanStack Query errors.

## Execution Summary
All tasks outlined in the sprint plan were successfully completed. `hasPermission` was correctly mapped to the `can` method provided by `usePermissions()`. Tooltips were added wrapped in `span` elements for semantic validity with Radix UI disabled elements. Tests were run and fully green after mocking `usePermissions` in component test environments that were lacking the `QueryClientProvider` tree context. AST sync with `graphify update .` completed successfully.
