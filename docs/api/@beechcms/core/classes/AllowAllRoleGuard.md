[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / AllowAllRoleGuard

# Class: AllowAllRoleGuard

Stub guard for the pre-roles world: grants every requested scope to every role.

This permissiveness is EXPLICIT and directly tested, not an accidental default.
When the roles feature lands, replace this binding with a real adapter; the
behaviour change will then be visible as a failing test here, by design.

## Implements

- [`IRoleGuard`](../interfaces/IRoleGuard.md)

## Constructors

### Constructor

> **new AllowAllRoleGuard**(): `AllowAllRoleGuard`

#### Returns

`AllowAllRoleGuard`

## Methods

### arbitrate()

> **arbitrate**(`_role`, `requestedScopes`): `Promise`&lt;[`ScopeGrantDecision`](../interfaces/ScopeGrantDecision.md)&gt;

#### Parameters

##### \_role

`string` \| `undefined`

##### requestedScopes

readonly (`"schema:read"` \| `"schema:write"`)[]

Scopes the client asked for, already validated.

#### Returns

`Promise`&lt;[`ScopeGrantDecision`](../interfaces/ScopeGrantDecision.md)&gt;

#### Implementation of

[`IRoleGuard`](../interfaces/IRoleGuard.md).[`arbitrate`](../interfaces/IRoleGuard.md#arbitrate)
