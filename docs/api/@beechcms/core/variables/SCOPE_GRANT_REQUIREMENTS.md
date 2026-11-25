[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / SCOPE\_GRANT\_REQUIREMENTS

# Variable: SCOPE\_GRANT\_REQUIREMENTS

> `const` **SCOPE\_GRANT\_REQUIREMENTS**: `Readonly`&lt;`Record`&lt;[`OAuthScope`](../type-aliases/OAuthScope.md), readonly [`Permission`](../type-aliases/Permission.md)[] \| `"authenticated"`&gt;&gt;

RBAC authority that makes each OAuth scope usable, derived from the route rules of the
scope's `agent` operations: `'authenticated'` when at least one of them is open to any
active account, otherwise the permissions (any one, at any scope) those routes demand.
Kept in sync with PROTECTED_ROUTES by apps/api/src/factory.operations-parity.test.ts.
