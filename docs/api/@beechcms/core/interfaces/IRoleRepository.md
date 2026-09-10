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

> **delete**(`roleId`): `Promise`&lt;`boolean`&gt;

Deletes a non-system role and, by cascade, its permissions and assignments.
Returns false when the role does not exist or is a system role.

#### Parameters

##### roleId

`string`

#### Returns

`Promise`&lt;`boolean`&gt;

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

> **update**(`roleId`, `input`): `Promise`&lt;`boolean`&gt;

Replaces a role's name, description and full permission set atomically.

Returns false — changing NOTHING, permissions included — when the role does not
exist or is a system role. System roles are seeded by migration and are immutable
in both halves of the write, which is the guarantee callers rely on to keep
`SuperAdmin` intact.

#### Parameters

##### roleId

`string`

##### input

[`NewRoleInput`](NewRoleInput.md)

#### Returns

`Promise`&lt;`boolean`&gt;
