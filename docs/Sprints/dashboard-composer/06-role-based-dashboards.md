# Dashboard Composer — Sprint 06: Role-targeted Tabs (superseded design)

## Status

The original design was not kept: per-role layout scopes (`role:admin` / `role:editor`) resolved from the JWT `role` claim, with a scope switcher in the builder. It was replaced by a single `default` layout whose tabs carry target role ids. Rows stored under `role:*` are ignored.

## Shipped model

- **Audience.** Each tab may list target role ids. No list, or an empty one, means everyone. Otherwise a caller sees the tab when they hold at least one listed role through an active assignment, at any scope. A caller with several roles sees the union of their tabs.
- **Server-side filtering.** The server filters before serving. Widgets on seeds the caller cannot read are dropped, and so are tabs or sections left with nothing usable. The layout is never the authority: data routes enforce RBAC on their own.
- **Role-id validation.** A role id that does not exist is refused at save (`422`). A role deleted later leaves an orphan id that grants nothing. No cleanup runs (fail-closed).
- **Permission split.** `manage_layout` at `*` edits the content of every tab. Structure (tabs, labels, target roles), the first save and reset need `manage_roles` at `*`, which also sees every tab. Widgets an editor cannot use appear as locked placeholders and are preserved on save.
- **Compare-and-swap.** Every write carries the version the editor loaded. A stale save is refused (`409 layout-conflict`) and the editor reloads.

## Where to read more

- [Dashboard Layout reference](../../reference/dashboard-layout.md)
- [Roles & Permissions](../../manage/roles-permissions.md)
- Archived plans: [DashboardTabAudienceApi](../DashboardTabAudienceApi/), [DashboardTabAudienceUi](../DashboardTabAudienceUi/), [WidgetPermissionRequirements](../WidgetPermissionRequirements/), [ManageLayoutPermissionApi](../ManageLayoutPermissionApi/), [ManageLayoutPermissionUi](../ManageLayoutPermissionUi/)
