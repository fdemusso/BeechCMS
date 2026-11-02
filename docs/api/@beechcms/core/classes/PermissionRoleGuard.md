[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / PermissionRoleGuard

# Class: PermissionRoleGuard

Production guard: only a holder of `manage_seeds` at [GLOBAL\_SCOPE](../variables/GLOBAL_SCOPE.md) may delegate
authority to an OAuth/MCP client.

Every OAuth scope in this system (`schema:read`, `schema:write`) drives seed-schema
routes, which the route gate refuses to anyone without `manage_seeds@*`. So the question
this guard answers is the same one the `/api/seeds/*` rows ask: delegation requires the
authority it delegates. `manage_users@*` alone no longer suffices.

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
