[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / IUserRepository

# Interface: IUserRepository

## Methods

### countAll()

> **countAll**(): `Promise`&lt;`number`&gt;

Returns the total number of registered users.
Used to block re-setup when at least one administrator account already exists.

#### Returns

`Promise`&lt;`number`&gt;

***

### create()

> **create**(`user`): `Promise`&lt;`void`&gt;

Inserts a new user record.

#### Parameters

##### user

[`NewUserInput`](NewUserInput.md)

#### Returns

`Promise`&lt;`void`&gt;

***

### createInitialAdmin()

> **createInitialAdmin**(`user`): `Promise`&lt;`boolean`&gt;

Atomically creates the first administrator account, guarded by a
setup-completed marker row inserted in the same transaction. Returns
false instead of throwing when setup was already completed concurrently.

#### Parameters

##### user

[`NewUserInput`](NewUserInput.md)

#### Returns

`Promise`&lt;`boolean`&gt;

***

### emailBelongsToAnotherUser()

> **emailBelongsToAnotherUser**(`email`, `currentUserId`): `Promise`&lt;`boolean`&gt;

Checks whether the given email is already registered to a different user.
Used during an email change to detect conflicts without exposing whether
an unrelated account exists.

#### Parameters

##### email

`string`

##### currentUserId

`string`

#### Returns

`Promise`&lt;`boolean`&gt;

***

### findByEmail()

> **findByEmail**(`email`): `Promise`&lt;[`UserRecord`](UserRecord.md) \| `null`&gt;

Retrieves a user by their email address, or null if not found.

#### Parameters

##### email

`string`

#### Returns

`Promise`&lt;[`UserRecord`](UserRecord.md) \| `null`&gt;

***

### findById()

> **findById**(`userId`): `Promise`&lt;[`UserRecord`](UserRecord.md) \| `null`&gt;

Retrieves a user by their unique identifier, or null if not found.

#### Parameters

##### userId

`string`

#### Returns

`Promise`&lt;[`UserRecord`](UserRecord.md) \| `null`&gt;

***

### updateAvatarUrl()

> **updateAvatarUrl**(`userId`, `avatarUrl`): `Promise`&lt;`void`&gt;

Sets or clears the user's avatar URL.

#### Parameters

##### userId

`string`

##### avatarUrl

`string` \| `null`

#### Returns

`Promise`&lt;`void`&gt;

***

### updateNotificationPreferences()

> **updateNotificationPreferences**(`userId`, `preferencesJson`): `Promise`&lt;`void`&gt;

Persists the user's notification preferences as a JSON string.

#### Parameters

##### userId

`string`

##### preferencesJson

`string`

#### Returns

`Promise`&lt;`void`&gt;

***

### updatePasswordHash()

> **updatePasswordHash**(`userId`, `newPasswordHash`): `Promise`&lt;`void`&gt;

Replaces the user's stored password hash after a successful password change.

#### Parameters

##### userId

`string`

##### newPasswordHash

`string`

#### Returns

`Promise`&lt;`void`&gt;

***

### updateProfile()

> **updateProfile**(`userId`, `fields`): `Promise`&lt;`void`&gt;

Updates the user's display name, surname, and/or email address.

#### Parameters

##### userId

`string`

##### fields

###### email?

`string`

###### name?

`string`

###### surname?

`string`

#### Returns

`Promise`&lt;`void`&gt;
