[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / PermissionRoleGuard

# Class: PermissionRoleGuard

Production guard: grants each requested scope whose [SCOPE\_GRANT\_REQUIREMENTS](../variables/SCOPE_GRANT_REQUIREMENTS.md)
the owner meets on at least one RBAC scope. Delegation requires the authority it delegates,
evaluated per OAuth scope, so the outcome is a partial grant.

RBAC remains the runtime authority (`permissionMiddleware`); this guard only refuses scopes
the owner could never use. Never grants a scope that was not requested.

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

readonly (`"content:read"` \| `"content:delete"` \| `"schema:read"` \| `"schema:write"` \| `"content:write"` \| `"media:read"` \| `"media:write"` \| `"automations:read"` \| `"automations:write"` \| `"users:read"` \| `"users:write"` \| `"settings:read"` \| `"settings:write"` \| `"analytics:read"` \| `"agent:read"` \| `"agent:approve"`)[]

Scopes the client asked for, already validated.

#### Returns

`Promise`&lt;[`ScopeGrantDecision`](../interfaces/ScopeGrantDecision.md)&gt;

#### Implementation of

[`IRoleGuard`](../interfaces/IRoleGuard.md).[`arbitrate`](../interfaces/IRoleGuard.md#arbitrate)
