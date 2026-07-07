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

### listScopes()

> **listScopes**(): `Promise`&lt;`string`[]&gt;

Scopes that currently have a stored row — used by the Sprint 06 builder UI.

#### Returns

`Promise`&lt;`string`[]&gt;

***

### remove()

> **remove**(`scope`): `Promise`&lt;`void`&gt;

Remove the stored row — the "Reset" action.

#### Parameters

##### scope

`string`

#### Returns

`Promise`&lt;`void`&gt;

***

### upsert()

> **upsert**(`scope`, `layout`, `updatedBy`): `Promise`&lt;`void`&gt;

Upsert. `updatedBy` is the writer's user id.

#### Parameters

##### scope

`string`

##### layout

[`DashboardLayout`](DashboardLayout.md)

##### updatedBy

`string`

#### Returns

`Promise`&lt;`void`&gt;
