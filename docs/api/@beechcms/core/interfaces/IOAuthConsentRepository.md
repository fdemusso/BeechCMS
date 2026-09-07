[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / IOAuthConsentRepository

# Interface: IOAuthConsentRepository

## Methods

### findActive()

> **findActive**(`clientId`, `userId`): `Promise`&lt;[`ConsentRecord`](ConsentRecord.md) \| `null`&gt;

Returns the live consent for the pair, or null when absent or revoked.

#### Parameters

##### clientId

`string`

##### userId

`string`

#### Returns

`Promise`&lt;[`ConsentRecord`](ConsentRecord.md) \| `null`&gt;

***

### grant()

> **grant**(`id`, `clientId`, `userId`, `scopes`, `nowTimestamp`): `Promise`&lt;`void`&gt;

Records consent for the pair, unioning `scopes` into any existing live grant
and reviving a previously revoked row. Idempotent for an unchanged scope set.

#### Parameters

##### id

`string`

##### clientId

`string`

##### userId

`string`

##### scopes

readonly (`"schema:read"` \| `"schema:write"`)[]

##### nowTimestamp

`number`

#### Returns

`Promise`&lt;`void`&gt;

***

### listForUser()

> **listForUser**(`userId`): `Promise`&lt;[`ConsentRecord`](ConsentRecord.md)[]&gt;

Lists all live consents for a user, newest first.

#### Parameters

##### userId

`string`

#### Returns

`Promise`&lt;[`ConsentRecord`](ConsentRecord.md)[]&gt;

***

### revoke()

> **revoke**(`clientId`, `userId`, `nowTimestamp`): `Promise`&lt;`boolean`&gt;

Revokes the consent. False when there was nothing live to revoke.

#### Parameters

##### clientId

`string`

##### userId

`string`

##### nowTimestamp

`number`

#### Returns

`Promise`&lt;`boolean`&gt;
