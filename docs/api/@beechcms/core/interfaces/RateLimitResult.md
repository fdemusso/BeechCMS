[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / RateLimitResult

# Interface: RateLimitResult

## Properties

### isAllowed

> **isAllowed**: `boolean`

***

### retryAfterSeconds?

> `optional` **retryAfterSeconds?**: `number`

The number of seconds after which the client may retry the request.
Note: This field is optional and may not be supported by all implementations
(e.g. Cloudflare Rate Limit binding does not return retry-after information).
