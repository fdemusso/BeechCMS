[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / IRoleRepository

# Interface: IRoleRepository

Storage contract for roles and their permission bundles.

## Methods

### create()

> **create**(`input`): `Promise`&lt;`string`&gt;

Creates a role and its permission rows atomically. Returns the new role id.

#### Parameters

##### input

[`NewRoleInput`](NewRoleInput.md)

#### Returns

`Promise`&lt;`string`&gt;

***

### delete()

> **delete**(`roleId`): `Promise`&lt;[`AdminGuardedResult`](../type-aliases/AdminGuardedResult.md)&gt;

Deletes a non-system role and, by cascade, its permissions and assignments.
`not-found` when the role does not exist or is a system role; `last-global-admin` when
the role carries the last active global administrator.

#### Parameters

##### roleId

`string`

#### Returns

`Promise`&lt;[`AdminGuardedResult`](../type-aliases/AdminGuardedResult.md)&gt;

***

### findById()

> **findById**(`roleId`): `Promise`&lt;[`RoleRecord`](RoleRecord.md) \| `null`&gt;

Retrieves a role with its permissions, or null when it does not exist.

#### Parameters

##### roleId

`string`

#### Returns

`Promise`&lt;[`RoleRecord`](RoleRecord.md) \| `null`&gt;

***

### findByIds()

> **findByIds**(`roleIds`): `Promise`&lt;[`RoleRecord`](RoleRecord.md)[]&gt;

Retrieves several roles in one round trip. Missing ids are simply absent.

#### Parameters

##### roleIds

readonly `string`[]

#### Returns

`Promise`&lt;[`RoleRecord`](RoleRecord.md)[]&gt;

***

### listAll()

> **listAll**(): `Promise`&lt;[`RoleRecord`](RoleRecord.md)[]&gt;

Lists every role, system roles included, ordered by name.

#### Returns

`Promise`&lt;[`RoleRecord`](RoleRecord.md)[]&gt;

***

### update()

> **update**(`roleId`, `input`): `Promise`&lt;[`AdminGuardedResult`](../type-aliases/AdminGuardedResult.md)&gt;

Replaces a role's name, description and full permission set atomically.

`not-found` — changing NOTHING, permissions included — when the role does not exist or
is a system role. System roles are seeded by migration and are immutable in both halves
of the write, which is the guarantee callers rely on to keep `SuperAdmin` intact.
`last-global-admin` when the new set drops `manage_users` from a role that carries the
last active global administrator; nothing is written then either.

#### Parameters

##### roleId

`string`

##### input

[`NewRoleInput`](NewRoleInput.md)

#### Returns

`Promise`&lt;[`AdminGuardedResult`](../type-aliases/AdminGuardedResult.md)&gt;
