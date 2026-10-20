[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / permissionsHeldAnywhere

# Function: permissionsHeldAnywhere()

> **permissionsHeldAnywhere**(`effective`): `ReadonlySet`&lt;`"content:read"` \| `"content:create"` \| `"content:update"` \| `"content:delete"` \| `"manage_users"` \| `"manage_roles"` \| `"view_analytics"`&gt;

Every permission the actor holds at ANY scope — global or seed-scoped — folded into
one set.

This is deliberately NOT an authorization primitive: it answers "could this actor
ever grant X somewhere", not "may this actor do X here". Only [hasPermission](hasPermission.md)
and [canGrant](canGrant.md) answer the latter, and every route-level decision must keep
using them.

## Parameters

### effective

[`EffectivePermissions`](../interfaces/EffectivePermissions.md)

## Returns

`ReadonlySet`&lt;`"content:read"` \| `"content:create"` \| `"content:update"` \| `"content:delete"` \| `"manage_users"` \| `"manage_roles"` \| `"view_analytics"`&gt;
