[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / IdempotencyRepository

# Interface: IdempotencyRepository

## Methods

### cleanup()

> **cleanup**(`now`): `Promise`&lt;`void`&gt;

#### Parameters

##### now

`number`

#### Returns

`Promise`&lt;`void`&gt;

***

### lookup()

> **lookup**(`key`): `Promise`&lt;[`IdempotencyRecord`](IdempotencyRecord.md) \| `null`&gt;

#### Parameters

##### key

`string`

#### Returns

`Promise`&lt;[`IdempotencyRecord`](IdempotencyRecord.md) \| `null`&gt;

***

### store()

> **store**(`record`): `Promise`&lt;`void`&gt;

#### Parameters

##### record

[`IdempotencyRecord`](IdempotencyRecord.md)

#### Returns

`Promise`&lt;`void`&gt;
