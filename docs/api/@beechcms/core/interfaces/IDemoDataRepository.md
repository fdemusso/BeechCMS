[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / IDemoDataRepository

# Interface: IDemoDataRepository

## Methods

### loadDemoData()

> **loadDemoData**(`repository`, `getSeed`): `Promise`&lt;`void`&gt;

Ingests structured demo datasets into the database via ContentRepository domain layer.

#### Parameters

##### repository

[`ContentRepository`](ContentRepository.md)

##### getSeed

(`slug`) => [`Seed`](Seed.md) \| `null`

#### Returns

`Promise`&lt;`void`&gt;
