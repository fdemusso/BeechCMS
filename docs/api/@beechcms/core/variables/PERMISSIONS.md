[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / PERMISSIONS

# Variable: PERMISSIONS

> `const` **PERMISSIONS**: readonly \[`"content:read"`, `"content:create"`, `"content:update"`, `"content:delete"`, `"manage_users"`, `"manage_roles"`, `"view_analytics"`, `"manage_layout"`, `"manage_seeds"`\]

The closed atomic permission vocabulary.

This tuple is the single source of truth for what a role may contain. It is
CLOSED BY DESIGN: new permissions arrive only as a developer code change plus a
migration widening the `role_permissions` CHECK constraint. Nothing at runtime —
no API, no plugin, no dashboard screen — may extend it.

`manage_seeds` gates seed-schema mutation (`/api/seeds/*`, the dashboard Data Models
group). It is evaluated at the global scope only, so a seed-scoped grant confers
nothing. It replaces the former developer axis (`users.role = 'admin'`) as a deliberate
decision: whoever holds it (SuperAdmin by default) may change the schema, bounded by the
anti-escalation rule.

Each non-CRUD dashboard surface owns one dedicated permission (`view_analytics` is
the first). Absence of the permission hides the surface; there is no default-visible
exception.

`manage_layout` edits the content of every dashboard tab; it is evaluated at the global
scope only (a seed-scoped grant confers nothing on the dashboard).
