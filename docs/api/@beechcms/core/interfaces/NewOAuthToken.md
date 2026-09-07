[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / NewOAuthToken

# Interface: NewOAuthToken

## Extended by

- [`OAuthTokenRecord`](OAuthTokenRecord.md)

## Properties

### authorizationCodeHash

> **authorizationCodeHash**: `string`

Hash of the authorization code this token descends from, for cascade revocation.

***

### clientId

> **clientId**: `string`

***

### expiresAt

> **expiresAt**: `number`

***

### id

> **id**: `string`

***

### scope

> **scope**: (`"schema:read"` \| `"schema:write"`)[]

***

### tokenHash

> **tokenHash**: `string`

SHA-256 hex hash of the token. The plaintext token is never persisted.

***

### tokenType

> **tokenType**: [`OAuthTokenType`](../type-aliases/OAuthTokenType.md)

***

### userId

> **userId**: `string`
