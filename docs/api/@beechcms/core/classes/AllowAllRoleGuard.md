[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / AllowAllRoleGuard

# Class: AllowAllRoleGuard

Stub guard: grants every requested scope to every caller.

Retained as the explicit, directly-tested permissive baseline and as the test
double for suites that are not exercising arbitration. It is NO LONGER the
production binding — `repositoryMiddleware` binds [PermissionRoleGuard](PermissionRoleGuard.md).

## Implements

- [`IRoleGuard`](../interfaces/IRoleGuard.md)

## Constructors

### Constructor

> **new AllowAllRoleGuard**(): `AllowAllRoleGuard`

#### Returns

`AllowAllRoleGuard`

## Methods

### arbitrate()

> **arbitrate**(`_effective`, `requestedScopes`): `Promise`&lt;[`ScopeGrantDecision`](../interfaces/ScopeGrantDecision.md)&gt;

#### Parameters

##### \_effective

[`EffectivePermissions`](../interfaces/EffectivePermissions.md)

##### requestedScopes

readonly (`"schema:read"` \| `"schema:write"`)[]

Scopes the client asked for, already validated.

#### Returns

`Promise`&lt;[`ScopeGrantDecision`](../interfaces/ScopeGrantDecision.md)&gt;

#### Implementation of

[`IRoleGuard`](../interfaces/IRoleGuard.md).[`arbitrate`](../interfaces/IRoleGuard.md#arbitrate)
