[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / getFileTypeByMime

# Function: getFileTypeByMime()

> **getFileTypeByMime**(`mime`): [`FileTypeDefinition`](../interfaces/FileTypeDefinition.md) \| `undefined`

Look up a supported file type definition by its declared MIME type.

## Parameters

### mime

`string` \| `null` \| `undefined`

The MIME string (e.g. 'image/png' or 'image/jpeg; charset=utf-8').

## Returns

[`FileTypeDefinition`](../interfaces/FileTypeDefinition.md) \| `undefined`

The matching FileTypeDefinition, or undefined if unsupported.
