[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / FileTypeDefinition

# Interface: FileTypeDefinition

Definition of a supported file format in BeechCMS, including MIME types,
binary classification, and binary signature verification rules.

## Properties

### category

> `readonly` **category**: [`FileCategory`](../type-aliases/FileCategory.md)

High-level file category.

***

### extension

> `readonly` **extension**: `string`

File extension without leading dot (e.g. 'jpg', 'png', 'pdf').

***

### isBinary

> `readonly` **isBinary**: `boolean`

Whether the file is a binary format requiring magic byte signature validation.

***

### magicBytes?

> `readonly` `optional` **magicBytes?**: readonly `number`[]

Expected magic bytes prefix if the format uses a static prefix.

***

### matchSignature?

> `readonly` `optional` **matchSignature?**: (`bytes`) => `boolean`

Custom signature matching function for formats with complex, variable, or offset headers.

#### Parameters

##### bytes

`Uint8Array`

#### Returns

`boolean`

***

### mimeTypes

> `readonly` **mimeTypes**: readonly `string`[]

All valid MIME types associated with this format.

***

### primaryMime

> `readonly` **primaryMime**: `string`

Canonical primary MIME type (e.g. 'image/jpeg').
