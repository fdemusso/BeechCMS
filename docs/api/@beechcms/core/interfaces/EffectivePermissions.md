[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / EffectivePermissions

# Interface: EffectivePermissions

A caller's resolved authority, computed once per request from their active
assignments. Purely additive: there is no negative permission and no conflict
resolution between roles.

## Properties

### byScope

> **byScope**: `ReadonlyMap`&lt;`string`, `ReadonlySet`&lt;`"content:read"` \| `"content:create"` \| `"content:update"` \| `"content:delete"` \| `"manage_users"` \| `"manage_roles"` \| `"view_analytics"`&gt;&gt;

Permissions held at a specific seed slug, keyed by that slug.

***

### global

> **global**: `ReadonlySet`&lt;`"content:read"` \| `"content:create"` \| `"content:update"` \| `"content:delete"` \| `"manage_users"` \| `"manage_roles"` \| `"view_analytics"`&gt;

Permissions held at [GLOBAL\_SCOPE](../variables/GLOBAL_SCOPE.md); they apply to every seed.
