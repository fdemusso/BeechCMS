[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / IPasswordResetTokenRepository

# Interface: IPasswordResetTokenRepository

## Methods

### create()

> **create**(`record`): `Promise`&lt;`void`&gt;

Stores a new password reset token. Only the hash is persisted, never the plaintext.

#### Parameters

##### record

[`NewPasswordResetToken`](NewPasswordResetToken.md)

#### Returns

`Promise`&lt;`void`&gt;

***

### findValidByHashWithEmail()

> **findValidByHashWithEmail**(`tokenHash`, `nowTimestamp`): `Promise`&lt;[`ValidatedResetToken`](ValidatedResetToken.md) \| `null`&gt;

Finds a valid reset token by its hash, joining the users table to return the
associated email in the same query to avoid a second round-trip.
Returns null if the token is expired, already used, or not found.

#### Parameters

##### tokenHash

`string`

##### nowTimestamp

`number`

#### Returns

`Promise`&lt;[`ValidatedResetToken`](ValidatedResetToken.md) \| `null`&gt;

***

### invalidatePending()

> **invalidatePending**(`userId`, `nowTimestamp`): `Promise`&lt;`void`&gt;

Marks all pending (unused) tokens for the user as consumed before issuing a new one.
Ensures only one active reset token exists per user at any time.

#### Parameters

##### userId

`string`

##### nowTimestamp

`number`

#### Returns

`Promise`&lt;`void`&gt;

***

### redeem()

> **redeem**(`input`): `Promise`&lt;`boolean`&gt;

Redeems a token in one atomic unit: burns it, replaces the user's password hash and revokes
every refresh token. Either all three land or none do.
Returns `true` for the single caller that burned the token, `false` (writing nothing) when it
was already redeemed by a concurrent request.

#### Parameters

##### input

[`RedeemPasswordResetInput`](RedeemPasswordResetInput.md)

#### Returns

`Promise`&lt;`boolean`&gt;
