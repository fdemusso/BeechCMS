[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / ITimeTrapTokenRepository

# Interface: ITimeTrapTokenRepository

## Methods

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

Checks if a time-trap token hash has already been consumed.

#### Parameters

##### tokenHash

`string`

#### Returns

`Promise`&lt;`boolean`&gt;

***

### markTokenUsed()

> **markTokenUsed**(`tokenHash`, `usedAt`, `expiresAt`): `Promise`&lt;`void`&gt;

Marks a time-trap token hash as consumed with an expiration timestamp.

#### Parameters

##### tokenHash

`string`

##### usedAt

`number`

##### expiresAt

`number`

#### Returns

`Promise`&lt;`void`&gt;
