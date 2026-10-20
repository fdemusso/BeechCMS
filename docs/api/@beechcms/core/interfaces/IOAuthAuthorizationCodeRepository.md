[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / IOAuthAuthorizationCodeRepository

# Interface: IOAuthAuthorizationCodeRepository

## Methods

### consumeByHash()

> **consumeByHash**(`codeHash`, `nowTimestamp`): `Promise`&lt;`boolean`&gt;

Atomically marks the code consumed. Returns true only for the first caller;
every subsequent call returns false, which is the replay signal. Expiry is
enforced here — redemption, unlike replay detection, must respect the TTL.

#### Parameters

##### codeHash

`string`

##### nowTimestamp

`number`

#### Returns

`Promise`&lt;`boolean`&gt;

***

### findByHash()

> **findByHash**(`codeHash`): `Promise`&lt;[`AuthorizationCodeRecord`](AuthorizationCodeRecord.md) \| `null`&gt;

Returns the code regardless of its consumed OR expired state — replay must be
detectable even after the 60s TTL, since tokens derived from the code outlive it
by 30 days. Callers MUST inspect `consumedAt` (replay signal, requires cascade
revocation via IOAuthTokenRepository.revokeByAuthorizationCode) and `expiresAt`
separately (an unconsumed-but-expired code is simply invalid, nothing to revoke).

#### Parameters

##### codeHash

`string`

#### Returns

`Promise`&lt;[`AuthorizationCodeRecord`](AuthorizationCodeRecord.md) \| `null`&gt;

***

### invalidateByClientAndUser()

> **invalidateByClientAndUser**(`clientId`, `userId`): `Promise`&lt;`number`&gt;

Invalidates every unconsumed code issued to a (client, user) pair, e.g. on consent revoke.

#### Parameters

##### clientId

`string`

##### userId

`string`

#### Returns

`Promise`&lt;`number`&gt;

***

### save()

> **save**(`record`): `Promise`&lt;`void`&gt;

Persists a new single-use authorization code. Hash only, never plaintext.

#### Parameters

##### record

[`NewAuthorizationCode`](NewAuthorizationCode.md)

#### Returns

`Promise`&lt;`void`&gt;
