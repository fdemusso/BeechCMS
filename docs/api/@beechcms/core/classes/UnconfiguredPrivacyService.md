[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / UnconfiguredPrivacyService

# Class: UnconfiguredPrivacyService

Fail-closed [IPrivacyService](../interfaces/IPrivacyService.md) for installs without a master key.
Never returns plaintext as protected output; legacy non-`v1:` values still read through.

## Implements

- [`IPrivacyService`](../interfaces/IPrivacyService.md)

## Constructors

### Constructor

> **new UnconfiguredPrivacyService**(): `UnconfiguredPrivacyService`

#### Returns

`UnconfiguredPrivacyService`

## Methods

### decrypt()

> **decrypt**(`ciphertext`): `Promise`&lt;`string`&gt;

Decrypts a formatted AES-256-GCM ciphertext payload.

#### Parameters

##### ciphertext

`string`

The formatted ciphertext string (`v1:<iv_base64>:<ciphertext_base64>`).

#### Returns

`Promise`&lt;`string`&gt;

A Promise resolving to the original plaintext string.

#### Throws

Error if the ciphertext format is invalid or decryption fails (authentication tag mismatch).

#### Implementation of

[`IPrivacyService`](../interfaces/IPrivacyService.md).[`decrypt`](../interfaces/IPrivacyService.md#decrypt)

***

### encrypt()

> **encrypt**(`_plaintext`): `Promise`&lt;`string`&gt;

Symmetrically encrypts a plaintext string using AES-256-GCM.

#### Parameters

##### \_plaintext

`string`

The raw string value to encrypt.

#### Returns

`Promise`&lt;`string`&gt;

A Promise resolving to formatted ciphertext (`v1:<iv_base64>:<ciphertext_base64>`).

#### Implementation of

[`IPrivacyService`](../interfaces/IPrivacyService.md).[`encrypt`](../interfaces/IPrivacyService.md#encrypt)

***

### hash()

> **hash**(`_plaintext`): `Promise`&lt;`string`&gt;

Computes a deterministic HMAC SHA-256 digest of a plaintext string.
Used for blind-indexing and one-way field digests (`restricted` classification).

#### Parameters

##### \_plaintext

`string`

The raw string value to hash.

#### Returns

`Promise`&lt;`string`&gt;

A Promise resolving to a 64-character hexadecimal digest string.

#### Implementation of

[`IPrivacyService`](../interfaces/IPrivacyService.md).[`hash`](../interfaces/IPrivacyService.md#hash)
