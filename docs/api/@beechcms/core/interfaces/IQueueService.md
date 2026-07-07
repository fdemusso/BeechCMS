[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / IQueueService

# Interface: IQueueService

Producer port. `enqueue` schedules deferred work and returns once the message
is accepted by the transport. Like INotificationService, implementations MUST
decide their own fire-and-forget vs inline semantics and MUST NOT let a
transport failure crash the request that called enqueue.

## Methods

### enqueue()

> **enqueue**&lt;`T`&gt;(`name`, `payload`): `Promise`&lt;`void`&gt;

#### Type Parameters

##### T

`T`

#### Parameters

##### name

`string`

##### payload

`T`

#### Returns

`Promise`&lt;`void`&gt;
