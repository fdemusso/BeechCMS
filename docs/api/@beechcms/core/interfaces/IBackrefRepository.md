[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / IBackrefRepository

# Interface: IBackrefRepository

Port for reading back-references (entries pointing at a target entry).

## Methods

### entryExists()

> **entryExists**(`seedOrSlug`, `id`): `Promise`&lt;`boolean`&gt;

#### Parameters

##### seedOrSlug

`string` \| [`Seed`](Seed.md)

##### id

`string`

#### Returns

`Promise`&lt;`boolean`&gt;

***

### queryGroup()

> **queryGroup**(`source`, `sourceSeed`, `targetId`, `limit`, `offset`): `Promise`&lt;[`QueryGroupResult`](QueryGroupResult.md)&gt;

#### Parameters

##### source

[`BackrefSource`](BackrefSource.md)

##### sourceSeed

[`Seed`](Seed.md)

##### targetId

`string`

##### limit

`number`

##### offset

`number`

#### Returns

`Promise`&lt;[`QueryGroupResult`](QueryGroupResult.md)&gt;
