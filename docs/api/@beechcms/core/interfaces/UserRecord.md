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

System-level account type ('admin' | 'editor').
- 'admin': Developer / instance owner with full system access and Seed Builder control.
- 'editor': Generic Beech CMS user whose permissions are managed via RBAC assignments.
  (Note: 'editor' is retained as technical debt for DB CHECK constraint and backwards compatibility).

***

### surname

> **surname**: `string` \| `null`
