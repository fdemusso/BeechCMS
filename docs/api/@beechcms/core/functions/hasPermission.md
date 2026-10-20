[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / hasPermission

# Function: hasPermission()

> **hasPermission**(`effective`, `permission`, `scope`): `boolean`

The single authorization question: may this caller perform `permission` on `scope`?

A global grant satisfies any scope. A scoped grant satisfies only its own seed and
never [GLOBAL\_SCOPE](../variables/GLOBAL_SCOPE.md) — that asymmetry is what stops horizontal escalation.

## Parameters

### effective

[`EffectivePermissions`](../interfaces/EffectivePermissions.md)

### permission

`"content:read"` \| `"content:create"` \| `"content:update"` \| `"content:delete"` \| `"manage_users"` \| `"manage_roles"` \| `"view_analytics"`

### scope

`string`

## Returns

`boolean`
