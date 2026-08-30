[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / RateLimitResult

# Interface: RateLimitResult

## Properties

### isAllowed

> **isAllowed**: `boolean`

***

### limit?

> `optional` **limit?**: `number`

The maximum token capacity configured for this limiter.

***

### remaining?

> `optional` **remaining?**: `number`

The number of whole tokens remaining in the bucket.

***

### retryAfterSeconds?

> `optional` **retryAfterSeconds?**: `number`

The number of whole seconds after which the client may retry the request.
