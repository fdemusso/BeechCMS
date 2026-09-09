[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/forms-react](../index.md) / verifyClientMagicBytes

# Function: verifyClientMagicBytes()

> **verifyClientMagicBytes**(`bytes`, `declaredMime`): [`ClientMagicBytesResult`](../interfaces/ClientMagicBytesResult.md)

Validates a binary byte array against the declared MIME type using @beechcms/core.

## Parameters

### bytes

`Uint8Array`

The binary data of the file.

### declaredMime

`string`

The MIME type reported by the browser File object.

## Returns

[`ClientMagicBytesResult`](../interfaces/ClientMagicBytesResult.md)

An object indicating whether the file signature is valid, with optional error message.
