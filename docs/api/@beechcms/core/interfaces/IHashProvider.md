[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / IHashProvider

# Interface: IHashProvider

## Methods

### hash()

> **hash**(`plaintextPassword`): `Promise`&lt;`string`&gt;

Hashes a plaintext password using a one-way algorithm so that the original
value can never be recovered from the stored digest.

#### Parameters

##### plaintextPassword

`string`

#### Returns

`Promise`&lt;`string`&gt;

***

### verify()

> **verify**(`plaintextPassword`, `storedHash`): `Promise`&lt;`boolean`&gt;

Verifies a plaintext password against a stored hash using a constant-time
comparison to prevent timing-based attacks that could reveal whether a hash exists.

#### Parameters

##### plaintextPassword

`string`

##### storedHash

`string`

#### Returns

`Promise`&lt;`boolean`&gt;
