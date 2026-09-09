[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / MagicBytesValidationResult

# Interface: MagicBytesValidationResult

Result of a file magic bytes signature validation.

## Properties

### detectedMime?

> `optional` **detectedMime?**: `string`

Detected canonical primary MIME type if valid or identified.

***

### error?

> `optional` **error?**: `string`

Human-readable error description when validation fails.

***

### valid

> **valid**: `boolean`

Whether the byte buffer matches the declared format signature.
