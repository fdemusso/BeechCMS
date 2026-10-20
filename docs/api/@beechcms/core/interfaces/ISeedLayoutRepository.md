[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / ISeedLayoutRepository

# Interface: ISeedLayoutRepository

## Methods

### get()

> **get**(`slug`): `Promise`&lt;[`SeedLayoutRecord`](SeedLayoutRecord.md) \| `null`&gt;

Return the stored layout for a seed, or null if none was ever saved.

#### Parameters

##### slug

`string`

#### Returns

`Promise`&lt;[`SeedLayoutRecord`](SeedLayoutRecord.md) \| `null`&gt;

***

### getAllAsMap()

> **getAllAsMap**(): `Promise`&lt;`Map`&lt;`string`, [`FormLayout`](FormLayout.md)&gt;&gt;

Return all stored layouts, keyed by slug — used by GET /api/schema to enrich.

#### Returns

`Promise`&lt;`Map`&lt;`string`, [`FormLayout`](FormLayout.md)&gt;&gt;

***

### remove()

> **remove**(`slug`): `Promise`&lt;`void`&gt;

Remove the stored row — used by the "Reset" action.

#### Parameters

##### slug

`string`

#### Returns

`Promise`&lt;`void`&gt;

***

### upsert()

> **upsert**(`slug`, `layout`, `updatedBy`): `Promise`&lt;`void`&gt;

Upsert. `updatedBy` is the writer's user id.

#### Parameters

##### slug

`string`

##### layout

[`FormLayout`](FormLayout.md)

##### updatedBy

`string`

#### Returns

`Promise`&lt;`void`&gt;
