[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / verifyTimeTrapToken

# Function: verifyTimeTrapToken()

> **verifyTimeTrapToken**(`token`, `secret`, `minDeltaSeconds?`, `maxAgeSeconds?`, `clock?`): `Promise`&lt;\{ `elapsedSeconds?`: `number`; `reason?`: `string`; `valid`: `boolean`; \}&gt;

## Parameters

### token

`string`

### secret

`string`

### minDeltaSeconds?

`number` = `1.5`

### maxAgeSeconds?

`number` = `3600`

### clock?

[`IClock`](../interfaces/IClock.md) = `SystemClock`

## Returns

`Promise`&lt;\{ `elapsedSeconds?`: `number`; `reason?`: `string`; `valid`: `boolean`; \}&gt;
