[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / getFileTypeByExtension

# Function: getFileTypeByExtension()

> **getFileTypeByExtension**(`ext`): [`FileTypeDefinition`](../interfaces/FileTypeDefinition.md) \| `undefined`

Look up a supported file type definition by its extension.

## Parameters

### ext

`string` \| `null` \| `undefined`

The extension string with or without leading dot.

## Returns

[`FileTypeDefinition`](../interfaces/FileTypeDefinition.md) \| `undefined`

The matching FileTypeDefinition, or undefined if unsupported.
