[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / IRoleGuard

# Interface: IRoleGuard

Arbitrates which of the requested scopes a given user role may grant.

This is the ONLY place role-based authorization may live in the OAuth flow.
`/oauth/authorize` and `/oauth/token` must never branch on `role` themselves,
so introducing a real role system later requires swapping the implementation
bound in repositoryMiddleware and nothing else.

## Methods

### arbitrate()

> **arbitrate**(`role`, `requestedScopes`): `Promise`&lt;[`ScopeGrantDecision`](ScopeGrantDecision.md)&gt;

#### Parameters

##### role

`string` \| `undefined`

The resource owner's role claim, or undefined when absent.

##### requestedScopes

readonly (`"schema:read"` \| `"schema:write"`)[]

Scopes the client asked for, already validated.

#### Returns

`Promise`&lt;[`ScopeGrantDecision`](ScopeGrantDecision.md)&gt;
