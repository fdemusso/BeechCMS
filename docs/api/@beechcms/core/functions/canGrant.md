[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / canGrant

# Function: canGrant()

> **canGrant**(`actor`, `targetScope`, `targetPermissions`): `boolean`

The anti-escalation rule: an actor may only hand out authority they already hold.

A grant is legal only when the actor holds every permission being granted, at the
scope it is being granted on. Consequently an actor scoped to seed X can never mint
a global assignment, and can never include a permission absent from their own set —
regardless of what the role itself contains.

## Parameters

### actor

[`EffectivePermissions`](../interfaces/EffectivePermissions.md)

The granting user's effective authority.

### targetScope

`string`

The scope the new assignment would apply to.

### targetPermissions

readonly (`"content:read"` \| `"content:create"` \| `"content:update"` \| `"content:delete"` \| `"manage_users"` \| `"manage_roles"` \| `"view_analytics"`)[]

The permissions carried by the role being assigned.

## Returns

`boolean`
