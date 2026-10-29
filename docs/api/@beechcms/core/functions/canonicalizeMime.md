[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / canonicalizeMime

# Function: canonicalizeMime()

> **canonicalizeMime**(`mime`): `string`

Canonicalizes a declared MIME type to its registered primary form (e.g. 'image/jpg' -\> 'image/jpeg').
Unrecognized MIME types pass through unchanged (lowercased, parameters stripped).

## Parameters

### mime

`string`

The declared MIME string (e.g. 'image/jpg' or 'image/png; charset=utf-8').

## Returns

`string`

The canonical primary MIME type, or the normalised input if unrecognized.
