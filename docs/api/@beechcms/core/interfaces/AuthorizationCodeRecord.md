[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / AuthorizationCodeRecord

# Interface: AuthorizationCodeRecord

## Extends

- [`NewAuthorizationCode`](NewAuthorizationCode.md)

## Properties

### clientId

> **clientId**: `string`

#### Inherited from

[`NewAuthorizationCode`](NewAuthorizationCode.md).[`clientId`](NewAuthorizationCode.md#clientid)

***

### codeChallenge

> **codeChallenge**: `string`

#### Inherited from

[`NewAuthorizationCode`](NewAuthorizationCode.md).[`codeChallenge`](NewAuthorizationCode.md#codechallenge)

***

### codeChallengeMethod

> **codeChallengeMethod**: `"S256"`

Always 'S256'; the column CHECK constraint rejects anything else.

#### Inherited from

[`NewAuthorizationCode`](NewAuthorizationCode.md).[`codeChallengeMethod`](NewAuthorizationCode.md#codechallengemethod)

***

### codeHash

> **codeHash**: `string`

SHA-256 hex hash of the code. The plaintext code is never persisted.

#### Inherited from

[`NewAuthorizationCode`](NewAuthorizationCode.md).[`codeHash`](NewAuthorizationCode.md#codehash)

***

### consumedAt

> **consumedAt**: `number` \| `null`

***

### createdAt

> **createdAt**: `number`

***

### expiresAt

> **expiresAt**: `number`

#### Inherited from

[`NewAuthorizationCode`](NewAuthorizationCode.md).[`expiresAt`](NewAuthorizationCode.md#expiresat)

***

### redirectUri

> **redirectUri**: `string`

#### Inherited from

[`NewAuthorizationCode`](NewAuthorizationCode.md).[`redirectUri`](NewAuthorizationCode.md#redirecturi)

***

### scope

> **scope**: (`"schema:read"` \| `"schema:write"`)[]

#### Inherited from

[`NewAuthorizationCode`](NewAuthorizationCode.md).[`scope`](NewAuthorizationCode.md#scope)

***

### userId

> **userId**: `string`

#### Inherited from

[`NewAuthorizationCode`](NewAuthorizationCode.md).[`userId`](NewAuthorizationCode.md#userid)
