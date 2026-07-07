[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / IPasswordResetTokenRepository

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

### markUsed()

> **markUsed**(`tokenId`, `nowTimestamp`): `Promise`&lt;`void`&gt;

Marks a token as consumed so it cannot be used again.

#### Parameters

##### tokenId

`string`

##### nowTimestamp

`number`

#### Returns

`Promise`&lt;`void`&gt;
