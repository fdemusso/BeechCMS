[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / IRoleAssignmentRepository

# Interface: IRoleAssignmentRepository

Storage contract for (user, role, scope) assignments.

## Methods

### countActiveGlobalAdmins()

> **countActiveGlobalAdmins**(): `Promise`&lt;`number`&gt;

Counts accounts holding `manage_users` at [GLOBAL\_SCOPE](../variables/GLOBAL_SCOPE.md) and still active.
Backs the last-SuperAdmin guardrail consumed by a later sprint.

#### Returns

`Promise`&lt;`number`&gt;

***

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

> **delete**(`assignmentId`): `Promise`&lt;`boolean`&gt;

Removes one assignment. Returns false when it did not exist.

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

### listByRole()

> **listByRole**(`roleId`): `Promise`&lt;[`PermissionAssignment`](PermissionAssignment.md)[]&gt;

Lists every assignment referencing a role, decay filter NOT applied.

#### Parameters

##### roleId

`string`

#### Returns

`Promise`&lt;[`PermissionAssignment`](PermissionAssignment.md)[]&gt;
