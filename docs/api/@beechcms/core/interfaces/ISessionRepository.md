[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / ISessionRepository

# Interface: ISessionRepository

## Methods

### findActiveByHash()

> **findActiveByHash**(`tokenHash`, `nowTimestamp`): `Promise`&lt;[`RefreshTokenRecord`](RefreshTokenRecord.md) \| `null`&gt;

Finds an active refresh token by its hash.
nowTimestamp is compared against expiresAt and revokedAt to guarantee the token
is both unexpired and not revoked before returning it.

#### Parameters

##### tokenHash

`string`

##### nowTimestamp

`number`

#### Returns

`Promise`&lt;[`RefreshTokenRecord`](RefreshTokenRecord.md) \| `null`&gt;

***

### listActiveForUser()

> **listActiveForUser**(`userId`, `nowTimestamp`, `limit`): `Promise`&lt;[`ActiveSessionSummary`](ActiveSessionSummary.md)[]&gt;

Returns a paginated list of active sessions for the user, ordered newest first.

#### Parameters

##### userId

`string`

##### nowTimestamp

`number`

##### limit

`number`

#### Returns

`Promise`&lt;[`ActiveSessionSummary`](ActiveSessionSummary.md)[]&gt;

***

### revokeAllForUser()

> **revokeAllForUser**(`userId`, `nowTimestamp`): `Promise`&lt;`void`&gt;

Revokes all active refresh tokens for a user.
Must be called on password change to invalidate all existing sessions immediately.

#### Parameters

##### userId

`string`

##### nowTimestamp

`number`

#### Returns

`Promise`&lt;`void`&gt;

***

### revokeByHash()

> **revokeByHash**(`tokenHash`, `nowTimestamp`): `Promise`&lt;`boolean`&gt;

Marks a refresh token as revoked so it cannot be used again.
Returns true if the token was found and revoked, false if it was already revoked or absent.

#### Parameters

##### tokenHash

`string`

##### nowTimestamp

`number`

#### Returns

`Promise`&lt;`boolean`&gt;

***

### revokeById()

> **revokeById**(`sessionId`, `userId`, `nowTimestamp`): `Promise`&lt;`boolean`&gt;

Revokes a specific session by its database ID, scoped to the owning user
to prevent one user from revoking another user's sessions.

#### Parameters

##### sessionId

`string`

##### userId

`string`

##### nowTimestamp

`number`

#### Returns

`Promise`&lt;`boolean`&gt;

***

### saveRefreshToken()

> **saveRefreshToken**(`record`): `Promise`&lt;`void`&gt;

Stores a new refresh token record. Only the hash is persisted, never the plaintext.

#### Parameters

##### record

[`NewRefreshToken`](NewRefreshToken.md)

#### Returns

`Promise`&lt;`void`&gt;
