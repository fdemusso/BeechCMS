[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / IContentViewRepository

# Interface: IContentViewRepository

Persistence for shared, ordered view instances (`seed_views`). Every write is one statement
or one D1 batch, so each method is atomic. Implementations own id minting and timestamps
(IIdGenerator / IClock injected).

## Methods

### create()

> **create**(`input`, `updatedBy`): `Promise`&lt;[`ContentViewRecord`](ContentViewRecord.md)&gt;

Appends after the current last position.

#### Parameters

##### input

[`NewContentView`](NewContentView.md)

##### updatedBy

`string`

#### Returns

`Promise`&lt;[`ContentViewRecord`](ContentViewRecord.md)&gt;

***

### ensureDefaults()

> **ensureDefaults**(`seedSlug`, `types`, `updatedBy`): `Promise`&lt;`void`&gt;

Inserts one untitled instance per type, at positions 0..n-1. Each insert is skipped when the
seed already has an instance of that type, so concurrent first reads never duplicate.

#### Parameters

##### seedSlug

`string`

##### types

readonly [`DashboardView`](../type-aliases/DashboardView.md)[]

##### updatedBy

`string`

#### Returns

`Promise`&lt;`void`&gt;

***

### get()

> **get**(`seedSlug`, `id`): `Promise`&lt;[`ContentViewRecord`](ContentViewRecord.md) \| `null`&gt;

#### Parameters

##### seedSlug

`string`

##### id

`string`

#### Returns

`Promise`&lt;[`ContentViewRecord`](ContentViewRecord.md) \| `null`&gt;

***

### listBySeed()

> **listBySeed**(`seedSlug`): `Promise`&lt;[`ContentViewRecord`](ContentViewRecord.md)[]&gt;

All rows of a seed, including types the allow-list currently hides, ordered by position.

#### Parameters

##### seedSlug

`string`

#### Returns

`Promise`&lt;[`ContentViewRecord`](ContentViewRecord.md)[]&gt;

***

### remove()

> **remove**(`seedSlug`, `id`): `Promise`&lt;[`RemoveContentViewResult`](../type-aliases/RemoveContentViewResult.md)&gt;

Refuses ('last-table') to delete the seed's only Table instance, atomically.

#### Parameters

##### seedSlug

`string`

##### id

`string`

#### Returns

`Promise`&lt;[`RemoveContentViewResult`](../type-aliases/RemoveContentViewResult.md)&gt;

***

### reorder()

> **reorder**(`seedSlug`, `orderedIds`, `updatedBy`): `Promise`&lt;`void`&gt;

Writes position = index for each id. Ids not listed keep their position.

#### Parameters

##### seedSlug

`string`

##### orderedIds

readonly `string`[]

##### updatedBy

`string`

#### Returns

`Promise`&lt;`void`&gt;

***

### update()

> **update**(`seedSlug`, `id`, `patch`, `updatedBy`): `Promise`&lt;[`ContentViewRecord`](ContentViewRecord.md) \| `null`&gt;

#### Parameters

##### seedSlug

`string`

##### id

`string`

##### patch

[`ContentViewPatch`](ContentViewPatch.md)

##### updatedBy

`string`

#### Returns

`Promise`&lt;[`ContentViewRecord`](ContentViewRecord.md) \| `null`&gt;
