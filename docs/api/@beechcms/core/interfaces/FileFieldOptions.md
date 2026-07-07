[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / FileFieldOptions

# Interface: FileFieldOptions

Specialized configuration for a branch of type 'file'.

## Properties

### accept?

> `optional` **accept?**: [`FileAccept`](../type-aliases/FileAccept.md)

Semantic type of file accepted.
- 'image': renderable images with preview
- 'document': PDF/Office/text
- 'any': any file (default — UI shows a generic icon, no image render attempt)
Default: 'any'.

***

### maxSize?

> `optional` **maxSize?**: `number`

Maximum size of a single file, in bytes.
NOTE: the backend /upload endpoint enforces the global MAX_FILE_SIZE_BYTES (5MB) —
this field is informational for the UI only; it is not enforced on upload.
Default: 5_242_880.
