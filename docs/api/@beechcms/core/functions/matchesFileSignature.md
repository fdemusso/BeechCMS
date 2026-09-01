[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / matchesFileSignature

# Function: matchesFileSignature()

> **matchesFileSignature**(`def`, `bytes`): `boolean`

Evaluates whether the given byte buffer matches the binary signature of a file definition.

## Parameters

### def

[`FileTypeDefinition`](../interfaces/FileTypeDefinition.md)

The file type definition to check against.

### bytes

`Uint8Array`

The raw byte buffer to inspect.

## Returns

`boolean`

True if the bytes match the definition's signature rules, false otherwise.
