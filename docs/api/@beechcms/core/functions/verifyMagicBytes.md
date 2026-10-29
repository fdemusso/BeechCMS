[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / verifyMagicBytes

# Function: verifyMagicBytes()

> **verifyMagicBytes**(`buffer`, `declaredMime`): [`MagicBytesValidationResult`](../interfaces/MagicBytesValidationResult.md)

Validates that an uploaded file's binary content matches its declared MIME type,
protecting against MIME-spoofing, disguised executables, and blocked formats (e.g. SVG).

## Parameters

### buffer

`ArrayBuffer` \| `Uint8Array`&lt;`ArrayBufferLike`&gt;

The raw binary buffer (ArrayBuffer or Uint8Array).

### declaredMime

`string`

The client-declared MIME type string.

## Returns

[`MagicBytesValidationResult`](../interfaces/MagicBytesValidationResult.md)

A MagicBytesValidationResult indicating validity and details.
