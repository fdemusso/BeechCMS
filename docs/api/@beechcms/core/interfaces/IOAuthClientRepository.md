[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / IOAuthClientRepository

# Interface: IOAuthClientRepository

## Methods

### findActiveById()

> **findActiveById**(`clientId`): `Promise`&lt;[`OAuthClientRecord`](OAuthClientRecord.md) \| `null`&gt;

Returns the client, or null when unknown or disabled.

#### Parameters

##### clientId

`string`

#### Returns

`Promise`&lt;[`OAuthClientRecord`](OAuthClientRecord.md) \| `null`&gt;
