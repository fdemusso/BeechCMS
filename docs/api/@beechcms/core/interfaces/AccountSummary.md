[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / AccountSummary

# Interface: AccountSummary

Administrative projection of an account. Deliberately carries NO `passwordHash`:
account listings must never put credential material on the wire.

## Properties

### createdAt

> **createdAt**: `number`

***

### email

> **email**: `string`

***

### id

> **id**: `string`

***

### isActive

> **isActive**: `boolean`

***

### name

> **name**: `string` \| `null`

***

### role

> **role**: `string`

Developer/owner axis (`'admin' | 'editor'`), orthogonal to RBAC permissions.

***

### surname

> **surname**: `string` \| `null`
