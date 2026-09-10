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

### countActiveGlobalAdminsExcludingRole()

> **countActiveGlobalAdminsExcludingRole**(`roleId`): `Promise`&lt;`number`&gt;

[countActiveGlobalAdmins](#countactiveglobaladmins) ignoring every assignment that goes through one role.
`0` means mutating that role would strip the platform of its last administrator.

#### Parameters

##### roleId

`string`

#### Returns

`Promise`&lt;`number`&gt;

***

### countActiveGlobalAdminsExcludingUser()

> **countActiveGlobalAdminsExcludingUser**(`userId`): `Promise`&lt;`number`&gt;

[countActiveGlobalAdmins](#countactiveglobaladmins) ignoring one user. `0` means that user is the last
account able to administer the platform, and any operation revoking their authority
must be refused.

#### Parameters

##### userId

`string`

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

### findById()

> **findById**(`assignmentId`): `Promise`&lt;[`PermissionAssignment`](PermissionAssignment.md) \| `null`&gt;

One assignment by id, decay filter NOT applied. Null when absent.

#### Parameters

##### assignmentId

`string`

#### Returns

`Promise`&lt;[`PermissionAssignment`](PermissionAssignment.md) \| `null`&gt;

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

### listAll()

> **listAll**(): `Promise`&lt;[`PermissionAssignment`](PermissionAssignment.md)[]&gt;

Every assignment in the system, decay filter NOT applied.

Exists so the account-list endpoint can resolve each account's scopes in ONE round
trip instead of one query per account. Administration tables are small by nature;
content never flows through here.

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
