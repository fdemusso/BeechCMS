### Pre-Computation Analysis

a) **God Nodes:** `usePermissions()` is the central god node for this sprint, governing the UI state across the entire `apps/dashboard`. Secondary god nodes include `apps/dashboard/src/pages/content-list.tsx` and `schema-form-shell.tsx` which serve as the primary routing points for content CRUD interactions.
b) **Affected Boundaries:** The scope is strictly contained within the UI layer (`apps/dashboard`). No changes will occur in `@beechcms/core` or `apps/api`.
c) **Impact Analysis (`graphify affected "usePermissions" --depth 2`):** `usePermissions()` is already imported by `AppSidebar`, `SettingsDialog`, and various dashboard pages. Broadening its usage to `content-toolbar`, `dynamic-columns`, `gallery`, `kanban`, and `drafts` introduces no breaking architectural changes. The UI will gracefully adapt through standard React state rendering (disabling elements natively via HTML `disabled` attributes).

### VETO Audit

The proposed plan adheres perfectly to the architectural invariants outlined in `ponytail_arch.md`. It introduces zero cross-imports between features. It does not introduce any D1 queries bypassing `@beechcms/core`, nor does it alter the API. Crucially, this sprint respects the binding decision from Sprint 6: HIDE sections a user cannot access (completed), but strictly DISABLE (never hide) actions inside sections a user can see. The VETO audit passes without requiring modifications.

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================
The API and middleware enforcement (Sprint 2) and the payload visibility constraints (Sprint 5/6) are fully complete. Currently, if an unauthorized user attempts an action (like updating an entry they can only read), the backend correctly blocks it. However, the dashboard UI still offers the interactive affordance, leading to a jarring user experience where clicks result in HTTP 403 errors. This sprint closes the loop by providing accurate, proactive visual feedback. We explicitly DISABLE—rather than hide—these affordances so users understand the feature exists but requires higher privileges, fulfilling the read-only persona requirement without obfuscating the product's capabilities.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================
The UI is fed by `usePermissions()`, which exposes `hasPermission(permission, scope)`.
The `EntryEditorDialog` (`apps/dashboard/src/features/entry-editor/components/entry-editor-dialog.tsx`) and `SchemaFormViewModel` already possess a `isReadOnly` state that natively disabled nested form fieldsets.
Action buttons across features (`content-toolbar`, `dynamic-columns`, `gallery-peek-panel`, `kanban-column`, `drafts-list`, `automations`) lack permission-based `disabled` states and do not present tooltips for missing privileges.
A proven Radix Tooltip pattern for explaining disabled buttons is established in `schema-form-shell.tsx`.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================
- `apps/dashboard/src/pages/content-list.tsx`
- `apps/dashboard/src/features/entry-editor/components/schema-form-shell.tsx`
- `apps/dashboard/src/features/content-toolbar/components/content-toolbar.tsx`
- `apps/dashboard/src/lib/dynamic-columns.tsx`
- `apps/dashboard/src/features/content-gallery/components/gallery-peek-panel.tsx`
- `apps/dashboard/src/features/content-kanban/components/kanban-column-virtualizer.tsx`
- `apps/dashboard/src/features/content-kanban/components/kanban-column.tsx`
- `apps/dashboard/src/pages/drafts-list.tsx`
- `apps/dashboard/src/features/automations/components/automations-tab.tsx`
- `apps/dashboard/src/features/content-delete-dialog/components/content-delete-dialog.tsx`

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================
Use `hasPermission` from `const { hasPermission } = usePermissions();` to drive visual states. Use the established `<Tooltip>` pattern from `schema-form-shell.tsx` for every disabled button, rendering the text: `Manca il permesso 'content:<action>'`.

1. **Entry Editor Read-Only Mode**:
   - `content-list.tsx`: Pass `readonly={!hasPermission('content:update', target.schemaSlug)}` to `EntryEditorDialog`.
   - `schema-form-shell.tsx`: For the `Pencil` icon button (which switches readonly back to edit mode), if `!hasPermission('content:update', target.schemaSlug)`, wrap it in the Tooltip, pass `disabled`, and prevent the `vm.setIsReadOnly(false)` toggle.

2. **Content Toolbar & List**:
   - `content-toolbar.tsx`: Disable the `+ Nuova Voce` button and the empty state CTA if `!hasPermission('content:create', currentSlug)`. Wrap with Tooltip.
   - `dynamic-columns.tsx`: Disable "Modifica" and "Modifica massiva" (`!canUpdate`); disable "Elimina" and "Elimina selezione" (`!canDelete`).
   - `content-list.tsx` (ContextMenu): Disable "Edit" (`!canUpdate`) and "Delete" (`!canDelete`).

3. **Gallery**:
   - `gallery-peek-panel.tsx`: Disable the "Modifica" button with Tooltip if `!hasPermission('content:update', target.schemaSlug)`. Pass `readonly={!canUpdate}` to `EntryEditorDialog` when clicking a card.

4. **Kanban**:
   - `kanban-column-virtualizer.tsx`: Add `disabled: !hasPermission('content:update', target.schemaSlug)` to `useSortable` parameters to lock drag-and-drop.
   - `kanban-column.tsx`: Disable the column `+` button and empty state CTA with Tooltip if `!hasPermission('content:create', target.schemaSlug)`.

5. **Drafts**:
   - `drafts-list.tsx`: Disable "Pubblica bozza" with Tooltip if `!hasPermission('content:update', target.schemaSlug)`. Disable "Scarta bozza" with Tooltip if `!hasPermission('content:delete', target.schemaSlug)`.
   - Disable Seed Picker dialog triggers if `!hasPermission('content:create', target.schemaSlug)`.

6. **Automations**:
   - `automations-tab.tsx`: Disable rule triggers, the create button, and the delete button if the user lacks global `'*'` authority for `content:update` / `content:delete`. Wrap with Tooltips.

7. **Delete Dialog**:
   - `content-delete-dialog.tsx`: Disable the Confirm button if `!hasPermission('content:delete', target.schemaSlug)`.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================
- `npx tsc --noEmit` in `apps/dashboard/`
- `pnpm run build` in `apps/dashboard/`
- `pnpm beech test --diff`

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================
- [ ] No button or interactive element is completely hidden; they are only set to `disabled`.
- [ ] Every disabled button is wrapped in the standard Radix Tooltip explaining the missing permission.
- [ ] Drag-and-drop in Kanban correctly halts natively when `content:update` is absent.
- [ ] The `readonly` prop successfully flows into `EntryEditorDialog` to lock down fieldsets.
- [ ] `tsc --noEmit` exits with 0 errors in `apps/dashboard/`.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================
- Altering any D1 schemas or API routing logic.
- Introducing new RBAC permissions or modifying `@beechcms/core`.
- Altering the "HIDE" behavior for top-level navigation sections (this sprint exclusively handles actions within visible sections).
