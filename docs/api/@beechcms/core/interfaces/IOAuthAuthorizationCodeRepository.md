[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / IOAuthAuthorizationCodeRepository

# Interface: IOAuthAuthorizationCodeRepository

## Methods

### consumeByHash()

> **consumeByHash**(`codeHash`, `nowTimestamp`): `Promise`&lt;`boolean`&gt;

Atomically marks the code consumed. Returns true only for the first caller;
every subsequent call returns false, which is the replay signal.

#### Parameters

##### codeHash

`string`

##### nowTimestamp

`number`

#### Returns

`Promise`&lt;`boolean`&gt;

***

### findByHash()

> **findByHash**(`codeHash`, `nowTimestamp`): `Promise`&lt;[`AuthorizationCodeRecord`](AuthorizationCodeRecord.md) \| `null`&gt;

Returns the code regardless of its consumed state, provided it is unexpired.
Callers MUST inspect `consumedAt`: a non-null value means replay, which
requires cascade revocation via IOAuthTokenRepository.revokeByAuthorizationCode.

#### Parameters

##### codeHash

`string`

##### nowTimestamp

`number`

#### Returns

`Promise`&lt;[`AuthorizationCodeRecord`](AuthorizationCodeRecord.md) \| `null`&gt;

***

### save()

> **save**(`record`): `Promise`&lt;`void`&gt;

Persists a new single-use authorization code. Hash only, never plaintext.

#### Parameters

##### record

[`NewAuthorizationCode`](NewAuthorizationCode.md)

#### Returns

`Promise`&lt;`void`&gt;
