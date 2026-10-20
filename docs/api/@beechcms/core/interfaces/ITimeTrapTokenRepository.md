[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / ITimeTrapTokenRepository

# Interface: ITimeTrapTokenRepository

## Methods

### claimToken()

> **claimToken**(`tokenHash`, `usedAt`, `expiresAt`): `Promise`&lt;`boolean`&gt;

Atomically claims a token hash as consumed. Returns false if it was already claimed.

#### Parameters

##### tokenHash

`string`

##### usedAt

`number`

##### expiresAt

`number`

#### Returns

`Promise`&lt;`boolean`&gt;

***

### cleanup()

> **cleanup**(`nowSeconds`): `Promise`&lt;`void`&gt;

Cleans up expired token entries.

#### Parameters

##### nowSeconds

`number`

#### Returns

`Promise`&lt;`void`&gt;

***

### isTokenUsed()

> **isTokenUsed**(`tokenHash`): `Promise`&lt;`boolean`&gt;

Cheap, non-atomic pre-check used only to fail fast before expensive validation.

#### Parameters

##### tokenHash

`string`

#### Returns

`Promise`&lt;`boolean`&gt;

***

### releaseToken()

> **releaseToken**(`tokenHash`): `Promise`&lt;`void`&gt;

Releases a previously claimed token hash, allowing retry after a failed content creation.

#### Parameters

##### tokenHash

`string`

#### Returns

`Promise`&lt;`void`&gt;
