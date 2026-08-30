[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / IVectorRepository

# Interface: IVectorRepository

## Methods

### deleteVector()

> **deleteVector**(`seed`, `entryId`): `Promise`&lt;`void`&gt;

Removes the embedding vector (used when unpublished/deleted)

#### Parameters

##### seed

[`Seed`](Seed.md)

##### entryId

`string`

#### Returns

`Promise`&lt;`void`&gt;

***

### getAllVectors()

> **getAllVectors**(`seed`): `Promise`&lt;`object`[]&gt;

Retrieves all vectors for a given seed to compile to R2

#### Parameters

##### seed

[`Seed`](Seed.md)

#### Returns

`Promise`&lt;`object`[]&gt;

***

### saveVector()

> **saveVector**(`seed`, `entryId`, `vector`): `Promise`&lt;`void`&gt;

Saves or updates the embedding vector for an entry

#### Parameters

##### seed

[`Seed`](Seed.md)

##### entryId

`string`

##### vector

`Float32Array`

#### Returns

`Promise`&lt;`void`&gt;
