[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / NoOpQueueService

# Class: NoOpQueueService

Safe no-op producer (e.g. unit tests that don't assert on enqueue).

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
