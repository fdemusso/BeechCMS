[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / permissionsForScope

# Function: permissionsForScope()

> **permissionsForScope**(`effective`, `scope`): `ReadonlySet`&lt;`"content:read"` \| `"content:create"` \| `"content:update"` \| `"content:delete"` \| `"manage_users"` \| `"manage_roles"` \| `"view_analytics"`&gt;

Returns everything the caller may do within one scope: the union of their global
permissions and the permissions granted on that specific seed.

## Parameters

### effective

[`EffectivePermissions`](../interfaces/EffectivePermissions.md)

### scope

`string`

## Returns

`ReadonlySet`&lt;`"content:read"` \| `"content:create"` \| `"content:update"` \| `"content:delete"` \| `"manage_users"` \| `"manage_roles"` \| `"view_analytics"`&gt;
