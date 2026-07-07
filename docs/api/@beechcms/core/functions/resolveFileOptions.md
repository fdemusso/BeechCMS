[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / resolveFileOptions

# Function: resolveFileOptions()

> **resolveFileOptions**(`branch`): `object`

Resolves the file validation options for a branch, applying default values.

## Parameters

### branch

[`Branch`](../interfaces/Branch.md)

The file branch containing option overrides.

## Returns

`object`

An object with resolved file acceptance rules and maximum size limit.

### accept

> **accept**: [`FileAccept`](../type-aliases/FileAccept.md)

### maxSize

> **maxSize**: `number`
