[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / IInvitationRepository

# Interface: IInvitationRepository

Storage contract for onboarding invitations.

Deliberately shaped after [IPasswordResetTokenRepository](IPasswordResetTokenRepository.md): a single-use,
expiring, hash-only bearer credential is the same lifecycle, and the codebase keeps
exactly one shape for it.

## Methods

### create()

> **create**(`input`): `Promise`&lt;`string`&gt;

Stores a new invitation. Only the hash is persisted, never the plaintext.
 Returns the new invitation id.

#### Parameters

##### input

[`NewInvitationInput`](NewInvitationInput.md)

#### Returns

`Promise`&lt;`string`&gt;

***

### delete()

> **delete**(`invitationId`): `Promise`&lt;`boolean`&gt;

Revokes (hard-deletes) an invitation. Returns false when it did not exist.

#### Parameters

##### invitationId

`string`

#### Returns

`Promise`&lt;`boolean`&gt;

***

### findById()

> **findById**(`invitationId`): `Promise`&lt;[`InvitationRecord`](InvitationRecord.md) \| `null`&gt;

One invitation by id, regardless of state. Null when absent.

#### Parameters

##### invitationId

`string`

#### Returns

`Promise`&lt;[`InvitationRecord`](InvitationRecord.md) \| `null`&gt;

***

### findValidByHash()

> **findValidByHash**(`tokenHash`, `nowTimestamp`): `Promise`&lt;[`ValidatedInvitation`](ValidatedInvitation.md) \| `null`&gt;

Resolves a live (unused, unexpired) invitation by token hash. Null otherwise —
 expired, already used and unknown are deliberately indistinguishable.

#### Parameters

##### tokenHash

`string`

##### nowTimestamp

`number`

#### Returns

`Promise`&lt;[`ValidatedInvitation`](ValidatedInvitation.md) \| `null`&gt;

***

### invalidatePending()

> **invalidatePending**(`email`, `nowTimestamp`): `Promise`&lt;`void`&gt;

Consumes every pending invitation for an email before a new one is issued, so at
 most one live token per address exists at any time.

#### Parameters

##### email

`string`

##### nowTimestamp

`number`

#### Returns

`Promise`&lt;`void`&gt;

***

### listAll()

> **listAll**(): `Promise`&lt;[`InvitationRecord`](InvitationRecord.md)[]&gt;

Every invitation, newest first. Administration tables are small by nature.

#### Returns

`Promise`&lt;[`InvitationRecord`](InvitationRecord.md)[]&gt;

***

### markUsed()

> **markUsed**(`invitationId`, `nowTimestamp`): `Promise`&lt;`boolean`&gt;

Consumes an invitation. Returns TRUE only when THIS call performed the transition
(`used_at IS NULL` at write time), which is what makes redemption single-use under
concurrency. A second concurrent redeem gets false and must be refused.

#### Parameters

##### invitationId

`string`

##### nowTimestamp

`number`

#### Returns

`Promise`&lt;`boolean`&gt;

***

### regenerate()

> **regenerate**(`invitationId`, `tokenHash`, `expiresAt`): `Promise`&lt;`boolean`&gt;

Replaces the token and expiry of an existing PENDING-or-EXPIRED invitation,
 preserving its (role, scope, email) pre-assignment. Returns false when the row is
 absent or already used — a consumed invitation is never re-armed.

#### Parameters

##### invitationId

`string`

##### tokenHash

`string`

##### expiresAt

`number`

#### Returns

`Promise`&lt;`boolean`&gt;
