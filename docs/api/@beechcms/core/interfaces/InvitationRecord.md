[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / InvitationRecord

# Interface: InvitationRecord

One invitation row. `tokenHash` is deliberately absent: nothing above the storage
 boundary ever needs it, and an administration listing must not carry credential
 material (same rule as AccountSummary omitting passwordHash).

## Properties

### createdAt

> **createdAt**: `number`

***

### email

> **email**: `string`

***

### expiresAt

> **expiresAt**: `number`

***

### id

> **id**: `string`

***

### invitedBy

> **invitedBy**: `string`

***

### roleId

> **roleId**: `string`

***

### scope

> **scope**: `string`

***

### usedAt

> **usedAt**: `number` \| `null`

Non-null once redeemed. Single-use is enforced by [IInvitationRepository.markUsed](IInvitationRepository.md#markused).
