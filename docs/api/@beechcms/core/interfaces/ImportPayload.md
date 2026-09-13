[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / ImportPayload

# Interface: ImportPayload

A decoded row split into the three arguments `ContentRepository.create` takes.
`slug` and `status` are optional: the caller supplies its own defaults
(`create.ts` slugifies the display-name branch and defaults status to 'draft').

## Properties

### data

> **data**: [`TransferRecord`](../type-aliases/TransferRecord.md)

***

### slug?

> `optional` **slug?**: `string`

***

### status?

> `optional` **status?**: `string`
