[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / PERMISSIONS

# Variable: PERMISSIONS

> `const` **PERMISSIONS**: readonly \[`"content:read"`, `"content:create"`, `"content:update"`, `"content:delete"`, `"manage_users"`, `"manage_roles"`, `"view_analytics"`\]

The closed atomic permission vocabulary.

This tuple is the single source of truth for what a role may contain. It is
CLOSED BY DESIGN: new permissions arrive only as a developer code change plus a
migration widening the `role_permissions` CHECK constraint. Nothing at runtime —
no API, no plugin, no dashboard screen — may extend it.

`manage_seeds` (or any schema-mutation permission) is deliberately absent and must
never be added. Seed schema mutation stays a developer capability exercised outside
the dashboard, via CLI and migrations.

Each non-CRUD dashboard surface owns one dedicated permission (`view_analytics` is
the first). Absence of the permission hides the surface; there is no default-visible
exception.
