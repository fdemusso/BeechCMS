[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / IOAuthTokenRepository

# Interface: IOAuthTokenRepository

## Methods

### findActiveByHash()

> **findActiveByHash**(`tokenHash`, `tokenType`, `nowTimestamp`): `Promise`&lt;[`OAuthTokenRecord`](OAuthTokenRecord.md) \| `null`&gt;

Finds an unexpired, unrevoked token by hash and type.

#### Parameters

##### tokenHash

`string`

##### tokenType

[`OAuthTokenType`](../type-aliases/OAuthTokenType.md)

##### nowTimestamp

`number`

#### Returns

`Promise`&lt;[`OAuthTokenRecord`](OAuthTokenRecord.md) \| `null`&gt;

***

### listAuthorizedClientsForUser()

> **listAuthorizedClientsForUser**(`userId`, `nowTimestamp`): `Promise`&lt;[`AuthorizedClientSummary`](AuthorizedClientSummary.md)[]&gt;

Lists the clients holding at least one live token for this user, newest first.

#### Parameters

##### userId

`string`

##### nowTimestamp

`number`

#### Returns

`Promise`&lt;[`AuthorizedClientSummary`](AuthorizedClientSummary.md)[]&gt;

***

### revokeAllForClientAndUser()

> **revokeAllForClientAndUser**(`clientId`, `userId`, `nowTimestamp`): `Promise`&lt;`number`&gt;

Revokes every live token for one (client, user) pair — access AND refresh,
never one without the other. Backs "revoke this app" in the dashboard.

#### Parameters

##### clientId

`string`

##### userId

`string`

##### nowTimestamp

`number`

#### Returns

`Promise`&lt;`number`&gt;

***

### revokeByAuthorizationCode()

> **revokeByAuthorizationCode**(`authorizationCodeHash`, `nowTimestamp`): `Promise`&lt;`number`&gt;

Revokes EVERY token descending from one authorization code, both access and
refresh. Called on authorization-code replay (OAuth 2.1 §4.1.3).
Returns the number of tokens revoked.

#### Parameters

##### authorizationCodeHash

`string`

##### nowTimestamp

`number`

#### Returns

`Promise`&lt;`number`&gt;

***

### revokeByHash()

> **revokeByHash**(`tokenHash`, `nowTimestamp`): `Promise`&lt;`boolean`&gt;

Revokes a single token. False when already revoked or absent.

#### Parameters

##### tokenHash

`string`

##### nowTimestamp

`number`

#### Returns

`Promise`&lt;`boolean`&gt;

***

### save()

> **save**(`record`): `Promise`&lt;`void`&gt;

#### Parameters

##### record

[`NewOAuthToken`](NewOAuthToken.md)

#### Returns

`Promise`&lt;`void`&gt;
