[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / IRateLimiter

# Interface: IRateLimiter

## Methods

### checkLimit()

> **checkLimit**(`key`): `Promise`&lt;[`RateLimitResult`](RateLimitResult.md)&gt;

Checks whether the given key is within the rate limit.

#### Parameters

##### key

`string`

#### Returns

`Promise`&lt;[`RateLimitResult`](RateLimitResult.md)&gt;

***

### reset()?

> `optional` **reset**(): `void`

Clears cached bucket state (for testing and isolation).

#### Returns

`void`
