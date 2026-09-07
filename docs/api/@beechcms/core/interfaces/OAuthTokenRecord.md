[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / OAuthTokenRecord

# Interface: OAuthTokenRecord

## Extends

- [`NewOAuthToken`](NewOAuthToken.md)

## Properties

### authorizationCodeHash

> **authorizationCodeHash**: `string`

Hash of the authorization code this token descends from, for cascade revocation.

#### Inherited from

[`NewOAuthToken`](NewOAuthToken.md).[`authorizationCodeHash`](NewOAuthToken.md#authorizationcodehash)

***

### clientId

> **clientId**: `string`

#### Inherited from

[`NewOAuthToken`](NewOAuthToken.md).[`clientId`](NewOAuthToken.md#clientid)

***

### createdAt

> **createdAt**: `number`

***

### expiresAt

> **expiresAt**: `number`

#### Inherited from

[`NewOAuthToken`](NewOAuthToken.md).[`expiresAt`](NewOAuthToken.md#expiresat)

***

### id

> **id**: `string`

#### Inherited from

[`NewOAuthToken`](NewOAuthToken.md).[`id`](NewOAuthToken.md#id)

***

### revokedAt

> **revokedAt**: `number` \| `null`

***

### scope

> **scope**: (`"schema:read"` \| `"schema:write"`)[]

#### Inherited from

[`NewOAuthToken`](NewOAuthToken.md).[`scope`](NewOAuthToken.md#scope)

***

### tokenHash

> **tokenHash**: `string`

SHA-256 hex hash of the token. The plaintext token is never persisted.

#### Inherited from

[`NewOAuthToken`](NewOAuthToken.md).[`tokenHash`](NewOAuthToken.md#tokenhash)

***

### tokenType

> **tokenType**: [`OAuthTokenType`](../type-aliases/OAuthTokenType.md)

#### Inherited from

[`NewOAuthToken`](NewOAuthToken.md).[`tokenType`](NewOAuthToken.md#tokentype)

***

### userId

> **userId**: `string`

#### Inherited from

[`NewOAuthToken`](NewOAuthToken.md).[`userId`](NewOAuthToken.md#userid)
