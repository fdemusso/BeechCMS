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

### listAll()

> **listAll**(): `Promise`&lt;[`InvitationRecord`](InvitationRecord.md)[]&gt;

Every invitation, newest first. Administration tables are small by nature.

#### Returns

`Promise`&lt;[`InvitationRecord`](InvitationRecord.md)[]&gt;

***

### redeem()

> **redeem**(`input`): `Promise`&lt;`boolean`&gt;

Redeems an invitation: creates the account, writes its (role, scope) assignment and
consumes the invitation in ONE atomic write. Either all three land or none does, so a
failure can neither burn the invitation nor leave an account without its role.

Returns TRUE only when THIS call performed the transition (`used_at IS NULL` at write
time), which is what makes redemption single-use under concurrency; FALSE means the
invitation was consumed or revoked meanwhile and nothing was written. Throws when the
email is already registered (UNIQUE), writing nothing.

#### Parameters

##### input

[`InvitationRedemption`](InvitationRedemption.md)

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

***

### supersedePending()

> **supersedePending**(`email`): `Promise`&lt;`void`&gt;

Deletes every unredeemed invitation for an email before a new one is issued, so at
 most one live token per address exists at any time. They are removed, not marked
 used: `used_at` means "redeemed", and a superseded row must never be reported as
 accepted.

#### Parameters

##### email

`string`

#### Returns

`Promise`&lt;`void`&gt;
