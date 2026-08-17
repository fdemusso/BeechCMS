[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / IPrivacyService

# Interface: IPrivacyService

Contract for the Application-Level Encryption (ALE) and hashing privacy service.
Used by the Botanical Engine to secure fields classified as `confidential` or `restricted`.

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

***

### encrypt()

> **encrypt**(`plaintext`): `Promise`&lt;`string`&gt;

Symmetrically encrypts a plaintext string using AES-256-GCM.

#### Parameters

##### plaintext

`string`

The raw string value to encrypt.

#### Returns

`Promise`&lt;`string`&gt;

A Promise resolving to formatted ciphertext (`v1:<iv_base64>:<ciphertext_base64>`).

***

### hash()

> **hash**(`plaintext`): `Promise`&lt;`string`&gt;

Computes a deterministic HMAC SHA-256 digest of a plaintext string.
Used for blind-indexing and one-way field digests (`restricted` classification).

#### Parameters

##### plaintext

`string`

The raw string value to hash.

#### Returns

`Promise`&lt;`string`&gt;

A Promise resolving to a 64-character hexadecimal digest string.
