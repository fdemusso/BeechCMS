[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / IRoleAssignmentRepository

# Interface: IRoleAssignmentRepository

Storage contract for (user, role, scope) assignments.

## Methods

### create()

> **create**(`input`): `Promise`&lt;`string`&gt;

Creates an assignment. Returns its id; an existing identical triple is a no-op.

#### Parameters

##### input

[`NewAssignmentInput`](NewAssignmentInput.md)

#### Returns

`Promise`&lt;`string`&gt;

***

### delete()

> **delete**(`assignmentId`): `Promise`&lt;[`AdminGuardedResult`](../type-aliases/AdminGuardedResult.md)&gt;

Removes one assignment. `not-found` when it did not exist; `last-global-admin` when it is
the global `manage_users` assignment of the last active global administrator.

#### Parameters

##### assignmentId

`string`

#### Returns

`Promise`&lt;[`AdminGuardedResult`](../type-aliases/AdminGuardedResult.md)&gt;

***

### findById()

> **findById**(`assignmentId`): `Promise`&lt;[`PermissionAssignment`](PermissionAssignment.md) \| `null`&gt;

One assignment by id, decay filter NOT applied. Null when absent.

#### Parameters

##### assignmentId

`string`

#### Returns

`Promise`&lt;[`PermissionAssignment`](PermissionAssignment.md) \| `null`&gt;

***

### isLastGlobalAdminAssignment()

> **isLastGlobalAdminAssignment**(`assignmentId`): `Promise`&lt;`boolean`&gt;

Read-only twin of the [delete](#delete) guard: would removing this assignment leave no
other active global administrator? ADVISORY — it only lets a caller that refuses for
another reason (the Developer account) report the more fundamental one; it is never a
substitute for the guard inside [delete](#delete).

#### Parameters

##### assignmentId

`string`

#### Returns

`Promise`&lt;`boolean`&gt;

***

### listActiveForUser()

> **listActiveForUser**(`userId`): `Promise`&lt;[`PermissionAssignment`](PermissionAssignment.md)[]&gt;

Lists a user's assignments that currently grant anything.

An assignment is skipped when its scope names a seed that is absent or
`status != 'active'`, so scopes decay with their seed and revive with it.
[GLOBAL\_SCOPE](../variables/GLOBAL_SCOPE.md) assignments are always returned.

#### Parameters

##### userId

`string`

#### Returns

`Promise`&lt;[`PermissionAssignment`](PermissionAssignment.md)[]&gt;

***

### listAllForUser()

> **listAllForUser**(`userId`): `Promise`&lt;[`PermissionAssignment`](PermissionAssignment.md)[]&gt;

Every assignment of one user, decay filter NOT applied — administration screens must
see (and be able to remove) a row whose seed is currently deleted, which
[listActiveForUser](#listactiveforuser) deliberately hides.

#### Parameters

##### userId

`string`

#### Returns

`Promise`&lt;[`PermissionAssignment`](PermissionAssignment.md)[]&gt;

***

### listByRole()

> **listByRole**(`roleId`): `Promise`&lt;[`PermissionAssignment`](PermissionAssignment.md)[]&gt;

Lists every assignment referencing a role, decay filter NOT applied.

#### Parameters

##### roleId

`string`

#### Returns

`Promise`&lt;[`PermissionAssignment`](PermissionAssignment.md)[]&gt;

***

### listForUsers()

> **listForUsers**(`userIds`): `Promise`&lt;[`PermissionAssignment`](PermissionAssignment.md)[]&gt;

Every assignment of the given users, decay filter NOT applied, in ONE round trip.

Exists so the account-list endpoint can resolve the scopes of one page of accounts
without a query per account. Callers pass at most [MAX\_PAGE\_SIZE](../variables/MAX_PAGE_SIZE.md) ids (D1 caps
bound parameters per statement); an empty list returns an empty list.

#### Parameters

##### userIds

readonly `string`[]

#### Returns

`Promise`&lt;[`PermissionAssignment`](PermissionAssignment.md)[]&gt;
