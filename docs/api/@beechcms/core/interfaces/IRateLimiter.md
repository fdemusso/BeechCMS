[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / IRateLimiter

# Interface: IRateLimiter

## Methods

### checkLimit()

> **checkLimit**(`key`): `Promise`&lt;[`RateLimitResult`](RateLimitResult.md)&gt;

Checks whether the given key is within the rate limit.
The key should combine the client IP address and an endpoint-specific prefix
to prevent one endpoint's limit from being shared with another.

#### Parameters

##### key

`string`

#### Returns

`Promise`&lt;[`RateLimitResult`](RateLimitResult.md)&gt;
