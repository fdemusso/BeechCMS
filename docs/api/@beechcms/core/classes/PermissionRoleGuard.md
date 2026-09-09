[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / PermissionRoleGuard

# Class: PermissionRoleGuard

Production guard: only a platform-wide administrator may delegate authority to an
OAuth/MCP client.

Every OAuth scope in this system (`schema:read`, `schema:write`) drives seed-schema
tooling, which brief §2 keeps OUT of the dashboard permission axis entirely — there is
deliberately no `manage_seeds` permission to map onto. So the question this guard
answers is not "which seed?" but "may this account hand platform authority to a
client at all?", and the marker for that is holding `manage_users` at
[GLOBAL\_SCOPE](../variables/GLOBAL_SCOPE.md) — the same SuperAdmin marker `countActiveGlobalAdmins()` uses.

A seed-scoped collaborator therefore cannot mint an MCP token, no matter which
scopes the client requests. Denial is all-or-nothing: there is no partial grant.

## Implements

- [`IRoleGuard`](../interfaces/IRoleGuard.md)

## Constructors

### Constructor

> **new PermissionRoleGuard**(): `PermissionRoleGuard`

#### Returns

`PermissionRoleGuard`

## Methods

### arbitrate()

> **arbitrate**(`effective`, `requestedScopes`): `Promise`&lt;[`ScopeGrantDecision`](../interfaces/ScopeGrantDecision.md)&gt;

#### Parameters

##### effective

[`EffectivePermissions`](../interfaces/EffectivePermissions.md)

The resource owner's effective permissions, already folded.

##### requestedScopes

readonly (`"schema:read"` \| `"schema:write"`)[]

Scopes the client asked for, already validated.

#### Returns

`Promise`&lt;[`ScopeGrantDecision`](../interfaces/ScopeGrantDecision.md)&gt;

#### Implementation of

[`IRoleGuard`](../interfaces/IRoleGuard.md).[`arbitrate`](../interfaces/IRoleGuard.md#arbitrate)
