[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / UserRecord

# Interface: UserRecord

## Properties

### avatarUrl

> **avatarUrl**: `string` \| `null`

***

### email

> **email**: `string`

***

### id

> **id**: `string`

***

### isActive

> **isActive**: `boolean`

Reversible deactivation (`users.is_active`). A deactivated account keeps its rows,
its assignments and its refresh tokens, but is refused at every authorization
boundary — which is what makes revocation instant despite 15-minute access JWTs.

***

### name

> **name**: `string` \| `null`

***

### notificationPreferences

> **notificationPreferences**: `string`

***

### passwordHash

> **passwordHash**: `string`

***

### role

> **role**: `string`

***

### surname

> **surname**: `string` \| `null`
