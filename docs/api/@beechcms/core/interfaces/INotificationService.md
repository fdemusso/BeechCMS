[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / INotificationService

# Interface: INotificationService

## Methods

### notify()

> **notify**(`input`): `void` \| `Promise`&lt;`void`&gt;

Emit a notification.

Implementations decide whether to fire-and-forget (production: schedules
the underlying repository write through `executionCtx.waitUntil`) or to
wait inline (tests). Like the activity logger, this method MUST NOT
throw to the caller: a failed notification must never break the public
request that triggered it.

#### Parameters

##### input

[`CreateNotificationInput`](CreateNotificationInput.md)

#### Returns

`void` \| `Promise`&lt;`void`&gt;
