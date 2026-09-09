[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / NewAuthorizationCode

# Interface: NewAuthorizationCode

## Extended by

- [`AuthorizationCodeRecord`](AuthorizationCodeRecord.md)

## Properties

### clientId

> **clientId**: `string`

***

### codeChallenge

> **codeChallenge**: `string`

***

### codeChallengeMethod

> **codeChallengeMethod**: `"S256"`

Always 'S256'; the column CHECK constraint rejects anything else.

***

### codeHash

> **codeHash**: `string`

SHA-256 hex hash of the code. The plaintext code is never persisted.

***

### expiresAt

> **expiresAt**: `number`

***

### redirectUri

> **redirectUri**: `string`

***

### scope

> **scope**: (`"schema:read"` \| `"schema:write"`)[]

***

### userId

> **userId**: `string`
