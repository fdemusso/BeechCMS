[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / checkFormatCompatibility

# Function: checkFormatCompatibility()

> **checkFormatCompatibility**(`seed`, `format`): [`FormatCompatibility`](../type-aliases/FormatCompatibility.md)

The single authority on "may this seed be transferred in this format?", shared by the
export endpoint and the import endpoint so the two can never disagree.
NDJSON is universal; CSV requires a flat seed.

## Parameters

### seed

[`Seed`](../interfaces/Seed.md)

### format

[`TransferFormat`](../type-aliases/TransferFormat.md)

## Returns

[`FormatCompatibility`](../type-aliases/FormatCompatibility.md)
