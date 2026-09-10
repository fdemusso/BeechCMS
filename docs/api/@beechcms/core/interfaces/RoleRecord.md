[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / RoleRecord

# Interface: RoleRecord

A named, reusable bundle of atomic permissions.

## Properties

### createdAt

> **createdAt**: `number`

***

### description

> **description**: `string` \| `null`

***

### icon?

> `optional` **icon?**: `string` \| `null`

***

### id

> **id**: `string`

***

### isSystem

> **isSystem**: `boolean`

System roles (e.g. SuperAdmin) are seeded by migration and may not be deleted.

***

### name

> **name**: `string`

***

### permissions

> **permissions**: (`"content:read"` \| `"content:create"` \| `"content:update"` \| `"content:delete"` \| `"manage_users"` \| `"manage_roles"` \| `"view_analytics"`)[]

Always a subset of `PERMISSIONS`; unknown values are dropped at the storage boundary.

***

### updatedAt

> **updatedAt**: `number`
