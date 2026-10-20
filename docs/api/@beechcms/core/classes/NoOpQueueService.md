[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / NoOpQueueService

# Class: NoOpQueueService

Drops messages without a transport.

## Implements

- [`IQueueService`](../interfaces/IQueueService.md)

## Constructors

### Constructor

> **new NoOpQueueService**(): `NoOpQueueService`

#### Returns

`NoOpQueueService`

## Methods

### enqueue()

> **enqueue**&lt;`T`&gt;(`_name`, `_payload`): `Promise`&lt;`boolean`&gt;

#### Type Parameters

##### T

`T`

#### Parameters

##### \_name

`string`

##### \_payload

`T`

#### Returns

`Promise`&lt;`boolean`&gt;

#### Implementation of

[`IQueueService`](../interfaces/IQueueService.md).[`enqueue`](../interfaces/IQueueService.md#enqueue)
