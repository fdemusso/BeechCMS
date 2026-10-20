[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / hasPermissionAnywhere

# Function: hasPermissionAnywhere()

> **hasPermissionAnywhere**(`effective`, `permission`): `boolean`

Whether the actor holds `permission` on at least one scope.

Backs the coarse route gate for administration endpoints whose scope is not in the
URL: the gate keeps out callers with no administrative authority at all, and the
slice then makes the exact per-scope decision with [hasPermission](hasPermission.md) /
[canGrant](canGrant.md). Never use it as the final authorization check.

## Parameters

### effective

[`EffectivePermissions`](../interfaces/EffectivePermissions.md)

### permission

`"content:read"` \| `"content:create"` \| `"content:update"` \| `"content:delete"` \| `"manage_users"` \| `"manage_roles"` \| `"view_analytics"`

## Returns

`boolean`
