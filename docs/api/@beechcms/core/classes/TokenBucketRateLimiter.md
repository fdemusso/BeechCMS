[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / TokenBucketRateLimiter

# Class: TokenBucketRateLimiter

## Implements

- [`IRateLimiter`](../interfaces/IRateLimiter.md)

## Constructors

### Constructor

> **new TokenBucketRateLimiter**(`options?`): `TokenBucketRateLimiter`

#### Parameters

##### options?

[`TokenBucketOptions`](../interfaces/TokenBucketOptions.md)

#### Returns

`TokenBucketRateLimiter`

## Methods

### checkLimit()

> **checkLimit**(`key`): `Promise`&lt;[`RateLimitResult`](../interfaces/RateLimitResult.md)&gt;

Checks whether the given key is within the rate limit.

#### Parameters

##### key

`string`

#### Returns

`Promise`&lt;[`RateLimitResult`](../interfaces/RateLimitResult.md)&gt;

#### Implementation of

[`IRateLimiter`](../interfaces/IRateLimiter.md).[`checkLimit`](../interfaces/IRateLimiter.md#checklimit)

***

### reset()

> **reset**(): `void`

Clears cached bucket state (for testing and isolation).

#### Returns

`void`

#### Implementation of

[`IRateLimiter`](../interfaces/IRateLimiter.md).[`reset`](../interfaces/IRateLimiter.md#reset)
