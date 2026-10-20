[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / toImportPayload

# Function: toImportPayload()

> **toImportPayload**(`record`): [`ImportPayload`](../interfaces/ImportPayload.md)

Splits a decoded record into the shape `ContentRepository.create` consumes, dropping the
engine-owned columns. Returns `data` WITHOUT `slug`/`status`, mirroring
`apps/api/src/features/content/handlers/create.ts:68-70`, so the import consumer can feed
`data` straight to `validateAndSanitizeSeedPayload` without re-filtering.

## Parameters

### record

[`TransferRecord`](../type-aliases/TransferRecord.md)

## Returns

[`ImportPayload`](../interfaces/ImportPayload.md)
