[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / verifyHashField

# Function: verifyHashField()

> **verifyHashField**(`stored`, `candidate`): `Promise`&lt;`boolean`&gt;

Verifies if a candidate string matches a stored SHA-256 hash digest.

## Parameters

### stored

`string`

The expected 64-character SHA-256 hex digest.

### candidate

`string`

The raw candidate string to verify.

## Returns

`Promise`&lt;`boolean`&gt;

A Promise resolving to true if candidate matches stored digest, false otherwise.
