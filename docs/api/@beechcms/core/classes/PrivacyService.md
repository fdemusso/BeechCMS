[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / PrivacyService

# Class: PrivacyService

Concrete Edge-native implementation of [IPrivacyService](../interfaces/IPrivacyService.md).
Employs Web Crypto API (`crypto.subtle`) for zero-dependency execution in Cloudflare Workers.

## Implements

- [`IPrivacyService`](../interfaces/IPrivacyService.md)

## Constructors

### Constructor

> **new PrivacyService**(`masterKey`): `PrivacyService`

Initializes the PrivacyService with a Master Encryption Key.

#### Parameters

##### masterKey

`string`

Secret key used to derive cryptographic keys for AES-GCM and HMAC.

#### Returns

`PrivacyService`

#### Throws

Error if `masterKey` is empty or undefined.

## Methods

### decrypt()

> **decrypt**(`ciphertext`): `Promise`&lt;`string`&gt;

Decrypts a `v1:<iv_base64>:<ciphertext_base64>` string back to its plaintext value.
If the input string is not prefixed with `v1:`, returns the raw string as unencrypted legacy data.

#### Parameters

##### ciphertext

`string`

#### Returns

`Promise`&lt;`string`&gt;

#### Implementation of

[`IPrivacyService`](../interfaces/IPrivacyService.md).[`decrypt`](../interfaces/IPrivacyService.md#decrypt)

***

### encrypt()

> **encrypt**(`plaintext`): `Promise`&lt;`string`&gt;

Encrypts a plaintext string with AES-256-GCM and a fresh 96-bit (12-byte) IV.
Output is formatted as `v1:<iv_base64>:<ciphertext_base64>`.

#### Parameters

##### plaintext

`string`

#### Returns

`Promise`&lt;`string`&gt;

#### Implementation of

[`IPrivacyService`](../interfaces/IPrivacyService.md).[`encrypt`](../interfaces/IPrivacyService.md#encrypt)

***

### hash()

> **hash**(`plaintext`): `Promise`&lt;`string`&gt;

Computes a deterministic HMAC SHA-256 hex digest for blind index generation.

#### Parameters

##### plaintext

`string`

#### Returns

`Promise`&lt;`string`&gt;

#### Implementation of

[`IPrivacyService`](../interfaces/IPrivacyService.md).[`hash`](../interfaces/IPrivacyService.md#hash)
