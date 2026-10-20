[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / IRoleGuard

# Interface: IRoleGuard

Arbitrates which of the requested scopes a given caller may grant.

This is the ONLY place role-based authorization may live in the OAuth flow.
`/oauth/authorize` and `/oauth/token` must never branch on authority themselves.

The parameter is the caller's RESOLVED authority, not a role string: the role
string is the pre-RBAC vocabulary and is on its way out.

## Methods

### arbitrate()

> **arbitrate**(`effective`, `requestedScopes`): `Promise`&lt;[`ScopeGrantDecision`](ScopeGrantDecision.md)&gt;

#### Parameters

##### effective

[`EffectivePermissions`](EffectivePermissions.md)

The resource owner's effective permissions, already folded.

##### requestedScopes

readonly (`"schema:read"` \| `"schema:write"`)[]

Scopes the client asked for, already validated.

#### Returns

`Promise`&lt;[`ScopeGrantDecision`](ScopeGrantDecision.md)&gt;
