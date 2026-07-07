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

### getViewConfig()

> **getViewConfig**(`slug`): `Promise`&lt;\{\[`key`: `string`\]: `unknown`; `card?`: \{ `header?`: \{ `branchId`: `string`; \} \| `null`; `media?`: \{ `branchId`: `string`; \} \| `null`; `metadata`: `object`[]; `subtitle?`: \{ `branchId`: `string`; \} \| `null`; `version`: `1`; \}; `kanban?`: \{ `axisBranchId`: `string` \| `null`; `collapsedColumnValues?`: `string`[]; `hiddenColumnValues?`: `string`[]; `sort`: \{ `branchId`: `string`; `dir`: `"ASC"` \| `"DESC"`; \} \| `null`; \}; \} \| `null`&gt;

Return the per-view config blob for a seed, or null if none was stored.

#### Parameters

##### slug

`string`

#### Returns

`Promise`&lt;\{\[`key`: `string`\]: `unknown`; `card?`: \{ `header?`: \{ `branchId`: `string`; \} \| `null`; `media?`: \{ `branchId`: `string`; \} \| `null`; `metadata`: `object`[]; `subtitle?`: \{ `branchId`: `string`; \} \| `null`; `version`: `1`; \}; `kanban?`: \{ `axisBranchId`: `string` \| `null`; `collapsedColumnValues?`: `string`[]; `hiddenColumnValues?`: `string`[]; `sort`: \{ `branchId`: `string`; `dir`: `"ASC"` \| `"DESC"`; \} \| `null`; \}; \} \| `null`&gt;

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

### setViewConfig()

> **setViewConfig**(`slug`, `config`, `updatedBy`): `Promise`&lt;`void`&gt;

Upsert the per-view config for a seed.

#### Parameters

##### slug

`string`

##### config

###### card?

\{ `header?`: \{ `branchId`: `string`; \} \| `null`; `media?`: \{ `branchId`: `string`; \} \| `null`; `metadata`: `object`[]; `subtitle?`: \{ `branchId`: `string`; \} \| `null`; `version`: `1`; \} = `...`

###### card.header?

\{ `branchId`: `string`; \} \| `null` = `...`

Full-width primary line. Max 1.

###### card.media?

\{ `branchId`: `string`; \} \| `null` = `...`

Optional media/avatar slot. Full width. Max 1.

###### card.metadata

`object`[] = `...`

2-column grid. Hard cap enforced by validator (see METADATA_SLOT_CAP).

###### card.subtitle?

\{ `branchId`: `string`; \} \| `null` = `...`

Full-width secondary line. Max 1.

###### card.version

`1` = `...`

###### kanban?

\{ `axisBranchId`: `string` \| `null`; `collapsedColumnValues?`: `string`[]; `hiddenColumnValues?`: `string`[]; `sort`: \{ `branchId`: `string`; `dir`: `"ASC"` \| `"DESC"`; \} \| `null`; \} = `...`

###### kanban.axisBranchId

`string` \| `null` = `...`

###### kanban.collapsedColumnValues?

`string`[] = `...`

###### kanban.hiddenColumnValues?

`string`[] = `...`

###### kanban.sort

\{ `branchId`: `string`; `dir`: `"ASC"` \| `"DESC"`; \} \| `null` = `...`

##### updatedBy

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
