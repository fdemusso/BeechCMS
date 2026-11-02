[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / IDashboardLayoutRepository

# Interface: IDashboardLayoutRepository

## Methods

### get()

> **get**(`scope`): `Promise`&lt;[`DashboardLayoutRecord`](DashboardLayoutRecord.md) \| `null`&gt;

Stored layout for a scope, or null if none was ever saved.

#### Parameters

##### scope

`string`

#### Returns

`Promise`&lt;[`DashboardLayoutRecord`](DashboardLayoutRecord.md) \| `null`&gt;

***

### remove()

> **remove**(`scope`, `expectedUpdatedAt`): `Promise`&lt;[`DashboardLayoutWriteResult`](../type-aliases/DashboardLayoutWriteResult.md)&gt;

Removes the row only while its `updatedAt` equals `expectedUpdatedAt`; with null, succeeds only when no row is stored.

#### Parameters

##### scope

`string`

##### expectedUpdatedAt

`number` \| `null`

#### Returns

`Promise`&lt;[`DashboardLayoutWriteResult`](../type-aliases/DashboardLayoutWriteResult.md)&gt;

***

### save()

> **save**(`scope`, `layout`, `updatedBy`, `expectedUpdatedAt`): `Promise`&lt;[`DashboardLayoutWriteResult`](../type-aliases/DashboardLayoutWriteResult.md)&gt;

Writes only while the stored `updatedAt` equals `expectedUpdatedAt` (null = no row stored). `updatedAt` strictly increases on every write.

#### Parameters

##### scope

`string`

##### layout

[`DashboardLayout`](DashboardLayout.md)

##### updatedBy

`string`

##### expectedUpdatedAt

`number` \| `null`

#### Returns

`Promise`&lt;[`DashboardLayoutWriteResult`](../type-aliases/DashboardLayoutWriteResult.md)&gt;
