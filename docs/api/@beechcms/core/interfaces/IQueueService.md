[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / IQueueService

# Interface: IQueueService

Producer port. `enqueue` schedules deferred work and returns once the message
is accepted by the transport. Like INotificationService, implementations MUST
decide their own fire-and-forget vs inline semantics and MUST NOT let a
transport failure crash the request that called enqueue. Resolves `true`
when the message was handed off successfully, `false` when it was dropped
(e.g. transport rejection, oversized payload, no handler) — callers that
need at-least-once delivery guarantees MUST check this instead of assuming
a resolved promise means success.

## Methods

### enqueue()

> **enqueue**&lt;`T`&gt;(`name`, `payload`): `Promise`&lt;`boolean`&gt;

#### Type Parameters

##### T

`T`

#### Parameters

##### name

`string`

##### payload

`T`

#### Returns

`Promise`&lt;`boolean`&gt;
